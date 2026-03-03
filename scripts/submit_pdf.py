#!/usr/bin/env python3
"""Generate an HTML submission page and open it in the browser for printing to PDF.

The script:
1. Commits any uncommitted changes and pushes to the remote.
2. Collects the key submission artefacts (TBox, ABox, SPARQL queries, outcome
   reports) and embeds them in a self-contained HTML page together with the
   GitHub repository link.
3. Opens the HTML page in the default browser so the student can print it to
   PDF via the browser's built-in print dialog.

Usage:
    python3 scripts/submit_pdf.py
"""

import datetime
import html
import os
import subprocess
import sys
import tempfile
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SAMOD = ROOT / "SAMOD" / "workflow-domain"
ABOX_DIR = SAMOD / "data" / "abox"
SELECT_DIR = SAMOD / "data" / "select"


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


def repo_url() -> str:
    result = run(["git", "remote", "get-url", "origin"])
    url = result.stdout.strip()
    # Normalise SSH URLs to HTTPS
    if url.startswith("git@"):
        url = url.replace(":", "/", 1).replace("git@", "https://")
    return url.removesuffix(".git")


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return "(file not found)"


def collect_files(directory: Path, extensions: tuple[str, ...]) -> list[Path]:
    """Return sorted list of files with given extensions in *directory*."""
    if not directory.is_dir():
        return []
    return sorted(p for p in directory.iterdir() if p.suffix in extensions)


def file_section(path: Path, lang: str = "") -> str:
    """Return an HTML block for a single file."""
    rel = path.relative_to(ROOT)
    content = html.escape(read_text(path))
    return (
        f'<h3><code>{rel}</code></h3>\n'
        f'<pre><code class="{html.escape(lang)}">{content}</code></pre>\n'
    )


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    print("Committing and pushing changes …")
    git_commit_and_push()

    url = repo_url()
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    sections: list[str] = []

    # Repository link
    sections.append(
        f'<h2>GitHub Repository</h2>\n'
        f'<p><a href="{html.escape(url)}">{html.escape(url)}</a></p>\n'
    )

    # TBox
    tbox_path = SAMOD / "tbox.ttl"
    if tbox_path.exists():
        sections.append("<h2>TBox</h2>")
        sections.append(file_section(tbox_path, "turtle"))

    # ABox files
    abox_files = collect_files(ABOX_DIR, (".ttl", ".turtle", ".rdf"))
    if abox_files:
        sections.append("<h2>ABox Data</h2>")
        for f in abox_files:
            sections.append(file_section(f, "turtle"))

    # SPARQL queries
    query_files = collect_files(SELECT_DIR, (".rq", ".sparql"))
    if query_files:
        sections.append("<h2>SPARQL Queries</h2>")
        for f in query_files:
            sections.append(file_section(f, "sparql"))

    # Outcome reports
    outcome_files = collect_files(SELECT_DIR, (".md",))
    if outcome_files:
        sections.append("<h2>Query Outcome Reports</h2>")
        for f in outcome_files:
            sections.append(file_section(f, "markdown"))

    body = "\n".join(sections)

    html_content = f"""\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Exercise 3 — Submission</title>
<style>
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    max-width: 900px;
    margin: 2rem auto;
    padding: 0 1rem;
    color: #1a1a1a;
    line-height: 1.5;
  }}
  h1 {{ border-bottom: 2px solid #333; padding-bottom: 0.3rem; }}
  h2 {{ margin-top: 2rem; color: #2c3e50; }}
  h3 {{ margin-top: 1.5rem; }}
  pre {{
    background: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 1rem;
    overflow-x: auto;
    font-size: 0.85rem;
    white-space: pre-wrap;
    word-wrap: break-word;
  }}
  code {{ font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; }}
  a {{ color: #2563eb; }}
  .meta {{ color: #666; font-size: 0.9rem; }}
  @media print {{
    body {{ max-width: 100%; margin: 0; }}
    pre {{ white-space: pre-wrap; word-wrap: break-word; }}
  }}
</style>
</head>
<body>
<h1>Exercise 3: Web Ontologies and Knowledge Graphs</h1>
<p class="meta">Generated on {html.escape(timestamp)}</p>
{body}
</body>
</html>
"""

    out = Path(tempfile.mktemp(suffix=".html", prefix="submission-exercise-3-"))
    out.write_text(html_content, encoding="utf-8")
    print(f"HTML written to {out}")
    print("Opening in browser — use File → Print (or Ctrl/Cmd+P) to save as PDF.")
    webbrowser.open(out.as_uri())


if __name__ == "__main__":
    main()
