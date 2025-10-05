use redis::streams::StreamReadOptions;
use redis::streams::StreamReadReply;
use redis::AsyncCommands;
use redis::FromRedisValue;
use redis::RedisResult;
use std::io;
use std::os::unix::fs::MetadataExt;
use std::path::Path;
use std::sync::Arc;
use std::sync::OnceLock;
use rune::Source;
use rune::Unit;
use common::Job;
use common::Task;
use common::REDIS_TASK_QUEUE_STREAM_GROUP;

pub(crate) async fn handle_redis_events() {
    let config = crate::get_config();
    let mut redis = config
        .redis
        .connect()
        .await;

    let consumer: u64 = redis.incr("runner", 1)
        .await.expect("Unable to determine worker ID");

    let _: RedisResult<Task> = redis.xgroup_create(&config.redis.task_stream_key, &REDIS_TASK_QUEUE_STREAM_GROUP, "0")
        .await;

    let options = StreamReadOptions::default()
        .block(0)
        .group(REDIS_TASK_QUEUE_STREAM_GROUP, format!("worker-{consumer}"));

    loop {
        let mut stream: StreamReadReply = redis
            .xread_options(&[&config.redis.task_stream_key], &[">"], &options)
            .await
            .expect("Failed to get redis stream reply");

        for id in stream.keys.drain(..).flat_map(|k| k.ids) {
            let Some(task) = id.map.get(REDIS_TASK_QUEUE_STREAM_GROUP)
                .map(Task::from_redis_value)
                .and_then(|i| i.ok()) else {
                continue;
            };

            if let Err(err) = receive_task(&task).await {
                log::error!("Error: {err:#?}");
            };

            redis.xack::<_, _, _, Task>(&config.redis.task_stream_key, REDIS_TASK_QUEUE_STREAM_GROUP, &[id.id])
                .await
                .expect("Failed to acknowledge task");
        }
    }
}

async fn receive_task(task: &Task) -> io::Result<()> {
    let result = match &task.job {
        Job::SignCsr { csr, path } => sign_csr(csr, path).await,
    };

    if let Err(err) = result {
        log::error!("Error: {err:#?}");
    }

    Ok(())
}

async fn sign_csr(csr: impl AsRef<str>, path: impl AsRef<Path>) -> io::Result<()> {
    log::debug!("Signing csr: {csr:?}", csr=csr.as_ref());

    Ok(())
}