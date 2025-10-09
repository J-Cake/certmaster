use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub redis: RedisConfig,

    #[serde(default)]
    pub inbox: InboxConfig,

    #[serde(default)]
    pub ca: CaConfig,

    #[serde(default)]
    pub web: WebConfig,

    #[serde(default)]
    pub modules: ModuleList
}

#[derive(Debug, Copy, Clone, Serialize, Deserialize)]
pub struct ModuleList {
    pub ca: bool,
    pub web: bool,
    pub cli: bool,
    pub inbox: bool,
    pub gc: bool,
    pub hooks: bool
}

impl Default for ModuleList {
    fn default() -> Self {
        Self {
            ca: true,
            web: true,
            cli: false,
            inbox: false,
            gc: false,
            hooks: false,
        }
    }
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
pub struct InboxConfig {
    pub inbox: PathBuf,

    pub rescan_interval: u64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct CaConfig {
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