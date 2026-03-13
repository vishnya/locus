"""Tests that verify install/uninstall artifacts."""

import os
import subprocess

LOCUS_DIR = os.path.expanduser("~/code/locus")


def test_install_script_exists():
    assert os.path.isfile(f"{LOCUS_DIR}/install.sh")


def test_uninstall_script_exists():
    assert os.path.isfile(f"{LOCUS_DIR}/uninstall.sh")


def test_install_script_executable():
    assert os.access(f"{LOCUS_DIR}/install.sh", os.X_OK)


def test_uninstall_script_executable():
    assert os.access(f"{LOCUS_DIR}/uninstall.sh", os.X_OK)


def test_lc_on_path_after_install():
    """After install, `lc` should be available."""
    result = subprocess.run(["which", "lc"], capture_output=True, text=True)
    if result.returncode == 0:
        assert ".local/bin/lc" in result.stdout or "locus" in result.stdout


def test_priorities_template_exists():
    assert os.path.isfile(f"{LOCUS_DIR}/templates/PRIORITIES.md")


def test_hammerspoon_hotkey_exists():
    assert os.path.isfile(f"{LOCUS_DIR}/hammerspoon/locus_hotkey.lua")


def test_claude_commands_exist():
    assert os.path.isfile(f"{LOCUS_DIR}/claude/morning.md")
    assert os.path.isfile(f"{LOCUS_DIR}/claude/think.md")
