-- Migration number: 0002 	 2026-08-02T00:00:00.000Z

-- Mosque corrections arrive from the mobile app (/api/moske-rattelse) and share this
-- table with the article corrections the web form files. Three columns tell them apart
-- and carry what the article shape has no room for.

-- 'article' | 'mosque'. The DEFAULT backfills every existing row, so /api/rattelse's
-- INSERT stays untouched and `pnpm rattelser` can branch on a value that is never null.
ALTER TABLE corrections ADD COLUMN kind TEXT NOT NULL DEFAULT 'article';

-- The mosque's stable slug, e.g. 'alsalam-moske-karlshamn'. Shape-checked, not matched
-- against the web dataset: apps/mobile ships 255 records to the web's 239, so an
-- allowlist would reject mosques the app actually displays. NULL for article rows.
ALTER TABLE corrections ADD COLUMN mosque_id TEXT;

-- Which kind of error the reporter picked: stangd | adress | namn | plats | annat.
-- Deliberately no CHECK constraint — the enum lives in the app and the endpoint, and a
-- constraint here would turn adding a sixth reason into a migration. NULL for articles.
ALTER TABLE corrections ADD COLUMN reason TEXT;

-- Triage reads one kind at a time ("show me the new mosque reports"), which the existing
-- corrections_triage_idx cannot serve now that the table holds two populations.
CREATE INDEX corrections_kind_idx ON corrections (kind, status, created_at DESC);
