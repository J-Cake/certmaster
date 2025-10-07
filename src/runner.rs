use std::io;
use redis::streams::StreamReadOptions;
use redis::streams::StreamReadReply;
use redis::AsyncCommands;
use redis::FromRedisValue;
use redis::RedisResult;
use common::{ChallengeResult, Csr, NewCsr};
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
    log::trace!("Initiating Challenge {id}", id=challenge.id);

    Ok(())
}

async fn challenge_result(challenge: ChallengeResult) -> Result<()> {
    let config = common::get_config();
    let mut redis = config
        .redis
        .connect()
        .await;

    let csr: Csr = redis.get(format!("csr:{id}", id=challenge.id)).await?;

    

    match challenge {
        ChallengeResult { success: false, id } => {
            Err(io::Error::other(format!("Challenge for {id} did not pass.")).into())
        },
        ChallengeResult { success: true, id } => {
            log::info!("Challenge {id} passed");

            Ok(())
        },
    }
}