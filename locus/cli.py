"""Locus CLI entrypoint."""

import argparse
import sys

from locus.commands import status, focus, note, drop, priority, morning, think, session


def main():
    parser = argparse.ArgumentParser(prog="lc", description="Locus -- your second brain")
    sub = parser.add_subparsers(dest="command")

    # lc status
    sub.add_parser("status", help="Show current priorities")

    # lc morning
    sub.add_parser("morning", help="Morning review context for Claude")

    # lc think
    sub.add_parser("think", help="Load priorities context for Claude conversation")

    # lc focus
    p_focus = sub.add_parser("focus", help="Set current focus")
    p_focus.add_argument("text", nargs="+", help="What you're working on")
    p_focus.add_argument("--level", choices=["!!", "!", "normal"], default="normal")

    # lc done
    p_done = sub.add_parser("done", help="Mark current focus or item N done")
    p_done.add_argument("n", nargs="?", type=int, help="Item number from Now list")

    # lc progress
    p_prog = sub.add_parser("progress", help="Log progress on current focus")
    p_prog.add_argument("text", nargs="+", help="Progress note")

    # lc note
    p_note = sub.add_parser("note", help="Quick note tagged to current focus")
    p_note.add_argument("text", nargs="+", help="Note text")

    # lc drop
    p_drop = sub.add_parser("drop", help="Drop a link (clipboard if no arg)")
    p_drop.add_argument("url", nargs="?", help="URL to drop")

    # lc priority
    p_pri = sub.add_parser("priority", help="Manage priorities")
    pri_sub = p_pri.add_subparsers(dest="priority_command")
    p_add = pri_sub.add_parser("add", help="Add a priority")
    p_add.add_argument("text", nargs="+", help="Task description")
    p_add.add_argument("--level", choices=["!!", "!", "normal"], default="normal")
    p_add.add_argument("--queue", action="store_true", help="Add to queue instead of now")

    # lc session
    p_sess = sub.add_parser("session", help="Cross-device session status")
    p_sess.add_argument("--pull", action="store_true", help="Pull latest from remote")
    p_sess.add_argument("--push", action="store_true", help="Push status to remote")
    p_sess.add_argument("--json", action="store_true", dest="as_json", help="Output raw JSON")

    args = parser.parse_args()

    if args.command is None:
        status.run()
    elif args.command == "status":
        status.run()
    elif args.command == "morning":
        morning.run()
    elif args.command == "think":
        think.run()
    elif args.command == "focus":
        level = "" if args.level == "normal" else args.level
        focus.set_focus(" ".join(args.text), level)
    elif args.command == "done":
        focus.mark_done(args.n)
    elif args.command == "progress":
        focus.log_progress(" ".join(args.text))
    elif args.command == "note":
        note.run(" ".join(args.text))
    elif args.command == "drop":
        drop.run(args.url)
    elif args.command == "priority":
        if args.priority_command == "add":
            level = "" if args.level == "normal" else args.level
            priority.add(" ".join(args.text), level, queue=args.queue)
        else:
            print("Usage: lc priority add \"task\" [--level !!|!|normal] [--queue]")
            sys.exit(1)
    elif args.command == "session":
        session.run(pull=args.pull, push=args.push, as_json=args.as_json)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
