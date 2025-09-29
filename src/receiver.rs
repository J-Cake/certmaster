use std::io;
use std::path::PathBuf;
use clap::Parser;
use serde::Deserialize;
use serde::Serialize;
use config::Config;

/// # Receiver
/// The receiver awaits directory changes and issues tasks according to the name of the item in the inbox.

#[derive(clap::Parser)]
pub struct Args {
    #[clap(default_value = "./config.toml")]
    config: PathBuf
}

#[tokio::main]
pub async fn main() -> io::Result<()> {
    env_logger::init();

    let args = Args::parse();

    let config = tokio::fs::read_to_string(args.config)
        .await?;
    let config = toml::from_str::<Config>(&config)
        .map_err(io::Error::other)?;

    Ok(())
}