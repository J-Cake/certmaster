use std::io;
use std::path::PathBuf;
use clap::Parser;
use config::Config;

#[derive(clap::Parser)]
pub struct Args {
    #[clap(long, short, default_value = "./config.toml")]
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