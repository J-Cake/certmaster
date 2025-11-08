use std::ops::Deref;
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};
use clap::Parser;
use crate::Config;
use crate::Result;

static CONFIG: OnceLock<Arc<Config>> = OnceLock::new();

#[derive(clap::Parser)]
pub struct Args {
    #[clap(long, short, default_value = "./config.toml")]
    config: PathBuf
}

pub async fn read_config() -> Arc<Config> {
    let args = Args::parse();

    let config = tokio::fs::read_to_string(&args.config)
        .await
        .expect("Failed to read config file");

    let mut config = toml::from_str::<Config>(&config)
        .expect("Failed to parse config file");

    config.ca.key = crate::resolve_path(config.ca.key, Some(&args.config)).await
        .expect("Failed to resolve issuer key");

    config.ca.certificate = crate::resolve_path(config.ca.certificate, Some(&args.config)).await
        .expect("Failed to resolve issuer certificate");

    config.ca.hooks = config.ca.hooks
        .into_iter()
        .map(|i| crate::resolve_path(i, Some(args.config.clone())))
        .collect::<tokio::task::JoinSet<std::io::Result<_>>>()
        .join_all()
        .await
        .into_iter()
        .collect::<std::io::Result<Vec<_>>>()
        .expect("Failed to resolve hooks");

    log::debug!("config: {config:#?}");

    let config = Arc::new(config);

    CONFIG.set(config.clone()).expect("Failed to set config");

    return config;
}

pub fn get_config() -> impl Deref<Target=Config> {
    CONFIG.get().cloned().unwrap_or_default()
}