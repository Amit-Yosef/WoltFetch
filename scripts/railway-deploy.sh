#!/usr/bin/env bash
set -euo pipefail

trim() {
  printf '%s' "$1" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

if [ -z "${RAILWAY_TOKEN:-}" ]; then
  echo "Missing RAILWAY_TOKEN GitHub secret."
  echo "Create a project token in Railway → Project Settings → Tokens."
  exit 1
fi

SERVICE="$(trim "${RAILWAY_SERVICE:-}")"
ENVIRONMENT="$(trim "${RAILWAY_ENVIRONMENT:-}")"

STATUS_JSON="$(railway status --json 2>/dev/null || true)"
if [ -z "$STATUS_JSON" ]; then
  echo "Could not read railway status --json."
  if [ -z "$SERVICE" ]; then
    echo "Set RAILWAY_SERVICE to the canvas name, e.g. WoltFetch."
    exit 1
  fi
  echo "Deploying with RAILWAY_SERVICE as-is: [$SERVICE]"
else
  SERVICE="$(STATUS_JSON="$STATUS_JSON" SERVICE="$SERVICE" python3 - <<'PY'
import json, os, sys

wanted = (os.environ.get("SERVICE") or "").strip()
data = json.loads(os.environ["STATUS_JSON"])
found = []
for edge in (data.get("services") or {}).get("edges") or []:
    node = edge.get("node") or {}
    name = node.get("name")
    if name:
        found.append({"name": name, "id": node.get("id")})

print("Discovered services: " + ", ".join(s["name"] for s in found), file=sys.stderr)
if not found:
    print(wanted)
    sys.exit(0)

def pick(name):
    print(name)
    sys.exit(0)

for svc in found:
    if wanted and svc["name"] == wanted:
        pick(svc["name"])
for svc in found:
    if wanted and svc["name"].lower() == wanted.lower():
        pick(svc["name"])
for svc in found:
    if wanted and svc.get("id") == wanted:
        pick(svc["name"])

skip = {"postgres", "postgresql", "redis", "mongodb", "mysql", "mariadb"}
apps = [svc for svc in found if svc["name"].lower() not in skip]
if len(apps) == 1:
    pick(apps[0]["name"])

print("Could not match RAILWAY_SERVICE to a Railway service.", file=sys.stderr)
print("Use the canvas name WoltFetch, not a UUID and not Postgres.", file=sys.stderr)
sys.exit(1)
PY
)"
fi

if [ -z "$SERVICE" ]; then
  echo "No Railway service name resolved."
  exit 1
fi

echo "Deploying to service: [$SERVICE]"

ARGS=(up --ci --service "$SERVICE")
if [ -n "$ENVIRONMENT" ]; then
  ARGS+=(--environment "$ENVIRONMENT")
fi

railway "${ARGS[@]}"
