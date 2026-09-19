use serde_json::Value;
use std::{
    fs::{self, OpenOptions},
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::mpsc::{self, Receiver},
    thread,
    time::{Duration, Instant},
};

pub struct Backend {
    child: Child,
    events: Receiver<Value>,
    pub origin: url::Url,
}

pub fn allowed_navigation(origin: &url::Url, destination: &url::Url) -> bool {
    origin.origin() == destination.origin()
        || (destination.scheme() == "http" && destination.host_str() == Some("127.0.0.1"))
        || destination.as_str() == "about:blank"
}

impl Backend {
    pub fn start(resources: &Path, data: &Path) -> Result<Self, String> {
        fs::create_dir_all(data).map_err(|e| e.to_string())?;
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(data.join("settings.json"))
        {
            Ok(mut file) => file
                .write_all(b"{\"server\":{\"port\":54321}}\n")
                .map_err(|e| e.to_string())?,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error.to_string()),
        }
        let bin = resources.join("bin");
        let node = bin.join(if cfg!(windows) { "node.exe" } else { "node" });
        let mut paths = vec![bin];
        if let Some(path) = std::env::var_os("PATH") {
            paths.extend(std::env::split_paths(&path));
        }
        if cfg!(target_os = "macos") {
            paths.extend([
                PathBuf::from("/opt/homebrew/bin"),
                PathBuf::from("/usr/local/bin"),
            ]);
        }
        let logs = OpenOptions::new()
            .create(true)
            .append(true)
            .open(data.join("desktop-server.log"))
            .map_err(|e| e.to_string())?;
        let mut command = Command::new(node);
        command
            .arg(resources.join("server/dist/cli.js"))
            .arg("serve")
            .arg("--data-dir")
            .arg(data)
            .current_dir(data)
            .env("REDPACT_DESKTOP_CONTROL", "1")
            .env(
                "PATH",
                std::env::join_paths(paths).map_err(|e| e.to_string())?,
            )
            .env_remove("NODE_OPTIONS")
            .env_remove("NODE_PATH")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(logs);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command
            .spawn()
            .map_err(|e| format!("Cannot start bundled Node: {e}"))?;
        let stdout = child.stdout.take().ok_or("Missing server stdout")?;
        let (sender, events) = mpsc::channel();
        let log_path = data.join("desktop-server.log");
        thread::spawn(move || {
            let mut log = OpenOptions::new()
                .create(true)
                .append(true)
                .open(log_path)
                .ok();
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if let Some(log) = log.as_mut() {
                    let _ = writeln!(log, "{line}");
                }
                if let Ok(value) = serde_json::from_str::<Value>(&line) {
                    if value.get("desktop").is_some() {
                        let _ = sender.send(value);
                    }
                }
            }
        });
        let ready = events.recv_timeout(Duration::from_secs(30));
        let port = ready
            .as_ref()
            .ok()
            .filter(|v| v["desktop"] == "ready")
            .and_then(|v| v["port"].as_u64())
            .filter(|p| *p > 0 && *p <= 65535);
        match port {
            Some(port) => Ok(Self {
                child,
                events,
                origin: url::Url::parse(&format!("http://127.0.0.1:{port}/"))
                    .map_err(|e| e.to_string())?,
            }),
            None => {
                drop(child.stdin.take());
                let deadline = Instant::now() + Duration::from_secs(5);
                while child.try_wait().ok().flatten().is_none() && Instant::now() < deadline {
                    thread::sleep(Duration::from_millis(50));
                }
                if child.try_wait().ok().flatten().is_none() {
                    let _ = child.kill();
                }
                let _ = child.wait();
                Err(format!("Redpact did not become ready. Check desktop-server.log (port may already be in use): {ready:?}"))
            }
        }
    }

    pub fn stop(&mut self, only_idle: bool) -> Result<bool, String> {
        if self.child.try_wait().map_err(|e| e.to_string())?.is_some() {
            return Ok(true);
        }
        if let Some(input) = self.child.stdin.as_mut() {
            writeln!(input, "{}", if only_idle { "update" } else { "shutdown" })
                .map_err(|e| e.to_string())?;
        }
        if only_idle {
            let reply = self
                .events
                .recv_timeout(Duration::from_secs(30))
                .map_err(|e| e.to_string())?;
            if reply["desktop"] == "busy" {
                return Ok(false);
            }
            if reply["desktop"] != "stopped" {
                return Err(format!("Server could not stop: {reply}"));
            }
        }
        let deadline = Instant::now() + Duration::from_secs(30);
        while Instant::now() < deadline {
            if let Some(status) = self.child.try_wait().map_err(|e| e.to_string())? {
                if !status.success() {
                    return Err(format!("Server exited with {status}"));
                }
                return Ok(true);
            }
            thread::sleep(Duration::from_millis(50));
        }
        Err("Server cleanup is still running; retry after it finishes".into())
    }
}

impl Drop for Backend {
    fn drop(&mut self) {
        drop(self.child.stdin.take());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn development_updater_configuration_can_initialize() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let parsed = serde_json::from_value::<tauri_plugin_updater::Config>(
            config["plugins"]["updater"].clone(),
        );
        assert!(
            parsed.is_ok(),
            "Updater config must initialize without a production key: {parsed:?}"
        );
    }
    #[test]
    fn restrict_navigation_to_the_owned_server() {
        let origin = url::Url::parse("http://127.0.0.1:54321/").unwrap();
        for path in [
            "http://localhost:54321/",
            "https://example.org/",
            "file:///etc/passwd",
        ] {
            assert!(!allowed_navigation(
                &origin,
                &url::Url::parse(path).unwrap()
            ));
        }
        assert!(allowed_navigation(
            &origin,
            &origin.join("settings").unwrap()
        ));
        assert!(allowed_navigation(
            &origin,
            &url::Url::parse("http://127.0.0.1:54399/storyboard").unwrap()
        ));
    }
}
