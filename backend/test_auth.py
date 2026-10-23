import pytest
import hashlib
import json
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from auth import _authenticate, router as auth_router
from companies import (
    PasswordResetConfirm,
    _password_hash as hash_legacy_company_password,
    confirm_password_reset,
    router as companies_router,
)
from company_portal import router as company_portal_router
from database import get_session
from models import (
    Company,
    CompanyCredential,
    CompanyPasswordResetToken,
    CompanyVerification,
    ProjectLifecycleRecord,
    Project,
    QuoteRequest,
    QuoteRequestCompany,
    User,
    VerificationDocument,
)
from projects import router as projects_router
from reviews import router as reviews_router
from security import _jwt_settings, create_access_token, hash_password, user_from_token, verify_password

JWT_SECRET = "unit-test-jwt-secret-key-which-is-long-enough"


@pytest.fixture
def auth_env(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", JWT_SECRET)
    monkeypatch.setenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30")


@pytest.fixture
def auth_api(auth_env):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    session = Session(engine)
    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(companies_router)
    app.include_router(company_portal_router)
    app.include_router(projects_router)
    app.include_router(reviews_router)

    def override_session():
        yield session

    app.dependency_overrides[get_session] = override_session
    client = TestClient(app)
    yield client, session
    client.close()
    session.close()
    engine.dispose()


def test_password_hashing_rejects_invalid_passwords():
    hashed = hash_password("a-long-test-password")
    assert hashed != "a-long-test-password"
    assert verify_password("a-long-test-password", hashed)
    assert not verify_password("wrong-password", hashed)
    assert not verify_password("a-long-test-password", "not-a-hash")


def test_jwt_secret_is_required_in_every_environment(monkeypatch):
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
    monkeypatch.setenv("APP_ENV", "development")

    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY must be set"):
        _jwt_settings()


def test_client_register_login_and_profile(auth_api):
    client, _ = auth_api
    registered = client.post("/api/auth/register/client", json={
        "email": "client@example.com",
        "password": "a-long-client-password",
        "full_name": "Test Client",
        "phone": "07712345678",
    })
    assert registered.status_code == 201
    body = registered.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["role"] == "client"
    assert body["user"]["email"] == "client@example.com"

    invalid = client.post("/api/auth/login", json={
        "email": "client@example.com",
        "password": "wrong-password",
    })
    assert invalid.status_code == 401

    login = client.post("/api/auth/login", json={
        "email": "client@example.com",
        "password": "a-long-client-password",
    })
    assert login.status_code == 200
    token = login.json()["access_token"]
    profile = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert profile.status_code == 200
    assert profile.json()["full_name"] == "Test Client"


def test_client_can_update_own_profile_without_changing_account_role(auth_api):
    client, _ = auth_api
    registered = client.post("/api/auth/register/client", json={
        "email": "client-profile@example.com",
        "password": "a-long-client-password",
        "full_name": "Original Client",
        "phone": "07712345678",
    })
    token = registered.json()["access_token"]

    response = client.patch(
        "/api/auth/me/profile",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "email": " updated-client@example.com ",
            "full_name": " Updated Client ",
            "phone": "07787654321",
        },
    )

    assert response.status_code == 200
    assert response.json()["email"] == "updated-client@example.com"
    assert response.json()["full_name"] == "Updated Client"
    assert response.json()["phone"] == "07787654321"
    assert response.json()["role"] == "client"


def test_client_profile_rejects_duplicate_email_and_invalid_phone(auth_api):
    client, _ = auth_api
    first = client.post("/api/auth/register/client", json={
        "email": "first-profile@example.com",
        "password": "a-long-client-password",
        "full_name": "First Client",
        "phone": "07712345678",
    })
    second = client.post("/api/auth/register/client", json={
        "email": "second-profile@example.com",
        "password": "a-long-client-password",
        "full_name": "Second Client",
        "phone": "07787654321",
    })
    headers = {"Authorization": f"Bearer {first.json()['access_token']}"}

    duplicate = client.patch("/api/auth/me/profile", headers=headers, json={
        "email": "second-profile@example.com",
        "full_name": "First Client",
        "phone": "07712345678",
    })
    invalid_phone = client.patch("/api/auth/me/profile", headers=headers, json={
        "email": "first-profile@example.com",
        "full_name": "First Client",
        "phone": "123",
    })

    assert second.status_code == 201
    assert duplicate.status_code == 409
    assert invalid_phone.status_code == 422


