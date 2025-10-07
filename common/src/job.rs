use redis::FromRedisValue;
use serde::{Deserialize, Serialize};
use redis_derive::FromRedisValue;
use crate::{CertmasterEvent};

pub const NEW_CSR_EVENT_GROUP: &str = "new-csr";
pub const CHALLENGE_EVENT_GROUP: &str = "challenge";
pub const CHALLENGE_RESULT_EVENT_GROUP: &str = "challenge-result";

#[derive(Debug, FromRedisValue, Serialize, Deserialize)]
pub struct NewCsr {
    pub pem: PEMString
}

impl CertmasterEvent for NewCsr {
    fn event_name() -> &'static str {
        NEW_CSR_EVENT_GROUP
    }
}

#[derive(Debug, FromRedisValue, Serialize, Deserialize)]
pub struct PendingChallenge {
    pub id: CsrId
}

impl CertmasterEvent for PendingChallenge {
    fn event_name() -> &'static str {
        CHALLENGE_EVENT_GROUP
    }
}

#[derive(Debug, FromRedisValue, Serialize, Deserialize)]
pub struct ChallengeResult {
    pub id: CsrId,
    pub success: bool,
}

impl CertmasterEvent for ChallengeResult {
    fn event_name() -> &'static str {
        CHALLENGE_RESULT_EVENT_GROUP
    }
}

pub type PEMString = String;
pub type CsrId = u64;

#[derive(Debug, FromRedisValue, Serialize, Deserialize)]
pub struct Csr {
    pub(crate) pem: PEMString,
    pub status: ChallengeStatus
}

impl From<NewCsr> for Csr {
    fn from(csr: NewCsr) -> Csr {
        Csr {
            pem: csr.pem,
            status: ChallengeStatus::Pending
        }
    }
}

impl From<PEMString> for Csr {
    fn from(value: PEMString) -> Self {
        Self {
            pem: value,
            status: ChallengeStatus::Pending
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub enum ChallengeStatus {
    Pending,
    Success,
    Failure {
        reason: String
    }
}