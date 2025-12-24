## 📸 Imagers

Imagers is a high-performance, cross-platform desktop application built with Tauri v2 and React. It streamlines image management by allowing users to quickly organize, tag, and move photos using customizable keyboard shortcuts.
✨ Features

    ⚡ High Performance: Built with Rust to ensure a tiny memory footprint and rapid startup.

    ⌨️ Custom Shortcuts: Define your own keys to instantly move images to specific folders.

    🖼️ Dual View Modes: Focused Single Image View for detail or Grid View for quick scanning.

    📂 Intelligent Processing: Handles bulk image moving/copying without locking up the UI.

    🔄 Integrated Auto-Updater: Automatically checks for new releases via GitHub and updates itself.

    🎨 Tailwind CSS 4: Modern, sleek interface with a focus on dark-mode usability.

### 🚀 Installation & Usage
#### For Users

    Go to the Latest Releases.

    Download the installer for your system:

        Windows: .msi or .exe

        Linux: .AppImage (portable) or .deb (Debian/Ubuntu).

    Launch the app and select your source folder to start tagging.

#### For Developers (Local Setup)

Prerequisites:

    Rust (stable)

    Node.js (v20+)

    pnpm (npm install -g pnpm)

Steps:

    Clone the repo:
    Bash

git clone https://github.com/MohammedNaser28/imager.git
cd imager

Install dependencies:
Bash

pnpm install

Run Development Mode:
Bash

pnpm tauri dev

Build Production Bundle:
Bash

    pnpm tauri build

🛠️ Tech Stack

    Frontend: React 19, Vite 7

    Styling: Tailwind CSS 4

    Backend: Tauri v2 (Rust)

    Icons: Lucide React

    CI/CD: GitHub Actions (Auto-releases & signing)

📂 Project Structure
Plaintext

├── src/               # React Frontend (Vite)
│   ├── components/    # UI Components
│   └── App.jsx        # Main application logic
├── src-tauri/         # Rust Backend
│   ├── src/lib.rs     # Tauri commands & plugin setup
│   ├── capabilities/  # Security & permissions (v2)
│   └── tauri.conf.json # App configuration
└── dist/              # Built assets (generated)

🤝 Contributing

    Fork the Project.

    Create your Feature Branch (git checkout -b feature/AmazingFeature).

    Commit your Changes (git commit -m 'Add some AmazingFeature').

    Push to the Branch (git push origin feature/AmazingFeature).

    Open a Pull Request.

📄 License

Distributed under the MIT License. See LICENSE for more information.

Developed with ❤️ by Mohammed Naser