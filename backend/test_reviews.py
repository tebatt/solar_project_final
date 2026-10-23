import os
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from sqlalchemy import inspect
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from database import get_session
import database as database_module
from models import Company, Project, QuoteRequest, QuoteRequestCompany, Review, User
from companies import router as companies_router
from projects import router as projects_router
from quote_requests import _token_hash, router as quote_requests_router
from reviews import UNVERIFIED_REVIEW_MESSAGE, router
from security import create_access_token

ACCESS_TOKEN = "customer-review-access-token-123456789"


@pytest.fixture
def review_api():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    session = Session(engine)
    company = Company(
        name="Rafidain Solar Systems",
        founded_year=2015,
        projects_count=12,
        phone="07700000000",
        verification_status="verified",
    )
    session.add(company)
    session.flush()
    owner = User(
        email="review-owner@example.com",
        hashed_password="test-hash",
        full_name="Ahmed Mohammed",
        role="client",
    )
    session.add(owner)
    session.flush()
    request = QuoteRequest(
        group_id="UTU-2026-REVIEW",
        customer_name="Ahmed Mohammed",
        customer_phone="07711111111",
        system_kwp=8.4,
        battery_kwh=10,
        panel_count=12,
        details_json="{}",
        access_token_hash=_token_hash(ACCESS_TOKEN),
        user_id=owner.id,
    )
    session.add(request)
    session.flush()
    assignment = QuoteRequestCompany(
        request_id=request.id,
        company_id=company.id,
        status="selected",
    )
    session.add(assignment)
    completed_project = Project(
        title="Completed customer installation",
        description="A completed linked installation.",
        company_id=company.id,
        quote_request_id=request.id,
        location_governorate="Baghdad",
        location_district="Al-Jadriya",
        system_kwp=8.4,
        battery_kwh=10,
        installation_type="Hybrid",
        image_url="/projects/review-project.jpg",
        status="completed",
    )
    incomplete_project = Project(
        title="Unfinished customer installation",
        description="Still in progress.",
        company_id=company.id,
        quote_request_id=request.id,
        location_governorate="Baghdad",
        location_district="Al-Mansour",
        system_kwp=5,
        battery_kwh=0,
        installation_type="On-grid rooftop",
        image_url="/projects/in-progress.jpg",
        status="in_progress",
    )
    session.add_all([completed_project, incomplete_project])
    session.commit()
    session.refresh(company)
    session.refresh(request)
    session.refresh(completed_project)
    session.refresh(incomplete_project)

    app = FastAPI()
    app.include_router(companies_router)
    app.include_router(projects_router)
    app.include_router(quote_requests_router)
    app.include_router(router)

    def override_session():
        yield session

    app.dependency_overrides[get_session] = override_session
    client = TestClient(app)
    yield client, session, company, request, completed_project, incomplete_project
    client.close()
    session.close()
    engine.dispose()


def review_body(project_id: int) -> dict:
    return {
        "project_id": project_id,
        "access_token": ACCESS_TOKEN,
        "rating": 5,
        "communication_rating": 4,
        "work_quality_rating": 5,
        "comment": "The installation was finished carefully and on schedule.",
    }


def test_customer_can_review_completed_project_and_company_average_updates(review_api):
    client, session, company, _, project, _ = review_api
    response = client.post("/api/reviews", json=review_body(project.id))

    assert response.status_code == 201
    assert response.json()["is_verified"] is True
    assert response.json()["client_name"] == "Ahmed M."
    assert response.json()["communication_rating"] == 4
    assert company.rating == 5
    assert company.reviews_count == 1
    assert session.exec(select(Review).where(Review.project_id == project.id)).first() is not None

    company_reviews = client.get(f"/api/companies/{company.id}/reviews")
    featured_reviews = client.get("/api/reviews/featured")
    company_profile = client.get(f"/api/companies/{company.id}")
    assert company_reviews.status_code == 200
    assert len(company_reviews.json()) == 1
    assert len(featured_reviews.json()) == 1
    assert company_profile.json()["rating"] == 5
    assert company_profile.json()["reviews_count"] == 1
    public_reviews = client.get("/api/reviews")
    assert public_reviews.status_code == 200
    assert [item["project_id"] for item in public_reviews.json()] == [project.id]
    project_cards = client.get("/api/projects?status=completed")
    assert project_cards.status_code == 200
    assert project_cards.json()[0]["verified_review"] == {
        "rating": 5,
        "client_name": "Ahmed M.",
        "comment": "The installation was finished carefully and on schedule.",
        "is_verified": True,
    }
    request_card = client.get(f"/api/quote-requests?access_token={ACCESS_TOKEN}")
    assert request_card.status_code == 200
    assert request_card.json()[0]["companies"][0]["completed_projects"][0]["review"] == {
        "rating": 5,
        "client_name": "Ahmed M.",
        "comment": "The installation was finished carefully and on schedule.",
        "is_verified": True,
    }


