use serde::Deserialize;
use serde::Serialize;
use notify::Watcher;
use std::path::PathBuf;
use common::*;

mod runner;

#[derive(clap::Parser)]
pub struct Args {
    #[clap(long, short, default_value = "./config.toml")]
    config: PathBuf,
}

#[tokio::main]
pub async fn main() {
    env_logger::init();

    log::info!("starting up");

    let config = read_config().await;

    let mut workers = tokio::task::JoinSet::new();
    for _ in 0..config.runner.workers {
        workers.spawn(runner::handle_redis_events());
    }

    let (..) = tokio::join!(workers.join_all());
}