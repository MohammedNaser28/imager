import { useState, useEffect } from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { mkdir, copyFile, remove } from '@tauri-apps/plugin-fs';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { FolderOpen, Archive, Zap, Grid3X3, Image as ImageIcon } from 'lucide-react';
import Button from './components/button';
import SettingsPage from './components/settings';

export default function FolderSelector() {
  const [selectedPath, setSelectedPath] = useState('');
  const [imageFiles, setImageFiles] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState('single');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState('main');
  const [isCompressing, setIsCompressing] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [shortcuts, setShortcuts] = useState([]);
  const [imageTags, setImageTags] = useState({});
  const [processing, setProcessing] = useState(false);
  const [outputPath, setOutputPath] = useState('');
  const [updateStatus, setUpdateStatus] = useState('');
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

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
          output_path: newOutputPath,
        },
      });
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError(`Failed to save settings: ${err}`);
    }
  };

  const checkForUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateStatus('Checking for updates...');

    try {
      const result = await invoke('check_for_updates');
      setUpdateStatus(result);

      if (result.includes('Update available')) {
        const install = confirm(
          'An update is available! Would you like to download and install it now?\n\nThe app will restart after installation.',
        );

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
        title: 'Select or Create Settings File',
      });

      if (selected) {
        await invoke('set_custom_config_path', { path: selected });
        const settings = await invoke('load_settings');
        setShortcuts(settings.shortcuts || []);
        setOutputPath(settings.output_path || '');
        alert(`Switched to: ${selected}`);
      }
    } catch (err) {
      setError('Failed to change config: ' + err);
    }
  };

  const handleCompressAll = async () => {
    setProcessing(true);
    setIsCompressing(true);
    try {
      for (const file of imageFiles) {
        const outputPath = file.path.replace(/\.\w+$/, '.webp');
        await invoke('convert_image', {
          inputPath: file.path,
          outputPath,
          format: 'webp',
        });
      }
      alert('Compression complete!');
    } catch (err) {
      setError('Compression failed: ' + err);
    } finally {
      setProcessing(false);
      setIsCompressing(false);
    }
  };

  const handleCreateArchive = async () => {
    const savePath = await save({
      filters: [{ name: 'Archive', extensions: ['zip'] }],
    });
    if (!savePath) return;

    setProcessing(true);
    setIsArchiving(true);
    try {
      const paths = imageFiles.map((f) => f.path);
      await invoke('archive_images', { files: paths, destZip: savePath });
      alert('Archive created successfully!');
    } catch (err) {
      setError('Archiving failed: ' + err);
    } finally {
      setProcessing(false);
      setIsArchiving(false);
    }
  };

  const selectFolder = async () => {
    try {
      setError('');
      setLoading(true);

      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select a Folder',
      });

      if (selected && selected !== null) {
        setSelectedPath(selected);
        await loadImageList(selected);
        setCurrentIndex(0);
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
      const images = await invoke('read_images', { path: folderPath });
      setImageFiles(images);
      setError('');
    } catch (err) {
      const msg = err?.message || err?.toString() || 'Unknown error';
      setError(msg);
      setImageFiles([]);
      console.error('Error loading images:', err);
    }
  };

  const tagImage = (key) => {
    const shortcut = shortcuts.find((s) => s.key === key);
    if (!shortcut) return;

    const currentImage = imageFiles[currentIndex].path;
    setImageTags((prev) => ({
      ...prev,
      [currentImage]: shortcut,
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
        const image = imageFiles.find((f) => f.path === imagePath);
        const fileName = image?.name || imagePath.split('/').pop() || imagePath.split('\\').pop();
        const destPath = `${folderPath}/${fileName}`;

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

  // Preload adjacent images for instant arrow navigation
  useEffect(() => {
    if (imageFiles.length === 0 || viewMode !== 'single') return;

    const indices = [currentIndex - 1, currentIndex + 1].filter(
      (i) => i >= 0 && i < imageFiles.length,
    );

    indices.forEach((i) => {
      const img = new Image();
      img.src = convertFileSrc(imageFiles[i].path);
    });
  }, [currentIndex, imageFiles, viewMode]);

  const SingleImageView = () => {
    const currentImageTag = imageTags[imageFiles[currentIndex].path];
    const imgSrc = convertFileSrc(imageFiles[currentIndex].path);

    return (
      <div className="bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-2xl shadow-2xl p-6 border border-purple-500/20">
        <div className="flex items-center justify-between mb-6">
          <Button variant="primary" onClick={prevImage}>
            ← Previous
          </Button>
          <span className="text-purple-300 font-medium text-lg">
            {currentIndex + 1} / {imageFiles.length}
          </span>
          <Button variant="primary" onClick={nextImage}>
            Next →
          </Button>
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
              Press shortcuts: {shortcuts.map((s) => s.key.toUpperCase()).join(', ')}
            </p>
          </div>
        )}

        <div className="flex flex-col items-center">
          <img
            src={imgSrc}
            alt={imageFiles[currentIndex].name}
            className="max-h-[60vh] max-w-full object-contain rounded-xl shadow-2xl border border-purple-500/20"
          />
          <p className="mt-4 text-gray-300 font-medium">{imageFiles[currentIndex].name}</p>
        </div>

        <p className="text-center text-sm text-gray-400 mt-4">Use arrow keys (← →) to navigate</p>
      </div>
    );
  };

  const GridImageItem = ({ image, index }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [imgRef, setImgRef] = useState(null);

    useEffect(() => {
      if (!imgRef) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setIsVisible(true);
        },
        { rootMargin: '200px' },
      );

      observer.observe(imgRef);
      return () => observer.disconnect();
    }, [imgRef]);

    const isTagged = !!imageTags[image.path];

    return (
      <div
        ref={setImgRef}
        onClick={() => {
          setCurrentIndex(index);
          setViewMode('single');
        }}
        className={`bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-200 cursor-pointer border ${
          isTagged
            ? 'ring-2 ring-green-400 border-green-400'
            : 'border-purple-500/20 hover:border-purple-500/40'
        }`}
      >
        <div className="aspect-square relative bg-slate-800">
          {isVisible ? (
            <img
              src={convertFileSrc(image.path)}
              alt={image.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-gray-600 text-xs">📷</div>
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
        <SettingsPage
          shortcuts={shortcuts}
          setShortcuts={setShortcuts}
          outputPath={outputPath}
          setOutputPath={setOutputPath}
          updateStatus={updateStatus}
          isCheckingUpdate={isCheckingUpdate}
          onBack={() => setCurrentPage('main')}
          saveSettingsToDisk={saveSettingsToDisk}
          changeConfigLocation={changeConfigLocation}
          checkForUpdates={checkForUpdates}
        />
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
            <Button
              variant="primary"
              size="lg"
              loading={loading}
              icon={FolderOpen}
              onClick={selectFolder}
              className="flex-1"
            >
              {loading ? 'Loading...' : 'Select Folder'}
            </Button>
            <Button variant="orange" size="lg" onClick={() => setCurrentPage('settings')}>
              Settings
            </Button>
          </div>

          {imageFiles.length > 0 && (
            <>
              <div className="flex gap-3 mb-6">
                <Button
                  variant={viewMode === 'grid' ? 'primary' : 'secondary'}
                  onClick={() => setViewMode('grid')}
                  icon={Grid3X3}
                  className="flex-1"
                >
                  Grid View
                </Button>
                <Button
                  variant={viewMode === 'single' ? 'primary' : 'secondary'}
                  onClick={() => setViewMode('single')}
                  icon={ImageIcon}
                  className="flex-1"
                >
                  Single View
                </Button>
              </div>

              {Object.keys(imageTags).length > 0 && (
                <Button
                  variant="green"
                  size="lg"
                  loading={processing}
                  onClick={processImages}
                  className="w-full mb-6"
                >
                  {processing
                    ? 'Processing...'
                    : `Process ${Object.keys(imageTags).length} Tagged Images`}
                </Button>
              )}
            </>
          )}

          {selectedPath && (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <Button
                variant="blue"
                loading={isCompressing}
                icon={isCompressing ? undefined : Zap}
                onClick={handleCompressAll}
                disabled={processing}
              >
                {isCompressing ? 'Compressing...' : 'Compress to WebP'}
              </Button>
              <Button
                variant="purple"
                loading={isArchiving}
                icon={isArchiving ? undefined : Archive}
                onClick={handleCreateArchive}
                disabled={processing}
              >
                {isArchiving ? 'Archiving...' : 'Archive to ZIP'}
              </Button>
            </div>
          )}

          {selectedPath && (
            <div className="mt-6 p-4 bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-lg backdrop-blur-sm">
              <p className="text-sm font-semibold text-green-300 mb-1">Selected Folder:</p>
              <p className="text-sm text-green-200 break-all">{selectedPath}</p>
              <p className="text-xs text-green-300 mt-2">
                Found {imageFiles.length} image(s) | Tagged: {Object.keys(imageTags).length}
              </p>
            </div>
          )}

          {error && (
            <div className="mt-6 p-4 bg-gradient-to-r from-red-900/30 to-pink-900/30 border border-red-500/30 rounded-lg backdrop-blur-sm">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}
        </div>

        {imageFiles.length > 0 && viewMode === 'single' && <SingleImageView />}

        {imageFiles.length > 0 && viewMode === 'grid' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {imageFiles.map((image, index) => (
              <GridImageItem key={image.path} image={image} index={index} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
