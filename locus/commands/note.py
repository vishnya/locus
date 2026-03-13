"""lc note -- quick note tagged to current focus."""

from locus.priorities import load, save, now_str


def run(text: str):
    p = load()
    tag = ""
    if p.focus:
        tag = f" [{p.focus.item.text}]"
    p.notes.append(f"[{now_str()}]{tag} {text}")
    save(p)
    print(f"Noted: {text}")
