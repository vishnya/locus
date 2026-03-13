#!/bin/bash
set -euo pipefail

LOCAL_BIN="$HOME/.local/bin"
INIT_LUA="$HOME/code/anki_fox/hammerspoon/init.lua"
CLAUDE_COMMANDS="$HOME/.claude/commands"
VAULT_DIR="$HOME/Obsidian/main"
LOCUS_DIR="$HOME/code/locus"

echo "Uninstalling Locus..."

# 1. Remove CLI symlink
if [ -L "$LOCAL_BIN/lc" ]; then
    rm "$LOCAL_BIN/lc"
    echo "Removed: $LOCAL_BIN/lc"
fi

# 2. Remove Hammerspoon hotkey lines
if [ -f "$INIT_LUA" ] && grep -q "locus_hotkey.lua" "$INIT_LUA"; then
    sed -i '' '/-- Locus quick capture/d' "$INIT_LUA"
    sed -i '' '/locus_hotkey\.lua/d' "$INIT_LUA"
    # Remove trailing blank lines
    sed -i '' -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$INIT_LUA"
    echo "Removed Hammerspoon hotkey"
fi

# 3. Remove Claude commands
for cmd in morning.md think.md; do
    if [ -f "$CLAUDE_COMMANDS/$cmd" ]; then
        rm "$CLAUDE_COMMANDS/$cmd"
        echo "Removed Claude command: $cmd"
    fi
done

# 4. Prompt for PRIORITIES.md
if [ -f "$VAULT_DIR/PRIORITIES.md" ]; then
    read -p "Delete $VAULT_DIR/PRIORITIES.md? This removes all your priorities. [y/N] " -r
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm "$VAULT_DIR/PRIORITIES.md"
        echo "Removed: PRIORITIES.md"
    else
        echo "Kept: PRIORITIES.md"
    fi
fi

# 5. Prompt for project directory
read -p "Delete $LOCUS_DIR/ project directory? [y/N] " -r
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf "$LOCUS_DIR"
    echo "Removed: $LOCUS_DIR"
else
    echo "Kept: $LOCUS_DIR"
fi

# 6. Reload Hammerspoon if running
if pgrep -x Hammerspoon > /dev/null 2>&1; then
    hs -c "hs.reload()" 2>/dev/null && echo "Hammerspoon reloaded" || true
fi

echo "Locus uninstalled."
