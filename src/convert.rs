use crate::{RedisConfig};
use redis::aio::MultiplexedConnection;
use redis::{FromRedisValue, RedisResult, Value};
use serde::Deserialize;
use std::io;
use std::sync::{LazyLock, OnceLock};
use serde::de::DeserializeOwned;
use crate::job::Task;

static REDIS: LazyLock<tokio::sync::OnceCell<MultiplexedConnection>> = LazyLock::new(|| tokio::sync::OnceCell::new());

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

impl FromRedisValue for Task {
    fn from_redis_value(v: &Value) -> RedisResult<Self> {
        let str = String::from_redis_value(v)?;

        ron::from_str(&str).map_err(|e| {
            redis::RedisError::from((redis::ErrorKind::TypeError, "RON decode", e.to_string()))
        })
    }
}
