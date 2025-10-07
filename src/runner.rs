use std::io;
use std::sync::{Arc, LazyLock};
use base64::Engine;
use rcgen::{CertificateSigningRequest, Issuer, KeyPair, SigningKey};
use redis::streams::StreamReadOptions;
use redis::streams::StreamReadReply;
use redis::AsyncCommands;
use redis::FromRedisValue;
use redis::RedisResult;
use ron::to_string;
use common::{JobProgress, JobStatus, Config, Csr, NewCsr, Completion, AltName};
use common::PendingChallenge;
use common::NEW_CSR_EVENT_GROUP;
use common::CHALLENGE_EVENT_GROUP;
use common::JOB_PROGRESS_EVENT_GROUP;
use common::CsrId;
use common::Result;
use common::RedisUtils;
use once_cell::unsync::Lazy;

static BASE64_ENGINE: LazyLock<base64::engine::GeneralPurpose> = LazyLock::new(|| base64::engine::GeneralPurpose::new(&base64::alphabet::STANDARD, Default::default()));

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
                    JOB_PROGRESS_EVENT_GROUP => job_progress(FromRedisValue::from_redis_value(&value)?).await?,
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

    let _: () = redis.set(format!("csr:{csr_id}"), ron::to_string(&Csr::from(csr.clone()))?)
        .await?;

    let alt = blake3::hash(format!("{id};{pem}", id=csr.client_id, pem=csr.pem).as_bytes());
    let alt = BASE64_ENGINE.encode(alt.as_bytes());
    let _: () = redis.set(format!("alt:{alt}"), ron::to_string(&AltName {
        client_id: csr.client_id,
        alias: csr_id,
    })?)
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

    match csr.status {
        JobStatus::Pending => {},
        _ => return Err(io::Error::other("Request has already been processed.").into())
    }

    Ok(())
}

async fn job_progress(update: JobProgress) -> Result<()> {
    let config = common::get_config();
    let mut redis = config
        .redis
        .connect()
        .await;

    let redis_key = format!("csr:{id}", id=update.id);
    let mut csr: Csr = redis.get(&redis_key).await?;

    csr.status = match update.status {
        JobStatus::Pending | JobStatus::ChallengePending if csr.status != update.status => {
            log::warn!("Job {id} was changed to {status:?}. Changing a job back to pending can leave it in a non-recoverable state.", id=update.id, status=update.status);
            update.status
        },
        JobStatus::ChallengePassed => {
            log::info!("Challenge {id} passed", id=update.id);
            let signing = ('crt: {
                let issuer = match get_issuer(&config).await {
                    Ok(issuer) => issuer,
                    Err(err) => break 'crt Err(err),
                };

                let params = match rcgen::CertificateSigningRequestParams::from_pem(csr.pem()) {
                    Ok(mut params) => {
                        params.params.serial_number.replace(update.id.into());
                        params
                    },
                    Err(err) => break 'crt Err(err.into()),
                };

                log::info!("Signing certificate for {cn:?}", cn=params.params.subject_alt_names);

                let result = match params.signed_by(&issuer) {
                    Ok(result) => result,
                    Err(err) => break 'crt Err(err.into()),
                };

                Ok(result)
            });

            let new_status = match signing {
                Ok(cert) => {
                    log::info!("Certificate for client signed.");
                    redis.dispatch_event(Completion {
                        id: update.id,
                        certificate: cert.pem()
                    }).await?;
                    JobStatus::Finished
                },
                Err(err) => {
                    log::error!("{err:?}");
                    JobStatus::SigningError {
                        reason: err.to_string(),
                    }
                }
            };

            redis.dispatch_event(JobProgress {
                id: update.id,
                status: new_status.clone(),
            }).await?;

            new_status
        },
        status => status
    };

    let _: () = redis.set(redis_key, ron::to_string(&csr)?).await?;

    Ok(())
}

async fn completion(completion: Completion) -> Result<()> {
    let config = common::get_config();
    let mut redis = config
        .redis
        .connect()
        .await;

    let csr_key = format!("csr:{id}", id=completion.id);
    let cert_key = format!("cert:{id}", id=completion.id);
    let mut csr: Csr = redis.get(&csr_key).await?;

    csr.status = JobStatus::Stale;

    let _: () = redis.set(cert_key, ron::to_string(&completion)?).await?;
    let _: () = redis.set(csr_key, ron::to_string(&csr)?).await?;

    Ok(())
}

async fn get_issuer(config: &Config) -> Result<rcgen::Issuer<'_, impl SigningKey>> {
    let cert = tokio::fs::read_to_string(&config.ca.certificate).await?;
    let key = tokio::fs::read_to_string(&config.ca.key).await?;

    let key = KeyPair::from_pem(&key)?;

    Ok(Issuer::from_ca_cert_pem(&cert, key)?)
}