@pytest.mark.parametrize("missing_field", ["full_name", "email", "password", "phone"])
def test_client_registration_requires_all_account_fields(auth_api, missing_field):
    client, session = auth_api
    payload = {
        "full_name": "Required Client",
        "email": "required-client@example.com",
        "password": "a-long-client-password",
        "phone": "07712345678",
    }
    payload.pop(missing_field)
    response = client.post("/api/auth/register/client", json=payload)

    assert response.status_code == 422
    assert session.exec(select(User).where(User.email == "required-client@example.com")).first() is None


def test_oauth2_password_token_flow(auth_api):
    client, _ = auth_api
    client.post("/api/auth/register/client", json={
        "email": "oauth@example.com",
        "password": "a-long-client-password",
        "full_name": "OAuth Client",
        "phone": "07712345678",
    })
    token_response = client.post(
        "/api/auth/token",
        data={"username": "oauth@example.com", "password": "a-long-client-password"},
    )
    assert token_response.status_code == 200
    assert token_response.json()["access_token"]


def test_company_registration_is_unverified(auth_api):
    client, session = auth_api
    response = client.post("/api/auth/register/company", json={
        "name": "JWT Solar",
        "email": "company@example.com",
        "password": "a-long-company-password",
        "phone": "07712345679",
    })
    assert response.status_code == 201
    user = response.json()["user"]
    assert user["role"] == "company"
    assert user["is_verified"] is False
    company = session.get(Company, user["company_id"])
    assert company is not None
    assert company.verification_status == "pending"


@pytest.mark.parametrize("missing_field", ["name", "email", "password", "phone"])
def test_company_registration_requires_all_account_fields(auth_api, missing_field):
    client, session = auth_api
    payload = {
        "name": "Mobile Required Solar",
        "email": "mobile-required@example.com",
        "password": "a-long-company-password",
        "phone": "07712345679",
    }
    payload.pop(missing_field)
    response = client.post("/api/auth/register/company", json=payload)

    assert response.status_code == 422
    assert session.exec(select(User).where(User.email == "mobile-required@example.com")).first() is None


def test_company_registration_accepts_blank_optional_profile_fields(auth_api):
    client, session = auth_api
    response = client.post("/api/auth/register/company", json={
        "name": "Optional Details Solar",
        "email": "optional-details@example.com",
        "password": "a-long-company-password",
        "phone": "07712345679",
        "founded_year": "",
        "support_phone": "",
        "address": "",
        "business_license_number": "",
        "tax_registration_number": "",
        "projects_count": "",
    })

    assert response.status_code == 201
    company_id = response.json()["user"]["company_id"]
    company = session.get(Company, company_id)
    assert company is not None
    assert company.founded_year == 0
    assert company.projects_count == 0
    assert company.address == ""
    assert company.support_phone is None
    verification = session.get(CompanyVerification, company_id)
    assert verification is not None
    assert verification.business_license_number == ""
    assert verification.tax_registration_number == ""


def test_company_jwt_opens_existing_company_portal(auth_api):
    client, _ = auth_api
    registered = client.post("/api/auth/register/company", json={
        "name": "JWT Portal Solar",
        "email": "portal@example.com",
        "password": "a-long-company-password",
        "phone": "07712345679",
    })
    assert registered.status_code == 201
    token = registered.json()["access_token"]

    profile = client.get("/api/company/profile", headers={"Authorization": f"Bearer {token}"})
    assert profile.status_code == 200
    assert profile.json()["name"] == "JWT Portal Solar"


