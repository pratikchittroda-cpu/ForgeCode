// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
mod parser;
mod watcher;
mod agent;
mod patcher;
mod terminal;
mod context;

use parser::RepoParser;
use agent::orchestrator::Orchestrator;
use terminal::TerminalSession;
use std::sync::Mutex;

struct AppState {
    parser: Mutex<RepoParser>,
    orchestrator: Mutex<Orchestrator>,
    terminal: Mutex<Option<TerminalSession>>,
    agent_runtime: Mutex<Option<agent::runtime::AgentRuntime>>,
    context_engine: Mutex<Option<context::ContextEngine>>,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn index_file(state: tauri::State<'_, AppState>, path: String, content: String) -> Result<Vec<parser::types::Symbol>, String> {
    let mut parser = state.parser.lock().map_err(|e| e.to_string())?;
    parser.parse_file(&path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn watch_repo(app_handle: tauri::AppHandle, path: String) -> Result<(), String> {
    watcher::start_watcher(app_handle, path);
    Ok(())
}

#[tauri::command]
async fn test_ai_connection() -> Result<String, String> {
    let client = reqwest::Client::new();
    let res = client.get("http://127.0.0.1:1234/v1/models")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(format!("Connected! Status: {}", res.status()))
}

#[tauri::command]
async fn create_plan(state: tauri::State<'_, AppState>, goal: String) -> Result<agent::orchestrator::Plan, String> {
    let mut orch = state.orchestrator.lock().map_err(|e| e.to_string())?;
    Ok(orch.create_plan(&goal))
}

#[tauri::command]
async fn open_project(state: tauri::State<'_, AppState>) -> Result<String, String> {
    use tauri::api::dialog::blocking::FileDialogBuilder;
    let path = FileDialogBuilder::new()
        .pick_folder()
        .ok_or("No folder selected")?;
    
    let path_str = path.to_string_lossy().to_string();
    
    // Initialize context engine for the new project
    let mut ce_lock = state.context_engine.lock().map_err(|e| e.to_string())?;
    *ce_lock = Some(context::ContextEngine::new(path.clone()));
    
    Ok(path_str)
}

#[tauri::command]
async fn create_directory(path: String) -> Result<String, String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(format!("Successfully created directory: {}", path))
}

#[tauri::command]
async fn search_in_files(path: String, query: String) -> Result<Vec<String>, String> {
    let mut results = Vec::new();
    for entry in walkdir::WalkDir::new(&path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file()) {
        
        let file_path = entry.path();
        if let Ok(content) = std::fs::read_to_string(file_path) {
            if content.contains(&query) {
                results.push(file_path.to_string_lossy().to_string());
            }
        }
    }
    Ok(results)
}

#[tauri::command]
async fn get_git_status(path: String) -> Result<serde_json::Value, String> {
    let output = std::process::Command::new("git")
        .arg("status")
        .arg("--porcelain")
        .current_dir(path)
        .output()
        .map_err(|e| e.to_string())?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut status_map = serde_json::Map::new();
    
    for line in stdout.lines() {
        if line.len() > 3 {
            let status = &line[..2].trim();
            let file = &line[3..];
            status_map.insert(file.to_string(), serde_json::Value::String(status.to_string()));
        }
    }
    Ok(serde_json::Value::Object(status_map))
}

#[tauri::command]
async fn list_project_files(path: String) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    for entry in walkdir::WalkDir::new(path)
        .max_depth(3)
        .into_iter()
        .filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                files.push(entry.path().to_string_lossy().to_string());
            }
        }
    Ok(files)
}

#[tauri::command]
async fn init_terminal(app_handle: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut terminal = state.terminal.lock().map_err(|e| e.to_string())?;
    *terminal = Some(TerminalSession::new(app_handle));
    Ok(())
}

