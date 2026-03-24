#!/bin/sh
# NodePress automated database backup
# Runs via crond inside the backup container (every day at 2am UTC).
# Retains the last 30 daily backups locally.
# If BACKUP_S3_BUCKET is set, also uploads to S3.

set -e

BACKUP_DIR="/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILE="${BACKUP_DIR}/nodepress_${TIMESTAMP}.sql.gz"

echo "[backup] Starting pg_dump at ${TIMESTAMP}..."

pg_dump \
  -h "${POSTGRES_HOST:-db}" \
  -U "${POSTGRES_USER:-postgres}" \
  "${POSTGRES_DB:-nodepress}" \
  | gzip > "${FILE}"

echo "[backup] Saved: ${FILE} ($(du -sh "${FILE}" | cut -f1))"

# ── Prune old backups (keep last 30 days) ────────────────────────────────────
find "${BACKUP_DIR}" -name "nodepress_*.sql.gz" -mtime +30 -delete
echo "[backup] Pruned backups older than 30 days"

# ── Upload to S3 (optional) ───────────────────────────────────────────────────
if [ -n "${BACKUP_S3_BUCKET}" ]; then
  if command -v aws >/dev/null 2>&1; then
    aws s3 cp "${FILE}" "s3://${BACKUP_S3_BUCKET}/$(basename "${FILE}")"
    echo "[backup] Uploaded to s3://${BACKUP_S3_BUCKET}/$(basename "${FILE}")"
  else
    echo "[backup] WARNING: BACKUP_S3_BUCKET set but 'aws' CLI not available in container"
  fi
fi

echo "[backup] Done."
