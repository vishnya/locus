"""lc think -- print context for Claude conversation about priorities."""

from locus.priorities import load


def run():
    p = load()

    print("CURRENT STATE:")
    print()

    if p.focus:
        level = f"{p.focus.item.level} " if p.focus.item.level else ""
        print(f"Focus: {level}{p.focus.item.text} (since {p.focus.since})")
        for entry in p.focus.log:
            print(f"  > {entry}")
        print()

    if p.now:
        print("Now:")
        for i, item in enumerate(p.now, 1):
            level = f"{item.level} " if item.level else ""
            print(f"  {i}. {level}{item.text}")
        print()

    if p.queue:
        print("Queue:")
        for item in p.queue:
            level = f"{item.level} " if item.level else ""
            print(f"  - {level}{item.text}")
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