#[tauri::command]
async fn run_terminal_sync(command: String) -> Result<String, String> {
    use std::process::Command;
    let output = if cfg!(target_os = "windows") {
        Command::new("cmd").args(["/C", &command]).output()
    } else {
        Command::new("sh").args(["-c", &command]).output()
    }.map_err(|e| e.to_string())?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
async fn write_terminal(state: tauri::State<'_, AppState>, data: String) -> Result<(), String> {
    let terminal = state.terminal.lock().map_err(|e| e.to_string())?;
    if let Some(session) = terminal.as_ref() {
        session.write(&data);
        Ok(())
    } else {
        Err("Terminal not initialized".to_string())
    }
}

#[tauri::command]
async fn read_project_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn apply_file_patch(path: String, content: String) -> Result<String, String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(format!("Successfully updated {}", path))
}

#[tauri::command]
async fn replace_in_file(path: String, target: String, replacement: String) -> Result<String, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let new_content = patcher::Patcher::dry_run_patch(&content, &target, &replacement, &path)?;
    std::fs::write(&path, new_content).map_err(|e| e.to_string())?;
    Ok(format!("Successfully updated {}", path))
}

#[tauri::command]
async fn read_file_range(path: String, start: usize, end: usize) -> Result<String, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let lines: Vec<&str> = content.lines().collect();
    let start_idx = (start.max(1) - 1).min(lines.len());
    let end_idx = end.min(lines.len());
    
    if start_idx >= end_idx {
        return Ok(String::new());
    }

    Ok(lines[start_idx..end_idx].join("\n"))
}

#[tauri::command]
async fn web_search(query: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    // Using a simple duckduckgo html search for robustness
    let url = format!("https://html.duckduckgo.com/html/?q={}", query);
    let res = client.get(url)
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    let body = res.text().await.map_err(|e| e.to_string())?;
    // In a real app we would parse this, for now return a snippet
    Ok(format!("Search results for '{}' retrieved. (HTML content length: {})", query, body.len()))
}

#[tauri::command]
async fn call_local_model(prompt: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": "lmstudio-community/qwen2.5-coder-7b-instruct-mlx",
        "messages": [
            {
                "role": "system", 
                "content": "You are ForgeCode, a world-class Senior AI Architect. \n\n### Your Capabilities:\n- **File Agency**: <write_file path=\"...\"/>, <read_file path=\"...\"/>\n- **System Agency**: <run_command>cmd</run_command>, <create_dir path=\"...\"/>\n\n### Your Style:\n1. **Deep Analysis**: Before answering, perform a brief architectural scan. Don't just list facts; provide insights.\n2. **Elite Formatting**: Use headers, bold keys, and clean code blocks. \n3. **Autonomous Action**: If a task requires multiple steps (e.g., create folder, then file), perform them all in sequence using your tools."
            },
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2,
        "stream": false
    });

    let res = client.post("http://127.0.0.1:1234/v1/chat/completions")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    
    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("Failed to parse AI response")?;

    Ok(content.to_string())
}

#[tauri::command]
async fn start_agent_task(app_handle: tauri::AppHandle, state: tauri::State<'_, AppState>, goal: String) -> Result<(), String> {
    let runtime = {
        let mut runtime_lock = state.agent_runtime.lock().map_err(|e| e.to_string())?;
        if runtime_lock.is_none() {
            *runtime_lock = Some(agent::runtime::AgentRuntime::new(app_handle));
        }
        runtime_lock.as_ref().unwrap().clone()
    }; // Lock dropped here
    
    runtime.start_task(goal).await;
    Ok(())
}

#[tauri::command]
async fn get_symbols_in_file(state: tauri::State<'_, AppState>, path: String) -> Result<Vec<parser::types::Symbol>, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut parser = state.parser.lock().map_err(|e| e.to_string())?;
    parser.parse_file(&path, &content).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            parser: Mutex::new(RepoParser::new()),
            orchestrator: Mutex::new(Orchestrator::new()),
            terminal: Mutex::new(None),
            agent_runtime: Mutex::new(None),
            context_engine: Mutex::new(None),
        })
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet, call_local_model, index_file, watch_repo, create_plan, 
            test_ai_connection, apply_file_patch, open_project, list_project_files, 
            init_terminal, write_terminal, run_terminal_sync, read_project_file, 
            replace_in_file, create_directory, search_in_files, get_git_status,
            get_symbols_in_file, read_file_range, web_search, start_agent_task
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
