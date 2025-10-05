use std::time::SystemTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Task {
    pub received: SystemTime,
    pub job: Job
}

#[derive(Debug, Serialize, Deserialize)]
pub enum Job {
    SignCsr {
        path: String,
        csr: PEMString
    }
}

pub type PEMString = String;