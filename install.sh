#!/bin/bash
set -euo pipefail

LOCUS_DIR="$HOME/code/locus"
VAULT_DIR="$HOME/Obsidian/main"
LOCAL_BIN="$HOME/.local/bin"
INIT_LUA="$HOME/code/anki_fox/hammerspoon/init.lua"
CLAUDE_COMMANDS="$HOME/.claude/commands"
DOFILE_LINE='dofile(os.getenv("HOME") .. "/code/locus/hammerspoon/locus_hotkey.lua")'
DOFILE_COMMENT="-- Locus quick capture"

echo "Installing Locus..."

# 1. Create venv and install
echo "Setting up Python environment..."
python3 -m venv "$LOCUS_DIR/.venv"
"$LOCUS_DIR/.venv/bin/pip" install -q -e "$LOCUS_DIR"

# 2. Symlink lc to ~/.local/bin
mkdir -p "$LOCAL_BIN"
ln -sf "$LOCUS_DIR/.venv/bin/lc" "$LOCAL_BIN/lc"
echo "Installed: lc -> $LOCAL_BIN/lc"

# 3. Create PRIORITIES.md if not present
if [ ! -f "$VAULT_DIR/PRIORITIES.md" ]; then
    cp "$LOCUS_DIR/templates/PRIORITIES.md" "$VAULT_DIR/PRIORITIES.md"
    echo "Created: $VAULT_DIR/PRIORITIES.md"
else
    echo "Skipped: PRIORITIES.md already exists"
fi

# 4. Add Hammerspoon hotkey
if [ -f "$INIT_LUA" ]; then
    if ! grep -q "locus_hotkey.lua" "$INIT_LUA"; then
        echo "" >> "$INIT_LUA"
        echo "$DOFILE_COMMENT" >> "$INIT_LUA"
        echo "$DOFILE_LINE" >> "$INIT_LUA"
        echo "Added Hammerspoon hotkey (Ctrl+Shift+N)"
    else
        echo "Skipped: Hammerspoon hotkey already configured"
    fi
else
    echo "Warning: $INIT_LUA not found. Hammerspoon hotkey not installed."
fi

# 5. Install Claude commands
mkdir -p "$CLAUDE_COMMANDS"
cp "$LOCUS_DIR/claude/morning.md" "$CLAUDE_COMMANDS/morning.md"
cp "$LOCUS_DIR/claude/think.md" "$CLAUDE_COMMANDS/think.md"
echo "Installed Claude commands: /morning, /think"

# 6. Reload Hammerspoon if running
if pgrep -x Hammerspoon > /dev/null 2>&1; then
    hs -c "hs.reload()" 2>/dev/null && echo "Hammerspoon reloaded" || echo "Note: reload Hammerspoon manually"
fi

echo ""
echo "Locus installed. Try:"
echo "  lc priority add \"my first task\" --level !!"
echo "  lc focus \"my first task\""
echo "  lc status"
