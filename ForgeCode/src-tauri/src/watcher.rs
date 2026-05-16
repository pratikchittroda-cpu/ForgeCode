use notify::{Watcher, RecursiveMode, Config, Event};
use std::path::Path;
use tokio::sync::mpsc;
use tauri::AppHandle;
use tauri::Manager;

pub fn start_watcher(app_handle: AppHandle, path: String) {
    let (tx, mut rx) = mpsc::channel(1);

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        match res {
            Ok(event) => {
                if event.kind.is_modify() || event.kind.is_create() || event.kind.is_remove() {
                    let _ = tx.blocking_send(event);
                }
            },
            Err(e) => println!("watch error: {:?}", e),
        }
    }).expect("Failed to create watcher");

    watcher.watch(Path::new(&path), RecursiveMode::Recursive).expect("Failed to watch path");

    // Background thread to handle events and notify frontend
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            let mut should_notify = false;
            for path in event.paths {
                if let Some(path_str) = path.to_str() {
                    // Ignore node_modules and hidden files
                    if path_str.contains("node_modules") || path_str.contains(".git") {
                        continue;
                    }
                    should_notify = true;
                    // Also notify about specific file changes
                    app_handle.emit_all("file-changed", path_str).unwrap();
                }
            }
            if should_notify {
                app_handle.emit_all("repo-changed", ()).unwrap();
            }
        }
    });

    // Keep watcher alive
    std::mem::forget(watcher);
}
