"""lc drop -- drop a link, tagged to current focus project."""

import subprocess
from locus.priorities import load, save, time_str


def run(url: str | None = None):
    if url is None:
        result = subprocess.run(["pbpaste"], capture_output=True, text=True)
        url = result.stdout.strip()
        if not url:
            print("Clipboard is empty. Pass a URL: lc drop <url>")
            return

    p = load()
    proj = p.focused_project()
    if proj:
        proj.items.append(f"- [{url}]({url})")
        save(p)
        print(f"Dropped in {proj.name}: {url}")
    else:
        p.notes.append(f"[link]({url})")
        save(p)
        print(f"Dropped (no focus): {url}")
