use redis::FromRedisValue;
use serde::{Deserialize, Serialize};
use redis_derive::FromRedisValue;
use crate::{CertmasterEvent, CHALLENGE_EVENT_GROUP, NEW_CSR_EVENT_GROUP};
// #[derive(Debug, Serialize, Deserialize)]
// pub enum Event {
//     NewCsr {
//         pem: PEMString
//     },
//     PendingChallenge {
//         id: CsrId
//     }
// }

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

pub type PEMString = String;
pub type CsrId = u64;

#[derive(Debug, FromRedisValue, Serialize, Deserialize)]
pub struct Csr {
    pub(crate) pem: PEMString,


}