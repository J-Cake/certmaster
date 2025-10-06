mod convert;
mod debounce;
mod config;
mod args;
mod resolve_homedir;
mod job;
mod rune;
mod redis_util;

pub use config::*;
pub use args::*;
pub use resolve_homedir::*;
pub use job::*;
pub use debounce::*;
pub use redis_util::*;

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;