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
    pub channel: String,
    pub password: Option<String>,
    pub db: Option<u32>,
    pub tls: Option<bool>,
    pub tls_verify: Option<bool>,
    pub tls_ca_cert: Option<String>,
    pub tls_cert: Option<String>,
    pub tls_key: Option<String>,
    pub tls_server_name: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct ReceiverConfig {
    pub inbox: PathBuf,
}

#[derive(Serialize, Deserialize)]
pub struct RunnerConfig {
    pub outbox: PathBuf,
}