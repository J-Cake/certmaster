mod convert;
mod debounce;
mod config;
mod args;

use std::time::SystemTime;
use serde::{Deserialize, Serialize};

pub use config::*;
pub use args::*;
pub use debounce::debounce;

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