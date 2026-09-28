import sqlite3
import unittest
from scripts.verify_teacher_migration import fingerprints


class FingerprintTests(unittest.TestCase):
    def test_same_fields_different_column_order_are_equal(self):
        first, second = sqlite3.connect(':memory:'), sqlite3.connect(':memory:')
        try:
            first.execute('CREATE TABLE users(id INTEGER,name TEXT,version INTEGER)')
            first.execute("INSERT INTO users VALUES(1,'test',2)")
            second.execute('CREATE TABLE users(id INTEGER,version INTEGER,name TEXT)')
            second.execute("INSERT INTO users VALUES(1,2,'test')")
            self.assertEqual(fingerprints(first,['users']), fingerprints(second,['users']))
            second.execute("UPDATE users SET name='changed'")
            self.assertNotEqual(fingerprints(first,['users']), fingerprints(second,['users']))
        finally:
            first.close()
            second.close()