def test_admin_can_filter_hide_unhide_and_delete_reviews_without_losing_verification_provenance(
    review_api, monkeypatch
):
    client, session, company, _, project, _ = review_api
    monkeypatch.setenv("JWT_SECRET_KEY", "review-admin-secret-key-that-is-long-enough")
    created = client.post("/api/reviews", json=review_body(project.id))
    assert created.status_code == 201
    review_id = created.json()["id"]
    review = session.get(Review, review_id)
    admin = User(
        email="review-admin@example.com",
        hashed_password="test-hash",
        full_name="Review Admin",
        role="admin",
    )
    session.add(admin)
    session.commit()
    headers = {"Authorization": f"Bearer {create_access_token(admin)}"}

    assert client.get("/api/admin/reviews").status_code == 401
    listed = client.get(
        f"/api/admin/reviews?company_id={company.id}&is_verified=true",
        headers=headers,
    )
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["is_verified"] is True

    hidden = client.patch(
        f"/api/admin/reviews/{review_id}/visibility",
        headers=headers,
        json={"is_hidden": True},
    )
    assert hidden.status_code == 200
    assert hidden.json()["is_hidden"] is True
    assert hidden.json()["is_verified"] is True
    assert review.is_verified is True
    assert company.rating == 0
    assert company.reviews_count == 0
    assert client.get("/api/reviews").json() == []
    assert client.get("/api/reviews/featured").json() == []
    assert client.get(f"/api/companies/{company.id}/reviews").json() == []
    assert client.get(f"/api/companies/{company.id}").json()["reviews_count"] == 0
    assert client.get(f"/api/projects/{project.id}").json()["verified_review"] is None
    hidden_list = client.get(
        "/api/admin/reviews?is_hidden=true",
        headers=headers,
    )
    assert len(hidden_list.json()) == 1

    visible = client.patch(
        f"/api/admin/reviews/{review_id}/visibility",
        headers=headers,
        json={"is_hidden": False},
    )
    assert visible.status_code == 200
    assert visible.json()["is_verified"] is True
    assert len(client.get("/api/reviews").json()) == 1
    assert company.rating == 5
    assert company.reviews_count == 1

    deleted = client.delete(f"/api/admin/reviews/{review_id}", headers=headers)
    assert deleted.status_code == 200
    assert deleted.json()["is_deleted"] is True
    assert deleted.json()["is_verified"] is True
    assert review.is_verified is True
    assert company.rating == 0
    assert company.reviews_count == 0
    assert client.get("/api/reviews").json() == []
    deleted_list = client.get("/api/admin/reviews?is_deleted=true", headers=headers)
    assert len(deleted_list.json()) == 1


def test_public_review_feed_returns_verified_reviews_newest_first(review_api):
    client, session, company, request, first_project, _ = review_api
    second_project = Project(
        title="Newer completed customer installation",
        description="A newer completed linked installation.",
        company_id=company.id,
        quote_request_id=request.id,
        location_governorate="Basra",
        location_district="Al-Ashar",
        system_kwp=6.4,
        installation_type="Hybrid",
        image_url="/projects/newer-review-project.jpg",
        status="completed",
    )
    session.add(second_project)
    session.flush()
    session.add_all([
        Review(
            company_id=company.id,
            project_id=first_project.id,
            client_name="Older Customer",
            rating=5,
            communication_rating=4,
            work_quality_rating=5,
            comment="An older verified review for this installation.",
            is_verified=True,
            created_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
        ),
        Review(
            company_id=company.id,
            project_id=second_project.id,
            client_name="Newer Customer",
            rating=4,
            communication_rating=4,
            work_quality_rating=4,
            comment="A newer verified review for this installation.",
            is_verified=True,
            created_at=datetime(2025, 1, 1, tzinfo=timezone.utc) + timedelta(days=1),
        ),
    ])
    session.commit()

    response = client.get("/api/reviews")

    assert response.status_code == 200
    assert [item["project_id"] for item in response.json()] == [second_project.id, first_project.id]


