"""lc priority add -- manage priority items."""

from locus.priorities import load, save, PriorityItem


def add(text: str, level: str = "", queue: bool = False):
    p = load()
    item = PriorityItem(text=text, level=level)

    if queue:
        p.queue.append(item)
        save(p)
        print(f"Queued: {level + ' ' if level else ''}{text}")
    else:
        # Insert into Now list by priority: !! first, then !, then normal
        insert_at = len(p.now)
        if level == "!!":
            # Before first non-!! item
            for i, existing in enumerate(p.now):
                if existing.level != "!!":
                    insert_at = i
                    break
        elif level == "!":
            # After !! items, before normal items
            for i, existing in enumerate(p.now):
                if existing.level not in ("!!", "!"):
                    insert_at = i
                    break
        p.now.insert(insert_at, item)
        save(p)
        print(f"Added: {level + ' ' if level else ''}{text}")