def test_company_can_update_support_phone_without_changing_verification_or_making_it_public(auth_api):
    client, session = auth_api
    registered = client.post("/api/auth/register/company", json={
        "name": "Support Solar",
        "email": "support@example.com",
        "password": "a-long-company-password",
        "phone": "07712345679",
    })
    assert registered.status_code == 201
    token = registered.json()["access_token"]
    company_id = registered.json()["user"]["company_id"]

    company = session.get(Company, company_id)
    assert company is not None
    company.verification_status = "verified"
    session.add(company)
    session.commit()

    updated = client.put(
        "/api/company/profile/support-phone",
        headers={"Authorization": f"Bearer {token}"},
        json={"support_phone": "07812345678"},
    )
    assert updated.status_code == 200
    assert updated.json() == {"support_phone": "07812345678"}

    profile = client.get("/api/company/profile", headers={"Authorization": f"Bearer {token}"})
    assert profile.status_code == 200
    assert profile.json()["support_phone"] == "07812345678"
    assert profile.json()["verification_status"] == "verified"

    public_directory = client.get("/api/companies")
    public_company = next(item for item in public_directory.json() if item["id"] == company_id)
    # Even for a verified company, the public directory never shows its numbers.
    assert public_company["phone"] is None
    assert public_company["support_phone"] is None

    invalid = client.put(
        "/api/company/profile/support-phone",
        headers={"Authorization": f"Bearer {token}"},
        json={"support_phone": "12"},
    )
    assert invalid.status_code == 422
    short_code = client.put(
        "/api/company/profile/support-phone",
        headers={"Authorization": f"Bearer {token}"},
        json={"support_phone": "6060"},
    )
    assert short_code.status_code == 200
    assert short_code.json() == {"support_phone": "6060"}
    cleared = client.put(
        "/api/company/profile/support-phone",
        headers={"Authorization": f"Bearer {token}"},
        json={"support_phone": None},
    )
    assert cleared.status_code == 200
    assert cleared.json() == {"support_phone": None}


def test_company_can_update_all_profile_fields_and_list_uploaded_document_metadata(auth_api):
    client, session = auth_api
    registered = client.post("/api/auth/register/company", json={
        "name": "Profile Solar",
        "email": "profile@example.com",
        "password": "a-long-company-password",
        "phone": "07712345679",
    })
    assert registered.status_code == 201
    token = registered.json()["access_token"]
    company_id = registered.json()["user"]["company_id"]
    session.add(VerificationDocument(
        company_id=company_id,
        document_type="national_id",
        file_name="national-id.png",
        content_type="image/png",
        data_base64="aW1hZ2U=",
    ))
    session.commit()

    updated = client.put(
        "/api/company/profile",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Updated Profile Solar",
            "founded_year": 2018,
            "address": "Erbil",
            "phone": "07776543210",
            "support_phone": "6060",
            "business_license_number": "LIC-UPDATED",
            "tax_registration_number": "TAX-UPDATED",
        },
    )
    assert updated.status_code == 200
    assert updated.json() == {
        "phone": "07776543210",
        "support_phone": "6060",
    }

    profile = client.get("/api/company/profile", headers={"Authorization": f"Bearer {token}"})
    assert profile.status_code == 200
    assert profile.json()["name"] == "Updated Profile Solar"
    assert profile.json()["founded_year"] == 2018
    assert profile.json()["address"] == "Erbil"
    assert profile.json()["phone"] == "07776543210"
    assert profile.json()["support_phone"] == "6060"
    assert profile.json()["verification"]["business_license_number"] == "LIC-UPDATED"
    assert profile.json()["verification"]["tax_registration_number"] == "TAX-UPDATED"
    assert profile.json()["documents"] == [{
        "document_type": "national_id",
        "file_name": "national-id.png",
        "content_type": "image/png",
        "uploaded_at": profile.json()["documents"][0]["uploaded_at"],
    }]


