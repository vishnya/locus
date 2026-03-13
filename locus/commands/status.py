"""lc status -- print current priorities."""

from locus.priorities import load


def run():
    p = load()

    if p.focus:
        level = f"{p.focus.item.level} " if p.focus.item.level else ""
        since = f" (since {p.focus.since})" if p.focus.since else ""
        print(f"FOCUS: {level}{p.focus.item.text}{since}")
        for entry in p.focus.log[-3:]:  # last 3 log entries
            print(f"  > {entry}")
        print()

    if p.now:
        print("NOW:")
        for i, item in enumerate(p.now, 1):
            level = f"{item.level} " if item.level else ""
            print(f"  {i}. {level}{item.text}")
        print()

    if p.queue:
        print(f"QUEUE: {len(p.queue)} items")
        print()

    if p.done:
        print(f"DONE TODAY: {len(p.done)} items")
        for item in p.done[-3:]:
            print(f"  x {item.text}")
        print()

    if not p.focus and not p.now and not p.queue:
        print("Nothing here yet. Start with: lc priority add \"your task\"")
