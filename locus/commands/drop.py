"""lc drop -- drop a link, tagged to current focus."""

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
    if p.focus:
        p.focus.log.append(f"[{time_str()}] [link]({url})")
        save(p)
        print(f"Dropped: {url}")
    else:
        p.notes.append(f"[link]({url})")
        save(p)
        print(f"Dropped (no focus): {url}")
