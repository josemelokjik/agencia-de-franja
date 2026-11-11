-- Migração aditiva: execute somente após homologação em D1 de teste.
-- Não altera a tabela de sessões RustDesk.
CREATE TABLE IF NOT EXISTS monitor_daily (
  alias TEXT NOT NULL,
  day TEXT NOT NULL,
  package_name TEXT NOT NULL,
  opens INTEGER NOT NULL CHECK(opens BETWEEN 0 AND 10000),
  uploaded_at INTEGER NOT NULL,
  PRIMARY KEY (alias,day,package_name)
);
CREATE INDEX IF NOT EXISTS idx_monitor_daily_day ON monitor_daily(day);
