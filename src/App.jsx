import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { readDir } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';

export default function FolderSelector() {
    const [selectedPath, setSelectedPath] = useState('');
    const [imageFiles, setImageFiles] = useState([]);
    const [imageCache, setImageCache] = useState({});
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [viewMode, setViewMode] = useState('single');
    const [currentIndex, setCurrentIndex] = useState(0);

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

    const nextImage = () => {
        setCurrentIndex((prev) => (prev + 1) % imageFiles.length);
    };

    const prevImage = () => {
        setCurrentIndex((prev) => (prev - 1 + imageFiles.length) % imageFiles.length);
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (viewMode === 'single' && imageFiles.length > 0) {
                if (e.key === 'ArrowRight') {
                    nextImage();
                } else if (e.key === 'ArrowLeft') {
                    prevImage();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [viewMode, imageFiles.length]);

    useEffect(() => {
        if (imageFiles.length > 0 && viewMode === 'single') {
            // Preload current and adjacent images
            loadImageData(imageFiles[currentIndex].path);
            if (currentIndex + 1 < imageFiles.length) {
                loadImageData(imageFiles[currentIndex + 1].path);
            }
            if (currentIndex > 0) {
                loadImageData(imageFiles[currentIndex - 1].path);
            }
        }
    }, [currentIndex, imageFiles, viewMode]);

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

                <div className="flex flex-col items-center">
                    {imgLoading ? (
                        <div className="max-h-[70vh] w-full flex items-center justify-center bg-gray-200 rounded-lg" style={{ minHeight: '400px' }}>
                            <div className="text-gray-500 text-lg">Loading...</div>
                        </div>
                    ) : (
                        <img
                            src={imgSrc}
                            alt={imageFiles[currentIndex].name}
                            className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-md"
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

        return (
            <div
                ref={imgRef}
                onClick={() => {
                    setCurrentIndex(index);
                    setViewMode('single');
                }}
                className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
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
                </div>
                <div className="p-2">
                    <p className="text-xs text-gray-700 truncate" title={image.name}>
                        {image.name}
                    </p>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-100 p-4">
            <div className="max-w-6xl mx-auto">
                <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
                    <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">
                        Image Folder Viewer
                    </h1>

                    <button
                        onClick={selectFolder}
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg mb-4"
                    >
                        {loading ? 'Loading...' : 'Select Folder'}
                    </button>

                    {imageFiles.length > 0 && (
                        <div className="flex gap-2">
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
                                Found {imageFiles.length} image(s)
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