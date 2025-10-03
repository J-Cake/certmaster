use common::{Task, Config, REDIS_TASK_QUEUE_STREAM_GROUP, Job};
use redis::{
    streams::StreamReadOptions,
    streams::StreamReadReply,
    AsyncCommands,
    FromRedisValue,
    RedisResult
};
use std::io;
use std::os::unix::fs::MetadataExt;
use std::sync::{Arc, ONCE_INIT};
use std::sync::OnceLock;
use rune::{Context, Source, Unit};

#[derive(Clone)]
struct Runner {
    unit: Arc<Unit>,
    runtime: Arc<rune::runtime::RuntimeContext>,
}

impl Runner {
    fn vm(&self) -> rune::Vm {
        rune::Vm::new(self.runtime.clone(), self.unit.clone())
    }
}

static RUNTIME: OnceLock<Runner> = OnceLock::new();

#[tokio::main]
pub async fn main() -> io::Result<()> {
    env_logger::init();

    log::info!("Starting runner");

    let config = common::read_config().await;
    let mut rune = create_rn_context(&config).await?;

    match rune.call(["main"], ()) {
        Ok(result) => log::debug!("{result:#?}"),
        Err(error) => log::error!("Error: {error:#?}")
    };

    let event = tokio::spawn(handle_redis_events());

    let (..) = tokio::join!(event);

    Ok(())
}

async fn create_rn_context(config: &Config) -> io::Result<rune::Vm> {
    let mut sources = rune::Sources::new();

    for hook in config.runner.hooks.iter() {
        let hook = common::resolve_path(hook)
            .await?;

        let perm = tokio::fs::metadata(&hook).await?;

        #[cfg(unix)]
        if !perm.is_file() || !perm.mode() & 0o100 != 0 {
            return Err(io::Error::new(io::ErrorKind::PermissionDenied, "Not a file or not executable"));
        }

        let source = Source::from_path(hook)
            .map_err(io::Error::other)?;

        sources.insert(source)
            .map_err(io::Error::other)?;
    }

    let mut diagnostics = rune::Diagnostics::new();
    let context = rune::Context::with_default_modules()
        .map_err(io::Error::other)?;

    let unit = rune::prepare(&mut sources)
        .with_context(&context)
        .with_diagnostics(&mut diagnostics)
        .build()
        .map_err(io::Error::other)?;
    let unit = Arc::new(unit);

    let rt = context.runtime()
        .map_err(io::Error::other)?;
    let rt = Arc::new(rt);

    RUNTIME.set(Runner {
        unit: unit.clone(),
        runtime: rt.clone(),
    }).map_err(|_| io::Error::other("Failed to set runner"))?;

    let vm = rune::Vm::new(rt, unit);

    Ok(vm)
}

async fn handle_redis_events() {
    let config = common::get_config();
    let mut redis = config
        .redis
        .connect()
        .await
        .expect("failed to connect to redis server");

    let consumer: u64 = redis.incr("runner", 1)
        .await.expect("Unable to determine worker ID");

    let _: RedisResult<Task> = redis.xgroup_create(&config.redis.task_stream_key, &REDIS_TASK_QUEUE_STREAM_GROUP, "0")
        .await;

    let options = StreamReadOptions::default()
        .block(0)
        .group(REDIS_TASK_QUEUE_STREAM_GROUP, format!("worker-{consumer}"));

    loop {
        let mut stream: StreamReadReply = redis
            .xread_options(&[&config.redis.task_stream_key], &[">"], &options)
            .await
            .expect("Failed to get redis stream reply");

        for key in stream.keys.drain(..).flat_map(|i| i.ids) {
            let Some(task) = key.map.get(REDIS_TASK_QUEUE_STREAM_GROUP)
                .map(Task::from_redis_value)
                .and_then(|i| i.ok()) else {
                continue;
            };

            if let Err(err) = call_hook(&task).await {
                log::error!("Error: {err:#?}");
            };
        }
    }
}

async fn call_hook(task: &Task) -> io::Result<()> {
    let mut vm = RUNTIME.get().unwrap().vm();

    let result = match &task.job {
        Job::SignCsr { csr, path } => vm.call(["on_csr"], (csr.to_owned(), path.to_owned()))
    };

    if let Err(err) = result {
        log::error!("Error: {err:#?}");
    }

    Ok(())
}