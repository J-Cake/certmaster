use std::ffi::OsStr;
use std::io;
use std::path::*;

pub async fn resolve_path(path: impl AsRef<Path>) -> io::Result<PathBuf> {
    let bits = path
        .as_ref()
        .components()
        .collect::<Vec<Component>>();

    let path: PathBuf = match bits.get(0) {
        Some(Component::Normal(pref)) if pref == &OsStr::new("~") =>
            std::env::home_dir()
                .map(|home| home
                    .components()
                    .chain(bits
                        .iter()
                        .skip(1)
                        .cloned()
                    )
                    .collect()
                )
                .expect("Failed to determine home directory"),
        _ => bits
            .into_iter()
            .collect()
    };

    tokio::fs::canonicalize(path).await
}