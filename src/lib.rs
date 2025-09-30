mod convert;
mod debounce;

use std::alloc::System;
use std::path::PathBuf;
use std::time::SystemTime;
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
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct ReceiverConfig {
    pub inbox: PathBuf,
    
    pub rescan_interval: u64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct RunnerConfig {
    pub outbox: PathBuf,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Task {
    pub received: SystemTime,
    pub path: String,
    pub csr: String,
}

pub use debounce::debounce;