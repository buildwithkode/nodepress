-- Serves the dynamic API's default list order (createdAt, id) per content type,
-- so both ?page= and keyset ?cursor= paging walk the index instead of sorting
-- every matching row. Postgres scans B-trees in either direction, so this
-- covers asc and desc.
CREATE INDEX IF NOT EXISTS "entries_contentTypeId_createdAt_id_idx" ON "entries"("contentTypeId", "createdAt", "id");
