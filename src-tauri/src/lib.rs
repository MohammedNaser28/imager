use tauri::Manager;
use std::fs;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri_plugin_updater::UpdaterExt; // Required for .updater_builder()

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

fn get_config_path() -> Result<PathBuf, String> {
    let config_dir = dirs::config_dir()
        .ok_or("Could not find config directory")?;
    let app_dir = config_dir.join("imagers");
    
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }
    
    Ok(app_dir.join("settings.json"))
}

#[tauri::command]
fn read_image(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_settings(settings: Settings) -> Result<(), String> {
    let config_path = get_config_path()?;
    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    
    fs::write(&config_path, json)
        .map_err(|e| format!("Failed to write settings: {}", e))?;
    
    Ok(())
}

#[tauri::command]
fn load_settings() -> Result<Settings, String> {
    let config_path = get_config_path()?;
    
    if !config_path.exists() {
        return Ok(Settings {
            shortcuts: Vec::new(),
            output_path: None,
        });
    }
    
    let json = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read settings: {}", e))?;
    
    let settings: Settings = serde_json::from_str(&json)
        .map_err(|e| format!("Failed to parse settings: {}", e))?;
    
    Ok(settings)
}

#[tauri::command]
async fn check_for_updates(app: tauri::AppHandle) -> Result<String, String> {
    // Note: use .updater() instead of .updater_builder()
    match app.updater().map_err(|e| e.to_string())?.check().await {
        Ok(Some(update)) => {
            Ok(format!("Update available: {}", update.version))
        }
        Ok(None) => Ok("App is up to date".to_string()),
        Err(e) => Err(format!("Failed to check for updates: {}", e))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init()) // Essential for relaunching
        .plugin(tauri_plugin_updater::Builder::new().build()) // Initialize updater
        .invoke_handler(tauri::generate_handler![
            read_image,
            save_settings,
            load_settings,
            check_for_updates
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // In V2, we use .updater() and check() returns Result<Option<Update>>
                if let Ok(Some(update)) = handle.updater().expect("failed to get updater").check().await {
                    if let Ok(_) = update.download_and_install(|_progress, _chunk| {}, || {}).await {
                        // Restart the app to apply the update
                        handle.restart();
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}