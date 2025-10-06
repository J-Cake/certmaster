use std::time::Duration;
use tokio::sync::mpsc::Receiver;
use tokio::sync::mpsc::{self};
use tokio::time::Instant;
use tokio::time::{self};

pub fn debounce(mut input: Receiver<()>, timeout: Duration) -> Receiver<()> {
    let (tx, output) = mpsc::channel(1);

    tokio::spawn(async move {
        let mut deadline: Option<Instant> = None;

        async fn expire_at(deadline: Option<Instant>) {
            match deadline {
                Some(deadline) => time::sleep_until(deadline).await,
                None => {}
            }
        }

        loop {
            tokio::select! {
                _ = expire_at(deadline), if deadline.is_some() => {
                    if tx.send(()).await.is_err() { break; } // receiver dropped
                    deadline = None;
                }

                msg = input.recv() => {
                    match msg {
                        Some(()) => deadline = Some(Instant::now() + timeout),
                        None => break
                    };
                }
            }
        }

        if let Some(_) = deadline.take() {
            let _ = tx.send(()).await;
        }
    });

    output
}
