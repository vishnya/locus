"""Parse and write PRIORITIES.md -- the single source of truth for Locus.

Format is project-based: each ## heading is a project containing
checkbox tasks and links. Hand-editable in Obsidian like a Google Doc.
"""

import fcntl
import os
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

DEFAULT_VAULT_PATH = os.path.expanduser("~/Obsidian/main/PRIORITIES.md")


def vault_path() -> Path:
    return Path(os.environ.get("LOCUS_VAULT", DEFAULT_VAULT_PATH))


@dataclass
class Task:
    text: str
    done: bool = False

    def to_line(self) -> str:
        check = "x" if self.done else " "
        return f"- [{check}] {self.text}"


@dataclass
class Project:
    name: str
    items: list[str] = field(default_factory=list)  # raw lines (tasks, links, notes)

    def tasks(self) -> list[Task]:
        """Extract tasks from items."""
        result = []
        for line in self.items:
            m = re.match(r"^- \[([ x])\] (.+)$", line)
            if m:
                result.append(Task(text=m.group(2), done=m.group(1) == "x"))
        return result

    def to_lines(self) -> list[str]:
        lines = [f"## {self.name}"]
        for item in self.items:
            lines.append(item)
        return lines


@dataclass
class Priorities:
    focus: str = ""  # project name
    focus_since: str = ""
    projects: list[Project] = field(default_factory=list)
    done: list[str] = field(default_factory=list)  # completed items (cross-project)
    notes: list[str] = field(default_factory=list)

    def get_project(self, name: str) -> Project | None:
        for p in self.projects:
            if p.name.lower() == name.lower():
                return p
        return None

    def focused_project(self) -> Project | None:
        if not self.focus:
            return None
        return self.get_project(self.focus)


def parse(content: str) -> Priorities:
    """Parse PRIORITIES.md content into a Priorities structure."""
    p = Priorities()
    lines = content.split("\n")
    i = 0
    current_project = None
    section = None  # "project", "done", "notes"

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Parse focus from header
        if stripped.startswith("_Focus:"):
            m = re.search(r"_Focus:\s*(.+?)(?:\s*\(since (.+?)\))?\s*_", stripped)
            if m:
                p.focus = m.group(1).strip()
                p.focus_since = m.group(2) or ""
            i += 1
            continue

        # Skip title and updated lines
        if stripped.startswith("# Priorities") or stripped.startswith("_Last updated:"):
            i += 1
            continue

        # Detect sections
        if stripped.startswith("## "):
            heading = stripped[3:].strip()
            if heading == "Done":
                section = "done"
                current_project = None
            elif heading == "Notes":
                section = "notes"
                current_project = None
            else:
                section = "project"
                current_project = Project(name=heading)
                p.projects.append(current_project)
            i += 1
            continue

        # Collect content
        if stripped == "":
            i += 1
            continue

        if section == "project" and current_project is not None:
            current_project.items.append(line.rstrip())

        elif section == "done" and stripped.startswith("- "):
            p.done.append(stripped[2:])

        elif section == "notes" and stripped.startswith("- "):
            p.notes.append(stripped[2:])

        i += 1

    return p


def render(p: Priorities) -> str:
    """Render a Priorities structure back to markdown."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [
        "# Priorities",
        f"_Last updated: {now}_",
    ]

    if p.focus:
        since = f" (since {p.focus_since})" if p.focus_since else ""
        lines.append(f"_Focus: {p.focus}{since}_")

    lines.append("")

    # Projects
    for proj in p.projects:
        lines.extend(proj.to_lines())
        lines.append("")

    # Done
    if p.done:
        lines.append("## Done")
        for item in p.done:
            lines.append(f"- {item}")
        lines.append("")

    # Notes
    if p.notes:
        lines.append("## Notes")
        for note in p.notes:
            lines.append(f"- {note}")
        lines.append("")

    return "\n".join(lines)


def load() -> Priorities:
    """Load and parse PRIORITIES.md."""
    path = vault_path()
    if not path.exists():
        return Priorities()
    return parse(path.read_text())


def save(p: Priorities) -> None:
    """Write PRIORITIES.md with file locking."""
    path = vault_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    content = render(p)
    with open(path, "w") as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        f.write(content)
        fcntl.flock(f.fileno(), fcntl.LOCK_UN)


def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def time_str() -> str:
    return datetime.now().strftime("%H:%M")
