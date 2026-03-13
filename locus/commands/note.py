"""lc note -- quick note tagged to current focus."""

from locus.priorities import load, save, now_str


def run(text: str):
    p = load()
    tag = f" [{p.focus}]" if p.focus else ""
    p.notes.append(f"[{now_str()}]{tag} {text}")
    save(p)
    print(f"Noted: {text}")
