"""Tests for priorities parser and writer."""

import os
import tempfile
from pathlib import Path

_tmpdir = tempfile.mkdtemp()
os.environ["LOCUS_VAULT"] = os.path.join(_tmpdir, "PRIORITIES.md")

from locus.priorities import parse, render, load, save, Priorities, Project, Task


SAMPLE = """# Priorities
_Last updated: 2026-03-13 09:15_
_Focus: Cache Latency (since 2026-03-13 09:00)_

## Cache Latency
- [ ] ship hotfix to prod
- [ ] investigate TTL config
- [MetaMate](https://metamate.internal/session/abc)

## Design Review
- [x] review Sarah's feedback
- [ ] prep slides
- [Diff](https://phabricator.internal/D67890)

## Done
- [x] triage oncall tickets

## Notes
- [2026-03-13 09:15] ask about rate limiting
"""


def test_parse_focus():
    p = parse(SAMPLE)
    assert p.focus == "Cache Latency"
    assert p.focus_since == "2026-03-13 09:00"


def test_parse_projects():
    p = parse(SAMPLE)
    assert len(p.projects) == 2
    assert p.projects[0].name == "Cache Latency"
    assert p.projects[1].name == "Design Review"


def test_parse_tasks():
    p = parse(SAMPLE)
    tasks = p.projects[0].tasks()
    assert len(tasks) == 2
    assert tasks[0].text == "ship hotfix to prod"
    assert tasks[0].done is False
    assert tasks[1].text == "investigate TTL config"


def test_parse_mixed_items():
    """Projects can have tasks and links mixed together."""
    p = parse(SAMPLE)
    assert len(p.projects[0].items) == 3  # 2 tasks + 1 link


def test_parse_done_tasks():
    p = parse(SAMPLE)
    tasks = p.projects[1].tasks()
    assert tasks[0].done is True
    assert tasks[0].text == "review Sarah's feedback"


def test_parse_done_section():
    p = parse(SAMPLE)
    assert len(p.done) == 1
    assert "triage oncall tickets" in p.done[0]


def test_parse_notes():
    p = parse(SAMPLE)
    assert len(p.notes) == 1
    assert "rate limiting" in p.notes[0]


def test_get_project():
    p = parse(SAMPLE)
    proj = p.get_project("cache latency")
    assert proj is not None
    assert proj.name == "Cache Latency"


def test_focused_project():
    p = parse(SAMPLE)
    proj = p.focused_project()
    assert proj is not None
    assert proj.name == "Cache Latency"


def test_round_trip():
    p = Priorities(
        focus="My Project",
        focus_since="2026-03-13 10:00",
        projects=[
            Project(name="My Project", items=[
                "- [ ] task one",
                "- [x] task two",
                "- [link](https://example.com)",
            ]),
            Project(name="Other", items=[
                "- [ ] other task",
            ]),
        ],
        done=["[x] old task"],
        notes=["[2026-03-13 10:00] test note"],
    )
    rendered = render(p)
    p2 = parse(rendered)
    assert p2.focus == "My Project"
    assert len(p2.projects) == 2
    assert len(p2.projects[0].items) == 3
    assert len(p2.projects[1].items) == 1
    assert len(p2.done) == 1
    assert len(p2.notes) == 1


def test_save_load():
    p = Priorities(
        projects=[Project(name="Test", items=["- [ ] test task"])],
    )
    save(p)
    p2 = load()
    assert len(p2.projects) == 1
    assert p2.projects[0].name == "Test"
    tasks = p2.projects[0].tasks()
    assert len(tasks) == 1
    assert tasks[0].text == "test task"


def test_empty_load():
    os.environ["LOCUS_VAULT"] = os.path.join(_tmpdir, "nonexistent.md")
    p = load()
    assert len(p.projects) == 0
    os.environ["LOCUS_VAULT"] = os.path.join(_tmpdir, "PRIORITIES.md")
