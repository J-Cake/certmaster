use std::mem::forget;
use clap::Parser;
use config::{debounce, Config};
use config::Task;
use notify::Watcher;
use redis::AsyncTypedCommands;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::OnceLock;
use std::time::Duration;
use std::time::SystemTime;
use tokio::sync::mpsc;

/// # Receiver
/// The receiver awaits directory changes and issues tasks according to the name of the item in the inbox.

#[derive(clap::Parser)]
pub struct Args {
    #[clap(long, short, default_value = "./config.toml")]
    config: PathBuf,
}

static CONFIG: OnceLock<Arc<Config>> = OnceLock::new();

#[tokio::main]
pub async fn main() {
    env_logger::init();

    log::info!("Starting receiver");

    let config = read_config().await;

    let (req_tx, req_rx) = mpsc::channel(100);
    let (fs_tx, fs_rx) = mpsc::unbounded_channel();

    let (reindex_tx, reindex_rx) = mpsc::channel(100);

    let senders = (req_tx.clone(), fs_tx.clone(), reindex_tx.clone());

    let mut watcher = init_watcher(fs_tx).await;

    let _req_tx = req_tx.clone();
    let __req_tx = req_tx.clone();
    let initial = tokio::spawn(async move { read_inbox(_req_tx.clone()).await });
    let fs_events = tokio::spawn(async move { handle_events(fs_rx, reindex_tx).await });
    let dispatcher = tokio::spawn(async move { dispatch_to_redis(req_rx).await });
    let reindex = tokio::spawn(async move { watch_reindex(reindex_rx, __req_tx).await });

    watcher
        .watch(config.receiver.inbox.as_path(), notify::RecursiveMode::Recursive)
        .expect("Failed to start watcher");

    let (..) = tokio::join!(initial, fs_events, dispatcher, reindex);

    // Keep references alive because dropping them will cause the watcher to stop.
    drop(senders.clone());
    drop(watcher);
}

async fn read_config() -> Arc<Config> {
    let args = Args::parse();

    let config = tokio::fs::read_to_string(args.config)
        .await
        .expect("Failed to read config file");

    let config = Arc::new(toml::from_str::<Config>(&config).expect("Failed to parse config file"));

    CONFIG.set(config.clone()).expect("Failed to set config");

    return config;
}

async fn init_watcher(fs_tx: mpsc::UnboundedSender<notify::Event>) -> impl Watcher {
    let config = CONFIG.get().cloned().unwrap_or_default();

    tokio::fs::create_dir_all(config.receiver.inbox.as_path())
        .await
        .expect("Failed to create inbox");

    notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        let event = event.expect("Failed to get event");
        let tx = fs_tx.clone();

        tx.send(event).expect("Failed to send event");
    })
    .expect("Failed to watch inbox")
}

async fn read_inbox(sender: mpsc::Sender<PathBuf>) {
    let config = CONFIG.get().cloned().unwrap_or_default();

    let mut dir = tokio::fs::read_dir(config.receiver.inbox.as_path())
        .await
        .expect("Failed to read inbox");

    while let Some(entry) = dir.next_entry().await.expect("Failed to read inbox") {
        if entry.file_type().await.expect("Failed to stat file").is_file() && entry.path().extension().is_some_and(|ext| ext == "csr") {
            sender.send(entry.path()).await.expect("Failed to send request");
        }
    }
}

async fn watch_reindex(rx: mpsc::Receiver<()>, sender: mpsc::Sender<PathBuf>) {
    let config = CONFIG.get().cloned().unwrap_or_default();
    let mut rx = debounce(rx, Duration::from_secs(config.receiver.rescan_interval));
    while let Some(_) = rx.recv().await {
        log::trace!("Reindexing");

        let sender = sender.clone();
        tokio::spawn(async move {
            read_inbox(sender.clone()).await;
        });
    }
}

async fn handle_events(mut rx: mpsc::UnboundedReceiver<notify::Event>, reindex: mpsc::Sender<()>) {
    while let Some(event) = rx.recv().await {
        match &event.kind {
            notify::EventKind::Create(_) | notify::EventKind::Modify(_) => if let Err(_) = reindex.send(()).await {},

            _ => {}
        }
    }

    log::trace!("No more events");
}

async fn dispatch_to_redis(mut rx: mpsc::Receiver<PathBuf>) {
    let config = CONFIG.get().cloned().unwrap_or_default();

    let mut redis = redis::Client::open(config.redis.url.as_ref())
        .expect("Failed to connect to redis")
        .get_multiplexed_async_connection()
        .await
        .expect("Failed to connect to redis");

    while let Some(path) = rx.recv().await {
        log::trace!("Dispatching request: {path:?}");

        let Some(str) = path.to_str() else {
            log::warn!("Invalid request path: Contains non-UTF-8 characters - Skipping {path:?}");
            continue;
        };

        let now = SystemTime::now();
        let contents = tokio::fs::read_to_string(&path).await.expect("Failed to read request");

        let payload = ron::to_string(&Task {
            received: now,
            path: str.to_owned(),
            csr: contents,
        })
        .expect("Failed to serialize task");

        redis.rpush("task_queue", payload)
            .await.expect("Failed to dispatch request");

        tokio::fs::remove_file(&path).await.expect("Failed to remove request");
    }

    log::trace!("Nothing more to dispatch");
}
