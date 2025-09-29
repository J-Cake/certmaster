use clap::Parser;
use config::Config;
use notify::Watcher;
use std::path::PathBuf;

/// # Receiver
/// The receiver awaits directory changes and issues tasks according to the name of the item in the inbox.

#[derive(clap::Parser)]
pub struct Args {
    #[clap(long, short, default_value = "./config.toml")]
    config: PathBuf,
}

#[tokio::main]
pub async fn main() {
    env_logger::init();

    log::info!("Starting receiver");

    let args = Args::parse();

    let config = tokio::fs::read_to_string(args.config)
        .await
        .expect("Failed to read config file");
    let config = toml::from_str::<Config>(&config).expect("Failed to parse config file");

    let redis = redis::Client::open(config.redis.url).expect("Failed to connect to redis");

    tokio::fs::create_dir_all(config.receiver.inbox.as_path())
        .await
        .expect("Failed to create inbox");

    let mut dir = tokio::fs::read_dir(config.receiver.inbox.as_path())
        .await
        .expect("Failed to read inbox");

    while let Some(entry) = dir.next_entry().await.expect("Failed to read inbox") {
        if entry.file_type().await.expect("Failed to stat file").is_file() && entry.path().extension().is_some_and(|ext| ext == "csr") {
            log::trace!("Found unprocessed request: {path:?}", path = entry.path());
        }
    }

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();

    let _tx = tx.clone();
    let mut watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        let event = event.expect("Failed to get event");
        let tx = tx.clone();

        tx.send(event)
            .expect("Failed to send event");
    })
    .expect("Failed to watch inbox");

    watcher
        .watch(config.receiver.inbox.as_path(), notify::RecursiveMode::Recursive)
        .expect("Failed to start watcher");

    while let Some(event) = rx.recv().await {

    }

    drop(_tx.clone());
}
