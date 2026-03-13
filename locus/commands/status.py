"""lc status -- print current priorities."""

from locus.priorities import load


def run():
    p = load()

    if p.focus:
        since = f" (since {p.focus_since})" if p.focus_since else ""
        print(f"FOCUS: {p.focus}{since}")
        print()

    if not p.projects:
        print("No projects. Start with: lc project add \"Project Name\"")
        return

    for proj in p.projects:
        tasks = proj.tasks()
        pending = [t for t in tasks if not t.done]
        done_count = len(tasks) - len(pending)
        focus_marker = " [FOCUS]" if p.focus and p.focus.lower() == proj.name.lower() else ""
        print(f"{proj.name}{focus_marker}  ({len(pending)} pending, {done_count} done)")
        for t in pending[:3]:  # show top 3 pending tasks
            print(f"  [ ] {t.text}")
        if len(pending) > 3:
            print(f"  ... +{len(pending) - 3} more")
        print()

    if p.done:
        print(f"DONE: {len(p.done)} items")
