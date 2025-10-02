use common::{Config, Task, REDIS_TASK_QUEUE_STREAM_GROUP};
use redis::streams::StreamReadOptions;
use redis::streams::StreamReadReply;
use redis::{AsyncCommands, FromRedisValue, RedisResult};
use std::io;
use rune::Source;

#[tokio::main]
pub async fn main() -> io::Result<()> {
    env_logger::init();

    log::info!("Starting runner");

    let config = common::read_config().await;

    let rune = create_rn_context(&config).await;

    let event = tokio::spawn(handle_redis_events());

    let (..) = tokio::join!(event);

    Ok(())
}

async fn create_rn_context(config: &Config) {
    let mut sources = rune::Sources::new();

    for hook in config.runner.hooks.iter() {
        let source = Source::from_path(hook)
            .expect("Failed to load hook");

        sources.insert(source)
            .expect("Failed to add hook to sources");
    }
}

async fn handle_redis_events() {
    let config = common::get_config();
    let mut redis = config
        .redis
        .connect()
        .await
        .expect("failed to connect to redis server");

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

        for key in stream.keys.drain(..).flat_map(|i| i.ids) {
            let Some(value) = key.map.get(REDIS_TASK_QUEUE_STREAM_GROUP)
                .map(Task::from_redis_value)
                .and_then(|i| i.ok()) else {
                continue;
            };

            log::debug!("{value:#?}");
        }
    }
}
