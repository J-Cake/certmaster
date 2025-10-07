use std::io;
use rcgen::{CertificateSigningRequest, Issuer, KeyPair, SigningKey};
use redis::streams::StreamReadOptions;
use redis::streams::StreamReadReply;
use redis::AsyncCommands;
use redis::FromRedisValue;
use redis::RedisResult;
use ron::to_string;
use common::{ChallengeResult, JobStatus, Config, Csr, NewCsr};
use common::PendingChallenge;
use common::NEW_CSR_EVENT_GROUP;
use common::CHALLENGE_EVENT_GROUP;
use common::CHALLENGE_RESULT_EVENT_GROUP;
use common::CsrId;
use common::Result;
use common::RedisUtils;

pub(crate) async fn handle_redis_events() -> Result<()> {
    let config = common::get_config();
    let mut redis = config
        .redis
        .connect()
        .await;

    let consumer: u64 = redis.incr("new-csr-worker", 1)
        .await?;

    let _: RedisResult<NewCsr> = redis.xgroup_create(&config.redis.task_stream_key, NEW_CSR_EVENT_GROUP, "0")
        .await;

    let options = StreamReadOptions::default()
        .block(0)
        .group(NEW_CSR_EVENT_GROUP, format!("worker-{consumer}"));

    loop {
        let mut stream: StreamReadReply = redis
            .xread_options(&[&config.redis.task_stream_key], &[">"], &options)
            .await?;

        for id in stream.keys.drain(..).flat_map(|k| k.ids) {
            for (key, value) in id.map {
                log::trace!("Received event '{key}'");

                match key.as_str() {
                    NEW_CSR_EVENT_GROUP => new_csr(FromRedisValue::from_redis_value(&value)?).await?,
                    CHALLENGE_EVENT_GROUP => challenge(FromRedisValue::from_redis_value(&value)?).await?,
                    CHALLENGE_RESULT_EVENT_GROUP => challenge_result(FromRedisValue::from_redis_value(&value)?).await?,
                    key => {
                        log::warn!("Unknown job type {key} - skipping");
                        continue;
                    }
                }
            }

            let _: () = redis.xack(&config.redis.task_stream_key, NEW_CSR_EVENT_GROUP, &[id.id])
                .await?;

        }
    }
}

async fn new_csr(csr: NewCsr) -> Result<()> {
    let config = common::get_config();
    let mut redis = config
        .redis
        .connect()
        .await;

    let csr_id: CsrId = redis.incr("csr_id", 1)
        .await?;

    log::trace!("Parsing CSR");

    let params = rcgen::CertificateSigningRequestParams::from_pem(&csr.pem)?;

    // TODO: Check whether all parameters are acceptable. If not fail the CSR. If acceptable, dispatch a challenge job.

    log::debug!("{csr:#?}");

    let _: () = redis.set(format!("csr:{csr_id}"), ron::to_string(&Csr::from(csr))?)
        .await?;

    redis.dispatch_event(PendingChallenge {
        id: csr_id,
    }).await?;

    Ok(())
}

async fn challenge(challenge: PendingChallenge) -> Result<()> {
    let config = common::get_config();
    let mut redis = config
        .redis
        .connect()
        .await;

    log::trace!("Initiating Challenge {id}", id=challenge.id);
    let csr: Csr = redis.get(format!("csr:{id}", id=challenge.id)).await?;

    if let 
        JobStatus::ChallengePassed | 
        JobStatus::ChallengeFailed { .. } | 
        JobStatus::Finished | 
        JobStatus::SigningError { .. } = csr.status {
        return Err(io::Error::other("Request has already been processed.").into());
    }

    Ok(())
}

async fn challenge_result(challenge: ChallengeResult) -> Result<()> {
    let config = common::get_config();
    let mut redis = config
        .redis
        .connect()
        .await;

    let redis_key = format!("csr:{id}", id=challenge.id);
    let csr: Csr = redis.get(&redis_key).await?;

    match challenge {
        ChallengeResult { success: false, id } => {
            Err(io::Error::other(format!("Challenge for {id} did not pass.")).into())
        },
        ChallengeResult { success: true, id } => {
            log::info!("Challenge {id} passed");

            let Ok(cert) = ('crt: {
                let issuer = match get_issuer(&config).await {
                    Ok(issuer) => issuer,
                    Err(err) => break 'crt Err(err),
                };

                let params = match rcgen::CertificateSigningRequestParams::from_pem(csr.pem()) {
                    Ok(params) => params,
                    Err(err) => break 'crt Err(err.into()),
                };

                let result = match params.signed_by(&issuer) {
                    Ok(result) => result,
                    Err(err) => break 'crt Err(err.into()),
                };

                Ok(result)
            }) else {
                return Err(io::Error::other("Signing certificate failed").into())
            };

            let mut csr = csr;

            redis.set(format!("csr:{id}"), ron::to_string()?).await?;
            log::info!("Certificate for client signed.");

            Ok(())
        },
    }
}

async fn get_issuer(config: &Config) -> Result<rcgen::Issuer<impl SigningKey>> {
    let cert = tokio::fs::read_to_string(&config.ca.certificate).await?;
    let key = tokio::fs::read_to_string(&config.ca.key).await?;

    let key = KeyPair::from_pem(&key)?;

    Ok(Issuer::from_ca_cert_pem(&cert, key)?)
}
