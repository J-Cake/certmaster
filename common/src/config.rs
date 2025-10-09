use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Config {
    pub redis: RedisConfig,

    pub receiver: ReceiverConfig,
    pub ca: CaConfig,
    pub web: WebConfig
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct RedisConfig {
    pub url: String,
    pub channel: Option<String>,
    pub db: Option<u32>,

    #[serde(default = "task_queue_key_default")]
    pub task_stream_key: String,
    #[serde(default = "job_list_key_default")]
    pub job_list_key: String,
}

#[inline]
fn task_queue_key_default() -> String { "event-queue".into() }
#[inline]
fn job_list_key_default() -> String { "job-list".into() }

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct ReceiverConfig {
    pub inbox: PathBuf,

    pub rescan_interval: u64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct CaConfig {
    pub outbox: PathBuf,

    #[serde(default)]
    pub hooks: Vec<PathBuf>,

    pub certificate: PathBuf,
    pub key: PathBuf
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WebConfig {
    pub socket: SocketAddr,
}

impl Default for WebConfig {
    fn default() -> WebConfig {
        WebConfig {
            socket: SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), 9999),
        }
    }
}