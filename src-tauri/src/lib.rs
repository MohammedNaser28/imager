use tauri::Manager;
use std::fs;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;
use tauri_plugin_updater::UpdaterExt; // ADD THIS LINE
#[derive(Debug, Serialize, Deserialize, Clone)]
struct Shortcut {
    key: String,
    folder: String,
    action: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Settings {
    shortcuts: Vec<Shortcut>,
    output_path: Option<String>,
}

pub struct AppState {
    pub custom_config_path: Mutex<Option<PathBuf>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self { custom_config_path: Mutex::new(None) }
    }
}

fn get_config_path(state: State<'_, AppState>) -> Result<PathBuf, String> {
    if let Some(custom_path) = state.custom_config_path.lock().unwrap().clone() {
        return Ok(custom_path);
    }

    let default_dir = dirs::config_dir().ok_or("No config dir")?.join("imagers");
    let pointer = default_dir.join("last_config.txt");
    
    if pointer.exists() {
        if let Ok(path_str) = fs::read_to_string(pointer) {
            let path = PathBuf::from(path_str.trim());
            if path.exists() { return Ok(path); }
        }
    }

    Ok(default_dir.join("settings.json"))
}

#[tauri::command]
fn set_custom_config_path(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut custom = state.custom_config_path.lock().unwrap();
    *custom = Some(PathBuf::from(&path));

    let default_dir = dirs::config_dir().ok_or("No config dir")?.join("imagers");
    let pointer = default_dir.join("last_config.txt");
    fs::create_dir_all(&default_dir).ok();
    fs::write(pointer, &path).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
fn save_settings(settings: Settings, state: State<'_, AppState>) -> Result<(), String> {
    let config_path = get_config_path(state)?;
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&config_path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    let config_path = get_config_path(state)?;
    if !config_path.exists() {
        return Ok(Settings { shortcuts: Vec::new(), output_path: None });
    }
    let data = fs::read_to_string(config_path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_image(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn check_for_updates(app: tauri::AppHandle) -> Result<String, String> {
    match app.updater() {
        Ok(updater) => {
            match updater.check().await {
                Ok(Some(update)) => {
                    Ok(format!("Update available: version {}", update.version))
                }
                Ok(None) => Ok("App is up to date".to_string()),
                Err(e) => Err(format!("Failed to check for updates: {}", e))
            }
        }
        Err(e) => Err(format!("Updater not available: {}", e))
    }
}

#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<String, String> {
    match app.updater() {
        Ok(updater) => {
            match updater.check().await {
                Ok(Some(update)) => {
                    // Download and install the update
                    update.download_and_install(
                        |_chunk_length, _content_length| {
                            // Progress callback - you can use this to show progress
                        },
                        || {
                            // Download finished callback
                            println!("Download finished");
                        }
                    ).await.map_err(|e| format!("Failed to install update: {}", e))?;
                    
                    Ok("Update installed successfully. Please restart the app.".to_string())
                }
                Ok(None) => Ok("No updates available".to_string()),
                Err(e) => Err(format!("Failed to check for updates: {}", e))
            }
        }
        Err(e) => Err(format!("Updater not available: {}", e))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState { custom_config_path: Mutex::new(None) })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            read_image,
            save_settings,
            load_settings,
            check_for_updates,
            install_update,
            set_custom_config_path
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            
            // Check for updates on startup (optional - only checks, doesn't auto-install)
            tauri::async_runtime::spawn(async move {
                if let Ok(updater) = handle.updater() {
                    if let Ok(Some(_update)) = updater.check().await {
                        println!("Update available!");
                        // You can send an event to the frontend here to notify the user
                    }
                }
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}