use crate::ClientJob;
use crate::Result;
use async_trait::async_trait;
use redis::aio::MultiplexedConnection;
use redis::AsyncCommands;
use redis::FromRedisValue;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::io;

#[async_trait]
pub trait RedisUtils {
    async fn dispatch_event<Event: CertmasterEvent + Send>(&mut self, event: Event) -> io::Result<()>;
    async fn get_jobs_by_alias<T: AsRef<str>>(&mut self, alias: impl Iterator<Item=T> + Send) -> Result<Vec<ClientJob>>;
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

    async fn get_jobs_by_alias<T: AsRef<str>>(&mut self, alias: impl Iterator<Item=T> + Send) -> Result<Vec<ClientJob>> {
        let jobs = alias
            .map(|i| format!("alt:{str}", str=i.as_ref()))
            .collect::<Vec<_>>();

        if jobs.is_empty() {
            return Ok(vec![]);
        }

        Ok(self.mget(jobs).await?)
    }
}