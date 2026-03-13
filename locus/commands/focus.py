"""lc focus, lc done, lc progress -- core workflow commands."""

from locus.priorities import load, save, Focus, PriorityItem, now_str, time_str
from locus.session_status import SessionStatus

_status = SessionStatus()


def set_focus(text: str, level: str = ""):
    p = load()

    # Move current focus back to top of Now list
    if p.focus:
        old = p.focus.item
        old.sub_items = p.focus.log.copy()
        p.now.insert(0, old)

    p.focus = Focus(
        item=PriorityItem(text=text, level=level),
        since=now_str(),
        log=[],
    )
    save(p)
    _status.write({"phase": "focus", "status": "running", "detail": f"{level + ' ' if level else ''}{text}"})
    print(f"Focus set: {level + ' ' if level else ''}{text}")


def mark_done(n: int | None = None):
    p = load()

    if n is not None:
        # Mark item N from Now list as done
        if n < 1 or n > len(p.now):
            print(f"No item #{n}. You have {len(p.now)} items in Now.")
            return
        item = p.now.pop(n - 1)
        item.sub_items.insert(0, f"~{now_str()}~")
        p.done.insert(0, item)
        save(p)
        _status.write({"phase": "done", "status": "done", "summary": item.text})
        print(f"Done: {item.text}")
        return

    # Mark current focus as done
    if not p.focus:
        print("No current focus. Nothing to mark done.")
        return

    item = p.focus.item
    item.sub_items = [f"~{now_str()}~"] + p.focus.log
    p.done.insert(0, item)
    p.focus = None

    # Auto-advance: if there are Now items, prompt
    if p.now:
        print(f"Done: {item.text}")
        print(f"Next up: {p.now[0].text}")
        print("Use `lc focus` to start it, or it stays in your Now list.")
    else:
        print(f"Done: {item.text}")
        print("Nothing left in Now. Use `lc priority add` or `lc focus`.")

    save(p)
    _status.write({"phase": "done", "status": "done", "summary": item.text})


def log_progress(text: str):
    p = load()
    if not p.focus:
        print("No current focus. Use `lc focus` first.")
        return
    p.focus.log.append(f"[{time_str()}] {text}")
    save(p)
    print(f"Logged: {text}")
