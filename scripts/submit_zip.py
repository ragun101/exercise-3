#!/usr/bin/env python3
"""Generate a ZIP submission file for Canvas.

The script:
1. Commits any uncommitted changes and pushes to the remote.
2. Creates ``submission-exercise-3.zip`` containing the entire repository
   (excluding .git, node_modules, and other non-essential files).

Usage:
    python3 scripts/submit_zip.py
"""

import os
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_NAME = "submission-exercise-3.zip"
OUT_PATH = ROOT / OUT_NAME

# Directories and patterns to exclude from the ZIP
EXCLUDE_DIRS = {
    ".git",
    "node_modules",
    ".gradle",
    "build",
    ".idea",
    ".settings",
    "bin",
    "__pycache__",
}
EXCLUDE_FILES = {
    ".DS_Store",
    OUT_NAME,
}


# ── helpers ──────────────────────────────────────────────────────────────────

def run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, **kwargs)


def git_commit_and_push():
    """Stage everything, commit if there are changes, and push."""
    run(["git", "add", "-A"])
    status = run(["git", "status", "--porcelain"])
    if status.stdout.strip():
        run(["git", "commit", "-m", "Submission snapshot"])
    push = run(["git", "push"])
    if push.returncode != 0:
        print("⚠  git push failed – you may need to push manually.")
        print(push.stderr)


def should_exclude(path: Path) -> bool:
    """Return True if *path* should be excluded from the ZIP."""
    parts = path.relative_to(ROOT).parts
    for part in parts:
        if part in EXCLUDE_DIRS:
            return True
    if path.name in EXCLUDE_FILES:
        return True
    return False


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    print("Committing and pushing changes …")
    git_commit_and_push()

    print(f"Creating {OUT_NAME} …")

    if OUT_PATH.exists():
        OUT_PATH.unlink()

    count = 0
    with zipfile.ZipFile(OUT_PATH, "w", zipfile.ZIP_DEFLATED) as zf:
        for file in sorted(ROOT.rglob("*")):
            if not file.is_file():
                continue
            if should_exclude(file):
                continue
            arcname = Path("exercise-3") / file.relative_to(ROOT)
            zf.write(file, arcname)
            count += 1

    size_kb = OUT_PATH.stat().st_size / 1024
    print(f"Done — {count} files, {size_kb:.0f} KB → {OUT_PATH}")


if __name__ == "__main__":
    main()
