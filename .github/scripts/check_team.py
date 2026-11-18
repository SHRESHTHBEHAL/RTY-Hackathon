"""Validates team.json. Runs in GitHub Actions on every push to a team's fork."""
import json
import sys

errors = []
try:
    with open("team.json", encoding="utf-8") as f:
        team = json.load(f)
except FileNotFoundError:
    sys.exit("::error::team.json is missing. Restore it from the starter repo.")
except json.JSONDecodeError as e:
    sys.exit(f"::error::team.json is not valid JSON: {e}")


def filled(value):
    return isinstance(value, str) and value.strip() and "CHANGE_ME" not in value


for key in ("team_name", "project_title", "one_liner", "track"):
    if not filled(team.get(key)):
        errors.append(f"'{key}' still needs to be filled in")

TRACKS = ("physical-world", "ai-agents", "area-of-expertise")
if filled(team.get("track")) and team["track"].strip() not in TRACKS:
    errors.append(f"'track' must be one of: {', '.join(TRACKS)}")

members = team.get("members")
if not isinstance(members, list) or not members:
    errors.append("'members' must list at least one person")
else:
    for i, m in enumerate(members, 1):
        for key in ("name", "github"):
            if not filled((m or {}).get(key)):
                errors.append(f"member #{i}: '{key}' still needs to be filled in")

if errors:
    for e in errors:
        print(f"::error file=team.json::{e}")
    sys.exit(1)

print(f"✅ Registered: {team['team_name']} ({len(members)} member(s)): {team['project_title']}")
