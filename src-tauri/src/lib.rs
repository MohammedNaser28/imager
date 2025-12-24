use tauri::Manager;
use std::fs;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri_plugin_updater::UpdaterExt; // Required for .updater_builder()
// Add this import to the top
use std::sync::Mutex;
use tauri::State;


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

// 1. Define App State to hold a custom config file location
pub struct AppState {
    pub custom_config_path: Mutex<Option<PathBuf>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self { custom_config_path: Mutex::new(None) }
    }
}
fn get_config_path(state: State<'_, AppState>) -> Result<PathBuf, String> {
    // 1. Check current session memory first
    if let Some(custom_path) = state.custom_config_path.lock().unwrap().clone() {
        return Ok(custom_path);
    }

    // 2. Check if there is a 'pointer' file from a previous session
    let default_dir = dirs::config_dir().ok_or("No config dir")?.join("imagers");
    let pointer = default_dir.join("last_config.txt");
    
    if pointer.exists() {
        if let Ok(path_str) = fs::read_to_string(pointer) {
            let path = PathBuf::from(path_str.trim());
            if path.exists() { return Ok(path); }
        }
    }

    // 3. Fallback to default
    Ok(default_dir.join("settings.json"))
}

#[tauri::command]
fn set_custom_config_path(path: String, state: State<'_, AppState>) -> Result<(), String> {
    // Save to memory
    let mut custom = state.custom_config_path.lock().unwrap();
    *custom = Some(PathBuf::from(&path));

    // Save to the "pointer" file so it persists after restart
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

// // Helper to make the custom path permanent
// #[tauri::command]
// fn set_custom_config_path(path: String, state: State<AppState>) -> Result<(), String> {
//     let mut custom = state.custom_config_path.lock().unwrap();
//     *custom = Some(PathBuf::from(&path));

//     // Save a "pointer" file so the app remembers this path on next launch
//     let default_dir = dirs::config_dir().ok_or("No config dir")?.join("imagers");
//     let pointer = default_dir.join("last_config.txt");
//     fs::create_dir_all(&default_dir).ok();
//     fs::write(pointer, path).map_err(|e| e.to_string())?;
    
//     Ok(())
// }

#[tauri::command]
fn read_image(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| e.to_string())
}

// #[tauri::command]
// fn save_settings(settings: Settings) -> Result<(), String> {
//     let config_path = get_config_path()?;
//     let json = serde_json::to_string_pretty(&settings)
//         .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    
//     fs::write(&config_path, json)
//         .map_err(|e| format!("Failed to write settings: {}", e))?;
    
//     Ok(())
// }

// #[tauri::command]
// fn load_settings() -> Result<Settings, String> {
//     let config_path = get_config_path()?;
    
//     if !config_path.exists() {
//         return Ok(Settings {
//             shortcuts: Vec::new(),
//             output_path: None,
//         });
//     }
    
//     let json = fs::read_to_string(&config_path)
//         .map_err(|e| format!("Failed to read settings: {}", e))?;
    
//     let settings: Settings = serde_json::from_str(&json)
//         .map_err(|e| format!("Failed to parse settings: {}", e))?;
    
//     Ok(settings)
// }

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
    .manage(AppState { custom_config_path: Mutex::new(None) })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init()) // Essential for relaunching
        .plugin(tauri_plugin_updater::Builder::new().build()) // Initialize updater
        .invoke_handler(tauri::generate_handler![
            read_image,
            save_settings,
            load_settings,
            check_for_updates,
            set_custom_config_path // Add this
        ])
    .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // 2. Use .updater() instead of .updater_builder()
                if let Ok(Some(update)) = handle.updater().expect("failed to get updater").check().await {
                   // 3. The correct method is download_and_install
                   // It requires two closures for progress and finish
                   let _ = update.download_and_install(|_progress, _chunk| {}, || {}).await;
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}