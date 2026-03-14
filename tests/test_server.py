"""Tests for web server API endpoints and undo functionality."""

import json
import os
import tempfile
import threading
from http.server import HTTPServer
from urllib.request import Request, urlopen

import pytest

_tmpdir = tempfile.mkdtemp()
os.environ["LOCUS_VAULT"] = os.path.join(_tmpdir, "PRIORITIES.md")

from locus.priorities import Priorities, Task, ProjectInfo, save, load
from web.server import LocusHandler, UNDO_STACK


def _api(port, path, body=None):
    url = f"http://127.0.0.1:{port}/api/{path}"
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if body is not None else {}
    req = Request(url, data=data, headers=headers, method="POST" if body is not None else "GET")
    with urlopen(req) as resp:
        return json.loads(resp.read())


@pytest.fixture()
def server():
    srv = HTTPServer(("127.0.0.1", 0), LocusHandler)
    port = srv.server_address[1]
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    UNDO_STACK.clear()
    yield port
    srv.shutdown()


def _seed(**kwargs):
    defaults = dict(
        active=[Task(text="active task", project="Test")],
        up_next=[Task(text="next task", project="Test")],
        projects=[ProjectInfo(name="Test", description="testing")],
    )
    defaults.update(kwargs)
    p = Priorities(**defaults)
    save(p)
    UNDO_STACK.clear()


# =============================================================================
# GET /api/priorities
# =============================================================================

def test_get_priorities(server):
    _seed()
    data = _api(server, "priorities")
    assert len(data["active"]) == 1
    assert len(data["up_next"]) == 1
    assert len(data["projects"]) == 1
    assert data["active"][0]["text"] == "active task"
    assert data["active"][0]["project"] == "Test"


def test_get_priorities_empty(server):
    save(Priorities())
    data = _api(server, "priorities")
    assert data["active"] == []
    assert data["up_next"] == []
    assert data["projects"] == []
    assert data["done"] == []
    assert data["notes"] == []


def test_get_priorities_includes_notes_and_deadline(server):
    p = Priorities(active=[
        Task(text="task", project="P", notes=["a note", "https://url.com"], deadline="2026-05-01"),
    ], projects=[ProjectInfo(name="P")])
    save(p)
    data = _api(server, "priorities")
    t = data["active"][0]
    assert t["notes"] == ["a note", "https://url.com"]
    assert t["deadline"] == "2026-05-01"


# =============================================================================
# POST /api/task/add
# =============================================================================

def test_add_task_to_up_next(server):
    _seed()
    data = _api(server, "task/add", {"text": "new task", "project": "Test"})
    assert len(data["up_next"]) == 2
    assert data["up_next"][0]["text"] == "new task"  # inserted at front


def test_add_task_to_active(server):
    _seed()
    data = _api(server, "task/add", {"text": "urgent", "section": "active"})
    assert len(data["active"]) == 2


# =============================================================================
# POST /api/task/done
# =============================================================================

def test_mark_task_done_active(server):
    _seed()
    data = _api(server, "task/done", {"section": "active", "index": 0})
    assert len(data["active"]) == 0
    assert len(data["done"]) == 1
    assert data["done"][0]["text"] == "active task"
    assert data["done"][0]["done"] is True


def test_mark_task_done_up_next(server):
    _seed()
    data = _api(server, "task/done", {"section": "up_next", "index": 0})
    assert len(data["up_next"]) == 0
    assert len(data["done"]) == 1


def test_mark_task_done_preserves_notes(server):
    p = Priorities(
        active=[Task(text="task", project="P", notes=["keep me"])],
        projects=[ProjectInfo(name="P")],
    )
    save(p)
    data = _api(server, "task/done", {"section": "active", "index": 0})
    assert data["done"][0]["notes"] == ["keep me"]


# =============================================================================
# POST /api/task/edit
# =============================================================================

def test_edit_task_text(server):
    _seed()
    data = _api(server, "task/edit", {"section": "active", "index": 0, "text": "renamed"})
    assert data["active"][0]["text"] == "renamed"


def test_edit_task_project(server):
    _seed()
    data = _api(server, "task/edit", {"section": "active", "index": 0, "text": "same", "project": "Other"})
    assert data["active"][0]["project"] == "Other"


# =============================================================================
# POST /api/task/delete
# =============================================================================

