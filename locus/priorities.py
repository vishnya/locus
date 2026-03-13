"""Parse and write PRIORITIES.md -- the single source of truth for Locus."""

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
class PriorityItem:
    text: str
    level: str = ""  # "!!", "!", or ""
    sub_items: list[str] = field(default_factory=list)

    def to_line(self) -> str:
        prefix = f"{self.level} " if self.level else ""
        return f"- {prefix}{self.text}"

    def to_lines(self) -> list[str]:
        lines = [self.to_line()]
        for sub in self.sub_items:
            lines.append(f"  - {sub}")
        return lines


@dataclass
class Focus:
    item: PriorityItem
    since: str = ""  # timestamp string
    log: list[str] = field(default_factory=list)

    def to_lines(self) -> list[str]:
        since_part = f" (since {self.since})" if self.since else ""
        prefix = f"{self.item.level} " if self.item.level else ""
        lines = [f"- **{prefix}{self.item.text}**{since_part}"]
        for entry in self.log:
            lines.append(f"  - {entry}")
        return lines


@dataclass
class Priorities:
    date: str = ""
    focus: Focus | None = None
    now: list[PriorityItem] = field(default_factory=list)
    queue: list[PriorityItem] = field(default_factory=list)
    done: list[PriorityItem] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def _parse_level(text: str) -> tuple[str, str]:
    """Extract priority level from text. Returns (level, remaining_text)."""
    text = text.strip()
    if text.startswith("!! "):
        return "!!", text[3:]
    if text.startswith("! "):
        return "!", text[2:]
    return "", text


def _parse_item_line(line: str) -> PriorityItem | None:
    """Parse a '- text' or '1. text' line into a PriorityItem."""
    m = re.match(r"^(?:-|\d+\.)\s+(.+)$", line.strip())
    if not m:
        return None
    level, text = _parse_level(m.group(1))
    return PriorityItem(text=text, level=level)


def _parse_sub_item(line: str) -> str | None:
    """Parse a '  - text' or '   - text' sub-item line."""
    m = re.match(r"^ {2,4}- (.+)$", line)
    if not m:
        return None
    return m.group(1)


def parse(content: str) -> Priorities:
    """Parse PRIORITIES.md content into a Priorities structure."""
    p = Priorities()
    lines = content.split("\n")
    section = None
    i = 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Parse date from header
        if stripped.startswith("_Last updated:"):
            m = re.search(r"_Last updated: (.+)_", stripped)
            if m:
                p.date = m.group(1)
            i += 1
            continue

        # Detect sections
        if stripped == "## Focus":
            section = "focus"
            i += 1
            continue
        elif stripped == "## Now":
            section = "now"
            i += 1
            continue
        elif stripped == "## Queue":
            section = "queue"
            i += 1
            continue
        elif stripped == "## Done":
            section = "done"
            i += 1
            continue
        elif stripped == "## Notes":
            section = "notes"
            i += 1
            continue
        elif stripped.startswith("## "):
            section = None
            i += 1
            continue

        if section == "focus" and stripped.startswith("- **"):
            # Parse focus line: - **!! task text** (since TIMESTAMP)
            m = re.match(r"^- \*\*(.+?)\*\*(?:\s*\(since (.+?)\))?$", stripped)
            if m:
                level, text = _parse_level(m.group(1))
                item = PriorityItem(text=text, level=level)
                since = m.group(2) or ""
                log = []
                # Collect sub-items
                i += 1
                while i < len(lines):
                    sub = _parse_sub_item(lines[i])
                    if sub is not None:
                        log.append(sub)
                        i += 1
                    else:
                        break
                p.focus = Focus(item=item, since=since, log=log)
                continue

        if section in ("now", "queue", "done") and (stripped.startswith("- ") or re.match(r"^\d+\.", stripped)):
            item = _parse_item_line(stripped)
            if item:
                # Collect sub-items
                i += 1
                while i < len(lines):
                    sub = _parse_sub_item(lines[i])
                    if sub is not None:
                        item.sub_items.append(sub)
                        i += 1
                    else:
                        break
                getattr(p, section).append(item)
                continue

        if section == "notes" and stripped.startswith("- "):
            m = re.match(r"^- (.+)$", stripped)
            if m:
                p.notes.append(m.group(1))

        i += 1

    return p


def render(p: Priorities) -> str:
    """Render a Priorities structure back to markdown."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [
        "# Priorities",
        f"_Last updated: {now}_",
        "",
    ]

    # Focus
    lines.append("## Focus")
    if p.focus:
        lines.extend(p.focus.to_lines())
    else:
        lines.append("_No current focus. Use `lc focus` to set one._")
    lines.append("")

    # Now
    lines.append("## Now")
    if p.now:
        for i, item in enumerate(p.now, 1):
            prefix = f"{item.level} " if item.level else ""
            lines.append(f"{i}. {prefix}{item.text}")
            for sub in item.sub_items:
                lines.append(f"   - {sub}")
    else:
        lines.append("_Queue is empty._")
    lines.append("")

    # Queue
    lines.append("## Queue")
    if p.queue:
        for item in p.queue:
            lines.extend(item.to_lines())
    else:
        lines.append("_Nothing queued._")
    lines.append("")

    # Done
    lines.append("## Done")
    if p.done:
        for item in p.done:
            lines.extend(item.to_lines())
    else:
        lines.append("_Nothing done yet today._")
    lines.append("")

    # Notes
    lines.append("## Notes")
    if p.notes:
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
