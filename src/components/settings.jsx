import { useState } from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { Settings, FolderOpen, ArrowLeft, RotateCw } from 'lucide-react';
import Button from './button';

export default function SettingsPage({
  shortcuts,
  setShortcuts,
  outputPath,
  setOutputPath,
  updateStatus,
  isCheckingUpdate,
  onBack,
  saveSettingsToDisk,
  changeConfigLocation,
  checkForUpdates,
}) {
  const [newKey, setNewKey] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [newAction, setNewAction] = useState('move');

  const selectOutputPath = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Output Folder',
    });

    if (selected) {
      setOutputPath(selected);
      await saveSettingsToDisk(shortcuts, selected);
    }
  };

  const addShortcut = async () => {
    if (!newKey || !newFolder) {
      alert('Please fill all fields');
      return;
    }

    if (shortcuts.find((s) => s.key === newKey.toLowerCase())) {
      alert('Key already exists');
      return;
    }

    const newShortcuts = [
      ...shortcuts,
      { key: newKey.toLowerCase(), folder: newFolder, action: newAction },
    ];

    setShortcuts(newShortcuts);
    await saveSettingsToDisk(newShortcuts, outputPath);

    setNewKey('');
    setNewFolder('');
    setNewAction('move');
  };

  const removeShortcut = async (key) => {
    const newShortcuts = shortcuts.filter((s) => s.key !== key);
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
          <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={onBack}>
            Back to Viewer
          </Button>
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
            <Button variant="primary" onClick={selectOutputPath}>
              Browse
            </Button>
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
              <Button variant="indigo" size="sm" onClick={changeConfigLocation}>
                Change/Load Config File
              </Button>
            </div>
          </div>

          <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <FolderOpen className="w-5 h-5" /> Default Output Folder
            </h3>
            <div className="flex flex-col gap-2">
              <p className="text-sm text-gray-400">
                Currently saving tagged images to:
                <span className="block text-indigo-300 break-all mt-1">
                  {outputPath || 'Not set'}
                </span>
              </p>
              <Button variant="green" size="sm" icon={FolderOpen} onClick={selectOutputPath}>
                Select Output Folder
              </Button>
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
              className="rounded-lg px-4 py-3 text-white font-medium focus:outline-none focus:ring-2 focus:ring-purple-400 cursor-pointer appearance-none"
              style={{
                background:
                  newAction === 'move'
                    ? 'linear-gradient(to right, rgb(37, 99, 235), rgb(147, 51, 234))'
                    : newAction === 'copy'
                      ? 'linear-gradient(to right, rgb(234, 88, 12), rgb(236, 72, 153))'
                      : 'linear-gradient(to right, rgb(220, 38, 38), rgb(236, 72, 153))',
              }}
            >
              <option value="move" className="bg-slate-800 text-white">Move</option>
              <option value="copy" className="bg-slate-800 text-white">Copy</option>
              <option value="delete" className="bg-slate-800 text-white">Delete</option>
            </select>
            <Button variant="orange" onClick={addShortcut}>
              Add
            </Button>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-purple-300 mb-4">Current Shortcuts</h2>
          {shortcuts.length === 0 ? (
            <p className="text-gray-400">No shortcuts configured</p>
          ) : (
            <div className="space-y-3">
              {shortcuts.map((shortcut) => (
                <div
                  key={shortcut.key}
                  className="flex items-center justify-between bg-slate-800/50 backdrop-blur-sm p-4 rounded-lg border border-purple-500/20 hover:border-purple-500/40 transition-all"
                >
                  <div className="flex gap-4 items-center">
                    <span className="font-mono font-bold text-2xl bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                      {shortcut.key.toUpperCase()}
                    </span>
                    <span className="text-gray-300">→ {shortcut.folder}</span>
                    <span className="text-sm text-gray-400 capitalize px-3 py-1 bg-slate-700/50 rounded-full">
                      ({shortcut.action})
                    </span>
                  </div>
                  <Button variant="danger" size="sm" onClick={() => removeShortcut(shortcut.key)}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 bg-gradient-to-br mt-10 from-blue-900/20 via-purple-900/20 to-pink-900/20 border border-blue-500/30 rounded-xl space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <RotateCw className="w-5 h-5" />
            Software Updates
          </h3>

          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-300">
              Check for the latest version of Imagers
            </p>

            {updateStatus && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  updateStatus.includes('up to date')
                    ? 'bg-green-900/30 border border-green-500/30 text-green-300'
                    : updateStatus.includes('available')
                      ? 'bg-blue-900/30 border border-blue-500/30 text-blue-300'
                      : updateStatus.includes('failed')
                        ? 'bg-red-900/30 border border-red-500/30 text-red-300'
                        : 'bg-purple-900/30 border border-purple-500/30 text-purple-300'
                }`}
              >
                {updateStatus}
              </div>
            )}

            <Button
              variant="primary"
              size="sm"
              loading={isCheckingUpdate}
              icon={RotateCw}
              onClick={checkForUpdates}
              className="w-fit"
            >
              {isCheckingUpdate ? 'Checking...' : 'Check for Updates'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