def test_delete_task(server):
    _seed()
    data = _api(server, "task/delete", {"section": "active", "index": 0})
    assert len(data["active"]) == 0


def test_delete_from_up_next(server):
    _seed()
    data = _api(server, "task/delete", {"section": "up_next", "index": 0})
    assert len(data["up_next"]) == 0


def test_delete_out_of_range(server):
    _seed()
    data = _api(server, "task/delete", {"section": "active", "index": 99})
    assert len(data["active"]) == 1  # unchanged


# =============================================================================
# POST /api/task/add_note, /api/task/delete_note
# =============================================================================

def test_add_note_to_task(server):
    _seed()
    data = _api(server, "task/add_note", {"section": "active", "index": 0, "text": "my note"})
    assert data["active"][0]["notes"] == ["my note"]


def test_add_multiple_notes(server):
    _seed()
    _api(server, "task/add_note", {"section": "active", "index": 0, "text": "note 1"})
    data = _api(server, "task/add_note", {"section": "active", "index": 0, "text": "note 2"})
    assert len(data["active"][0]["notes"]) == 2


def test_add_note_to_project_task(server):
    _seed(projects=[ProjectInfo(name="Test", tasks=[Task(text="proj task", project="Test")])])
    data = _api(server, "task/add_note", {"section": "project:Test", "index": 0, "text": "proj note"})
    assert data["projects"][0]["tasks"][0]["notes"] == ["proj note"]


def test_delete_note_from_task(server):
    p = Priorities(
        active=[Task(text="task", project="P", notes=["note0", "note1"])],
        projects=[ProjectInfo(name="P")],
    )
    save(p)
    data = _api(server, "task/delete_note", {"section": "active", "index": 0, "sub_index": 0})
    assert data["active"][0]["notes"] == ["note1"]


def test_delete_note_out_of_range(server):
    p = Priorities(
        active=[Task(text="task", project="P", notes=["only"])],
        projects=[ProjectInfo(name="P")],
    )
    save(p)
    data = _api(server, "task/delete_note", {"section": "active", "index": 0, "sub_index": 99})
    assert data["active"][0]["notes"] == ["only"]  # unchanged


# =============================================================================
# POST /api/task/deadline
# =============================================================================

def test_set_deadline(server):
    _seed()
    data = _api(server, "task/deadline", {"section": "active", "index": 0, "deadline": "2026-06-01"})
    assert data["active"][0]["deadline"] == "2026-06-01"


def test_clear_deadline(server):
    p = Priorities(
        active=[Task(text="task", project="P", deadline="2026-06-01")],
        projects=[ProjectInfo(name="P")],
    )
    save(p)
    data = _api(server, "task/deadline", {"section": "active", "index": 0, "deadline": ""})
    assert data["active"][0]["deadline"] == ""


def test_set_deadline_on_project_task(server):
    _seed(projects=[ProjectInfo(name="Test", tasks=[Task(text="pt", project="Test")])])
    data = _api(server, "task/deadline", {"section": "project:Test", "index": 0, "deadline": "2026-07-01"})
    assert data["projects"][0]["tasks"][0]["deadline"] == "2026-07-01"


# =============================================================================
# POST /api/reorder
# =============================================================================

def test_reorder_active(server):
    p = Priorities(
        active=[Task(text="a", project="P"), Task(text="b", project="P")],
        projects=[ProjectInfo(name="P")],
    )
    save(p)
    # Swap order
    data = _api(server, "reorder", {
        "active": [{"text": "b", "project": "P", "done": False, "notes": [], "deadline": ""},
                    {"text": "a", "project": "P", "done": False, "notes": [], "deadline": ""}],
        "up_next": [],
    })
    assert data["active"][0]["text"] == "b"
    assert data["active"][1]["text"] == "a"


def test_reorder_up_next(server):
    p = Priorities(
        up_next=[Task(text="x", project="P"), Task(text="y", project="P"), Task(text="z", project="P")],
        projects=[ProjectInfo(name="P")],
    )
    save(p)
    data = _api(server, "reorder", {
        "active": [],
        "up_next": [
            {"text": "z", "project": "P", "done": False, "notes": [], "deadline": ""},
            {"text": "x", "project": "P", "done": False, "notes": [], "deadline": ""},
            {"text": "y", "project": "P", "done": False, "notes": [], "deadline": ""},
        ],
    })
    assert [t["text"] for t in data["up_next"]] == ["z", "x", "y"]


