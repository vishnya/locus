# Locus -- Claude Instructions

## Session Start -- Always Do This

On session start, immediately check `data/session_status.json`:

1. Run `git pull origin <current-branch>` to get latest
2. Read `data/session_status.json`
3. If status is "running" -- tell the user what's in progress (phase, %, detail)
4. If status is "done" -- briefly mention the completed task
5. If status is "error" -- alert the user

This enables cross-device monitoring (e.g. checking from phone what the computer is doing).

## Cross-Device Session Sync

This repo uses a git-tracked status file for monitoring long-running tasks across devices.

### Checking status (phone or any device)

If the user asks what their computer is doing, what's running, or wants a progress update:

1. Pull the latest: `git pull origin <current-branch>`
2. Read `data/session_status.json`
3. Display it in human-readable format (phase, progress %, detail, timing)

You can also run: `python -m locus.status_cli --pull`

### Running long tasks (computer)

When running any long-running operation, use `SessionStatus`:

```python
from locus.session_status import SessionStatus

status = SessionStatus(auto_push=True)
status.mark_phase("processing", "reindexing notes")
# ... do work ...
status.mark_done("reindexed 150 notes")
```

### Status JSON schema

```json
{
  "phase": "processing",
  "status": "running | done | error",
  "detail": "Human-readable description",
  "percent": 42.5,
  "items_done": 425,
  "items_total": 1000,
  "started_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "summary": "Final result (when done)",
  "error": "Error message (when failed)"
}
```

## Project Overview

Locus is a local-first second brain and priority tracker. All data lives in a single `PRIORITIES.md` file in the Obsidian vault (`~/Obsidian/main/`).

### CLI (`lc`)

- `lc` / `lc status` -- show current focus + priorities
- `lc focus "task"` -- set current focus
- `lc done [N]` -- mark done
- `lc progress "note"` -- log progress
- `lc note "text"` -- quick note
- `lc drop [url]` -- drop link (clipboard if no arg)
- `lc priority add "task" [--level !!|!] [--queue]` -- add priority
- `lc morning` -- morning review context
- `lc think` -- priority conversation context

### Architecture

- Zero dependencies beyond Python stdlib
- Source of truth: Hetzner VPS (5.161.182.15), vault at `/home/locus/vault/PRIORITIES.md`
- Web UI: https://5.161.182.15.nip.io (Caddy + systemd)
- Hammerspoon hotkey: Cmd+Shift+L opens web UI
- Claude commands: `/morning`, `/think`
- File locking via `fcntl.flock()` for concurrent writes
- Vault path overridable via `LOCUS_VAULT` env var

### Key files

```
locus/
    priorities.py         Parser/writer for PRIORITIES.md
    cli.py                Argparse entrypoint
    session_status.py     Cross-device session sync
    status_cli.py         CLI for session status
    commands/             One module per subcommand
data/
    session_status.json   Git-tracked session status (NOT gitignored)
hammerspoon/
    locus_hotkey.lua      Cmd+Shift+L opens web UI
claude/
    morning.md            /morning Claude command
    think.md              /think Claude command
install.sh
uninstall.sh
tests/                    26 tests
```

### Git / Monorepo

This project lives at `~/code/locus/` inside the monorepo. Push with:

```bash
git subtree push --prefix=locus <remote> main
```

### Tests

```bash
cd ~/code/locus && .venv/bin/python -m pytest tests/ -v
```

### Commit style

- No "Co-Authored-By: Claude" or LLM attribution
- No "Generated with Claude Code" footers
