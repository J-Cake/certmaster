use crate::RedisConfig;
use redis::aio::MultiplexedConnection;
use std::sync::LazyLock;

static REDIS: LazyLock<tokio::sync::OnceCell<MultiplexedConnection>> = LazyLock::new(tokio::sync::OnceCell::new);

impl RedisConfig {
    pub async fn connect(&self) -> MultiplexedConnection {
        REDIS.get_or_init(async || {
            log::trace!("Establishing connection to Redis");
            redis::Client::open(self.url.as_ref())
                .expect("Failed to connect to Redis")
                .get_multiplexed_async_connection()
                .await
                .expect("Unable to get multiplexed connection")
        }).await.clone()
    }
}