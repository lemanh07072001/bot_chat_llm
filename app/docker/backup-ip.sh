#!/bin/sh
set -eu
cd /srv/chat-center
umask 077
mkdir -p backups
file="backups/chat-center-$(date +%Y%m%d-%H%M%S).archive.gz"
docker compose -f docker-compose.ip.yml --env-file .env.production exec -T mongo sh -c 'mongodump --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db chat_center --archive --gzip' > "$file.partial"
test -s "$file.partial"
mv "$file.partial" "$file"
find backups -type f -name 'chat-center-*.archive.gz' -mtime +14 -delete
echo "Backup complete: $file"
