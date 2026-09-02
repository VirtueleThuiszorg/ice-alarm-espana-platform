#!/usr/bin/env python3
"""
Care Conneqt → ICE Alarm España : brand-string rename.

One-shot tool. Dry-run by default; `--apply` writes.

    python3 scripts/rebrand-strings.py            # show every file and hit
    python3 scripts/rebrand-strings.py --apply    # write

THREE THINGS THIS SCRIPT WILL NOT DO, all deliberate:

1.  MedConneqt is a THIRD PARTY.  `alarm.medconneqt.nl` is the Dutch
    medication-dispenser platform the call centre works alongside, embedded at
    /call-centre/medconneqt.  It spans ten files including all three locales.
    A naive `Conneqt → ICE Alarm` pass destroys it.  Every occurrence is masked
    before any replacement runs and restored afterwards, byte for byte.

2.  `supabase/migrations/` is never touched.  Those migrations have already run
    against production; editing applied history is how you get a schema that no
    longer matches its own record.  Brand strings living in live ROWS
    (email_templates, products, documentation, ai_agent_configs) are changed by
    a new forward migration instead.

3.  `archive/`, `docs/archive/`, `REBRAND_CHECKLIST.md` and `AUDIT_REPORT*.md`
    are left alone.  They are the record of how the platform got here, and a
    record you rewrite is not a record.

Run it once, review `git diff`, then delete it.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

APPLY = "--apply" in sys.argv

# ─────────────────────────────────────────────────────────────── what to touch
INCLUDE = [
    "src", "supabase/functions", "public", "e2e", "scripts",
    "index.html", "package.json", "vercel.json", ".env.example",
    "README.md", "CLAUDE.md", "STATE.md", "GOALS.md", "TECHNICAL_SPEC.md",
    "LEGAL.md", "LAUNCH_CHECKLIST.md", "LAUNCH_SCOPE.md", "MEMBER_ONBOARDING.md",
    "PARTNER_JOURNEY.md", "CONSENT_MODEL.md", "DRAFT_OPERATOR_PROCEDURES.md",
    "PROJECT_REFS.md", "CUTOVER_CHECKLIST.md", "CUTOVER_RUNBOOK.md",
]
EXCLUDE_RE = re.compile(
    r"^(archive/|docs/archive/|supabase/migrations/|node_modules/|dist/|"
    r"package-lock\.json|bun\.lock|REBRAND_CHECKLIST\.md|AUDIT_REPORT.*\.md|"
    r"scripts/rebrand-strings\.py)"
)

# ────────────────────────────────────────────── the third party we must protect
MEDCONNEQT_RE = re.compile(r"[Mm][Ee][Dd][Cc][Oo][Nn][Nn][Ee][Qq][Tt]")
SENTINEL = "\x00MEDCQ%d\x00"

# ───────────────────────────────────────────────────── replacements, in order
# Longest and most specific first — order is load-bearing.
RULES: list[tuple[str, str]] = [
    # social handle before the generic CamelCase rule
    ("@CareConneqt", "@icealarmes"),
    ("#CareConneqt", "#ICEAlarmEspana"),
    # taglines before the name, so the name rule doesn't split them
    ("Connected Health. Human Care.", "Siempre responde alguien."),
    ("Connected Health, Human Care", "Siempre responde alguien"),
    ("Connected Health", "Siempre responde alguien"),
    # the name itself — always the full registered form; it is never wrong
    ("Care Conneqt España", "ICE Alarm España"),
    ("Care Conneqt Spain", "ICE Alarm España"),
    ("Care Conneqt", "ICE Alarm España"),
    ("CareConneqt", "ICEAlarmEspana"),
    # hosts and slugs
    ("care-conneqt-platform.vercel.app", "icealarm.es"),
    ("care-conneqt-platform", "ice-alarm-espana-platform"),
    ("careconneqt.es", "icealarm.es"),
    ("careconneqt.com", "icealarm.es"),
    ("care-conneqt", "ice-alarm-espana"),
    ("careconneqt", "icealarm"),
    # sender domain left over from ICE v1's own infrastructure
    ("notify.icehealthsync.com", "notify.icealarm.es"),
    ("icehealthsync.com", "icealarm.es"),
]


def tracked_files() -> list[Path]:
    out = subprocess.run(
        ["git", "ls-files", "-z", "--"] + INCLUDE,
        capture_output=True, text=True, check=True,
    ).stdout
    files = []
    for name in out.split("\0"):
        if not name or EXCLUDE_RE.match(name):
            continue
        p = Path(name)
        if p.is_file():
            files.append(p)
    return files


def rewrite(text: str) -> tuple[str, int]:
    """Mask MedConneqt, apply the rules, restore. Returns (text, hits)."""
    masked: list[str] = []

    def mask(m: re.Match[str]) -> str:
        masked.append(m.group(0))
        return SENTINEL % (len(masked) - 1)

    body = MEDCONNEQT_RE.sub(mask, text)

    hits = 0
    for old, new in RULES:
        n = body.count(old)
        if n:
            hits += n
            body = body.replace(old, new)

    for i, original in enumerate(masked):
        body = body.replace(SENTINEL % i, original)
    return body, hits


def main() -> int:
    files, total, touched, protected = tracked_files(), 0, 0, 0
    for p in files:
        try:
            src = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        guarded = len(MEDCONNEQT_RE.findall(src))
        out, hits = rewrite(src)
        if not hits:
            continue
        touched += 1
        total += hits
        protected += guarded
        flag = f"   [{guarded} MedConneqt protected]" if guarded else ""
        print(f"  {p}  ({hits}){flag}")
        if APPLY:
            p.write_text(out, encoding="utf-8")

    print()
    print(f"{total} replacements across {touched} of {len(files)} tracked files")
    if protected:
        print(f"{protected} MedConneqt references left untouched")
    if not APPLY:
        print("\nDRY RUN — nothing written. Re-run with --apply.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
