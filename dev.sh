#!/bin/bash
export PATH="$HOME/.npm-global/bin:$PATH"
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export WEBKIT_DISABLE_DMABUF_RENDERER=1
export LIBGL_ALWAYS_SOFTWARE=1

pnpm tauri dev