
// In App.jsx
import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { readDir, mkdir, copyFile, remove } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog'; // Add 'save' to your imports

// ADD THIS LINE:
import { Settings, FolderOpen } from 'lucide-react';
export default function FolderSelector() {
  const [selectedPath, setSelectedPath] = useState('');
  const [imageFiles, setImageFiles] = useState([]);
  const [imageCache, setImageCache] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState('single');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState('main');

  // Shortcuts and tagging
  const [shortcuts, setShortcuts] = useState([]);
  const [imageTags, setImageTags] = useState({});
  const [processing, setProcessing] = useState(false);
  const [outputPath, setOutputPath] = useState('');


  const [updateStatus, setUpdateStatus] = useState('');
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  // Load settings on mount
  useEffect(() => {
    loadSettingsFromDisk();
  }, []);

  const checkForUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateStatus('Checking for updates...');

    try {
      const result = await invoke('check_for_updates');
      setUpdateStatus(result);

      if (result.includes('Update available')) {
        const install = confirm('An update is available! Would you like to download and install it now?\n\nThe app will restart after installation.');

        if (install) {
          setUpdateStatus('Downloading update...');
          const installResult = await invoke('install_update');
          setUpdateStatus(installResult);

          if (installResult.includes('successfully')) {
            alert('Update installed! Please restart the application.');
          }
        }
      }
    } catch (err) {
      setUpdateStatus(`Update check failed: ${err}`);
      console.error('Update error:', err);
    } finally {
      setIsCheckingUpdate(false);
    }
  };
  const changeConfigLocation = async () => {
    try {
      const selected = await save({
        filters: [{ name: 'JSON Settings', extensions: ['json'] }],
        defaultPath: 'settings.json',
        title: "Select or Create Settings File",
      });

      if (selected) {
        // 1. Tell Rust to switch the active path in memory
        await invoke('set_custom_config_path', { path: selected });

        // 2. Load settings from the NEW path immediately
        const settings = await invoke('load_settings');

        // 3. Update the UI with whatever is in that file
        // If it's a new empty file, shortcuts will become [] (This is correct)
        setShortcuts(settings.shortcuts || []);
        setOutputPath(settings.output_path || '');

        alert(`Switched to: ${selected}`);
      }
    } catch (err) {
      setError("Failed to change config: " + err);
    }
  };
  const selectOutputPath = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Output Folder",
      });

      if (selected) {
        setOutputPath(selected);
        // Save immediately so it persists in the current config
        await saveSettingsToDisk(shortcuts, selected);
      }
    } catch (err) {
      setError("Failed to set output path: " + err);
    }
  };
  const loadSettingsFromDisk = async () => {
    try {
      const settings = await invoke('load_settings');
      setShortcuts(settings.shortcuts || []);
      setOutputPath(settings.output_path || '');
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  const saveSettingsToDisk = async (newShortcuts, newOutputPath) => {
    try {
      await invoke('save_settings', {
        settings: {
          shortcuts: newShortcuts,
          output_path: newOutputPath
        }
      });
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError(`Failed to save settings: ${err}`);
    }
  };

  const selectFolder = async () => {
    try {
      setError('');
      setLoading(true);

      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select a Folder'
      });

      if (selected && selected !== null) {
        setSelectedPath(selected);
        await loadImageList(selected);
        setCurrentIndex(0);
        setImageCache({});
        setImageTags({});
      }
    } catch (err) {
      const errorMsg = err?.message || err?.toString() || 'Failed to open folder dialog';
      setError(`Error: ${errorMsg}`);
      console.error('Full error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadImageList = async (folderPath) => {
    try {
      const entries = await readDir(folderPath);

      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
      const images = entries.filter(entry => {
        if (!entry.isFile) return false;
        const name = entry.name.toLowerCase();
        return imageExtensions.some(ext => name.endsWith(ext));
      }).map(file => ({
        name: file.name,
        path: `${folderPath}/${file.name}`
      }));

      if (images.length === 0) {
        setError('No images found in the selected folder');
        return;
      }

      setImageFiles(images);
    } catch (err) {
      setError(`Error loading images: ${err?.message || err?.toString()}`);
      console.error('Error loading images:', err);
    }
  };

  const loadImageData = async (path) => {
    if (imageCache[path]) {
      return imageCache[path];
    }

    try {
      const bytes = await invoke('read_image', { path });
      const base64 = btoa(
        new Uint8Array(bytes).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const ext = path.toLowerCase().split('.').pop();
      const mimeTypes = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'bmp': 'image/bmp',
        'webp': 'image/webp'
      };
      const mimeType = mimeTypes[ext] || 'image/jpeg';
      const url = `data:${mimeType};base64,${base64}`;

      setImageCache(prev => ({ ...prev, [path]: url }));
      return url;
    } catch (err) {
      console.error('Error loading image:', err);
      return null;
    }
  };

  const tagImage = (key) => {
    const shortcut = shortcuts.find(s => s.key === key);
    if (!shortcut) return;

    const currentImage = imageFiles[currentIndex].path;
    setImageTags(prev => ({
      ...prev,
      [currentImage]: shortcut
    }));
  };

  const processImages = async () => {
    if (Object.keys(imageTags).length === 0) {
      setError('No images tagged');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      // FIX: Use the outputPath state if it exists, otherwise use selectedPath
      const basePath = outputPath || selectedPath;

      for (const [imagePath, shortcut] of Object.entries(imageTags)) {
        // Construct the subfolder path within your custom Output Path
        const folderPath = `${basePath}/${shortcut.folder}`;
        const fileName = imagePath.split('/').pop();
        const destPath = `${folderPath}/${fileName}`;

        // Ensure the sub-directory exists in the new location
        try {
          await mkdir(folderPath, { recursive: true });
        } catch (e) {
          // Folder already exists
        }

        if (shortcut.action === 'move') {
          await copyFile(imagePath, destPath);
          await remove(imagePath);
        } else if (shortcut.action === 'copy') {
          await copyFile(imagePath, destPath);
        } else if (shortcut.action === 'delete') {
          await remove(imagePath);
        }
      }

      setImageTags({});
      await loadImageList(selectedPath);
      setCurrentIndex(0);
      alert('Images processed successfully!');
    } catch (err) {
      setError(`Error processing images: ${err?.message || err?.toString()}`);
    } finally {
      setProcessing(false);
    }
  };

  const nextImage = () => {
    setCurrentIndex((prev) => (prev + 1) % imageFiles.length);
  };

  const prevImage = () => {
    setCurrentIndex((prev) => (prev - 1 + imageFiles.length) % imageFiles.length);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (currentPage !== 'main' || viewMode !== 'single' || imageFiles.length === 0) return;

      if (e.key === 'ArrowRight') {
        nextImage();
      } else if (e.key === 'ArrowLeft') {
        prevImage();
      } else {
        tagImage(e.key.toLowerCase());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, imageFiles.length, currentIndex, shortcuts, currentPage]);

  useEffect(() => {
    if (imageFiles.length > 0 && viewMode === 'single') {
      loadImageData(imageFiles[currentIndex].path);
      if (currentIndex + 1 < imageFiles.length) {
        loadImageData(imageFiles[currentIndex + 1].path);
      }
      if (currentIndex > 0) {
        loadImageData(imageFiles[currentIndex - 1].path);
      }
    }
  }, [currentIndex, imageFiles, viewMode]);

  const SettingsPage = () => {
    const [newKey, setNewKey] = useState('');
    const [newFolder, setNewFolder] = useState('');
    const [newAction, setNewAction] = useState('move');

    const selectOutputPath = async () => {
      try {
        const selected = await open({
          directory: true,
          multiple: false,
          title: 'Select Output Folder'
        });

        if (selected) {
          setOutputPath(selected);
          await saveSettingsToDisk(shortcuts, selected);
        }
      } catch (err) {
        console.error('Error selecting output path:', err);
      }
    };

    const addShortcut = async () => {
      if (!newKey || !newFolder) {
        alert('Please fill all fields');
        return;
      }

      if (shortcuts.find(s => s.key === newKey.toLowerCase())) {
        alert('Key already exists');
        return;
      }

      const newShortcuts = [...shortcuts, {
        key: newKey.toLowerCase(),
        folder: newFolder,
        action: newAction
      }];

      setShortcuts(newShortcuts);
      await saveSettingsToDisk(newShortcuts, outputPath);

      setNewKey('');
      setNewFolder('');
      setNewAction('move');
    };

    const removeShortcut = async (key) => {
      const newShortcuts = shortcuts.filter(s => s.key !== key);
      setShortcuts(newShortcuts);
      await saveSettingsToDisk(newShortcuts, outputPath);
    };

    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-2xl shadow-2xl p-8 border border-purple-500/20">
        
         <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Settings
            </h1>
            <button
              onClick={() => setCurrentPage('main')}
              className="bg-gradient-to-r from-slate-700 to-slate-600 hover:from-slate-600 hover:to-slate-500 text-white font-semibold py-2 px-6 rounded-lg transition-all duration-200 shadow-lg"
            >
              Back to Viewer
            </button>
          </div>



          <div className="mb-8">
            <h2 className="text-xl font-semibold text-purple-300 mb-4">Output Path</h2>
            <div className="flex gap-4 items-center">
              <input
                type="text"
                value={outputPath}
                readOnly
                placeholder="Default: Same as source folder"
                className="flex-1 bg-slate-800/50 border border-purple-500/30 rounded-lg px-4 py-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                onClick={selectOutputPath}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-lg"
              >
                Browse
              </button>
            </div>
            <p className="text-sm text-gray-400 mt-2">
              If not set, organized images will be saved in subfolders within the source folder
            </p>
          </div>
          <div className="space-y-6">
            <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Settings className="w-5 h-5" /> App Configuration
              </h3>
              <div className="flex flex-col gap-2">
                <p className="text-sm text-gray-400">
                  Choose where your settings (shortcuts & output paths) are saved.
                </p>
                <button
                  onClick={changeConfigLocation}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors text-sm w-fit"
                >
                  Change/Load Config File
                </button>
              </div>
            </div>


            <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <FolderOpen className="w-5 h-5" /> Default Output Folder
              </h3>
              <div className="flex flex-col gap-2">
                <p className="text-sm text-gray-400">
                  Currently saving tagged images to:
                  <span className="block text-indigo-300 break-all mt-1">{outputPath || 'Not set'}</span>
                </p>
                <button
                  onClick={selectOutputPath}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors text-sm w-fit"
                >
                  Select Output Folder
                </button>
              </div>
            </div>
          </div>
          <div className="mb-8 mt-10">
            <h2 className="text-xl font-semibold text-purple-300 mb-4">Add Keyboard Shortcut</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <input
                type="text"
                maxLength="1"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="Key (e.g. b)"
                className="bg-slate-800/50 border border-purple-500/30 rounded-lg px-4 py-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <input
                type="text"
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                placeholder="Folder name"
                className="bg-slate-800/50 border border-purple-500/30 rounded-lg px-4 py-3 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <select
                value={newAction}
                onChange={(e) => setNewAction(e.target.value)}
                className="bg-gradient-to-r from-blue-600 to-purple-600 border border-purple-400/50 rounded-lg px-4 py-3 text-white font-medium focus:outline-none focus:ring-2 focus:ring-purple-400 cursor-pointer"
                style={{
                  backgroundImage: newAction === 'move' ? 'linear-gradient(to right, rgb(37, 99, 235), rgb(147, 51, 234))' :
                    newAction === 'copy' ? 'linear-gradient(to right, rgb(234, 88, 12), rgb(236, 72, 153))' :
                      'linear-gradient(to right, rgb(220, 38, 38), rgb(236, 72, 153))'
                }}
              >
                <option value="move" className="bg-slate-800 text-white">Move</option>
                <option value="copy" className="bg-slate-800 text-white">Copy</option>
                <option value="delete" className="bg-slate-800 text-white">Delete</option>
              </select>
              <button
                onClick={addShortcut}
                className="bg-gradient-to-r from-orange-600 to-pink-600 hover:from-orange-500 hover:to-pink-500 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-lg"
              >
                Add
              </button>
            </div>
          </div>


   
          <div>
            <h2 className="text-xl font-semibold text-purple-300 mb-4">Current Shortcuts</h2>
            {shortcuts.length === 0 ? (
              <p className="text-gray-400">No shortcuts configured</p>
            ) : (
              <div className="space-y-3">
                {shortcuts.map((shortcut) => (
                  <div key={shortcut.key} className="flex items-center justify-between bg-slate-800/50 backdrop-blur-sm p-4 rounded-lg border border-purple-500/20 hover:border-purple-500/40 transition-all">
                    <div className="flex gap-4 items-center">
                      <span className="font-mono font-bold text-2xl bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">{shortcut.key.toUpperCase()}</span>
                      <span className="text-gray-300">→ {shortcut.folder}</span>
                      <span className="text-sm text-gray-400 capitalize px-3 py-1 bg-slate-700/50 rounded-full">({shortcut.action})</span>
                    </div>
                    <button
                      onClick={() => removeShortcut(shortcut.key)}
                      className="bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

                 <div className="p-4 bg-gradient-to-br mt-10 from-blue-900/20 via-purple-900/20 to-pink-900/20 border border-blue-500/30 rounded-xl space-y-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Software Updates
            </h3>

            <div className="flex flex-col gap-3">
              <p className="text-sm text-gray-300">
                Check for the latest version of Imagers
              </p>

              {updateStatus && (
                <div className={`p-3 rounded-lg text-sm ${updateStatus.includes('up to date')
                    ? 'bg-green-900/30 border border-green-500/30 text-green-300'
                    : updateStatus.includes('available')
                      ? 'bg-blue-900/30 border border-blue-500/30 text-blue-300'
                      : updateStatus.includes('failed')
                        ? 'bg-red-900/30 border border-red-500/30 text-red-300'
                        : 'bg-purple-900/30 border border-purple-500/30 text-purple-300'
                  }`}>
                  {updateStatus}
                </div>
              )}

              <button
                onClick={checkForUpdates}
                disabled={isCheckingUpdate}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:from-blue-500 hover:via-purple-500 hover:to-pink-500 disabled:from-gray-600 disabled:to-gray-500 text-white rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none font-semibold text-sm w-fit flex items-center gap-2"
              >
                {isCheckingUpdate ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Checking...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Check for Updates
                  </>
                )}
              </button>
            </div>
          </div>


        </div>
        
      </div>
    );
  };

  const SingleImageView = () => {
    const [imgSrc, setImgSrc] = useState(null);
    const [imgLoading, setImgLoading] = useState(true);

    useEffect(() => {
      setImgLoading(true);
      loadImageData(imageFiles[currentIndex].path).then(url => {
        setImgSrc(url);
        setImgLoading(false);
      });
    }, [currentIndex]);

    const currentImageTag = imageTags[imageFiles[currentIndex].path];

    return (
      <div className="bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-2xl shadow-2xl p-6 border border-purple-500/20">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={prevImage}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold py-3 px-6 rounded-lg transition-all duration-200 shadow-lg"
          >
            ← Previous
          </button>
          <span className="text-purple-300 font-medium text-lg">
            {currentIndex + 1} / {imageFiles.length}
          </span>
          <button
            onClick={nextImage}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold py-3 px-6 rounded-lg transition-all duration-200 shadow-lg"
          >
            Next →
          </button>
        </div>

        {currentImageTag && (
          <div className="mb-4 p-4 bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-lg backdrop-blur-sm">
            <p className="text-green-300 text-center font-medium">
              Tagged: {currentImageTag.key.toUpperCase()} → {currentImageTag.folder} ({currentImageTag.action})
            </p>
          </div>
        )}

        {shortcuts.length > 0 && (
          <div className="mb-4 p-4 bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-500/30 rounded-lg backdrop-blur-sm">
            <p className="text-blue-300 text-sm text-center">
              Press shortcuts: {shortcuts.map(s => s.key.toUpperCase()).join(', ')}
            </p>
          </div>
        )}

        <div className="flex flex-col items-center">
          {imgLoading ? (
            <div className="max-h-[70vh] w-full flex items-center justify-center bg-slate-800/50 rounded-xl border border-purple-500/20" style={{ minHeight: '400px' }}>
              <div className="text-purple-300 text-lg">Loading...</div>
            </div>
          ) : (
            <img
              src={imgSrc}
              alt={imageFiles[currentIndex].name}
              className="max-h-[60vh] max-w-full object-contain rounded-xl shadow-2xl border border-purple-500/20"
            />
          )}
          <p className="mt-4 text-gray-300 font-medium">
            {imageFiles[currentIndex].name}
          </p>
        </div>

        <p className="text-center text-sm text-gray-400 mt-4">
          Use arrow keys (← →) to navigate
        </p>
      </div>
    );
  };

  const GridImageItem = ({ image, index }) => {
    const [imgSrc, setImgSrc] = useState(null);
    const [isVisible, setIsVisible] = useState(false);
    const [imgRef, setImgRef] = useState(null);

    useEffect(() => {
      if (!imgRef) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
          }
        },
        { rootMargin: '200px' }
      );

      observer.observe(imgRef);
      return () => observer.disconnect();
    }, [imgRef]);

    useEffect(() => {
      if (isVisible && !imgSrc) {
        loadImageData(image.path).then(setImgSrc);
      }
    }, [isVisible]);

    const isTagged = !!imageTags[image.path];

    return (
      <div
        ref={setImgRef}
        onClick={() => {
          setCurrentIndex(index);
          setViewMode('single');
        }}
        className={`bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-200 cursor-pointer border ${isTagged ? 'ring-2 ring-green-400 border-green-400' : 'border-purple-500/20 hover:border-purple-500/40'
          }`}
      >
        <div className="aspect-square relative bg-slate-800">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={image.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {isVisible ? (
                <div className="text-gray-500 text-xs">Loading...</div>
              ) : (
                <div className="text-gray-600 text-xs">📷</div>
              )}
            </div>
          )}
          {isTagged && (
            <div className="absolute top-2 right-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white px-3 py-1 rounded-lg text-xs font-bold shadow-lg">
              {imageTags[image.path].key.toUpperCase()}
            </div>
          )}
        </div>
        <div className="p-3 bg-slate-900/50">
          <p className="text-xs text-gray-300 truncate" title={image.name}>
            {image.name}
          </p>
        </div>
      </div>
    );
  };

  if (currentPage === 'settings') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 p-4">
        <SettingsPage />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-2xl shadow-2xl p-8 mb-6 border border-purple-500/20">
          <h1 className="text-3xl font-bold text-center mb-6 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Image Folder Viewer
          </h1>

          <div className="flex gap-3 mb-6">
            <button
              onClick={selectFolder}
              disabled={loading}
              className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:from-gray-600 disabled:to-gray-500 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-lg"
            >
              {loading ? 'Loading...' : 'Select Folder'}
            </button>
            <button
              onClick={() => setCurrentPage('settings')}
              className="bg-gradient-to-r from-orange-600 to-pink-600 hover:from-orange-500 hover:to-pink-500 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-lg"
            >
              Settings
            </button>
          </div>

          {imageFiles.length > 0 && (
            <>
              <div className="flex gap-3 mb-6">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`flex-1 py-3 px-6 rounded-lg font-medium transition-all duration-200 ${viewMode === 'grid'
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                    : 'bg-slate-800/50 text-gray-300 hover:bg-slate-700/50 border border-purple-500/20'
                    }`}
                >
                  Grid View
                </button>
                <button
                  onClick={() => setViewMode('single')}
                  className={`flex-1 py-3 px-6 rounded-lg font-medium transition-all duration-200 ${viewMode === 'single'
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                    : 'bg-slate-800/50 text-gray-300 hover:bg-slate-700/50 border border-purple-500/20'
                    }`}
                >
                  Single View
                </button>
              </div>

              {Object.keys(imageTags).length > 0 && (
                <button
                  onClick={processImages}
                  disabled={processing}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-gray-600 disabled:to-gray-500 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-lg mb-6"
                >
                  {processing ? 'Processing...' : `Process ${Object.keys(imageTags).length} Tagged Images`}
                </button>
              )}
            </>
          )}

          {selectedPath && (
            <div className="mt-6 p-4 bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-lg backdrop-blur-sm">
              <p className="text-sm font-semibold text-green-300 mb-1">
                Selected Folder:
              </p>
              <p className="text-sm text-green-200 break-all">
                {selectedPath}
              </p>
              <p className="text-xs text-green-300 mt-2">
                Found {imageFiles.length} image(s) | Tagged: {Object.keys(imageTags).length}
              </p>
            </div>
          )}

          {error && (
            <div className="mt-6 p-4 bg-gradient-to-r from-red-900/30 to-pink-900/30 border border-red-500/30 rounded-lg backdrop-blur-sm">
              <p className="text-sm text-red-300">
                {error}
              </p>
            </div>
          )}
        </div>

        {imageFiles.length > 0 && viewMode === 'single' && <SingleImageView />}

        {imageFiles.length > 0 && viewMode === 'grid' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {imageFiles.map((image, index) => (
              <GridImageItem key={index} image={image} index={index} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}