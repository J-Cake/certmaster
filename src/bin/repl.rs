#![feature(str_as_str)]

use common::{Error, JobProgress, NewCsr};
use common::JobStatus;
use common::RedisUtils;
use common::Result;
use std::ops::Deref;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicU64;
use std::sync::LazyLock;
use base64::Engine;
use tokio::io::AsyncBufReadExt;
use tokio::io::AsyncWriteExt;
use tokio::io::BufReader;
use tokio::io::BufWriter;

const EMPTY: String = String::new();

static SEQ: AtomicU64 = AtomicU64::new(0);
static BASE64_ENGINE: LazyLock<base64::engine::GeneralPurpose> = LazyLock::new(|| base64::engine::GeneralPurpose::new(&base64::alphabet::STANDARD, Default::default()));

#[tokio::main]
pub async fn main() -> Result<()> {
    env_logger::init();

    let config = common::read_config().await;

    let mut stdin = BufReader::new(tokio::io::stdin());
    let mut stdout = BufWriter::new(tokio::io::stdout());
    let mut stderr = BufWriter::new(tokio::io::stderr());

    loop {
        stderr.write_all(b"> ").await?;
        stderr.flush().await?;

        let mut line = String::new();
        stdin.read_line(&mut line).await?;

        let mut args = line.split_whitespace();

        let res = &match args.next() {
            Some("echo") => echo(args).await?,
            Some("challenge") => handle_challenge(args).await?,
            Some("request") => handle_request(args).await?,
            Some("exit") | Some("quit") => return Ok(()),
            _ => EMPTY,
        };

        stdout.write_all(res.as_bytes()).await?;
        stdout.write_all(b"\n").await?;
        stdout.flush().await?;
    }

    drop(config);
}

async fn echo(args: impl Iterator<Item = impl AsRef<str>>) -> Result<String> {
    Ok(args.fold(String::new(), |mut a: String, i| {
        a.push_str(i.as_ref());
        a.push(' ');
        a
    }))
}

async fn handle_challenge(mut args: impl Iterator<Item = impl AsRef<str>>) -> Result<String> {
    let config = common::get_config();
    let mut redis = config.redis.connect().await;

    let cmd = args.next().map(|i| i.as_ref().to_owned());
    Ok(match cmd.as_ref().map(|i| i.as_ref()) {
        Some("pass") => {
            for id in args.map_while(|id| id.as_ref().parse::<u64>().ok()) {
                log::info!("Passing challenge {id}");
                redis
                    .dispatch_event(JobProgress { id, status: JobStatus::ChallengePassed })
                    .await?;
            }

            ""
        }
        _ => return Error::custom("Invalid Syntax"),
    }
    .to_owned())
}

async fn handle_request(mut args: impl Iterator<Item = impl AsRef<str>>) -> Result<String> {
    let config = common::get_config();
    let mut redis = config.redis.connect().await;

    let cmd = args.next().map(|i| i.as_ref().to_owned());
    Ok(match cmd.as_ref().map(|i| i.as_ref()) {
        Some("submit") => {
            for path in args.map(|i| PathBuf::from(i.as_ref())) {
                let pem = tokio::fs::read_to_string(&path).await?;
                let client_id = SEQ.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                redis
                    .dispatch_event(NewCsr {
                        client_id,
                        pem: pem.clone()
                    })
                    .await?;

                let alt = blake3::hash(format!("{id};{pem}", id=client_id).as_bytes());
                let alt = BASE64_ENGINE.encode(alt.as_bytes());

                log::info!("Submitted CSR {path:?} using ID '{alt}'");
            }

            ""
        },
        _ => return Error::custom("Invalid Syntax"),
    }
    .to_owned())
}
