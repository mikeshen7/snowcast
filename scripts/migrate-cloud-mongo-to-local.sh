#!/usr/bin/env sh
set -eu

if [ -z "${CLOUD_DB_URL:-}" ]; then
  cat >&2 <<'EOF'
Set CLOUD_DB_URL to the source MongoDB connection string, then run this again.

Example:
  CLOUD_DB_URL='mongodb+srv://user:pass@example.mongodb.net/' ./scripts/migrate-cloud-mongo-to-local.sh

The local destination defaults to the Compose MongoDB service: mongodb://mongo:27017/
EOF
  exit 1
fi

if [ -z "${DB_NAME:-}" ] && [ -f .env ]; then
  DB_NAME="$(awk -F= '$1 == "DB_NAME" { print substr($0, index($0, "=") + 1); exit }' .env)"
fi

DB_NAME="${DB_NAME:-snowcast}"
LOCAL_MONGO_URI="${LOCAL_MONGO_URI:-mongodb://mongo:27017/}"
MONGO_TOOLS_IMAGE="${MONGO_TOOLS_IMAGE:-mongo:7}"

echo "Starting local MongoDB service..."
docker compose up -d mongo

mongo_container="$(docker compose ps -q mongo)"
if [ -z "$mongo_container" ]; then
  echo "Could not find the Compose mongo container." >&2
  exit 1
fi

network="$(docker inspect "$mongo_container" --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' | sed -n '1p')"
if [ -z "$network" ]; then
  echo "Could not determine the Docker network for the mongo container." >&2
  exit 1
fi

echo "Migrating database '$DB_NAME' into local MongoDB..."
docker run --rm \
  --network "$network" \
  -e CLOUD_DB_URL="$CLOUD_DB_URL" \
  -e DB_NAME="$DB_NAME" \
  -e LOCAL_MONGO_URI="$LOCAL_MONGO_URI" \
  "$MONGO_TOOLS_IMAGE" \
  sh -c 'mongodump --uri "$CLOUD_DB_URL" --db "$DB_NAME" --archive | mongorestore --uri "$LOCAL_MONGO_URI" --archive --drop --nsInclude "$DB_NAME.*"'

echo "Migration complete."
