#![feature(str_as_str)]

use futures_util::{
    stream::StreamExt
};
use common::{RedisUtils, JobStatus, Result, Error, JobProgress, NewCsr, ClientJob, Status, PEMString};
use rcgen::{string::Ia5String, Certificate, CertificateParams, DnType, SanType};
use std::{
    str::FromStr,
    path::PathBuf,
    collections::HashMap,
    str::SplitWhitespace,
    sync::atomic::AtomicU64,
    sync::Arc,
    sync::LazyLock
};
use std::collections::{HashSet, VecDeque};
use redis::AsyncCommands;
use tokio::{
    io::BufWriter,
    io::BufReader,
    io::AsyncWriteExt,
    io::AsyncBufReadExt,
    io::Stderr,
    io::Stdin,
    io::Stdout,
    sync::Mutex,
    sync::OnceCell,
    task::JoinSet
};

const EMPTY: String = String::new();

static SEQ: AtomicU64 = AtomicU64::new(0);
static PROMPT: LazyLock<OnceCell<Prompt>> = LazyLock::new(|| OnceCell::new());

#[derive(Debug, Clone)]
struct Prompt {
    stdin: Arc<Mutex<BufReader<Stdin>>>,
    stdout: Arc<Mutex<BufWriter<Stdout>>>,
    stderr: Arc<Mutex<BufWriter<Stderr>>>,
}

impl Prompt {
    async fn new() -> Result<Self> {
        Ok(PROMPT.get_or_init(async || Self {
            stdin: Arc::new(Mutex::new(BufReader::new(tokio::io::stdin()))),
            stdout: Arc::new(Mutex::new(BufWriter::new(tokio::io::stdout()))),
            stderr: Arc::new(Mutex::new(BufWriter::new(tokio::io::stderr()))),
        }).await.clone())
    }

    async fn prompt(&self, msg: impl AsRef<str>) -> Result<String> {
        let mut stderr = self.stderr.lock().await;
        let mut stdin = self.stdin.lock().await;

        stderr.write_all(msg.as_ref().as_bytes()).await?;
        stderr.flush().await?;

        let mut str = String::new();
        stdin.read_line(&mut str).await?;

        Ok(str)
    }

    async fn write(&self, str: impl AsRef<str>) -> Result<()> {
        let mut stdout = self.stdout.lock().await;

        for line in str.as_ref().trim().split('\n') {
            stdout.write_all("\u{2502} ".as_bytes()).await?;
            stdout.write_all(line.trim().as_bytes()).await?;
            stdout.write_all("\n".as_bytes()).await?;
        }

        stdout.flush().await?;

        Ok(())
    }
}

#[tokio::main]
pub async fn main() -> Result<()> {
    env_logger::init();

    let config = common::read_config().await;

    let mut redis = config.redis.connect().await;
    let _: () = ::redis::cmd("CONFIG")
        .arg("SET")
        .arg("notify-keyspace-events")
        .arg("KA")
        .query_async(&mut redis)
        .await?;

    let prompt = Prompt::new().await?;

    loop {
        let line = prompt.prompt("> ").await?;

        let res = match handle_command(line.split_whitespace()).await {
            Ok(res) => res,
            Err(err) => {
                log::error!("{err:?}");
                continue;
            }
        };

        prompt.write(res).await?;
    }

    drop(config);
}

async fn handle_command(mut args: SplitWhitespace<'_>) -> Result<String> {
    Ok(match args.next() {
        Some("echo") => echo(args).await?,
        Some("challenge") => handle_challenge(args).await?,
        Some("request") => handle_request(args).await?,
        Some("exit") | Some("quit") => {
            std::process::exit(0);
        }
        Some(cmd) => return Error::custom(format!("'{cmd}' is not a recognised command")),
        _ => EMPTY,
    })
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
                    .dispatch_event(JobProgress {
                        id,
                        status: JobStatus::ChallengePassed,
                    })
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
                        pem: pem.clone(),
                    })
                    .await?;

                let alt = common::get_alt_name(client_id, &pem);

                log::info!("Submitted CSR {path:?} using ID '{alt}'");
            }

            ""
        }
        Some("new") => new_request(args).await
                .map(|_| "")?,
        Some("await") => wait_for_completion(args).await
                .map(|_| "")?,
        _ => return Error::custom("Invalid Syntax"),
    }
    .to_owned())
}