def test_seeded_demo_reviews_require_explicit_development_preview(review_api):
    client, session, company, _, project, _ = review_api
    session.add(Review(
        company_id=company.id,
        project_id=project.id,
        client_name="عميل تجريبي 01",
        rating=4.8,
        communication_rating=5,
        work_quality_rating=4.7,
        comment="بيانات توضيحية: الخدمة ممتازة والتنصيب تم في الموعد المحدد.",
        is_verified=False,
    ))
    session.commit()

    assert client.get("/api/reviews").json() == []

    with patch.dict(
        os.environ,
        {"APP_ENV": "development", "UTU_DEMO_REVIEW_PREVIEW_ENABLED": "true"},
    ):
        preview = client.get("/api/reviews?include_demo=true")
    assert preview.status_code == 200
    assert len(preview.json()) == 1
    assert preview.json()[0]["comment"].endswith("الخدمة ممتازة والتنصيب تم في الموعد المحدد.")
    assert preview.json()[0]["is_demo"] is True
    assert preview.json()[0]["is_verified"] is False

    with patch.dict(
        os.environ,
        {"APP_ENV": "production", "UTU_DEMO_REVIEW_PREVIEW_ENABLED": "true"},
    ):
        production = client.get("/api/reviews?include_demo=true")
    assert production.status_code == 200
    assert production.json() == []


def test_featured_project_is_not_reviewable(review_api):
    client, session, _, _, project, _ = review_api
    project.status = "featured"
    session.add(project)
    session.commit()

    response = client.post("/api/reviews", json=review_body(project.id))

    assert response.status_code == 403
    assert client.get("/api/reviews/featured").json() == []


def test_company_must_be_officially_verified_to_accept_reviews(review_api):
    client, session, company, _, project, _ = review_api
    company.verification_status = "identity_verified"
    session.add(company)
    session.commit()

    response = client.post("/api/reviews", json=review_body(project.id))

    assert response.status_code == 403
    assert response.json()["detail"] == UNVERIFIED_REVIEW_MESSAGE


def test_existing_verified_review_is_not_public_after_company_verification_is_removed(review_api):
    client, session, company, _, project, _ = review_api
    session.add(Review(
        company_id=company.id,
        project_id=project.id,
        client_name="Ahmed M.",
        rating=5,
        communication_rating=5,
        work_quality_rating=5,
        comment="A review that should not appear for an unverified company.",
        is_verified=True,
    ))
    company.verification_status = "identity_verified"
    session.add(company)
    session.commit()

    public_reviews = client.get("/api/reviews")
    project_list = client.get("/api/projects?status=completed")

    assert public_reviews.status_code == 200
    assert public_reviews.json() == []
    assert project_list.status_code == 200
    assert len(project_list.json()) == 1
    assert project_list.json()[0]["verified_review"] is None


def test_customer_cannot_review_without_completed_linked_project(review_api):
    client, _, _, _, _, project = review_api
    response = client.post("/api/reviews", json=review_body(project.id))

    assert response.status_code == 403
    assert response.json()["detail"] == UNVERIFIED_REVIEW_MESSAGE


@pytest.mark.parametrize("status", ["pending", "cancelled"])
def test_pending_or_cancelled_project_cannot_be_reviewed(review_api, status):
    client, session, _, _, project, _ = review_api
    project.status = status
    session.add(project)
    session.commit()

    response = client.post("/api/reviews", json=review_body(project.id))

    assert response.status_code == 403
    assert response.json()["detail"] == UNVERIFIED_REVIEW_MESSAGE


def test_customer_cannot_review_company_before_accepting_its_quote(review_api):
    client, session, _, request, project, _ = review_api
    assignment = session.exec(
        select(QuoteRequestCompany).where(QuoteRequestCompany.request_id == request.id)
    ).one()
    assignment.status = "quoted"
    session.add(assignment)
    session.commit()

    response = client.post("/api/reviews", json=review_body(project.id))

    assert response.status_code == 403
    assert response.json()["detail"] == UNVERIFIED_REVIEW_MESSAGE


def test_project_without_reviews_returns_empty_list(review_api):
    client, _, company, _, _, _ = review_api

    response = client.get(f"/api/companies/{company.id}/reviews")

    assert response.status_code == 200
    assert response.json() == []
    assert company.rating == 0
    assert company.reviews_count == 0


def test_missing_project_returns_404_when_submitting_review(review_api):
    client, _, _, _, _, _ = review_api

    response = client.post("/api/reviews", json=review_body(99999))

    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"


def test_customer_cannot_submit_duplicate_review_for_project(review_api):
    client, _, _, _, project, _ = review_api
    assert client.post("/api/reviews", json=review_body(project.id)).status_code == 201

    duplicate = client.post("/api/reviews", json=review_body(project.id))

    assert duplicate.status_code == 409