def test_reorder_project_tasks(server):
    _seed(projects=[ProjectInfo(name="Test", tasks=[
        Task(text="p1", project="Test"),
        Task(text="p2", project="Test"),
    ])])
    data = _api(server, "reorder", {
        "active": [{"text": "active task", "project": "Test", "done": False, "notes": [], "deadline": ""}],
        "up_next": [{"text": "next task", "project": "Test", "done": False, "notes": [], "deadline": ""}],
        "projects": {
            "Test": [
                {"text": "p2", "project": "Test", "done": False, "notes": [], "deadline": ""},
                {"text": "p1", "project": "Test", "done": False, "notes": [], "deadline": ""},
            ]
        },
    })
    assert data["projects"][0]["tasks"][0]["text"] == "p2"


def test_reorder_move_between_sections(server):
    """Move a task from up_next to active via reorder."""
    _seed()
    data = _api(server, "reorder", {
        "active": [
            {"text": "active task", "project": "Test", "done": False, "notes": [], "deadline": ""},
            {"text": "next task", "project": "Test", "done": False, "notes": [], "deadline": ""},
        ],
        "up_next": [],
    })
    assert len(data["active"]) == 2
    assert len(data["up_next"]) == 0


def test_reorder_preserves_notes_and_deadline(server):
    p = Priorities(
        active=[Task(text="a", project="P", notes=["note1"], deadline="2026-05-01")],
        up_next=[],
        projects=[ProjectInfo(name="P")],
    )
    save(p)
    data = _api(server, "reorder", {
        "active": [{"text": "a", "project": "P", "done": False, "notes": ["note1"], "deadline": "2026-05-01"}],
        "up_next": [],
    })
    assert data["active"][0]["notes"] == ["note1"]
    assert data["active"][0]["deadline"] == "2026-05-01"


# =============================================================================
# POST /api/project/*
# =============================================================================

def test_add_project(server):
    _seed(projects=[])
    data = _api(server, "project/add", {"name": "NewProj", "description": "desc"})
    assert len(data["projects"]) == 1
    assert data["projects"][0]["name"] == "NewProj"
    assert data["projects"][0]["description"] == "desc"


def test_add_duplicate_project(server):
    _seed()
    data = _api(server, "project/add", {"name": "Test"})
    assert len(data["projects"]) == 1  # still just one


def test_edit_project_description(server):
    _seed()
    data = _api(server, "project/edit", {"name": "Test", "description": "updated desc"})
    assert data["projects"][0]["description"] == "updated desc"


def test_add_project_task(server):
    _seed()
    data = _api(server, "project/task/add", {"name": "Test", "text": "new proj task"})
    assert len(data["projects"][0]["tasks"]) == 1
    assert data["projects"][0]["tasks"][0]["text"] == "new proj task"
    assert data["projects"][0]["tasks"][0]["project"] == "Test"


def test_delete_project_task(server):
    _seed(projects=[ProjectInfo(name="Test", tasks=[
        Task(text="t1", project="Test"),
        Task(text="t2", project="Test"),
    ])])
    data = _api(server, "project/task/delete", {"name": "Test", "index": 0})
    assert len(data["projects"][0]["tasks"]) == 1
    assert data["projects"][0]["tasks"][0]["text"] == "t2"


def test_done_project_task(server):
    _seed(projects=[ProjectInfo(name="Test", tasks=[Task(text="proj task", project="Test")])])
    data = _api(server, "project/task/done", {"name": "Test", "index": 0})
    assert len(data["projects"][0]["tasks"]) == 0
    assert len(data["done"]) == 1
    assert data["done"][0]["text"] == "proj task"
    assert data["done"][0]["done"] is True


# =============================================================================
# POST /api/note/*
# =============================================================================

def test_add_global_note(server):
    _seed()
    data = _api(server, "note/add", {"text": "remember this"})
    assert len(data["notes"]) == 1
    assert "remember this" in data["notes"][0]


def test_delete_global_note(server):
    p = Priorities(notes=["note0", "note1", "note2"])
    save(p)
    data = _api(server, "note/delete", {"index": 1})
    assert len(data["notes"]) == 2
    assert "note1" not in data["notes"]