async fn new_request(mut args: impl Iterator<Item = impl AsRef<str>>) -> Result<()> {
    let config = common::get_config();
    let mut redis = config.redis.connect().await;

    let mut cert = CertificateParams::default();

    let mut key = None;

    let mut detach = false;

    while let Some(arg) = args.next() {
        match arg.as_ref() {
            "-key" => {
                let Some(arg) = args.next() else {
                    return Error::custom("Expected argument after -key");
                };

                let pem = tokio::fs::read_to_string(arg.as_ref()).await?;
                key.replace(rcgen::KeyPair::from_pem(&pem)?);
            }
            "-cn" => {
                let Some(arg) = args.next() else {
                    return Error::custom("Expected argument after -cn");
                };

                cert.distinguished_name.push(DnType::CommonName, arg.as_ref());
            }
            "-c" => {
                let Some(arg) = args.next() else {
                    return Error::custom("Expected argument after -c");
                };

                cert.distinguished_name.push(DnType::CountryName, arg.as_ref());
            }
            "-o" => {
                let Some(arg) = args.next() else {
                    return Error::custom("Expected argument after -o");
                };

                cert.distinguished_name.push(DnType::OrganizationName, arg.as_ref());
            }
            "-ou" => {
                let Some(arg) = args.next() else {
                    return Error::custom("Expected argument after -ou");
                };

                cert.distinguished_name.push(DnType::OrganizationalUnitName, arg.as_ref());
            }
            "-l" => {
                let Some(arg) = args.next() else {
                    return Error::custom("Expected argument after -l");
                };

                cert.distinguished_name.push(DnType::LocalityName, arg.as_ref());
            }
            "-st" => {
                let Some(arg) = args.next() else {
                    return Error::custom("Expected argument after -st");
                };

                cert.distinguished_name.push(DnType::StateOrProvinceName, arg.as_ref());
            }
            "-alt" => {
                let Some(arg) = args.next() else {
                    return Error::custom("Expected argument after -alt");
                };

                cert.subject_alt_names.push(SanType::DnsName(Ia5String::from_str(arg.as_ref())?))
            }
            "-ip" => {
                let Some(arg) = args.next() else {
                    return Error::custom("Expected argument after -ip");
                };

                cert.subject_alt_names.push(SanType::IpAddress(std::net::IpAddr::from_str(
                    arg.as_ref(),
                )?))
            },
            "-async" => detach = true,
            opt => log::warn!("unrecognised option {opt}"),
        };
    }

    let Some(key) = key else {
        log::warn!("No key specified. Skipping");
        return Ok(());
    };

    let client_id = SEQ.fetch_add(1, std::sync::atomic::Ordering::SeqCst);

    let pem = cert.serialize_request(&key)?.pem()?;
    let alt = common::get_alt_name(client_id, &pem);

    redis.dispatch_event(NewCsr {
        client_id,
        pem,
    }).await?;

    if detach {
        log::info!("Sent request under ID '{alt}'");
        Ok(())
    } else {
        let certificates = wait_for_completion([alt].into_iter()).await?;

        log::debug!("Done: {certificates:#?}");

        Ok(())
    }
}

async fn wait_for_completion(args: impl Iterator<Item = impl AsRef<str>>) -> Result<HashMap<u64, PEMString>> {
    let config = common::get_config();

    let mut redis = config.redis.connect().await;
    let mut stream = redis::Client::open(config.redis.url.as_ref())?
        .get_async_pubsub()
        .await?;

    let mut jobs = HashSet::new();

    for arg in args {
        let name = arg.as_ref();
        let arg = format!("__keyspace@0__:alt:{name}");
        let _ : () = stream.subscribe(&arg).await?;

        jobs.insert(name.to_owned());
    }

    let mut certificates = HashMap::new();

    let mut stream = stream.on_message();
    while let Some(event) = stream.next().await {
        let channel = event.get_channel_name().trim_start_matches("__keyspace@0__:");
        let status: ClientJob = redis.get(channel).await?;
        // log::debug!("Change: {channel} => {status:#?}");

        if let ClientJob { alias, status: Status::Success { certificate }, client_id, .. } = status {
            if jobs.remove(&alias) {
                certificates.insert(client_id, certificate);
            } else {
                log::warn!("Certificate {client_id} was not expected");
            }

            if jobs.is_empty() {
                break;
            }
        }
    }

    Ok(certificates)
}