def test_company_can_resubmit_verification_for_a_fresh_admin_review(auth_api):
    client, session = auth_api
    registered = client.post("/api/auth/register/company", json={
        "name": "Resubmission Solar",
        "email": "resubmit@example.com",
        "password": "a-long-company-password",
        "phone": "07712345679",
    })
    assert registered.status_code == 201
    token = registered.json()["access_token"]
    company_id = registered.json()["user"]["company_id"]
    company = session.get(Company, company_id)
    assert company is not None
    company.verification_status = "verified"
    user = session.exec(select(User).where(User.company_id == company_id)).first()
    assert user is not None
    user.is_verified = True
    session.add(company)
    session.add(user)
    verification = session.get(CompanyVerification, company_id)
    assert verification is not None
    verification.business_license_number = "LIC-OLD"
    verification.tax_registration_number = "TAX-OLD"
    verification.license_checked = True
    verification.tax_record_checked = True
    verification.projects_checked = True
    verification.reviewed_at = datetime.now(timezone.utc)
    session.add(verification)
    session.add(VerificationDocument(
        company_id=company_id,
        document_type="national_id",
        file_name="national-id.png",
        content_type="image/png",
        data_base64="aW1hZ2U=",
    ))
    session.commit()

    resubmitted = client.post(
        "/api/company/verification-application/resubmit",
        headers={"Authorization": f"Bearer {token}"},
        json={"projects_count": 6},
    )
    assert resubmitted.status_code == 200
    assert resubmitted.json() == {"verification_status": "pending"}
    assert company.verification_status == "pending"
    assert company.projects_count == 6
    assert user.is_verified is False
    verification = session.get(CompanyVerification, company_id)
    assert verification is not None
    assert verification.license_checked is False
    assert verification.tax_record_checked is False
    assert verification.projects_checked is False
    assert verification.reviewed_at is None


def test_company_can_correct_unsigned_project_dimensions_but_not_signed_contract_details(auth_api):
    client, session = auth_api
    registered = client.post("/api/auth/register/company", json={
        "name": "Project Detail Solar",
        "email": "project-details@example.com",
        "password": "a-long-company-password",
        "phone": "07712345679",
    })
    assert registered.status_code == 201
    token = registered.json()["access_token"]
    company_id = registered.json()["user"]["company_id"]
    company = session.get(Company, company_id)
    assert company is not None
    company.verification_status = "verified"
    request = QuoteRequest(
        group_id="UTU-TECHNICAL-DETAILS",
        customer_name="Test Customer",
        customer_phone="07712345678",
        system_kwp=8,
        battery_kwh=10,
        panel_count=12,
        details_json=json.dumps({"governorate": "Baghdad", "district": "Karrada", "roofArea": "100 sqm"}),
        access_token_hash="technical-details-hash",
    )
    session.add(company)
    session.add(request)
    session.commit()
    session.refresh(request)
    assignment = QuoteRequestCompany(request_id=request.id, company_id=company_id, status="selected")
    session.add(assignment)
    session.commit()
    session.refresh(assignment)

    updated = client.put(
        f"/api/company/requests/{request.group_id}/technical-details",
        headers={"Authorization": f"Bearer {token}"},
        json={"roof_area": "140 sqm", "site_dimensions": "14m x 10m"},
    )
    assert updated.status_code == 200
    assert updated.json()["details"]["roofArea"] == "140 sqm"
    assert updated.json()["details"]["siteDimensions"] == "14m x 10m"

    session.add(ProjectLifecycleRecord(
        request_company_id=assignment.id,
        contract_json=json.dumps({"signatures": {"customer_signed": True, "company_signed": False}}),
        status="awaiting_signatures",
    ))
    session.commit()
    rejected = client.put(
        f"/api/company/requests/{request.group_id}/technical-details",
        headers={"Authorization": f"Bearer {token}"},
        json={"roof_area": "150 sqm"},
    )
    assert rejected.status_code == 409
    session.refresh(request)
    assert json.loads(request.details_json)["roofArea"] == "140 sqm"


