use std::io;
use async_trait::async_trait;
use redis::aio::MultiplexedConnection;
use redis::{AsyncCommands, FromRedisValue, RedisError};
use redis::streams::StreamAddOptions;
use serde::{Deserialize, Serialize};
use serde::de::DeserializeOwned;
use crate::{ClientJob, Csr, NewCsr, RedisConfig, NEW_CSR_EVENT_GROUP};
use crate::Result;

#[async_trait]
pub trait RedisUtils {
    async fn dispatch_event<Event: CertmasterEvent + Send>(&mut self, event: Event) -> io::Result<()>;
    async fn get_job(&mut self, alias: &str) -> Result<ClientJob>;
}
pub trait CertmasterEvent: Serialize + DeserializeOwned + FromRedisValue {
    fn event_name() -> &'static str;
}

#[async_trait]
impl RedisUtils for MultiplexedConnection {
    async fn dispatch_event<Event: CertmasterEvent + Send>(&mut self, event: Event) -> io::Result<()> {
        let config = crate::get_config();

        let payload = ron::to_string(&event)
            .map_err(io::Error::other)?;

        let _: () = self.xadd(&config.redis.task_stream_key, "*", &[(Event::event_name(), payload)])
            .await
            .map_err(io::Error::other)?;

        Ok(())
    }

    async fn get_job(&mut self, alias: &str) -> Result<ClientJob> {

        Ok(self.get(format!("alt:{alias}")).await?)
    }
}