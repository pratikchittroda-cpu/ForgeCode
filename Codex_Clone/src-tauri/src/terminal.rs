use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Manager};

pub struct TerminalSession {
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
}

impl TerminalSession {
    pub fn new(app_handle: AppHandle) -> Self {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .unwrap();

        let shell = if cfg!(target_os = "windows") {
            "cmd.exe"
        } else {
            "zsh" // Or "bash"
        };

        let mut cmd = CommandBuilder::new(shell);
        let _child = pair.slave.spawn_command(cmd).unwrap();

        let mut reader = pair.master.try_clone_reader().unwrap();
        let writer = Arc::new(Mutex::new(pair.master.take_writer().unwrap()));

        let writer_clone = Arc::clone(&writer);
        
        // Spawn thread to read from PTY and emit to frontend
        thread::spawn(move || {
            let mut buf = [0u8; 1024];
            while let Ok(n) = reader.read(&mut buf) {
                if n == 0 { break; }
                let data = String::from_utf8_lossy(&buf[..n]).to_string();
                app_handle.emit_all("terminal-data", data).unwrap();
            }
        });

        Self { writer: writer_clone }
    }

    pub fn write(&self, data: &str) {
        let mut writer = self.writer.lock().unwrap();
        writer.write_all(data.as_bytes()).unwrap();
        writer.flush().unwrap();
    }
}
