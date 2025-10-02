use crate::{RedisConfig, Task};
use redis::aio::MultiplexedConnection;
use redis::{FromRedisValue, RedisResult, Value};
use serde::Deserialize;
use std::io;
use std::sync::OnceLock;
use serde::de::DeserializeOwned;

static REDIS: OnceLock<MultiplexedConnection> = OnceLock::new();

impl RedisConfig {
    pub async fn connect(&self) -> io::Result<MultiplexedConnection> {
        if let Some(redis) = REDIS.get() {
            Ok(redis.clone())
        } else {
            let redis = redis::Client::open(self.url.as_ref())
                .map_err(io::Error::other)?
                .get_multiplexed_async_connection()
                .await
                .map_err(io::Error::other)?;

            if let Err(..) = REDIS.set(redis.clone()) {
                return Err(io::Error::other(
                    "Failed to allocate handle to Redis connection.",
                ));
            }

            Ok(redis)
        }
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