@pytest.mark.parametrize("support_phone", ["07712345678", "6060", "6633", "0123456789"])
def test_company_registration_and_profile_settings_save_both_phone_numbers(auth_api, support_phone):
    client, session = auth_api
    registered = client.post("/api/auth/register/company", json={
        "name": "Contact Solar",
        "email": "contact@example.com",
        "password": "a-long-company-password",
        "phone": "07712345679",
        "support_phone": support_phone,
    })
    assert registered.status_code == 201
    token = registered.json()["access_token"]
    company_id = registered.json()["user"]["company_id"]

    company = session.get(Company, company_id)
    assert company is not None
    assert company.phone == "07712345679"
    assert company.support_phone == support_phone

    updated = client.put(
        "/api/company/profile",
        headers={"Authorization": f"Bearer {token}"},
        json={"phone": "07799999999", "support_phone": support_phone},
    )
    assert updated.status_code == 200
    assert updated.json() == {"phone": "07799999999", "support_phone": support_phone}

    partial_update = client.put(
        "/api/company/profile",
        headers={"Authorization": f"Bearer {token}"},
        json={"phone": "07788888888"},
    )
    assert partial_update.status_code == 200
    assert partial_update.json() == {"phone": "07788888888", "support_phone": support_phone}

    profile = client.get("/api/company/profile", headers={"Authorization": f"Bearer {token}"})
    assert profile.status_code == 200
    assert profile.json()["phone"] == "07788888888"
    assert profile.json()["support_phone"] == support_phone


@pytest.mark.parametrize("support_phone", ["07712345678", "6060", "6633", "0123456789"])
def test_company_registration_accepts_support_phone_formats(auth_api, support_phone):
    client, _ = auth_api
    registered = client.post("/api/auth/register/company", json={
        "name": "Contact Solar",
        "email": f"contact-{support_phone}@example.com",
        "password": "a-long-company-password",
        "phone": "07712345679",
        "support_phone": support_phone,
    })
    assert registered.status_code == 201


def test_company_from_the_old_login_system_migrates_on_first_sign_in(auth_api):
    client, session = auth_api
    company = Company(
        name="Old Login Solar",
        founded_year=2018,
        projects_count=0,
        phone="",
        email="old-login@example.com",
        verification_status="pending",
    )
    session.add(company)
    session.commit()
    session.refresh(company)
    # Accounts made by the removed /api/companies/register only had a credential.
    session.add(CompanyCredential(
        company_id=company.id,
        email="old-login@example.com",
        password_hash=hash_legacy_company_password("old-company-password"),
    ))
    session.commit()

    wrong = client.post("/api/auth/login", json={"email": "old-login@example.com", "password": "not-the-password"})
    assert wrong.status_code == 401
    migrated = client.post("/api/auth/login", json={"email": "old-login@example.com", "password": "old-company-password"})
    assert migrated.status_code == 200
    assert migrated.json()["user"]["role"] == "company"
    assert migrated.json()["user"]["company_id"] == company.id
    user = session.exec(select(User).where(User.email == "old-login@example.com")).one()
    assert verify_password("old-company-password", user.hashed_password)


def test_company_password_reset_revokes_existing_jwt(auth_api):
    _, session = auth_api
    company = Company(
        name="Reset Solar",
        founded_year=2020,
        projects_count=0,
        phone="",
        email="reset@example.com",
        verification_status="pending",
    )
    session.add(company)
    session.commit()
    session.refresh(company)
    user = User(
        email="reset@example.com",
        hashed_password=hash_password("old-company-password"),
        full_name="Reset Solar",
        role="company",
        company_id=company.id,
    )
    session.add(user)
    reset_token = "r" * 40
    session.add(CompanyPasswordResetToken(
        company_id=company.id,
        token_hash=hashlib.sha256(reset_token.encode()).hexdigest(),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
    ))
    session.commit()
    session.refresh(user)
    previous_jwt = create_access_token(user)

    confirm_password_reset(
        PasswordResetConfirm(token=reset_token, new_password="new-company-password"),
        session,
    )

    assert verify_password("new-company-password", user.hashed_password)
    with pytest.raises(HTTPException) as error:
        user_from_token(previous_jwt, session)
    assert error.value.status_code == 401


