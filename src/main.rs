use std::path::PathBuf;

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

    let config = common::read_config().await;

    let worker = tokio::spawn(async move {
        runner::handle_redis_events()
            .await
            .expect("Worker died");
    });

    let (..) = tokio::join!(worker);
    drop(config);
}