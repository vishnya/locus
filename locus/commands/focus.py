"""lc focus, lc done, lc progress -- core workflow commands."""

from locus.priorities import load, save, now_str, time_str
from locus.session_status import SessionStatus

_status = SessionStatus()


def set_focus(name: str):
    p = load()
    proj = p.get_project(name)
    if not proj:
        # Fuzzy match
        for pr in p.projects:
            if name.lower() in pr.name.lower():
                proj = pr
                break
    if not proj:
        print(f"No project matching \"{name}\". Projects: {', '.join(pr.name for pr in p.projects)}")
        return

    p.focus = proj.name
    p.focus_since = now_str()
    save(p)
    _status.write({"phase": "focus", "status": "running", "detail": proj.name})
    print(f"Focus set: {proj.name}")


def mark_done(n: int | None = None):
    p = load()

    if n is not None:
        # Mark task N in focused project
        proj = p.focused_project()
        if not proj:
            print("No focused project. Use `lc focus` first.")
            return
        tasks = proj.tasks()
        pending = [(i, t) for i, t in enumerate(tasks) if not t.done]
        if n < 1 or n > len(pending):
            print(f"No task #{n}. You have {len(pending)} pending tasks.")
            return
        idx, task = pending[n - 1]
        # Find and update the line in items
        task_count = 0
        for j, line in enumerate(proj.items):
            if line.strip().startswith("- [ ]") or line.strip().startswith("- [x]"):
                task_count += 1
                if task_count - 1 == idx:
                    proj.items[j] = line.replace("- [ ]", "- [x]", 1)
                    break
        p.done.insert(0, f"[x] {task.text}")
        save(p)
        _status.write({"phase": "done", "status": "done", "summary": task.text})
        print(f"Done: {task.text}")
        return

    # No number -- mark top pending task in focused project
    proj = p.focused_project()
    if not proj:
        print("No focused project. Use `lc focus` first.")
        return
    tasks = proj.tasks()
    pending = [t for t in tasks if not t.done]
    if not pending:
        print(f"No pending tasks in {proj.name}.")
        return
    # Mark the first pending task done
    for j, line in enumerate(proj.items):
        if line.strip().startswith("- [ ]"):
            proj.items[j] = line.replace("- [ ]", "- [x]", 1)
            break
    p.done.insert(0, f"[x] {pending[0].text}")
    save(p)
    _status.write({"phase": "done", "status": "done", "summary": pending[0].text})
    print(f"Done: {pending[0].text}")


def log_progress(text: str):
    p = load()
    proj = p.focused_project()
    if not proj:
        print("No focused project. Use `lc focus` first.")
        return
    proj.items.append(f"- [{time_str()}] {text}")
    save(p)
    print(f"Logged: {text}")