def test_authenticated_client_can_review_and_edit_owned_completed_project_without_private_token(review_api, monkeypatch):
    client, session, company, _, project, _ = review_api
    monkeypatch.setenv("JWT_SECRET_KEY", "review-test-secret-key-that-is-long-enough")
    owner = session.exec(select(User).where(User.email == "review-owner@example.com")).one()
    authorization = {"Authorization": f"Bearer {create_access_token(owner)}"}
    body = review_body(project.id)
    body.pop("access_token")

    submitted = client.post("/api/reviews", headers=authorization, json=body)
    assert submitted.status_code == 201
    assert submitted.json()["comment"] == body["comment"]

    saved = client.get(f"/api/reviews/projects/{project.id}/mine", headers=authorization)
    assert saved.status_code == 200
    assert saved.json()["rating"] == 5

    updated = client.put(
        f"/api/reviews/{project.id}",
        headers=authorization,
        json={
            "project_id": project.id,
            "rating": 3,
            "communication_rating": 4,
            "work_quality_rating": 3,
            "comment": "The service was acceptable, and the finished system works.",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["rating"] == 3
    assert company.reviews_count == 1
    assert company.rating == 3

    other_client = User(
        email="other-review-owner@example.com",
        hashed_password="test-hash",
        full_name="Other Client",
        role="client",
    )
    session.add(other_client)
    session.commit()
    other_authorization = {"Authorization": f"Bearer {create_access_token(other_client)}"}
    assert client.get(
        f"/api/reviews/projects/{project.id}/mine",
        headers=other_authorization,
    ).status_code == 404


def test_company_average_uses_conventional_half_up_rounding(review_api):
    client, session, company, request, project, _ = review_api
    for index, rating in enumerate((4, 4, 4)):
        session.add(Project(
            title=f"Prior completed project {index}",
            company_id=company.id,
            quote_request_id=request.id,
            location_governorate="Baghdad",
            location_district=f"District {index}",
            system_kwp=5,
            installation_type="Hybrid",
            image_url="/projects/previous.jpg",
            status="completed",
        ))
    session.flush()
    for prior_project, rating in zip(
        session.exec(select(Project).where(Project.title.like("Prior completed project %"))).all(),
        (4, 4, 4),
    ):
        session.add(Review(
            company_id=company.id,
            project_id=prior_project.id,
            client_name="Prior Customer",
            rating=rating,
            communication_rating=rating,
            work_quality_rating=rating,
            comment="A previous verified customer review.",
            is_verified=True,
        ))
    session.commit()

    body = review_body(project.id)
    body["rating"] = 4.5
    response = client.post("/api/reviews", json=body)

    assert response.status_code == 201
    assert company.rating == 4.13
    assert company.reviews_count == 4


def test_existing_database_receives_company_rating_and_project_request_columns(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE company (id INTEGER PRIMARY KEY)")
        connection.exec_driver_sql("CREATE TABLE project (id INTEGER PRIMARY KEY)")
    monkeypatch.setattr(database_module, "engine", engine)

    database_module.migrate_review_columns()

    with engine.connect() as connection:
        company_columns = {column["name"] for column in inspect(connection).get_columns("company")}
        project_columns = {column["name"] for column in inspect(connection).get_columns("project")}
    engine.dispose()

    assert {"rating", "reviews_count"} <= company_columns
    assert "quote_request_id" in project_columns


def test_admin_moderation_migration_preserves_rows_and_defaults_flags(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE company (id INTEGER PRIMARY KEY, name VARCHAR)")
        connection.exec_driver_sql("CREATE TABLE review (id INTEGER PRIMARY KEY, comment VARCHAR)")
        connection.exec_driver_sql("INSERT INTO company (id, name) VALUES (1, 'Legacy Solar')")
        connection.exec_driver_sql("INSERT INTO review (id, comment) VALUES (1, 'Legacy review')")

    monkeypatch.setattr(database_module, "engine", engine)
    database_module.migrate_admin_dashboard_columns()
    database_module.migrate_admin_dashboard_columns()

    with engine.connect() as connection:
        company = connection.exec_driver_sql(
            "SELECT id, name, is_blocked FROM company WHERE id=1"
        ).one()
        review = connection.exec_driver_sql(
            "SELECT id, comment, is_hidden, is_deleted FROM review WHERE id=1"
        ).one()
    engine.dispose()

    assert company == (1, "Legacy Solar", 0)
    assert review == (1, "Legacy review", 0, 0)