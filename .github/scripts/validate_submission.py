"""Checks a Buildathon submission issue. Runs in the organizer repo when a submission issue is opened or edited."""
import json
import os
import re
import urllib.error
import urllib.request
from datetime import datetime

REPO = os.environ["REPO"]  # owner/repo of the starter repo
TOKEN = os.environ["GH_TOKEN"]
BODY = os.environ.get("ISSUE_BODY") or ""
CREATED = os.environ["ISSUE_CREATED"]
FREEZE = datetime.fromisoformat("2026-11-18T19:00:00+05:30")


def api(path):
    req = urllib.request.Request(f"https://api.github.com{path}")
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError:
        return None


def field(label):
    m = re.search(rf"### {re.escape(label)}\s*\n+(.*?)(?=\n### |\Z)", BODY, re.S)
    v = (m.group(1).strip() if m else "")
    return "" if v == "_No response_" else v


errors, warnings, ok = [], [], []
fork_url = field("Fork URL")
m = re.search(r"github\.com/([\w.-]+)/([\w.-]+?)(?:\.git)?/?$", fork_url.strip())
if not m:
    errors.append(f"**Fork URL** `{fork_url or '(empty)'}` isn't a GitHub repo URL like `https://github.com/you/buildathon-team`.")
else:
    full = f"{m.group(1)}/{m.group(2)}"
    repo = api(f"/repos/{full}")
    if not repo:
        errors.append(f"Couldn't find `{full}`. Is the URL right, and is the repo public?")
    else:
        if repo.get("private"):
            errors.append("Your repo is **private**. It must be public.")
        parent = (repo.get("parent") or {}).get("full_name", "")
        if not repo.get("fork") or parent.lower() != REPO.lower():
            errors.append(f"`{full}` is **not a fork of {REPO}**. Fork this repo using the Fork button and submit that URL.")
        else:
            ok.append(f"`{full}` is a public fork of `{REPO}`")
        tj = api(f"/repos/{full}/contents/team.json")
        if not tj:
            errors.append("`team.json` is missing from your fork.")
        else:
            import base64
            raw = base64.b64decode(tj["content"]).decode("utf-8", "replace")
            if "CHANGE_ME" in raw:
                errors.append("`team.json` still has `CHANGE_ME` in it. Fill it in, commit and push (README step 5).")
            else:
                ok.append("`team.json` is filled in")

created = datetime.fromisoformat(CREATED.replace("Z", "+00:00"))
if created > FREEZE:
    warnings.append("Submitted **after the 7:00 PM IST deadline**. The organizers will decide whether it's accepted.")

status = "needs-fix" if errors else "valid"
lines = ["## " + ("✅ Submission looks good" if not errors else "⚠️ Submission needs fixing")]
lines += [f"- ✅ {o}" for o in ok] + [f"- ❌ {e}" for e in errors] + [f"- ⏰ {w}" for w in warnings]
if errors:
    lines.append("\nFix the problems above, then **edit this issue** (no need to open a new one). The check runs again automatically.")
else:
    lines.append("\nKeep committing and pushing until **7:00 PM IST**. Judges look at your last commit before the deadline. Good luck! 🚀")

with open("result.md", "w") as f:
    f.write("\n".join(lines) + "\n")
with open(os.environ["GITHUB_OUTPUT"], "a") as f:
    f.write(f"status={status}\nlate={'true' if warnings else 'false'}\n")
print("\n".join(lines))
