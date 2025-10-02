use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Config {
    pub redis: RedisConfig,

    pub receiver: ReceiverConfig,
    pub runner: RunnerConfig
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct RedisConfig {
    pub url: String,
    pub channel: Option<String>,
    pub db: Option<u32>,

    #[serde(default = "task_queue_key_default")]
    pub task_stream_key: String,
}

#[inline]
fn task_queue_key_default() -> String { "task-queue".into() }

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct ReceiverConfig {
    pub inbox: PathBuf,

    pub rescan_interval: u64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct RunnerConfig {
    pub outbox: PathBuf,

    #[serde(default)]
    pub hooks: Vec<PathBuf>
}

pub const REDIS_TASK_QUEUE_STREAM_GROUP: &'static str = "Task";