def test_jwt_required_and_role_guard(auth_api):
    client, session = auth_api
    client.post("/api/auth/register/client", json={
        "email": "client@example.com",
        "password": "a-long-client-password",
        "full_name": "Test Client",
        "phone": "07712345678",
    })
    login = client.post("/api/auth/login", json={
        "email": "client@example.com",
        "password": "a-long-client-password",
    })
    token = login.json()["access_token"]

    missing = client.get("/api/auth/me")
    assert missing.status_code == 401

    invalid = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-token"})
    assert invalid.status_code == 401

    forbidden = client.get("/api/auth/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert forbidden.status_code == 403

    admin = User(
        email="admin@example.com",
        hashed_password=hash_password("a-long-admin-password"),
        full_name="Admin",
        role="admin",
        is_active=True,
        is_verified=True,
    )
    session.add(admin)
    session.commit()
    session.refresh(admin)
    admin_token = create_access_token(admin)
    allowed = client.get("/api/auth/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert allowed.status_code == 200
    emails = {row["email"] for row in allowed.json()}
    assert "client@example.com" in emails
    assert "admin@example.com" in emails


def test_client_jwt_is_forbidden_from_company_admin_routes(auth_api):
    client, _ = auth_api
    registered = client.post("/api/auth/register/client", json={
        "email": "regular-client@example.com",
        "password": "a-long-client-password",
        "full_name": "Regular Client",
        "phone": "07712345678",
    })
    token = registered.json()["access_token"]

    response = client.get(
        "/api/companies/admin/pending",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403


def test_admin_jwt_can_load_pending_company_applications(auth_api):
    client, session = auth_api
    admin = User(
        email="admin@example.com",
        hashed_password=hash_password("a-long-admin-password"),
        full_name="Platform Admin",
        role="admin",
        is_active=True,
        is_verified=True,
    )
    session.add(admin)
    session.commit()
    session.refresh(admin)
    admin_token = create_access_token(admin)

    response = client.get(
        "/api/companies/admin/pending",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    assert response.json() == []


def test_admin_can_update_client_status_and_reactivation_revokes_old_tokens(auth_api):
    client, session = auth_api
    registered = client.post("/api/auth/register/client", json={
        "email": "status-client@example.com",
        "password": "a-long-client-password",
        "full_name": "Status Client",
        "phone": "07712345678",
    })
    assert registered.status_code == 201
    client_user = session.exec(
        select(User).where(User.email == "status-client@example.com")
    ).one()
    admin = User(
        email="status-admin@example.com",
        hashed_password=hash_password("a-long-admin-password"),
        full_name="Status Admin",
        role="admin",
    )
    session.add(admin)
    session.commit()
    admin_token = create_access_token(admin)
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    client_headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}

    status_url = f"/api/auth/admin/users/{client_user.id}/status"
    assert client.patch(status_url, json={"is_active": False}).status_code == 401
    assert client.patch(
        status_url,
        headers=client_headers,
        json={"is_active": False},
    ).status_code == 403
    disabled = client.patch(
        status_url,
        headers=admin_headers,
        json={"is_active": False},
    )
    assert disabled.status_code == 200
    assert disabled.json()["is_active"] is False
    assert client.get("/api/auth/me", headers=client_headers).status_code == 403
    assert client.post("/api/auth/login", json={
        "email": "status-client@example.com",
        "password": "a-long-client-password",
    }).status_code == 403

    enabled = client.patch(
        status_url,
        headers=admin_headers,
        json={"is_active": True},
    )
    assert enabled.status_code == 200
    assert client.get("/api/auth/me", headers=client_headers).status_code == 401
    new_login = client.post("/api/auth/login", json={
        "email": "status-client@example.com",
        "password": "a-long-client-password",
    })
    assert new_login.status_code == 200
    assert client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {new_login.json()['access_token']}"},
    ).status_code == 200


def test_admin_can_block_company_without_exposing_its_public_data_or_changing_admin_access(auth_api):
    client, session = auth_api
    company_response = client.post("/api/auth/register/company", json={
        "name": "Blockable Solar",
        "email": "blockable@example.com",
        "password": "a-long-company-password",
        "phone": "07798765432",
    })
    assert company_response.status_code == 201
    company_id = company_response.json()["user"]["company_id"]
    company = session.get(Company, company_id)
    company.verification_status = "verified"
    company.projects_count = 1
    linked_user = session.exec(select(User).where(User.company_id == company_id)).one()
    linked_user.is_verified = True
    project = Project(
        title="Public portfolio project",
        company_id=company_id,
        location_governorate="Baghdad",
        location_district="Karrada",
        system_kwp=5,
        installation_type="Hybrid",
        image_url="/projects/blockable.jpg",
        status="completed",
    )
    session.add_all([
        company,
        linked_user,
        project,
        VerificationDocument(
            company_id=company_id,
            document_type="license",
            file_name="business-license.pdf",
            content_type="application/pdf",
            data_base64="c2VjcmV0LWRvY3VtZW50",
        ),
    ])
    session.commit()
    session.refresh(project)
    company_token = company_response.json()["access_token"]

    admin = User(
        email="block-admin@example.com",
        hashed_password=hash_password("a-long-admin-password"),
        full_name="Block Admin",
        role="admin",
    )
    session.add(admin)
    session.commit()
    admin_headers = {"Authorization": f"Bearer {create_access_token(admin)}"}
    company_headers = {"Authorization": f"Bearer {company_token}"}

    records = client.get("/api/companies/admin", headers=admin_headers)
    assert records.status_code == 200
    record = next(item for item in records.json() if item["id"] == company_id)
    assert record["verification_status"] == "verified"
    assert record["verification_documents"] == ["license"]
    assert len(record["documents"]) == 1
    assert record["documents"][0]["document_type"] == "license"
    assert record["documents"][0]["file_name"] == "business-license.pdf"
    assert record["documents"][0]["content_type"] == "application/pdf"
    assert "data_base64" not in record["documents"][0]

    blocked = client.patch(
        f"/api/companies/admin/{company_id}/block",
        headers=admin_headers,
        json={"is_blocked": True},
    )
    assert blocked.status_code == 200
    assert blocked.json()["is_blocked"] is True
    assert blocked.json()["verification_status"] == "verified"
    assert session.get(User, linked_user.id).is_verified is True
    assert company_id not in [item["id"] for item in client.get("/api/companies").json()]
    assert client.get(f"/api/companies/{company_id}").status_code == 404
    assert client.get(f"/api/companies/{company_id}/projects").status_code == 404
    assert company_id not in [
        item["company_id"] for item in client.get("/api/projects").json()
    ]
    assert client.get(f"/api/projects/{project.id}").status_code == 404
    assert client.get("/api/company/profile", headers=company_headers).status_code == 403
    assert client.post("/api/auth/login", json={
        "email": "blockable@example.com",
        "password": "a-long-company-password",
    }).status_code == 403

    still_listed = client.get("/api/companies/admin", headers=admin_headers)
    assert still_listed.status_code == 200
    assert next(item for item in still_listed.json() if item["id"] == company_id)["is_blocked"] is True
    assert client.get("/api/auth/admin/users", headers=admin_headers).status_code == 200

    unblocked = client.patch(
        f"/api/companies/admin/{company_id}/block",
        headers=admin_headers,
        json={"is_blocked": False},
    )
    assert unblocked.status_code == 200
    assert unblocked.json()["is_blocked"] is False
    assert session.get(User, linked_user.id).is_verified is True
    assert client.get("/api/company/profile", headers=company_headers).status_code == 401
    assert client.post("/api/auth/login", json={
        "email": "blockable@example.com",
        "password": "a-long-company-password",
    }).status_code == 200


def test_inactive_user_cannot_use_token(auth_api):
    client, session = auth_api
    user = User(
        email="inactive@example.com",
        hashed_password=hash_password("a-long-test-password"),
        full_name="Inactive",
        role="client",
        is_active=False,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    login = client.post("/api/auth/login", json={
        "email": "inactive@example.com",
        "password": "a-long-test-password",
    })
    assert login.status_code == 403

    token = create_access_token(user)
    profile = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert profile.status_code == 403


def test_public_marketplace_endpoints_remain_open(auth_api):
    client, _ = auth_api
    assert client.get("/api/companies").status_code == 200
    assert client.get("/api/projects").status_code == 200
    assert client.get("/api/reviews/featured").status_code == 200


def test_seed_creates_demo_auth_accounts(monkeypatch, auth_env):
    import seed as seed_module

    monkeypatch.setenv("UTU_DEMO_PASSWORD", "initial-demo-password")
    monkeypatch.setattr(seed_module, "DEMO_PASSWORD", "initial-demo-password")
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    def create_test_tables():
        SQLModel.metadata.create_all(engine)

    monkeypatch.setattr(seed_module, "engine", engine)
    monkeypatch.setattr(seed_module, "create_db_and_tables", create_test_tables)
    create_test_tables()
    admin = User(
        email="admin@solar.iq",
        hashed_password=hash_password("existing-admin-password"),
        full_name="Existing Administrator",
        role="admin",
        is_active=True,
        is_verified=True,
        token_version=7,
    )
    with Session(engine) as session:
        session.add(admin)
        session.commit()
        session.refresh(admin)
        original_admin = admin.model_dump()
    seed_module.seed_companies()
    monkeypatch.setenv("UTU_DEMO_PASSWORD", "updated-demo-password")
    monkeypatch.setattr(seed_module, "DEMO_PASSWORD", "updated-demo-password")
    seed_module.seed_companies()

    with Session(engine) as session:
        emails = {user.email for user in session.exec(select(User)).all()}
        assert "admin@solar.iq" in emails
        assert all(f"company{index:02}@solar-demo.test" in emails for index in range(1, 11))
        assert all(f"customer{index:02}@solar-demo.test" in emails for index in range(1, 11))
        linked = session.exec(select(User).where(User.role == "company", User.demo_key.is_not(None))).all()
        assert len(linked) == 10
        assert all(user.company_id is not None and not user.is_verified for user in linked)
        admin = session.exec(select(User).where(User.email == "admin@solar.iq")).first()
        assert admin is not None
        assert admin.model_dump() == original_admin
        assert verify_password("existing-admin-password", admin.hashed_password)
        assert _authenticate("admin@solar.iq", "existing-admin-password", session).role == "admin"
    engine.dispose()


def _seed_test_engine(monkeypatch, seed_module):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    def create_test_tables():
        SQLModel.metadata.create_all(engine)

    monkeypatch.setattr(seed_module, "engine", engine)
    monkeypatch.setattr(seed_module, "create_db_and_tables", create_test_tables)
    return engine


def test_seed_refuses_to_run_without_a_demo_password(monkeypatch, auth_env):
    import seed as seed_module

    monkeypatch.setattr(seed_module, "DEMO_PASSWORD", None)
    engine = _seed_test_engine(monkeypatch, seed_module)
    with pytest.raises(RuntimeError, match="UTU_DEMO_PASSWORD"):
        seed_module.seed_companies()
    monkeypatch.setattr(seed_module, "DEMO_PASSWORD", "short")
    with pytest.raises(RuntimeError, match="UTU_DEMO_PASSWORD"):
        seed_module.seed_companies()
    engine.dispose()


def test_seed_never_creates_logins_for_real_companies(monkeypatch, auth_env):
    import seed as seed_module

    monkeypatch.setattr(seed_module, "DEMO_PASSWORD", "demo-password-for-tests")
    engine = _seed_test_engine(monkeypatch, seed_module)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        session.add(Company(
            name="Real Customer Company",
            founded_year=2020,
            phone="07700000099",
            email="owner@real-company.example",
            verification_status="verified",
        ))
        session.commit()

    seed_module.seed_companies()

    with Session(engine) as session:
        real_company = session.exec(
            select(Company).where(Company.name == "Real Customer Company")
        ).one()
        linked_users = session.exec(
            select(User).where(User.company_id == real_company.id)
        ).all()
        assert linked_users == []
        assert session.exec(
            select(User).where(User.email == "owner@real-company.example")
        ).first() is None
    engine.dispose()
