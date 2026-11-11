CREATE TABLE IF NOT EXISTS active_session (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    session_id TEXT NOT NULL,
    pairing_hash TEXT NOT NULL,
    rustdesk_id TEXT,
    state TEXT NOT NULL CHECK (state IN ('waiting','ready','closed')),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    consented_at INTEGER
);
