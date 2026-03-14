"""Locus web UI -- drag-and-drop priority board backed by PRIORITIES.md."""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs

from locus.priorities import load, save, parse, render, Task, ProjectInfo, Priorities, now_str, vault_path

PORT = 5790
WEB_DIR = Path(__file__).parent
UNDO_STACK = []  # list of PRIORITIES.md content strings
MAX_UNDO = 20


def _snapshot_and_save(p):
    """Snapshot current file to undo stack, then save new state."""
    path = vault_path()
    if path.exists():
        UNDO_STACK.append(path.read_text())
        if len(UNDO_STACK) > MAX_UNDO:
            UNDO_STACK.pop(0)
    save(p)


class LocusHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            self._serve_file("templates/index.html", "text/html")
        elif self.path == "/static/app.js":
            self._serve_file("static/app.js", "application/javascript")
        elif self.path == "/static/favicon.svg":
            self._serve_file("static/favicon.svg", "image/svg+xml")
        elif self.path == "/static/style.css":
            self._serve_file("static/style.css", "text/css")
        elif self.path == "/api/priorities":
            self._json_response(self._get_priorities())
        else:
            self.send_error(404)

    def do_POST(self):
        body = self._read_body()

        if self.path == "/api/task/add":
            self._handle_add_task(body)
        elif self.path == "/api/task/done":
            self._handle_done(body)
        elif self.path == "/api/task/edit":
            self._handle_edit(body)
        elif self.path == "/api/task/delete":
            self._handle_delete(body)
        elif self.path == "/api/reorder":
            self._handle_reorder(body)
        elif self.path == "/api/project/add":
            self._handle_add_project(body)
        elif self.path == "/api/project/edit":
            self._handle_edit_project(body)
        elif self.path == "/api/note/add":
            self._handle_add_note(body)
        elif self.path == "/api/note/delete":
            self._handle_delete_note(body)
        elif self.path == "/api/project/task/add":
            self._handle_add_project_task(body)
        elif self.path == "/api/project/task/delete":
            self._handle_delete_project_task(body)
        elif self.path == "/api/project/task/done":
            self._handle_done_project_task(body)
        elif self.path == "/api/task/add_note":
            self._handle_task_sub(body, "notes", "text")
        elif self.path == "/api/task/delete_note":
            self._handle_task_sub_delete(body, "notes")
        elif self.path == "/api/task/deadline":
            self._handle_task_deadline(body)
        elif self.path == "/api/undo":
            self._handle_undo(body)
        elif self.path == "/api/claude":
            self._handle_claude(body)
        else:
            self.send_error(404)

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length).decode()
        return json.loads(raw) if raw else {}

    def _json_response(self, data, code=200):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _serve_file(self, rel_path, content_type):
        path = WEB_DIR / rel_path
        if not path.exists():
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.end_headers()
        self.wfile.write(path.read_bytes())

    @staticmethod
    def _task_dict(t):
        return {"text": t.text, "project": t.project, "done": t.done,
                "notes": t.notes, "deadline": t.deadline}

    @staticmethod
    def _task_from_dict(t):
        return Task(text=t["text"], project=t.get("project", ""), done=t.get("done", False),
                     notes=t.get("notes", []),
                     deadline=t.get("deadline", ""))

    def _get_priorities(self) -> dict:
        p = load()
        td = self._task_dict
        return {
            "active": [td(t) for t in p.active],
            "up_next": [td(t) for t in p.up_next],
            "projects": [{"name": pr.name, "description": pr.description, "tasks": [td(t) for t in pr.tasks]} for pr in p.projects],
            "done": [td(t) for t in p.done],
            "notes": p.notes,
        }

    def _handle_add_task(self, body):
        p = load()
        task = Task(text=body["text"], project=body.get("project", ""))
        if body.get("section") == "active":
            p.active.append(task)
        else:
            p.up_next.insert(0, task)
        _snapshot_and_save(p)
        self._json_response(self._get_priorities())

    def _handle_done(self, body):
        p = load()
        section = body["section"]
        idx = body["index"]
        if section == "active" and idx < len(p.active):
            task = p.active.pop(idx)
            task.done = True
            p.done.insert(0, task)
        elif section == "up_next" and idx < len(p.up_next):
            task = p.up_next.pop(idx)
            task.done = True
            p.done.insert(0, task)
        _snapshot_and_save(p)
        self._json_response(self._get_priorities())

    def _handle_edit(self, body):
        p = load()
        section = body["section"]
        idx = body["index"]
        tasks = getattr(p, section, [])
        if idx < len(tasks):
            tasks[idx].text = body["text"]
            if "project" in body:
                tasks[idx].project = body["project"]
        _snapshot_and_save(p)
        self._json_response(self._get_priorities())

    def _handle_delete(self, body):
        p = load()
        section = body["section"]
        idx = body["index"]
        tasks = getattr(p, section, [])
        if idx < len(tasks):
            tasks.pop(idx)
        _snapshot_and_save(p)
        self._json_response(self._get_priorities())

    def _handle_reorder(self, body):
        """Handle drag-and-drop reorder. Body: {active: [...], up_next: [...], projects: {name: [tasks]}}"""
        p = load()
        tf = self._task_from_dict
        if "active" in body:
            p.active = [tf(t) for t in body["active"]]
        if "up_next" in body:
            p.up_next = [tf(t) for t in body["up_next"]]
        if "projects" in body:
            for proj_name, tasks in body["projects"].items():
                proj = p.get_project(proj_name)
                if proj:
                    proj.tasks = [tf(t) for t in tasks]
        _snapshot_and_save(p)
        self._json_response(self._get_priorities())

    def _handle_add_project(self, body):
        p = load()
        if not p.get_project(body["name"]):
            p.projects.append(ProjectInfo(name=body["name"], description=body.get("description", "")))
            _snapshot_and_save(p)
        self._json_response(self._get_priorities())

    def _handle_edit_project(self, body):
        p = load()
        proj = p.get_project(body["name"])
        if proj:
            if "description" in body:
                proj.description = body["description"]
        _snapshot_and_save(p)
        self._json_response(self._get_priorities())

    def _handle_add_note(self, body):
        p = load()
        p.notes.append(f"[{now_str()}] {body['text']}")
        _snapshot_and_save(p)
        self._json_response(self._get_priorities())

    def _handle_add_project_task(self, body):
        p = load()
        proj = p.get_project(body["name"])
        if proj:
            proj.tasks.append(Task(text=body["text"], project=proj.name))
        _snapshot_and_save(p)
        self._json_response(self._get_priorities())

    def _handle_delete_project_task(self, body):
        p = load()
        proj = p.get_project(body["name"])
        if proj and body["index"] < len(proj.tasks):
            proj.tasks.pop(body["index"])
        _snapshot_and_save(p)
        self._json_response(self._get_priorities())

    def _handle_done_project_task(self, body):
        p = load()
        proj = p.get_project(body["name"])
        if proj and body["index"] < len(proj.tasks):
            task = proj.tasks.pop(body["index"])
            task.done = True
            p.done.insert(0, task)
        _snapshot_and_save(p)
        self._json_response(self._get_priorities())

    def _get_task(self, body):
        """Get a task by section + index. Supports active, up_next, project:Name."""
        p = load()
        section = body.get("section", "")
        idx = body.get("index", 0)
        if section.startswith("project:"):
            proj = p.get_project(section[8:])
            if proj and idx < len(proj.tasks):
                return p, proj.tasks[idx]
        else:
            tasks = getattr(p, section, [])
            if idx < len(tasks):
                return p, tasks[idx]
        return p, None

    def _handle_task_sub(self, body, field, value_key):
        p, task = self._get_task(body)
        if task:
            getattr(task, field).append(body[value_key])
        _snapshot_and_save(p)
        self._json_response(self._get_priorities())

    def _handle_task_sub_delete(self, body, field):
        p, task = self._get_task(body)
        if task:
            items = getattr(task, field)
            sub_idx = body.get("sub_index", 0)
            if sub_idx < len(items):
                items.pop(sub_idx)
        _snapshot_and_save(p)
        self._json_response(self._get_priorities())

    def _handle_task_deadline(self, body):
        p, task = self._get_task(body)
        if task:
            task.deadline = body.get("deadline", "")
        _snapshot_and_save(p)
        self._json_response(self._get_priorities())

    def _handle_delete_note(self, body):
        p = load()
        idx = body["index"]
        if idx < len(p.notes):
            p.notes.pop(idx)
        _snapshot_and_save(p)
        self._json_response(self._get_priorities())

    def _handle_undo(self, body):
        if not UNDO_STACK:
            self._json_response(self._get_priorities())
            return
        content = UNDO_STACK.pop()
        path = vault_path()
        import fcntl
        with open(path, "w") as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            f.write(content)
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        self._json_response(self._get_priorities())

    def _handle_claude(self, body):
        import subprocess
        import shlex
        p = load()
        ctx_lines = ["Active:"]
        for t in p.active:
            ctx_lines.append(f"  [{t.project}] {t.text}")
        ctx_lines.append("Up Next:")
        for t in p.up_next:
            ctx_lines.append(f"  [{t.project}] {t.text}")
        ctx_lines.append("Projects:")
        for proj in p.projects:
            ctx_lines.append(f"  {proj.name}: {proj.description}")
            for t in proj.tasks:
                ctx_lines.append(f"    - {t.text}")
        ctx = "\n".join(ctx_lines)
        prompt = f"Here are my current priorities:\n\n{ctx}\n\nHelp me think about what to work on next and how to approach it."
        escaped = shlex.quote(prompt)
        script = f'''
            tell application "Terminal"
                activate
                do script "cd ~/code/locus && claude --dangerously-skip-permissions -p {escaped}"
            end tell
        '''
        subprocess.Popen(["osascript", "-e", script])
        self._json_response({"ok": True})

    def log_message(self, format, *args):
        pass  # quiet


def main():
    server = HTTPServer(("127.0.0.1", PORT), LocusHandler)
    print(f"Locus UI running at http://localhost:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
