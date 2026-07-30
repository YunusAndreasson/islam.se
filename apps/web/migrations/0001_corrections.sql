-- Migration number: 0001 	 2026-07-29T00:00:00.000Z

CREATE TABLE corrections (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
	-- Site-relative path, e.g. /svar/vad-ar-tawhid/. Never a full URL.
	page TEXT NOT NULL,
	-- The sentence the reader says is wrong, quoted verbatim from the page.
	passage TEXT,
	description TEXT NOT NULL,
	source TEXT,
	reporter_email TEXT,
	status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'fixed', 'rejected')),
	handled_at TEXT,
	note TEXT,
	-- Salted SHA-256 of the client IP, for rate limiting. The raw IP is never stored.
	ip_hash TEXT
);

CREATE INDEX corrections_triage_idx ON corrections (status, created_at DESC);
CREATE INDEX corrections_ip_hash_idx ON corrections (ip_hash, created_at DESC);
