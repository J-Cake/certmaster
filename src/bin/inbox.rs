use common::{NewCsr, RedisUtils};
use common::debounce;
use common::NEW_CSR_EVENT_GROUP;
use common::read_config;
use notify::Watcher;
use redis::AsyncTypedCommands;
use std::path::PathBuf;
use std::sync::atomic::AtomicU64;
use std::time::Duration;
use tokio::sync::mpsc;

/// # Receiver
/// The receiver awaits directory changes and issues tasks to Redis according to the name of the item in the inbox.

static SEQ: AtomicU64 = AtomicU64::new(0);

#[tokio::main]
pub async fn main() {
    env_logger::init();

    log::info!("Starting inbox receiver");

    let config = read_config().await;

    let (req_tx, req_rx) = mpsc::channel(100);
    let (fs_tx, fs_rx) = mpsc::unbounded_channel();
    let (reindex_tx, reindex_rx) = mpsc::channel(100);
    let senders = (req_tx.clone(), fs_tx.clone(), reindex_tx.clone());

    let mut watcher = init_watcher(fs_tx).await;

    let _req_tx = req_tx.clone();
    let __req_tx = req_tx.clone();
    let initial = tokio::spawn(read_inbox(_req_tx.clone()));
    let fs_events = tokio::spawn(handle_events(fs_rx, reindex_tx));
    let dispatcher = tokio::spawn(dispatch_to_redis(req_rx));
    let reindex = tokio::spawn(watch_reindex(reindex_rx, __req_tx));

    watcher
        .watch(config.inbox.inbox.as_path(), notify::RecursiveMode::Recursive)
        .expect("Failed to start watcher");

    let (..) = tokio::join!(initial, fs_events, dispatcher, reindex);

    // Keep references alive because dropping them will cause the watcher to stop.
    drop(senders.clone());
    drop(watcher);
}

pub(crate) async fn init_watcher(fs_tx: mpsc::UnboundedSender<notify::Event>) -> impl Watcher {
    let config = common::get_config();

    tokio::fs::create_dir_all(config.inbox.inbox.as_path())
        .await
        .expect("Failed to create inbox");

    notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        let event = event.expect("Failed to get event");
        let tx = fs_tx.clone();

        tx.send(event).expect("Failed to send event");
    })
    .expect("Failed to watch inbox")
}

pub(crate) async fn read_inbox(sender: mpsc::Sender<PathBuf>) {
    let config = common::get_config();

    let mut dir = tokio::fs::read_dir(config.inbox.inbox.as_path())
        .await
        .expect("Failed to read inbox");

    while let Some(entry) = dir.next_entry().await.expect("Failed to read inbox") {
        if entry.file_type().await.expect("Failed to stat file").is_file() && entry.path().extension().is_some_and(|ext| ext == "csr") {
            sender.send(entry.path()).await.expect("Failed to send request");
        }
    }
}

pub(crate) async fn watch_reindex(rx: mpsc::Receiver<()>, sender: mpsc::Sender<PathBuf>) {
    let config = common::get_config();

    let mut rx = debounce(rx, Duration::from_secs(config.inbox.rescan_interval));
    while let Some(_) = rx.recv().await {
        log::trace!("Reindexing...");

        let sender = sender.clone();
        tokio::spawn(async move {
            read_inbox(sender.clone()).await;
        });
    }
}

pub(crate) async fn handle_events(mut rx: mpsc::UnboundedReceiver<notify::Event>, reindex: mpsc::Sender<()>) {
    while let Some(event) = rx.recv().await {
        match &event.kind {
            notify::EventKind::Create(_) | notify::EventKind::Modify(_) => if let Err(_) = reindex.send(()).await {},

            _ => {}
        }
    }

    log::trace!("No more events");
}

pub(crate) async fn dispatch_to_redis(mut rx: mpsc::Receiver<PathBuf>) {
    let config = common::get_config();

    let mut redis = config.redis.connect().await;

    while let Some(path) = rx.recv().await {
        log::info!("Received CSR: {path:?}");

        let Some(str) = path.to_str() else {
            log::warn!("Invalid request path: Contains non-UTF-8 characters - Skipping {path:?}");
            continue;
        };

        let pem = tokio::fs::read_to_string(&path).await.expect("Failed to read request");

        redis.dispatch_event(NewCsr {
            pem,
            client_id: SEQ.fetch_add(1, std::sync::atomic::Ordering::SeqCst),
        })
            .await.expect("Failed to dispatch request");

        // let payload = ron::to_string(&NewCsr {
        //     pem
        // })
        // .expect("Failed to serialize task");
        //
        // redis.xadd(&config.redis.task_stream_key, "*", &[(NEW_CSR_EVENT_GROUP, payload)])
        //     .await.expect("Failed to dispatch request");

        tokio::fs::remove_file(&path).await.expect("Failed to remove request");
    }

    log::trace!("Nothing more to dispatch");
}
