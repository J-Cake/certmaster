mod convert;

use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct Config {
    pub redis: RedisConfig,

    pub receiver: ReceiverConfig,
    pub runner: RunnerConfig
}

#[derive(Serialize, Deserialize)]
pub struct RedisConfig {
    pub url: String,
    pub channel: Option<String>,
    pub db: Option<u32>,
}

#[derive(Serialize, Deserialize)]
pub struct ReceiverConfig {
    pub inbox: PathBuf,
}

#[derive(Serialize, Deserialize)]
pub struct RunnerConfig {
    pub outbox: PathBuf,
}