import sqlite3

import pytest

from seed_real_companies_test import _ensure_test_admin
from security import hash_password, verify_password


USER_SCHEMA = """
CREATE TABLE "user" (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    hashed_password TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,
    is_active BOOLEAN NOT NULL,
    is_verified BOOLEAN NOT NULL DEFAULT 0,
    token_version INTEGER NOT NULL DEFAULT 0,
    company_id INTEGER,
    demo_key TEXT UNIQUE,
    created_at TEXT NOT NULL
)
"""


def test_admin_seeder_creates_explicit_admin_account(monkeypatch):
    monkeypatch.setenv("UTU_ADMIN_EMAIL", "admin@example.com")
    monkeypatch.setenv("UTU_ADMIN_PASSWORD", "secure-test-admin-password")
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.execute(USER_SCHEMA)

    email, status = _ensure_test_admin(connection)

    account = connection.execute(
        'SELECT email, hashed_password, full_name, role, is_active, is_verified '
        'FROM "user" WHERE email = ?',
        (email,),
    ).fetchone()
    assert status == "created"
    assert account["email"] == "admin@example.com"
    assert account["role"] == "admin"
    assert account["is_active"]
    assert account["is_verified"]
    assert verify_password("secure-test-admin-password", account["hashed_password"])
    connection.close()


def test_admin_seeder_promotes_only_the_configured_active_unlinked_account(monkeypatch):
    monkeypatch.setenv("UTU_ADMIN_EMAIL", "admin@solar.iq")
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.execute(USER_SCHEMA)
    connection.execute(
        """
        INSERT INTO "user"
            (email, hashed_password, full_name, role, is_active, token_version, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        ("admin@solar.iq", "existing-hash", "Existing Admin", "client", 1, 2, "2026-01-01"),
    )

    email, status = _ensure_test_admin(connection)

    account = connection.execute(
        'SELECT role, token_version, hashed_password FROM "user" WHERE email = ?',
        (email,),
    ).fetchone()
    assert status == "promoted"
    assert account["role"] == "admin"
    assert account["token_version"] == 3
    assert account["hashed_password"] == "existing-hash"
    connection.close()


def test_admin_seeder_requires_password_to_create_missing_account(monkeypatch):
    monkeypatch.setenv("UTU_ADMIN_EMAIL", "admin@example.com")
    monkeypatch.delenv("UTU_ADMIN_PASSWORD", raising=False)
    connection = sqlite3.connect(":memory:")
    connection.execute(USER_SCHEMA)

    with pytest.raises(RuntimeError, match="UTU_ADMIN_PASSWORD"):
        _ensure_test_admin(connection)

    assert connection.execute('SELECT COUNT(*) FROM "user"').fetchone()[0] == 0
    connection.close()


def test_admin_seeder_changes_password_only_when_explicitly_configured(monkeypatch):
    monkeypatch.setenv("UTU_ADMIN_EMAIL", "admin@solar.iq")
    monkeypatch.setenv("UTU_ADMIN_PASSWORD", "new-test-admin-password")
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.execute(USER_SCHEMA)
    connection.execute(
        """
        INSERT INTO "user"
            (email, hashed_password, full_name, role, is_active, token_version, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "admin@solar.iq",
            hash_password("old-test-admin-password"),
            "Existing Admin",
            "admin",
            1,
            2,
            "2026-01-01",
        ),
    )

    email, status = _ensure_test_admin(connection)

    account = connection.execute(
        'SELECT hashed_password, token_version FROM "user" WHERE email = ?',
        (email,),
    ).fetchone()
    assert status == "password updated"
    assert verify_password("new-test-admin-password", account["hashed_password"])
    assert account["token_version"] == 3
    connection.close()
