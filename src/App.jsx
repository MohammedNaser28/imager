import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { readDir, mkdir, copyFile, remove } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';

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

  // Load settings on mount
  useEffect(() => {
    loadSettingsFromDisk();
  }, []);

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
      const basePath = outputPath || selectedPath;

      for (const [imagePath, shortcut] of Object.entries(imageTags)) {
        const folderPath = `${basePath}/${shortcut.folder}`;
        const fileName = imagePath.split('/').pop();
        const destPath = `${folderPath}/${fileName}`;

        try {
          await mkdir(folderPath, { recursive: true });
        } catch (e) {
          // Folder might already exist
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
      console.error('Error:', err);
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
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
            <button
              onClick={() => setCurrentPage('main')}
              className="bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg"
            >
              Back to Viewer
            </button>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">Output Path</h2>
            <div className="flex gap-4 items-center">
              <input
                type="text"
                value={outputPath}
                readOnly
                placeholder="Default: Same as source folder"
                className="flex-1 border border-gray-300 rounded-lg px-4 py-2 bg-gray-50"
              />
              <button
                onClick={selectOutputPath}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg"
              >
                Browse
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              If not set, organized images will be saved in subfolders within the source folder
            </p>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">Add Keyboard Shortcut</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <input
                type="text"
                maxLength="1"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="Key (e.g. b)"
                className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                placeholder="Folder name"
                className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={newAction}
                onChange={(e) => setNewAction(e.target.value)}
                className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="move">Move</option>
                <option value="copy">Copy</option>
                <option value="delete">Delete</option>
              </select>
              <button
                onClick={addShortcut}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg"
              >
                Add
              </button>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-gray-700 mb-4">Current Shortcuts</h2>
            {shortcuts.length === 0 ? (
              <p className="text-gray-500">No shortcuts configured</p>
            ) : (
              <div className="space-y-2">
                {shortcuts.map((shortcut) => (
                  <div key={shortcut.key} className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
                    <div className="flex gap-4">
                      <span className="font-mono font-bold text-lg text-blue-600">{shortcut.key.toUpperCase()}</span>
                      <span className="text-gray-700">→ {shortcut.folder}</span>
                      <span className="text-sm text-gray-500 capitalize">({shortcut.action})</span>
                    </div>
                    <button
                      onClick={() => removeShortcut(shortcut.key)}
                      className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
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
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prevImage}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
          >
            ← Previous
          </button>
          <span className="text-gray-700 font-medium">
            {currentIndex + 1} / {imageFiles.length}
          </span>
          <button
            onClick={nextImage}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
          >
            Next →
          </button>
        </div>

        {currentImageTag && (
          <div className="mb-4 p-3 bg-green-100 border border-green-300 rounded-lg">
            <p className="text-green-800 text-center font-medium">
              Tagged: {currentImageTag.key.toUpperCase()} → {currentImageTag.folder} ({currentImageTag.action})
            </p>
          </div>
        )}

        {shortcuts.length > 0 && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-800 text-sm text-center">
              Press shortcuts: {shortcuts.map(s => s.key.toUpperCase()).join(', ')}
            </p>
          </div>
        )}
        
        <div className="flex flex-col items-center">
          {imgLoading ? (
            <div className="max-h-[70vh] w-full flex items-center justify-center bg-gray-200 rounded-lg" style={{ minHeight: '400px' }}>
              <div className="text-gray-500 text-lg">Loading...</div>
            </div>
          ) : (
            <img
              src={imgSrc}
              alt={imageFiles[currentIndex].name}
              className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-md"
            />
          )}
          <p className="mt-4 text-gray-700 font-medium">
            {imageFiles[currentIndex].name}
          </p>
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          Use arrow keys (← →) to navigate
        </p>
      </div>
    );
  };

  const GridImageItem = ({ image, index }) => {
    const [imgSrc, setImgSrc] = useState(null);
    const [isVisible, setIsVisible] = useState(false);
    const imgRef = useState(null);

    useEffect(() => {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        },
        { rootMargin: '100px' }
      );

      if (imgRef.current) {
        observer.observe(imgRef.current);
      }

      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      if (isVisible && !imgSrc) {
        loadImageData(image.path).then(setImgSrc);
      }
    }, [isVisible]);

    const isTagged = !!imageTags[image.path];

    return (
      <div
        ref={imgRef}
        onClick={() => {
          setCurrentIndex(index);
          setViewMode('single');
        }}
        className={`bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow cursor-pointer ${
          isTagged ? 'ring-4 ring-green-400' : ''
        }`}
      >
        <div className="aspect-square relative bg-gray-200">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={image.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
              Loading...
            </div>
          )}
          {isTagged && (
            <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded text-xs font-bold">
              {imageTags[image.path].key.toUpperCase()}
            </div>
          )}
        </div>
        <div className="p-2">
          <p className="text-xs text-gray-700 truncate" title={image.name}>
            {image.name}
          </p>
        </div>
      </div>
    );
  };

  if (currentPage === 'settings') {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <SettingsPage />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">
            Image Folder Viewer
          </h1>
          
          <div className="flex gap-2 mb-4">
            <button
              onClick={selectFolder}
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg"
            >
              {loading ? 'Loading...' : 'Select Folder'}
            </button>
            <button
              onClick={() => setCurrentPage('settings')}
              className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Settings
            </button>
          </div>

          {imageFiles.length > 0 && (
            <>
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Grid View
                </button>
                <button
                  onClick={() => setViewMode('single')}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                    viewMode === 'single'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Single View
                </button>
              </div>

              {Object.keys(imageTags).length > 0 && (
                <button
                  onClick={processImages}
                  disabled={processing}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors mb-4"
                >
                  {processing ? 'Processing...' : `Process ${Object.keys(imageTags).length} Tagged Images`}
                </button>
              )}
            </>
          )}

          {selectedPath && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-semibold text-green-800 mb-1">
                Selected Folder:
              </p>
              <p className="text-sm text-green-700 break-all">
                {selectedPath}
              </p>
              <p className="text-xs text-green-600 mt-2">
                Found {imageFiles.length} image(s) | Tagged: {Object.keys(imageTags).length}
              </p>
            </div>
          )}

          {error && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">
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