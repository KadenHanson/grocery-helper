-- One row per household, keyed by a SHA-256 of that household's secret.
-- version increments on each write (used for compare-and-swap).
CREATE TABLE IF NOT EXISTS households (
  secret_hash TEXT PRIMARY KEY,
  version     INTEGER NOT NULL,
  data        TEXT    NOT NULL
);
