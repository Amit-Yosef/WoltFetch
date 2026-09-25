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

if [ -z "$SERVICE" ]; then
  echo "Missing RAILWAY_SERVICE GitHub secret."
  echo "Use the service NAME from the Railway canvas (the Node app, not Postgres)."
  echo "Do not use the UUID from the browser URL."
  exit 1
fi

if printf '%s' "$SERVICE" | grep -Eq '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'; then
  echo "RAILWAY_SERVICE looks like a UUID."
  echo "Railway CI usually wants the service NAME from the canvas, e.g. woltfetch."
fi

echo "Requested service: [$SERVICE]"

STATUS_JSON="$(railway status --json 2>/dev/null || true)"
if [ -n "$STATUS_JSON" ]; then
  echo "Railway status JSON:"
  printf '%s\n' "$STATUS_JSON"
  RESOLVED="$(STATUS_JSON="$STATUS_JSON" SERVICE="$SERVICE" python3 - <<'PY'
import json, os, sys

wanted = os.environ.get("SERVICE", "").strip()
raw = os.environ.get("STATUS_JSON", "")
try:
    data = json.loads(raw)
except Exception:
    print(wanted)
    sys.exit(0)

found = []

def add(name, sid=None):
    if not name or not isinstance(name, str):
        return
    item = {"name": name, "id": sid if isinstance(sid, str) else None}
    if item not in found:
        found.append(item)

def walk(obj):
    if isinstance(obj, dict):
        services = obj.get("services")
        if isinstance(services, list):
            for svc in services:
                if isinstance(svc, dict):
                    add(svc.get("name"), svc.get("id"))
        elif isinstance(services, dict):
            for key, val in services.items():
                if isinstance(val, dict):
                    add(val.get("name") or key, val.get("id"))
                else:
                    add(key)
        for value in obj.values():
            walk(value)
    elif isinstance(obj, list):
        for value in obj:
            walk(value)

walk(data)
print("Discovered services: " + ", ".join(f"{s['name']}" + (f" ({s['id']})" if s.get("id") else "") for s in found), file=sys.stderr)

for svc in found:
    if svc["name"] == wanted:
        print(svc["name"])
        sys.exit(0)
for svc in found:
    if svc["name"].lower() == wanted.lower():
        print(svc["name"])
        sys.exit(0)
for svc in found:
    if svc.get("id") == wanted:
        print(svc["name"])
        sys.exit(0)

skip = {"postgres", "postgresql", "redis", "mongodb", "mysql", "mariadb"}
apps = [svc for svc in found if svc["name"].lower() not in skip]
if len(apps) == 1:
    print(apps[0]["name"])
    sys.exit(0)

print(wanted)
PY
)"
  if [ -n "$RESOLVED" ] && [ "$RESOLVED" != "$SERVICE" ]; then
    echo "Resolved service name: [$RESOLVED]"
    SERVICE="$RESOLVED"
  fi
else
  echo "Could not read railway status --json; deploying with the secret as-is."
fi

ARGS=(up --ci --service "$SERVICE")
if [ -n "$ENVIRONMENT" ]; then
  ARGS+=(--environment "$ENVIRONMENT")
fi

echo "Running: railway ${ARGS[*]}"
railway "${ARGS[@]}"
