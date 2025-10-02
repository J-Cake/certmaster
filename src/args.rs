use std::ops::Deref;
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};
use clap::Parser;
use crate::Config;

static CONFIG: OnceLock<Arc<Config>> = OnceLock::new();

#[derive(clap::Parser)]
pub struct Args {
    #[clap(long, short, default_value = "./config.toml")]
    config: PathBuf
}

pub async fn read_config() -> Arc<Config> {
    let args = Args::parse();

    let config = tokio::fs::read_to_string(args.config)
        .await
        .expect("Failed to read config file");

    let config = Arc::new(toml::from_str::<Config>(&config).expect("Failed to parse config file"));

    CONFIG.set(config.clone()).expect("Failed to set config");

    return config;
}

pub fn get_config() -> impl Deref<Target=Config> {
    CONFIG.get().cloned().unwrap_or_default()
}