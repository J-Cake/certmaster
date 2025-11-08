use std::ffi::OsStr;
use std::{env, io};
use std::path::*;

pub async fn resolve_path(path: impl AsRef<Path>, root: Option<impl AsRef<Path>>) -> io::Result<PathBuf> {
    let bits = path
        .as_ref()
        .components()
        .collect::<Vec<Component>>();

    let root = root.map(|i| i.as_ref().to_owned())
        .or_else(|| env::home_dir())
        .expect("Could not determine root directory");

    let root = if tokio::fs::metadata(&root).await?.is_file() {
        root.parent()
            .expect("We got a file as a root directory somehow")
            .to_owned()
    } else {
        root
    };

    let path: PathBuf = match bits.first() {
        Some(Component::CurDir) => root.components()
            .chain(bits
                .iter()
                .cloned())
            .collect(),
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