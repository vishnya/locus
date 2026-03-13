"""Integration tests for CLI commands."""

import os
import tempfile

_tmpdir = tempfile.mkdtemp()
os.environ["LOCUS_VAULT"] = os.path.join(_tmpdir, "PRIORITIES.md")

from locus.priorities import load, save, Priorities, PriorityItem, Focus
from locus.commands import focus, note, drop, priority


def setup():
    """Reset to empty state."""
    save(Priorities())


def test_priority_add():
    setup()
    priority.add("Ship feature", level="!!")
    p = load()
    assert len(p.now) == 1
    assert p.now[0].text == "Ship feature"
    assert p.now[0].level == "!!"


def test_priority_ordering():
    setup()
    priority.add("Normal task")
    priority.add("Urgent task", level="!!")
    priority.add("High task", level="!")
    p = load()
    assert p.now[0].level == "!!"
    assert p.now[1].level == "!"
    assert p.now[2].level == ""


def test_focus_set():
    setup()
    focus.set_focus("Build locus", level="!!")
    p = load()
    assert p.focus is not None
    assert p.focus.item.text == "Build locus"


def test_focus_switch_moves_old_to_now():
    setup()
    focus.set_focus("Task A")
    focus.set_focus("Task B")
    p = load()
    assert p.focus.item.text == "Task B"
    assert len(p.now) == 1
    assert p.now[0].text == "Task A"


def test_done_moves_focus_to_done():
    setup()
    focus.set_focus("Task A")
    focus.mark_done()
    p = load()
    assert p.focus is None
    assert len(p.done) == 1
    assert p.done[0].text == "Task A"


def test_done_by_number():
    setup()
    priority.add("Task 1")
    priority.add("Task 2")
    focus.mark_done(1)
    p = load()
    assert len(p.now) == 1
    assert len(p.done) == 1


def test_progress():
    setup()
    focus.set_focus("Task A")
    focus.log_progress("halfway done")
    p = load()
    assert len(p.focus.log) == 1
    assert "halfway done" in p.focus.log[0]


def test_note():
    setup()
    focus.set_focus("Task A")
    note.run("remember to check config")
    p = load()
    assert len(p.notes) == 1
    assert "remember to check config" in p.notes[0]
    assert "Task A" in p.notes[0]


def test_note_without_focus():
    setup()
    note.run("standalone note")
    p = load()
    assert len(p.notes) == 1
    assert "standalone note" in p.notes[0]


def test_priority_add_to_queue():
    setup()
    priority.add("Later task", queue=True)
    p = load()
    assert len(p.now) == 0
    assert len(p.queue) == 1
    assert p.queue[0].text == "Later task"
