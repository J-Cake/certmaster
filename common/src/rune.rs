use std::io;
use std::os::unix::fs::MetadataExt;
use std::sync::{Arc, OnceLock};
use rune::{Source, Unit};
use rune::ast::Path;
// use rune_std::Stdlib;
use crate::Config;

#[derive(Clone)]
pub(crate) struct Runner {
    unit: Arc<Unit>,
    runtime: Arc<rune::runtime::RuntimeContext>,
}

impl Runner {
    fn vm(&self) -> rune::Vm {
        rune::Vm::new(self.runtime.clone(), self.unit.clone())
    }
    async fn create_rn_context(config: &Config, root: impl AsRef<std::path::Path>) -> io::Result<rune::Vm> {
        let mut sources = rune::Sources::new();

        for hook in config.ca.hooks.iter() {
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
            // .map_err(io::Error::other)?
            // .stdlib()
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
}

static RUNTIME: OnceLock<Runner> = OnceLock::new();