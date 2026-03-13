"""lc think -- print context for Claude conversation about priorities."""

from locus.priorities import load


def run():
    p = load()

    print("CURRENT STATE:")
    print()

    if p.focus:
        print(f"Focus: {p.focus} (since {p.focus_since})")
        print()

    for proj in p.projects:
        tasks = proj.tasks()
        pending = [t for t in tasks if not t.done]
        focus_marker = " [FOCUS]" if p.focus and p.focus.lower() == proj.name.lower() else ""
        print(f"{proj.name}{focus_marker}:")
        for t in pending:
            print(f"  [ ] {t.text}")
        print()

    if p.notes:
        print("Recent notes:")
        for n in p.notes[-5:]:
            print(f"  - {n}")
        print()

    if p.done:
        print(f"Done today: {len(p.done)} items")
        print()

    print("Talk to Claude about what to prioritize next.")
    print("Claude can edit PRIORITIES.md directly when you agree on changes.")
