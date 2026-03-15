# Worklog

Recent session handoff notes. Read on session start, append before committing.
Keep only the last 10 entries. Each entry: date, device, what was done.

---

### 2026-03-15 | Mac + Server
- Added cookie-based auth system (login page, sessions, HttpOnly cookies with SameSite=Lax)
- New endpoints: project rename/delete/archive, task undone, redo
- Touch drag-and-drop for mobile task reordering
- Chat panel improvements (close button, voice input)
- User context save/load API, PWA manifest + service worker
- Merged voice FAB (floating action button for mobile voice) from server session
- 35 new server tests (236 total across all test files)
- Fixed Locus web auth: was using Caddy basicauth which broke on mobile Chrome
- Pushed to GitHub via subtree, synced server repo
