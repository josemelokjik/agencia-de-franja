"""Verifica a migração aditiva Cloudflare D1 em SQLite descartável."""
import sqlite3
import unittest
from pathlib import Path

WORKER = Path(__file__).resolve().parents[1]
BASE = (WORKER / "schema.sql").read_text(encoding="utf-8")
MIGRATION = (WORKER / "schema-monitor.sql").read_text(encoding="utf-8")


class MonitorMigrationTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.executescript(BASE)
        self.db.execute(
            "INSERT INTO active_session VALUES (1, ?, ?, ?, ?, ?, ?, ?)",
            ("session-test", "hash-test", "id-test", "waiting", 1, 100000, None),
        )

    def tearDown(self):
        self.db.close()

    def test_additive_and_idempotent(self):
        before = self.db.execute("SELECT * FROM active_session").fetchall()
        self.db.executescript(MIGRATION)
        self.db.executescript(MIGRATION)
        self.assertEqual(before, self.db.execute("SELECT * FROM active_session").fetchall())
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM monitor_daily").fetchone()[0], 0)

    def test_composite_key_and_check_constraints(self):
        self.db.executescript(MIGRATION)
        row = ("dispositivo-01", "2026-11-11", "com.example.app", 2, 12345)
        self.db.execute("INSERT INTO monitor_daily VALUES (?,?,?,?,?)", row)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO monitor_daily VALUES (?,?,?,?,?)", row)
        for opens in (-1, 10001):
            with self.subTest(opens=opens), self.assertRaises(sqlite3.IntegrityError):
                self.db.execute("INSERT INTO monitor_daily VALUES (?,?,?,?,?)",
                                ("dispositivo-02", "2026-11-11", "com.example.app", opens, 12345))
        self.assertTrue(any(x[1] == "idx_monitor_daily_day"
                            for x in self.db.execute("PRAGMA index_list('monitor_daily')")))

    def test_scratch_rollback_preserves_existing_session(self):
        original = self.db.execute("SELECT * FROM active_session").fetchall()
        self.db.executescript(MIGRATION)
        self.db.executescript(
            "DROP INDEX IF EXISTS idx_monitor_daily_day;"
            "DROP TABLE IF EXISTS monitor_daily;"
        )
        self.assertEqual(original, self.db.execute("SELECT * FROM active_session").fetchall())
        self.assertIsNone(self.db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='monitor_daily'"
        ).fetchone())


if __name__ == "__main__":
    unittest.main()
