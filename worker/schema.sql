-- One-row store. id is always 1; version increments on each write (used for CAS).
CREATE TABLE IF NOT EXISTS state (
  id      INTEGER PRIMARY KEY,
  version INTEGER NOT NULL,
  data    TEXT    NOT NULL
);
