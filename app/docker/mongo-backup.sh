#!/bin/sh
# Dumps the database into ./backups and prunes anything older than KEEP_DAYS.
# Run it from the repo root, on the host, via cron:
#
#   0 3 * * * cd /srv/chat-center && sh docker/mongo-backup.sh >> backups/backup.log 2>&1
#
# Restore with:
#   docker compose exec -T mongo mongorestore --archive=/backups/<file> --gzip \
#     --username "$MONGO_ROOT_USERNAME" --password "$MONGO_ROOT_PASSWORD" \
#     --authenticationDatabase admin --drop

set -eu

KEEP_DAYS="${KEEP_DAYS:-14}"
ENV_FILE="${ENV_FILE:-.env.production}"

if [ ! -f "$ENV_FILE" ]; then
  echo "missing $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
. "./$ENV_FILE"

STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="chat_center-${STAMP}.archive.gz"

mkdir -p backups

# mongodump writes inside the container, into the ./backups bind mount.
docker compose exec -T mongo mongodump \
  --archive="/backups/${ARCHIVE}" \
  --gzip \
  --db=chat_center \
  --username="${MONGO_ROOT_USERNAME}" \
  --password="${MONGO_ROOT_PASSWORD}" \
  --authenticationDatabase=admin

echo "$(date -Iseconds) wrote backups/${ARCHIVE} ($(du -h "backups/${ARCHIVE}" | cut -f1))"

# Pruning runs after a successful dump, so a failing backup never deletes the
# last good one.
find backups -name 'chat_center-*.archive.gz' -type f -mtime "+${KEEP_DAYS}" -print -delete
