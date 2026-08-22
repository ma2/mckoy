-- user_id is informational only (not a foreign key): during invitation-based
-- registration, no users row exists yet when the challenge is issued.
CREATE TABLE webauthn_challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  user_id TEXT,
  purpose TEXT NOT NULL CHECK (purpose IN ('registration', 'authentication')),
  expires_at TEXT NOT NULL,
  used_at TEXT
);