# =============================================================================
# POST /api/undo
# =============================================================================

def test_undo_restores_deleted_task(server):
    _seed()
    _api(server, "task/delete", {"section": "active", "index": 0})
    data = _api(server, "priorities")
    assert len(data["active"]) == 0

    data = _api(server, "undo", {})
    assert len(data["active"]) == 1
    assert data["active"][0]["text"] == "active task"


def test_undo_multiple_steps(server):
    _seed()
    _api(server, "task/delete", {"section": "active", "index": 0})
    _api(server, "task/delete", {"section": "up_next", "index": 0})
    data = _api(server, "priorities")
    assert len(data["active"]) == 0
    assert len(data["up_next"]) == 0

    data = _api(server, "undo", {})
    assert len(data["up_next"]) == 1
    assert len(data["active"]) == 0

    data = _api(server, "undo", {})
    assert len(data["active"]) == 1
    assert len(data["up_next"]) == 1


def test_undo_empty_stack(server):
    _seed()
    data = _api(server, "undo", {})
    assert len(data["active"]) == 1  # unchanged


def test_undo_stack_limit(server):
    from web.server import MAX_UNDO
    _seed()
    for i in range(MAX_UNDO + 5):
        _api(server, "task/add", {"text": f"task {i}", "section": "up_next"})
    assert len(UNDO_STACK) == MAX_UNDO


def test_undo_restores_task_edit(server):
    _seed()
    _api(server, "task/edit", {"section": "active", "index": 0, "text": "changed"})
    data = _api(server, "priorities")
    assert data["active"][0]["text"] == "changed"

    data = _api(server, "undo", {})
    assert data["active"][0]["text"] == "active task"


def test_undo_restores_added_note(server):
    _seed()
    _api(server, "task/add_note", {"section": "active", "index": 0, "text": "my note"})
    data = _api(server, "priorities")
    assert len(data["active"][0]["notes"]) == 1

    data = _api(server, "undo", {})
    assert len(data["active"][0]["notes"]) == 0


def test_undo_restores_deadline_change(server):
    _seed()
    _api(server, "task/deadline", {"section": "active", "index": 0, "deadline": "2026-08-01"})
    data = _api(server, "undo", {})
    assert data["active"][0]["deadline"] == ""


def test_undo_restores_project_add(server):
    _seed(projects=[])
    _api(server, "project/add", {"name": "NewProj"})
    data = _api(server, "priorities")
    assert len(data["projects"]) == 1

    data = _api(server, "undo", {})
    assert len(data["projects"]) == 0


def test_undo_restores_reorder(server):
    p = Priorities(
        up_next=[Task(text="a", project="P"), Task(text="b", project="P")],
        projects=[ProjectInfo(name="P")],
    )
    save(p)
    UNDO_STACK.clear()

    _api(server, "reorder", {
        "active": [],
        "up_next": [
            {"text": "b", "project": "P", "done": False, "notes": [], "deadline": ""},
            {"text": "a", "project": "P", "done": False, "notes": [], "deadline": ""},
        ],
    })
    data = _api(server, "undo", {})
    assert data["up_next"][0]["text"] == "a"
    assert data["up_next"][1]["text"] == "b"


# =============================================================================
# _get_task helper (project: prefix)
# =============================================================================

def test_get_task_from_project_section(server):
    """Notes/deadline on project tasks should work via project: prefix."""
    _seed(projects=[ProjectInfo(name="Test", tasks=[Task(text="pt", project="Test")])])
    data = _api(server, "task/add_note", {"section": "project:Test", "index": 0, "text": "proj note"})
    assert data["projects"][0]["tasks"][0]["notes"] == ["proj note"]


def test_get_task_nonexistent_project(server):
    _seed()
    # Should not crash, just no-op
    data = _api(server, "task/add_note", {"section": "project:Ghost", "index": 0, "text": "note"})
    # Verify state unchanged
    assert len(data["active"]) == 1


# =============================================================================
# Task serialization round-trip
# =============================================================================

