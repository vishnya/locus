"""Integration tests for CLI commands."""

import os
import tempfile

_tmpdir = tempfile.mkdtemp()
os.environ["LOCUS_VAULT"] = os.path.join(_tmpdir, "PRIORITIES.md")

from locus.priorities import load, save, Priorities, Project
from locus.commands import focus, note, drop, priority


def setup():
    """Reset to empty state."""
    save(Priorities())


def test_project_add():
    setup()
    priority.add_project("My Project")
    p = load()
    assert len(p.projects) == 1
    assert p.projects[0].name == "My Project"


def test_project_add_duplicate():
    setup()
    priority.add_project("My Project")
    priority.add_project("My Project")
    p = load()
    assert len(p.projects) == 1


def test_task_add_to_focused():
    setup()
    priority.add_project("My Project")
    focus.set_focus("My Project")
    priority.add("ship hotfix", level="!!")
    p = load()
    tasks = p.projects[0].tasks()
    assert len(tasks) == 1
    assert "ship hotfix" in tasks[0].text


def test_task_add_to_named_project():
    setup()
    priority.add_project("Alpha")
    priority.add_project("Beta")
    priority.add("alpha task", project="Alpha")
    priority.add("beta task", project="Beta")
    p = load()
    assert len(p.projects[0].tasks()) == 1
    assert len(p.projects[1].tasks()) == 1


def test_focus_set():
    setup()
    priority.add_project("My Project")
    focus.set_focus("My Project")
    p = load()
    assert p.focus == "My Project"


def test_focus_fuzzy_match():
    setup()
    priority.add_project("Cache Latency Investigation")
    focus.set_focus("cache")
    p = load()
    assert p.focus == "Cache Latency Investigation"


def test_done_marks_top_task():
    setup()
    priority.add_project("Proj")
    focus.set_focus("Proj")
    priority.add("task one")
    priority.add("task two")
    focus.mark_done()
    p = load()
    tasks = p.projects[0].tasks()
    pending = [t for t in tasks if not t.done]
    assert len(pending) == 1
    assert pending[0].text == "task two"
    assert len(p.done) == 1


def test_done_by_number():
    setup()
    priority.add_project("Proj")
    focus.set_focus("Proj")
    priority.add("task one")
    priority.add("task two")
    focus.mark_done(2)
    p = load()
    tasks = p.projects[0].tasks()
    pending = [t for t in tasks if not t.done]
    assert len(pending) == 1
    assert pending[0].text == "task one"


def test_progress():
    setup()
    priority.add_project("Proj")
    focus.set_focus("Proj")
    focus.log_progress("halfway done")
    p = load()
    assert any("halfway done" in item for item in p.projects[0].items)


def test_note():
    setup()
    priority.add_project("Proj")
    focus.set_focus("Proj")
    note.run("remember to check config")
    p = load()
    assert len(p.notes) == 1
    assert "remember to check config" in p.notes[0]
    assert "Proj" in p.notes[0]


def test_note_without_focus():
    setup()
    note.run("standalone note")
    p = load()
    assert len(p.notes) == 1
    assert "standalone note" in p.notes[0]
