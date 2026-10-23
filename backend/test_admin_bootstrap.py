import logging

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

import main
from admin_bootstrap import DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD, ensure_startup_admin
from auth import router as auth_router
from database import get_session
from models import User
from security import hash_password, verify_password


def create_test_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    return engine


def test_startup_bootstrap_creates_default_hashed_admin_in_local_environment(monkeypatch, caplog):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.delenv("UTU_ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("UTU_ADMIN_PASSWORD", raising=False)
    engine = create_test_engine()

    with Session(engine) as session, caplog.at_level(logging.WARNING):
        assert ensure_startup_admin(session) is True
        admin = session.exec(select(User).where(User.email == DEFAULT_ADMIN_EMAIL)).one()
        assert admin.role == "admin"
        assert admin.is_active
        assert admin.is_verified
        assert admin.hashed_password != DEFAULT_ADMIN_PASSWORD
        assert verify_password(DEFAULT_ADMIN_PASSWORD, admin.hashed_password)
        original = admin.model_dump()

        assert ensure_startup_admin(session) is False
        session.refresh(admin)
        assert admin.model_dump() == original

    assert "change it before exposing this server" in caplog.text
    engine.dispose()


def test_startup_does_not_change_an_existing_admin(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("UTU_ADMIN_EMAIL", raising=False)
    monkeypatch.setenv("UTU_ADMIN_PASSWORD", "replacement-admin-password")
    engine = create_test_engine()

    with Session(engine) as session:
        existing = User(
            email="existing-admin@example.com",
            hashed_password=hash_password("original-admin-password"),
            full_name="Existing Admin",
            role="admin",
            is_active=True,
            is_verified=True,
            token_version=4,
        )
        session.add(existing)
        session.commit()
        session.refresh(existing)
        original = existing.model_dump()

        assert ensure_startup_admin(session) is False
        session.refresh(existing)
        assert existing.model_dump() == original
        assert verify_password("original-admin-password", existing.hashed_password)

    engine.dispose()


def test_production_requires_explicit_admin_password(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("UTU_ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("UTU_ADMIN_PASSWORD", raising=False)
    engine = create_test_engine()

    with Session(engine) as session:
        with pytest.raises(RuntimeError, match="Set UTU_ADMIN_PASSWORD"):
            ensure_startup_admin(session)
        assert session.exec(select(User)).all() == []

    engine.dispose()


def test_startup_creates_admin_and_default_login_works_on_fresh_database(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.delenv("UTU_ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("UTU_ADMIN_PASSWORD", raising=False)
    monkeypatch.setenv("JWT_SECRET_KEY", "unit-test-jwt-secret-key-which-is-long-enough")
    engine = create_test_engine()
    original_engine = main.engine
    original_create_tables = main.create_db_and_tables
    original_override = main.app.dependency_overrides.get(get_session)

    def create_isolated_tables():
        SQLModel.metadata.create_all(engine)

    def isolated_session():
        with Session(engine) as session:
            yield session

    monkeypatch.setattr(main, "engine", engine)
    monkeypatch.setattr(main, "create_db_and_tables", create_isolated_tables)
    main.app.dependency_overrides[get_session] = isolated_session

    try:
        with TestClient(main.app) as client:
            response = client.post(
                "/api/auth/login",
                json={"email": DEFAULT_ADMIN_EMAIL, "password": DEFAULT_ADMIN_PASSWORD},
            )
            assert response.status_code == 200
            assert response.json()["user"]["role"] == "admin"
    finally:
        main.app.dependency_overrides.pop(get_session, None)
        if original_override is not None:
            main.app.dependency_overrides[get_session] = original_override
        monkeypatch.setattr(main, "engine", original_engine)
        monkeypatch.setattr(main, "create_db_and_tables", original_create_tables)
        engine.dispose()
