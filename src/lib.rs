mod convert;
mod debounce;
mod config;
mod args;
mod resolve_homedir;

use std::time::SystemTime;
use serde::{Deserialize, Serialize};

pub use config::*;
pub use args::*;
pub use debounce::debounce;
pub use resolve_homedir::resolve as resolve_path;

#[derive(Debug, Serialize, Deserialize)]
pub struct Task {
    pub received: SystemTime,
    pub job: Job
}

#[derive(Debug, Serialize, Deserialize)]
pub enum Job {
    SignCsr {
        path: String,
        csr: String
    }
}