def test_task_dict_roundtrip(server):
    """Verify _task_dict and _task_from_dict are inverses."""
    p = Priorities(
        active=[Task(text="t", project="P", notes=["n1", "n2"], deadline="2026-01-01")],
        projects=[ProjectInfo(name="P")],
    )
    save(p)
    data = _api(server, "priorities")
    t = data["active"][0]
    assert t == {"text": "t", "project": "P", "done": False, "notes": ["n1", "n2"], "deadline": "2026-01-01", "priority": 0}


# =============================================================================
# Priority
# =============================================================================

def test_set_priority(server):
    _seed()
    data = _api(server, "task/priority", {"section": "active", "index": 0, "priority": 2})
    assert data["active"][0]["priority"] == 2


def test_set_priority_up_next(server):
    _seed()
    data = _api(server, "task/priority", {"section": "up_next", "index": 0, "priority": 1})
    assert data["up_next"][0]["priority"] == 1


def test_set_priority_project_task(server):
    _seed(projects=[ProjectInfo(name="P", tasks=[Task(text="proj task")])])
    data = _api(server, "task/priority", {"section": "project:P", "index": 0, "priority": 2})
    assert data["projects"][0]["tasks"][0]["priority"] == 2


def test_clear_priority(server):
    _seed(active=[Task(text="t", priority=2)])
    data = _api(server, "task/priority", {"section": "active", "index": 0, "priority": 0})
    assert data["active"][0]["priority"] == 0


def test_priority_survives_roundtrip(server):
    """Priority is preserved through save/load cycle."""
    _seed(active=[Task(text="important", priority=1)])
    data = _api(server, "priorities")
    assert data["active"][0]["priority"] == 1


def test_priority_undo(server):
    _seed()
    _api(server, "task/priority", {"section": "active", "index": 0, "priority": 2})
    data = _api(server, "undo", {})
    assert data["active"][0]["priority"] == 0


def test_done_preserves_priority(server):
    _seed(active=[Task(text="urgent", priority=2)])
    data = _api(server, "task/done", {"section": "active", "index": 0})
    assert data["done"][0]["priority"] == 2


def test_reorder_preserves_priority(server):
    _seed(active=[Task(text="a", priority=1), Task(text="b", priority=2)])
    data = _api(server, "reorder", {"active": [
        {"text": "b", "priority": 2}, {"text": "a", "priority": 1}
    ]})
    assert data["active"][0]["priority"] == 2
    assert data["active"][1]["priority"] == 1


# =============================================================================
# Project reorder
# =============================================================================

def test_reorder_projects(server):
    _seed(projects=[
        ProjectInfo(name="A", tasks=[Task(text="t1")]),
        ProjectInfo(name="B", tasks=[Task(text="t2")]),
        ProjectInfo(name="C", tasks=[Task(text="t3")]),
    ])
    data = _api(server, "project/reorder", {"order": ["C", "A", "B"]})
    names = [p["name"] for p in data["projects"]]
    assert names == ["C", "A", "B"]


def test_reorder_projects_preserves_tasks(server):
    _seed(projects=[
        ProjectInfo(name="X", tasks=[Task(text="xt")]),
        ProjectInfo(name="Y", tasks=[Task(text="yt1"), Task(text="yt2")]),
    ])
    data = _api(server, "project/reorder", {"order": ["Y", "X"]})
    assert len(data["projects"][0]["tasks"]) == 2
    assert data["projects"][0]["tasks"][0]["text"] == "yt1"
    assert len(data["projects"][1]["tasks"]) == 1


def test_reorder_projects_partial(server):
    """Projects not mentioned in order are appended at the end."""
    _seed(projects=[
        ProjectInfo(name="A", tasks=[Task(text="t")]),
        ProjectInfo(name="B", tasks=[Task(text="t")]),
        ProjectInfo(name="C", tasks=[Task(text="t")]),
    ])
    data = _api(server, "project/reorder", {"order": ["C"]})
    names = [p["name"] for p in data["projects"]]
    assert names[0] == "C"
    assert set(names) == {"A", "B", "C"}


def test_reorder_projects_undo(server):
    _seed(projects=[
        ProjectInfo(name="A", tasks=[Task(text="t")]),
        ProjectInfo(name="B", tasks=[Task(text="t")]),
    ])
    _api(server, "project/reorder", {"order": ["B", "A"]})
    data = _api(server, "undo", {})
    names = [p["name"] for p in data["projects"]]
    assert names == ["A", "B"]
