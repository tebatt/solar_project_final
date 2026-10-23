import os
import unittest
import base64
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from companies import (
    CompanyPublic,
    CompanyRegistration,
    CompanyVerificationReview,
    PolicyReportCreate,
    PolicyReportStatusUpdate,
    VerificationDocumentUpload,
    admin_policy_reports,
    admin_revenue,
    create_policy_report,
    get_verification_document,
    list_pending_companies,
    get_companies,
    get_company,
    get_company_projects,
    PasswordResetConfirm,
    PasswordResetRequest,
    confirm_password_reset,
    request_password_reset,
    review_company,
    refund_deposit,
    update_policy_report_status,
    upload_verification_document,
)
from auth import LoginRequest, login as auth_login, register_company_user, router as auth_router
from company_portal import (
    VerificationApplicationUpdate,
    company_requests,
    mark_request_viewed,
    router as company_portal_router,
    update_verification_application,
)
from database import (
    get_session,
    migrate_company_support_phone_column,
    migrate_company_verification,
    migrate_company_verification_review_columns,
    migrate_green_initiative_columns,
)
from models import (
    ChatMessage,
    Company,
    CompanyBranch,
    CompanyPasswordResetToken,
    CompanyProject,
    CompanyQuote,
    CompanyVerification,
    DepositPayment,
    PolicyReport,
    Project,
    ProjectLifecycleRecord,
    QuoteRequest,
    QuoteRequestCompany,
    User,
    VerificationDocument,
)
from quote_requests import (
    ChatMessageCreate,
    CompletedInstallation,
    DepositPaymentCreate,
    confirm_deposit_payment,
    QuoteCreate,
    QuoteRequestCreate,
    QuoteRequestUpdate,
    create_quote_request,
    complete_company_installation,
    choose_company_quote,
    create_chat_message,
    list_chat_messages,
    list_quote_requests,
    submit_company_quote,
    update_quote_request,
    _authenticated_company_id,
    _token_hash,
    router as quote_requests_router,
)
from companies import router as companies_router
from projects import router as projects_router
from project_lifecycle import (
    authorize_project_work,
    router as project_lifecycle_router,
    sign_contract_as_company,
    sign_contract_as_customer,
)
from security import create_access_token


class MarketplaceTests(unittest.TestCase):
    def setUp(self):
        jwt_env = patch.dict(
            os.environ,
            {"JWT_SECRET_KEY": "unit-test-jwt-secret-key-which-is-long-enough"},
        )
        jwt_env.start()
        self.addCleanup(jwt_env.stop)
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)
        self.session = Session(self.engine)

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def test_green_schema_migration_preserves_existing_rows_and_defaults_new_flags(self):
        legacy_engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        with legacy_engine.begin() as connection:
            connection.exec_driver_sql(
                "CREATE TABLE quoterequest (id INTEGER PRIMARY KEY, group_id VARCHAR NOT NULL)"
            )
            connection.exec_driver_sql(
                "CREATE TABLE companyquote (id INTEGER PRIMARY KEY, total_iqd INTEGER NOT NULL)"
            )
            connection.exec_driver_sql(
                "CREATE TABLE quoterequestcompany (id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL)"
            )
            connection.exec_driver_sql(
                "INSERT INTO quoterequest (id, group_id) VALUES (1, 'legacy-request')"
            )
            connection.exec_driver_sql("INSERT INTO companyquote (id, total_iqd) VALUES (1, 1000)")
            connection.exec_driver_sql(
                "INSERT INTO quoterequestcompany (id, request_id) VALUES (1, 1)"
            )

        with patch("database.engine", legacy_engine):
            migrate_green_initiative_columns()

        with legacy_engine.connect() as connection:
            request = connection.exec_driver_sql(
                "SELECT group_id, is_green_initiative, green_initiative_budget_iqd "
                "FROM quoterequest WHERE id=1"
            ).one()
            quote = connection.exec_driver_sql(
                "SELECT total_iqd, green_initiative_supported FROM companyquote WHERE id=1"
            ).one()
            assignment = connection.exec_driver_sql(
                "SELECT request_id, green_verification_id FROM quoterequestcompany WHERE id=1"
            ).one()
        self.assertEqual(request, ("legacy-request", 0, None))
        self.assertEqual(quote, (1000, 0))
        self.assertEqual(assignment, (1, None))
        legacy_engine.dispose()

    def test_support_phone_migration_preserves_existing_company_rows(self):
        legacy_engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        with legacy_engine.begin() as connection:
            connection.exec_driver_sql(
                "CREATE TABLE company (id INTEGER PRIMARY KEY, name VARCHAR NOT NULL)"
            )
            connection.exec_driver_sql(
                "INSERT INTO company (id, name) VALUES (1, 'Existing Solar')"
            )

        with patch("database.engine", legacy_engine):
            migrate_company_support_phone_column()

        with legacy_engine.connect() as connection:
            company = connection.exec_driver_sql(
                "SELECT id, name, support_phone FROM company WHERE id=1"
            ).one()
        self.assertEqual(company, (1, "Existing Solar", None))
        legacy_engine.dispose()

    def test_company_verification_review_migration_adds_manual_attestation_flags(self):
        legacy_engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        with legacy_engine.begin() as connection:
            connection.exec_driver_sql(
                """
                CREATE TABLE companyverification (
                    company_id INTEGER PRIMARY KEY,
                    business_license_number VARCHAR NOT NULL DEFAULT '',
                    tax_registration_number VARCHAR NOT NULL DEFAULT '',
                    license_checked BOOLEAN NOT NULL DEFAULT 0,
                    tax_record_checked BOOLEAN NOT NULL DEFAULT 0,
                    projects_checked BOOLEAN NOT NULL DEFAULT 0,
                    reviewed_at DATETIME
                )
                """
            )
            connection.exec_driver_sql(
                "INSERT INTO companyverification (company_id, license_checked) VALUES (1, 1)"
            )

        with patch("database.engine", legacy_engine):
            migrate_company_verification_review_columns()

        with legacy_engine.connect() as connection:
            columns = {
                row[1]
                for row in connection.exec_driver_sql(
                    "PRAGMA table_info(companyverification)"
                )
            }
            attestations = connection.exec_driver_sql(
                """
                SELECT identity_document_checked, business_document_checked,
                       project_evidence_checked, license_checked
                FROM companyverification WHERE company_id = 1
                """
            ).one()
        self.assertTrue({
            "identity_document_checked",
            "business_document_checked",
            "project_evidence_checked",
        }.issubset(columns))
        self.assertEqual(attestations, (0, 0, 0, 1))
        legacy_engine.dispose()

    def register_company_account(self, registration):
        """Register a company the way the app does (company user + JWT)."""
        response = register_company_user(registration, self.session)
        return {
            "id": response.user.company_id,
            "name": registration.name,
            "verification_status": self.session.get(Company, response.user.company_id).verification_status,
            "access_token": response.access_token,
        }

    def register(self, email="solar@example.com", projects_count=3, phone="07700000000"):
        return self.register_company_account(
            CompanyRegistration(
                name="Test Solar",
                founded_year=2015,
                phone=phone,
                email=email,
                password="a-long-test-password",
                address="Baghdad",
                business_license_number="LIC-12345",
                tax_registration_number="TAX-12345",
                projects_count=projects_count,
            )
        )

    def admin_user(self):
        """A signed-in administrator (the shared admin token no longer exists)."""
        admin = self.session.exec(select(User).where(User.email == "admin-test@example.com")).first()
        if admin is None:
            admin = User(
                email="admin-test@example.com",
                hashed_password="not-used",
                full_name="Test Admin",
                role="admin",
                is_active=True,
                is_verified=True,
            )
            self.session.add(admin)
            self.session.commit()
            self.session.refresh(admin)
        return admin

    def admin_bearer(self):
        return create_access_token(self.admin_user())

    def company_token(self, company_id):
        """JWT of the company user linked to a company."""
        user = self.session.exec(select(User).where(User.company_id == company_id)).one()
        return create_access_token(user)

    def test_company_branches_are_saved_and_returned_in_public_company_data(self):
        company = self.register()
        self.approve(company["id"])
        token = self.company_token(company["id"])
        app = FastAPI()
        app.include_router(company_portal_router)
        app.include_router(companies_router)

        def override_session():
            yield self.session

        app.dependency_overrides[get_session] = override_session
        branches = [
            {"governorate": "Basra", "address": "Al-Ashar"},
            {"governorate": "Erbil", "address": "Ankawa"},
        ]
        with TestClient(app) as client:
            saved = client.put(
                "/api/company/profile/branches",
                headers={"Authorization": f"Bearer {token}"},
                json={"branches": branches},
            )
            profile = client.get(
                "/api/company/profile",
                headers={"Authorization": f"Bearer {token}"},
            )
            directory = client.get("/api/companies")
            public_profile = client.get(f"/api/companies/{company['id']}")

        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.json(), branches)
        self.assertEqual(profile.json()["branches"], branches)
        self.assertEqual(
            next(row for row in directory.json() if row["id"] == company["id"])["branches"],
            branches,
        )
        self.assertEqual(public_profile.json()["branches"], branches)
        stored = self.session.exec(
            select(CompanyBranch).where(CompanyBranch.company_id == company["id"])
        ).all()
        self.assertEqual(len(stored), 2)

    def login_company_user(self, email, password):
        """Companies sign in through /api/auth/login like every other account."""
        response = auth_login(LoginRequest(email=email, password=password), self.session)
        return {"access_token": response.access_token}

    def approve(self, company_id):
        review_company(
            company_id,
            CompanyVerificationReview(
                decision="verified",
                license_checked=True,
                tax_record_checked=True,
                projects_checked=True,
            ),
            self.session,
            self.admin_user(),
        )

    def company_auth(self, email="solar@example.com"):
        login = self.login_company_user(email=email, password="a-long-test-password")
        return f"Bearer {login['access_token']}"

    def simple_quote(self, total_iqd=10_000_000):
        return QuoteCreate(
            total_iqd=total_iqd,
            capacity_kwp=8.4,
            panel_brand="Panel",
            inverter_brand="Inverter",
            battery_brand="Battery",
            warranty="5 years",
            install_days=5,
        )

    def request_for(self, company_id):
        return create_quote_request(
            QuoteRequestCreate(
                company_ids=[company_id],
                customer_name="Test Customer",
                customer_phone="07711111111",
                system_kwp=8.4,
                battery_kwh=10.2,
                panel_count=12,
                details={"governorate": "baghdad"},
            ),
            self.session,
        )

    def test_authenticated_request_phone_uses_account_phone_and_rejects_edits(self):
        company = self.register()
        client = User(
            email="request-owner@example.com",
            phone="07712345678",
            hashed_password="not-used",
            full_name="Request Owner",
            role="client",
            is_active=True,
        )
        self.session.add(client)
        self.session.commit()
        self.session.refresh(client)

        request = create_quote_request(
            QuoteRequestCreate(
                company_ids=[company["id"]],
                customer_name="Request Owner",
                customer_phone="07799999999",
                system_kwp=8.4,
                battery_kwh=10,
                panel_count=12,
            ),
            self.session,
            client,
        )
        self.assertEqual(request["customer_phone"], client.phone)

        with self.assertRaises(HTTPException) as error:
            update_quote_request(
                request["group_id"],
                QuoteRequestUpdate(customer_phone="07799999999"),
                session=self.session,
                current_user=client,
            )
        self.assertEqual(error.exception.status_code, 422)
        self.assertEqual(
            self.session.exec(
                select(QuoteRequest).where(QuoteRequest.group_id == request["group_id"])
            ).one().customer_phone,
            client.phone,
        )

    def test_authenticated_request_requires_account_phone(self):
        company = self.register()
        client = User(
            email="no-phone@example.com",
            phone=None,
            hashed_password="not-used",
            full_name="No Phone",
            role="client",
            is_active=True,
        )
        self.session.add(client)
        self.session.commit()

        with self.assertRaises(HTTPException) as error:
            create_quote_request(
                QuoteRequestCreate(
                    company_ids=[company["id"]],
                    customer_name="No Phone",
                    customer_phone="07799999999",
                    system_kwp=8.4,
                    battery_kwh=10,
                    panel_count=12,
                ),
                self.session,
                client,
            )
        self.assertEqual(error.exception.status_code, 422)
        self.assertEqual(
            self.session.exec(
                select(QuoteRequest).where(QuoteRequest.user_id == client.id)
            ).all(),
            [],
        )

    def test_company_registration_starts_pending_and_admin_can_verify(self):
        result = self.register()
        self.assertEqual(result["verification_status"], "pending")
        self.assertNotIn(result["id"], {item.id for item in get_companies(self.session)})
        self.approve(result["id"])
        self.assertEqual(self.session.get(Company, result["id"]).verification_status, "verified")
        self.assertIn(result["id"], {item.id for item in get_companies(self.session)})

    def test_identity_verified_company_can_submit_quotes_but_pending_company_cannot(self):
        company = self.register()
        request = self.request_for(company["id"])
        company_token = self.company_token(company["id"])
        payload = QuoteCreate(
            total_iqd=10_000_000,
            panel_iqd=4_000_000,
            inverter_iqd=2_000_000,
            battery_iqd=2_000_000,
            installation_iqd=2_000_000,
            capacity_kwp=8.4,
            panel_brand="Panel Co",
            inverter_brand="Inverter Co",
            battery_brand="Battery Co",
            warranty="10 years",
            install_days=5,
        )
        authorization = f"Bearer {company_token}"

        with self.assertRaises(HTTPException) as error:
            submit_company_quote(
                request["group_id"],
                company["id"],
                payload,
                authorization,
                self.session,
            )
        self.assertEqual(error.exception.status_code, 403)

        self.session.add(VerificationDocument(
            company_id=company["id"],
            document_type="national_id",
            file_name="national-id.pdf",
            content_type="application/pdf",
            data_base64=base64.b64encode(b"%PDF-1.4 test").decode("ascii"),
        ))
        self.session.commit()
        review_company(
            company["id"],
            CompanyVerificationReview(
                decision="identity_verified",
                identity_document_checked=True,
            ),
            self.session,
            self.admin_user(),
        )

        submitted = submit_company_quote(
            request["group_id"],
            company["id"],
            payload,
            authorization,
            self.session,
        )
        self.assertEqual(submitted["total_iqd"], 10_000_000)
        self.assertEqual(self.session.get(Company, company["id"]).verification_status, "identity_verified")

    def test_jwt_client_registration_login_profile_and_role_guard(self):
        app = FastAPI()
        app.include_router(auth_router)

        def override_session():
            yield self.session

        app.dependency_overrides[get_session] = override_session
        with patch.dict(os.environ, {"JWT_SECRET_KEY": "unit-test-jwt-secret-key-which-is-long-enough"}):
            with TestClient(app) as client:
                registered = client.post("/api/auth/register/client", json={
                    "email": "client@example.com",
                    "password": "a-long-client-password",
                    "full_name": "Test Client",
                    "phone": "07712345678",
                })
                self.assertEqual(registered.status_code, 201)
                self.assertEqual(registered.json()["user"]["role"], "client")

                invalid_login = client.post("/api/auth/login", json={
                    "email": "client@example.com",
                    "password": "wrong-password",
                })
                self.assertEqual(invalid_login.status_code, 401)

                login = client.post("/api/auth/login", json={
                    "email": "client@example.com",
                    "password": "a-long-client-password",
                })
                self.assertEqual(login.status_code, 200)
                token = login.json()["access_token"]
                profile = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
                self.assertEqual(profile.status_code, 200)
                self.assertEqual(profile.json()["email"], "client@example.com")
                forbidden = client.get("/api/auth/admin/users", headers={"Authorization": f"Bearer {token}"})
                self.assertEqual(forbidden.status_code, 403)

    def test_authenticated_client_rfq_ownership_verified_company_quote_and_acceptance(self):
        app = FastAPI()
        app.include_router(auth_router)
        app.include_router(quote_requests_router)
        app.include_router(company_portal_router)

        def override_session():
            yield self.session

        app.dependency_overrides[get_session] = override_session
        with patch.dict(os.environ, {"JWT_SECRET_KEY": "unit-test-jwt-secret-key-which-is-long-enough"}):
            with TestClient(app) as client:
                company_response = client.post("/api/auth/register/company", json={
                    "name": "Verified Solar",
                    "email": "verified@example.com",
                    "password": "a-long-company-password",
                    "phone": "07712345678",
                })
                self.assertEqual(company_response.status_code, 201)
                company_body = company_response.json()
                company_id = company_body["user"]["company_id"]
                company_headers = {"Authorization": f"Bearer {company_body['access_token']}"}

                client_response = client.post("/api/auth/register/client", json={
                    "email": "owner@example.com",
                    "password": "a-long-client-password",
                    "full_name": "Request Owner",
                    "phone": "07722223333",
                })
                self.assertEqual(client_response.status_code, 201)
                owner_headers = {"Authorization": f"Bearer {client_response.json()['access_token']}"}

                guest_request = client.post("/api/quote-requests", json={
                    "company_ids": [company_id],
                    "customer_name": "Request Owner",
                    "customer_phone": "07711111111",
                    "system_kwp": 5,
                    "battery_kwh": 0,
                    "panel_count": 8,
                })
                self.assertEqual(guest_request.status_code, 201)
                guest_group_id = guest_request.json()["group_id"]
                guest_access_token = guest_request.json()["access_token"]

                unauthenticated_claim = client.post(
                    "/api/quote-requests/claim-guest",
                    json={"access_tokens": [guest_access_token]},
                )
                self.assertEqual(unauthenticated_claim.status_code, 401)
                company_claim = client.post(
                    "/api/quote-requests/claim-guest",
                    headers=company_headers,
                    json={"access_tokens": [guest_access_token]},
                )
                self.assertEqual(company_claim.status_code, 403)
                unclaimed = client.get("/api/quote-requests/mine", headers=owner_headers)
                self.assertEqual(unclaimed.status_code, 200)
                self.assertEqual(unclaimed.json(), [])
                claimed = client.post(
                    "/api/quote-requests/claim-guest",
                    headers=owner_headers,
                    json={"access_tokens": [guest_access_token]},
                )
                self.assertEqual(claimed.status_code, 200)
                self.assertEqual(claimed.json()["claimed"], 1)
                self.assertEqual(
                    client.post(
                        "/api/quote-requests/claim-guest",
                        headers=owner_headers,
                        json={"access_tokens": [guest_access_token]},
                    ).json()["claimed"],
                    0,
                )
                self.assertEqual(
                    [item["group_id"] for item in client.get(
                        "/api/quote-requests/mine", headers=owner_headers
                    ).json()],
                    [guest_group_id],
                )

                forbidden_request = client.post("/api/quote-requests", headers=company_headers, json={
                    "company_ids": [company_id],
                    "customer_name": "Request Owner",
                    "customer_phone": "07711111111",
                    "system_kwp": 8.4,
                    "battery_kwh": 10.2,
                    "panel_count": 12,
                })
                self.assertEqual(forbidden_request.status_code, 403)

                created = client.post("/api/quote-requests", headers=owner_headers, json={
                    "company_ids": [company_id],
                    "customer_name": "Request Owner",
                    "customer_phone": "07711111111",
                    "system_kwp": 8.4,
                    "battery_kwh": 10.2,
                    "panel_count": 12,
                    "is_green_initiative": True,
                    "green_initiative_budget_iqd": 12_000_000,
                    "details": {
                        "governorate": "Baghdad",
                        "district": "Al-Jadriya",
                        "budget": "20m IQD",
                        "notes": "Include installation",
                        "email": "private@example.com",
                    },
                })
                self.assertEqual(created.status_code, 201)
                body = created.json()
                self.assertNotIn("email", body["details"])
                self.assertEqual(body["details"]["notes"], "Include installation")
                self.assertTrue(body["is_green_initiative"])
                self.assertEqual(body["green_initiative_budget_iqd"], 12_000_000)
                group_id = body["group_id"]
                persisted_request = self.session.exec(
                    select(QuoteRequest).where(QuoteRequest.group_id == group_id)
                ).one()
                self.assertTrue(persisted_request.is_green_initiative)
                self.assertEqual(persisted_request.green_initiative_budget_iqd, 12_000_000)

                mine = client.get("/api/quote-requests/mine", headers=owner_headers)
                self.assertEqual(mine.status_code, 200)
                self.assertEqual(
                    {request["group_id"] for request in mine.json()},
                    {guest_group_id, group_id},
                )
                green_requests = client.get(
                    "/api/quote-requests/mine?is_green_initiative=true",
                    headers=owner_headers,
                )
                self.assertEqual(
                    [request["group_id"] for request in green_requests.json()],
                    [group_id],
                )

                quote_body = {
                    "total_iqd": 12_000_000,
                    "panel_iqd": 4_000_000,
                    "inverter_iqd": 3_000_000,
                    "battery_iqd": 2_000_000,
                    "installation_iqd": 3_000_000,
                    "capacity_kwp": 8.4,
                    "panel_brand": "Test Panel",
                    "inverter_brand": "Test Inverter",
                    "battery_brand": "Test Battery",
                    "warranty": "10 years",
                    "install_days": 5,
                    "financing": True,
                    "down_payment_iqd": 3_000_000,
                    "installment_months": 6,
                    "monthly_installment_iqd": 1_600_000,
                    "notes": "Direct installment option",
                    "green_initiative_supported": True,
                }
                pending_quote = client.post(
                    f"/api/quote-requests/{group_id}/quotes/{company_id}",
                    headers=company_headers,
                    json=quote_body,
                )
                self.assertEqual(pending_quote.status_code, 403)

                company = self.session.get(Company, company_id)
                company.verification_status = "verified"
                self.session.add(company)
                self.session.commit()
                unsupported_quote = client.post(
                    f"/api/quote-requests/{guest_group_id}/quotes/{company_id}",
                    headers=company_headers,
                    json=quote_body,
                )
                self.assertEqual(unsupported_quote.status_code, 422)
                mismatch = client.post(
                    f"/api/quote-requests/{group_id}/quotes/{company_id}",
                    headers=company_headers,
                    json={**quote_body, "total_iqd": 12_000_001},
                )
                self.assertEqual(mismatch.status_code, 422)
                submitted = client.post(
                    f"/api/quote-requests/{group_id}/quotes/{company_id}",
                    headers=company_headers,
                    json=quote_body,
                )
                self.assertEqual(submitted.status_code, 200)
                self.assertEqual(submitted.json()["panel_iqd"], 4_000_000)
                self.assertEqual(submitted.json()["down_payment_iqd"], 3_000_000)
                self.assertEqual(submitted.json()["installment_months"], 6)
                self.assertEqual(submitted.json()["monthly_installment_iqd"], 1_600_000)
                self.assertEqual(submitted.json()["notes"], "Direct installment option")
                updated_quote_body = {
                    **quote_body,
                    "down_payment_iqd": 2_000_000,
                    "installment_months": 3,
                    "monthly_installment_iqd": None,
                }
                updated_quote = client.post(
                    f"/api/quote-requests/{group_id}/quotes/{company_id}",
                    headers=company_headers,
                    json=updated_quote_body,
                )
                self.assertEqual(updated_quote.status_code, 200)
                self.assertEqual(updated_quote.json()["down_payment_iqd"], 2_000_000)
                self.assertEqual(updated_quote.json()["installment_months"], 3)
                self.assertEqual(updated_quote.json()["monthly_installment_iqd"], 3_333_333)
                self.assertEqual(updated_quote.json()["notes"], "Direct installment option")
                invalid_schedule = client.post(
                    f"/api/quote-requests/{group_id}/quotes/{company_id}",
                    headers=company_headers,
                    json={**quote_body, "down_payment_iqd": 12_000_000},
                )
                self.assertEqual(invalid_schedule.status_code, 422)
                stored_request = client.get(
                    "/api/quote-requests/mine",
                    headers=owner_headers,
                ).json()
                stored_green_quote = next(
                    request for request in stored_request if request["group_id"] == group_id
                )["companies"][0]["quote"]
                self.assertEqual(stored_green_quote["monthly_installment_iqd"], 3_333_333)
                self.assertNotIn("UTU-DIRECT-FINANCING", stored_green_quote["notes"])
                cash_quote = client.post(
                    f"/api/quote-requests/{guest_group_id}/quotes/{company_id}",
                    headers=company_headers,
                    json={
                        **quote_body,
                        "financing": False,
                        "down_payment_iqd": None,
                        "installment_months": None,
                        "monthly_installment_iqd": None,
                        "green_initiative_supported": False,
                        "notes": "Cash quote",
                    },
                )
                self.assertEqual(cash_quote.status_code, 200)
                self.assertFalse(cash_quote.json()["financing"])
                self.assertIsNone(cash_quote.json()["down_payment_iqd"])
                self.assertIsNone(cash_quote.json()["installment_months"])
                self.assertIsNone(cash_quote.json()["monthly_installment_iqd"])
                self.assertEqual(cash_quote.json()["notes"], "Cash quote")

                edit_after_quote = client.patch(
                    f"/api/quote-requests/{group_id}",
                    headers=owner_headers,
                    json={
                        "customer_phone": "07722223333",
                        "system_kwp": 9.6,
                        "battery_kwh": 12,
                        "panel_count": 14,
                        "details": {
                            "governorate": "basra",
                            "district": "Ashar",
                            "notes": "Please call before visiting",
                        },
                    },
                )
                self.assertEqual(edit_after_quote.status_code, 200)
                self.assertEqual(edit_after_quote.json()["customer_phone"], "07722223333")
                self.assertEqual(edit_after_quote.json()["details"]["notes"], "Please call before visiting")
                invalid_edit = client.patch(
                    f"/api/quote-requests/{group_id}",
                    headers=owner_headers,
                    json={"customer_phone": "123"},
                )
                self.assertEqual(invalid_edit.status_code, 422)

                other_client = client.post("/api/auth/register/client", json={
                    "email": "other@example.com",
                    "password": "a-long-client-password",
                    "full_name": "Other Client",
                    "phone": "07799999999",
                })
                self.assertEqual(other_client.status_code, 201)
                other_headers = {"Authorization": f"Bearer {other_client.json()['access_token']}"}
                self.assertEqual(client.get("/api/quote-requests/mine", headers=other_headers).json(), [])
                stolen_edit = client.patch(
                    f"/api/quote-requests/{group_id}",
                    headers=other_headers,
                    json={"details": {"notes": "not the owner"}},
                )
                self.assertEqual(stolen_edit.status_code, 404)
                stolen_claim = client.post(
                    "/api/quote-requests/claim-guest",
                    headers=other_headers,
                    json={"access_tokens": [guest_access_token]},
                )
                self.assertEqual(stolen_claim.status_code, 200)
                self.assertEqual(stolen_claim.json()["claimed"], 0)
                forbidden_acceptance = client.post(
                    f"/api/quote-requests/{group_id}/choose/{company_id}",
                    headers=other_headers,
                )
                self.assertEqual(forbidden_acceptance.status_code, 404)
                accepted = client.post(
                    f"/api/quote-requests/{group_id}/choose/{company_id}",
                    headers=owner_headers,
                )
                self.assertEqual(accepted.status_code, 200)
                self.assertEqual(accepted.json()["status"], "accepted")
                # Accepting a quote is not enough to see the company's numbers.
                self.assertIsNone(accepted.json()["companies"][0]["company_phone"])
                self.assertIsNone(accepted.json()["companies"][0]["company_support_phone"])
                self.assertIsNone(accepted.json()["companies"][0]["company_email"])
                saved_address = client.patch(
                    f"/api/quote-requests/{group_id}",
                    headers=owner_headers,
                    json={"details": {"notes": "My address is 14 Baker Street"}},
                )
                self.assertEqual(saved_address.status_code, 200)
                inbox_before_deposit = client.get("/api/company/requests", headers=company_headers)
                self.assertEqual(inbox_before_deposit.status_code, 200)
                request_before_deposit = next(
                    item for item in inbox_before_deposit.json() if item["group_id"] == group_id
                )
                self.assertIsNone(request_before_deposit["customer_phone"])
                self.assertEqual(
                    request_before_deposit["details"]["notes"],
                    "Location and contact details are available after deposit confirmation.",
                )
                payment_response = client.post(
                    f"/api/quote-requests/{group_id}/choose/{company_id}/deposit",
                    headers=owner_headers,
                    json={"payment_method": "fib", "phone_number": "07711111111"},
                )
                self.assertEqual(payment_response.status_code, 200)
                payment_group = payment_response.json()
                self.assertEqual(payment_group["status"], "in_progress")
                payment = payment_group["companies"][0]["payment"]
                # After the deposit, the customer can call this company directly.
                paid_company = self.session.get(Company, company_id)
                self.assertIsNotNone(payment_group["companies"][0]["company_phone"])
                self.assertEqual(payment_group["companies"][0]["company_phone"], paid_company.phone)
                self.assertEqual(
                    payment_group["companies"][0]["company_support_phone"],
                    paid_company.support_phone,
                )
                self.assertEqual(payment_group["companies"][0]["company_email"], paid_company.email)
                self.assertEqual(payment["payment_method"], "fib")
                self.assertEqual(payment["deposit_iqd"], 600_000)
                self.assertEqual(payment["remaining_iqd"], 11_400_000)
                self.assertEqual(payment["commission_iqd"], 600_000)
                self.assertEqual(payment["project_status"], "ready_for_installation")
                paid_inbox = client.get("/api/company/requests", headers=company_headers)
                paid_request = next(
                    item for item in paid_inbox.json() if item["group_id"] == group_id
                )
                self.assertEqual(paid_request["customer_phone"], "07722223333")
                self.assertEqual(
                    paid_request["details"]["notes"],
                    "My address is 14 Baker Street",
                )
                retry_payment = client.post(
                    f"/api/quote-requests/{group_id}/choose/{company_id}/deposit",
                    headers=owner_headers,
                    json={"payment_method": "fib", "phone_number": "07711111111"},
                )
                self.assertEqual(
                    retry_payment.json()["companies"][0]["payment"]["transaction_id"],
                    payment["transaction_id"],
                )
                company_inbox = client.get("/api/company/requests", headers=company_headers)
                self.assertEqual(company_inbox.status_code, 200)
                company_paid_request = next(
                    item for item in company_inbox.json() if item["group_id"] == group_id
                )
                # Deposits are a demo flow: recorded as simulated, never as paid.
                self.assertEqual(
                    company_paid_request["companies"][0]["payment"]["payment_status"],
                    "simulated",
                )
                # After the deposit, the company may contact the customer.
                self.assertEqual(company_paid_request["customer_phone"], "07722223333")
                revenue_rows = admin_revenue(self.session, self.admin_user())
                paid_revenue = next(row for row in revenue_rows if row["request_id"] == persisted_request.id)
                self.assertEqual(paid_revenue["payment_status"], "simulated")
                self.assertEqual(paid_revenue["commission_status"], "simulated")
                self.assertEqual(paid_revenue["deposit_iqd"], 600_000)
                refund_result = refund_deposit(
                    paid_revenue["assignment_id"],
                    self.session,
                    self.admin_user(),
                )
                self.assertEqual(refund_result["payment_status"], "refunded")
                self.assertEqual(refund_result["commission_status"], "reversed")
                stored_payment = self.session.exec(
                    select(DepositPayment).where(
                        DepositPayment.assignment_id == paid_revenue["assignment_id"]
                    )
                ).one()
                self.assertEqual(stored_payment.project_status, "cancelled")
                # A refunded deposit hides the company's numbers again.
                after_refund = next(
                    item for item in client.get("/api/quote-requests/mine", headers=owner_headers).json()
                    if item["group_id"] == group_id
                )
                self.assertIsNone(after_refund["companies"][0]["company_phone"])
                verification_id = accepted.json()["companies"][0]["green_verification_id"]
                self.assertTrue(verification_id)
                company_verification = self.session.get(CompanyVerification, company_id)
                company_verification.business_license_number = "LIC-VERIFIED"
                company_verification.tax_registration_number = "TAX-VERIFIED"
                company_verification.license_checked = True
                company_verification.tax_record_checked = True
                company_verification.projects_checked = True
                self.session.add(company_verification)
                self.session.commit()
                verification_response = client.get(
                    f"/api/quote-requests/verify/{verification_id}"
                )
                self.assertEqual(verification_response.status_code, 200)
                verification_data = verification_response.json()
                self.assertEqual(verification_data["reference"], group_id)
                self.assertEqual(verification_data["company_name"], "Verified Solar")
                self.assertEqual(verification_data["system_kwp"], 8.4)
                self.assertEqual(verification_data["business_license_number"], "LIC-VERIFIED")
                self.assertEqual(verification_data["tax_registration_number"], "TAX-VERIFIED")
                self.assertNotIn("customer_name", verification_data)
                self.assertNotIn("customer_phone", verification_data)
                edit_after_acceptance = client.patch(
                    f"/api/quote-requests/{group_id}",
                    headers=owner_headers,
                    json={"details": {"notes": "Updated after accepting"}},
                )
                self.assertEqual(edit_after_acceptance.status_code, 200)
                self.assertEqual(
                    edit_after_acceptance.json()["details"]["notes"],
                    "Updated after accepting",
                )
                company_inbox = client.get("/api/company/requests", headers=company_headers)
                self.assertEqual(company_inbox.status_code, 200)
                company_request = next(
                    item for item in company_inbox.json() if item["group_id"] == group_id
                )
                # The deposit was refunded above, so the phone is hidden again.
                self.assertIsNone(company_request["customer_phone"])
                self.assertEqual(
                    company_request["details"]["notes"],
                    "Updated after accepting",
                )
                self.assertTrue(company_request["is_green_initiative"])
                self.assertTrue(
                    company_request["companies"][0]["quote"]["green_initiative_supported"]
                )
                company_green_requests = client.get(
                    "/api/company/requests?is_green_initiative=true",
                    headers=company_headers,
                )
                self.assertEqual(
                    [request["group_id"] for request in company_green_requests.json()],
                    [group_id],
                )

    def test_jwt_company_registration_links_pending_company(self):
        app = FastAPI()
        app.include_router(auth_router)

        def override_session():
            yield self.session

        app.dependency_overrides[get_session] = override_session
        with patch.dict(os.environ, {"JWT_SECRET_KEY": "unit-test-jwt-secret-key-which-is-long-enough"}):
            with TestClient(app) as client:
                response = client.post("/api/auth/register/company", json={
                    "name": "JWT Solar",
                    "email": "jwt-company@example.com",
                    "password": "a-long-company-password",
                    "phone": "07712345678",
                    "business_license_number": "LIC-1",
                    "tax_registration_number": "TAX-1",
                    "projects_count": 0,
                })
                self.assertEqual(response.status_code, 201)
                body = response.json()
                self.assertEqual(body["user"]["role"], "company")
                self.assertFalse(body["user"]["is_verified"])
                company = self.session.get(Company, body["user"]["company_id"])
                self.assertEqual(company.verification_status, "pending")

    def test_company_can_register_before_submitting_verification_details(self):
        result = self.register_company_account(
            CompanyRegistration(
                name="Incomplete Solar",
                email="incomplete@example.com",
                password="a-long-test-password",
            ),
        )
        company = self.session.get(Company, result["id"])
        self.assertEqual(company.verification_status, "pending")
        self.assertEqual(company.projects_count, 0)
        self.assertEqual(company.phone, "")
        self.assertNotIn(company.id, {item.id for item in get_companies(self.session)})

    def test_company_and_customer_phone_numbers_require_eleven_iraqi_digits(self):
        with self.assertRaises(ValidationError):
            CompanyRegistration(
                name="Wrong Phone",
                email="wrong-phone@example.com",
                password="a-long-test-password",
                phone="0771234567",
            )
        with self.assertRaises(ValidationError):
            QuoteRequestCreate(
                company_ids=[1],
                customer_name="Test Customer",
                customer_phone="0771234567",
                system_kwp=8,
                battery_kwh=0,
                panel_count=12,
            )

    def test_green_initiative_request_requires_a_valid_budget(self):
        with self.assertRaises(ValidationError):
            QuoteRequestCreate(
                company_ids=[1],
                customer_name="Test Customer",
                customer_phone="07712345678",
                system_kwp=8,
                battery_kwh=0,
                panel_count=12,
                is_green_initiative=True,
            )

    def test_admin_can_review_uploaded_verification_document_without_changing_company_records(self):
        company_result = self.register()
        company = self.session.get(Company, company_result["id"])
        company_token = self.company_token(company.id)
        document_data = b"%PDF-1.4\nminimal test document"
        upload = VerificationDocumentUpload(
            document_type="license",
            file_name="C:\\uploads\\business-license.pdf",
            content_type="application/pdf",
            data_base64=base64.b64encode(document_data).decode("ascii"),
        )
        upload_verification_document(
            upload,
            f"Bearer {company_token}",
            self.session,
        )
        admin = User(
            id=999,
            email="admin@example.com",
            hashed_password="not-used",
            full_name="Platform Admin",
            role="admin",
            is_active=True,
        )

        pending = list_pending_companies(session=self.session, current_user=admin)
        self.assertTrue(pending[0]["has_license_document"])
        self.assertFalse(pending[0]["has_tax_document"])
        viewed = get_verification_document(
            company.id,
            "license",
            session=self.session,
            current_user=admin,
        )
        self.assertEqual(viewed["file_name"], "business-license.pdf")
        self.assertEqual(base64.b64decode(viewed["data_base64"]), document_data)
        self.assertEqual(company.verification_status, "pending")
        self.assertEqual(company.projects_count, 3)
        self.assertEqual(self.session.exec(select(VerificationDocument)).one().company_id, company.id)

    def test_admin_revenue_calculates_commission_for_accepted_and_completed_quotes(self):
        company_result = self.register()
        company_id = company_result["id"]
        request = QuoteRequest(
            group_id="UTU-2026-REVENUE",
            customer_name="Test Customer",
            customer_phone="07711111111",
            system_kwp=8.4,
            battery_kwh=10,
            panel_count=12,
            access_token_hash="revenue-test-token-hash",
        )
        self.session.add(request)
        self.session.commit()
        self.session.refresh(request)
        assignment = QuoteRequestCompany(
            request_id=request.id,
            company_id=company_id,
            status="selected",
        )
        self.session.add(assignment)
        self.session.commit()
        self.session.refresh(assignment)
        self.session.add(CompanyQuote(
            request_company_id=assignment.id,
            total_iqd=10_000_000,
            capacity_kwp=8.4,
            panel_brand="Test Panel",
            inverter_brand="Test Inverter",
            battery_brand="Test Battery",
            warranty="10 years",
            install_days=5,
        ))
        self.session.add(Project(
            title="Completed revenue installation",
            company_id=company_id,
            quote_request_id=request.id,
            location_governorate="Baghdad",
            location_district="Mansour",
            system_kwp=8.4,
            installation_type="Hybrid rooftop",
            image_url="https://example.test/project.jpg",
            status="completed",
            completed_at=datetime.now(timezone.utc),
        ))
        accepted_request = QuoteRequest(
            group_id="UTU-2026-ACCEPTED",
            customer_name="Second Customer",
            customer_phone="07722222222",
            system_kwp=5,
            battery_kwh=0,
            panel_count=8,
            access_token_hash="accepted-test-token-hash",
        )
        self.session.add(accepted_request)
        self.session.commit()
        self.session.refresh(accepted_request)
        accepted_assignment = QuoteRequestCompany(
            request_id=accepted_request.id,
            company_id=company_id,
            status="selected",
        )
        self.session.add(accepted_assignment)
        self.session.commit()
        self.session.refresh(accepted_assignment)
        self.session.add(CompanyQuote(
            request_company_id=accepted_assignment.id,
            total_iqd=4_000_000,
            capacity_kwp=5,
            panel_brand="Test Panel",
            inverter_brand="Test Inverter",
            battery_brand="Test Battery",
            warranty="10 years",
            install_days=5,
        ))
        self.session.commit()
        admin = User(
            id=999,
            email="admin@example.com",
            hashed_password="not-used",
            full_name="Platform Admin",
            role="admin",
            is_active=True,
        )

        rows = admin_revenue(session=self.session, current_user=admin)

        self.assertEqual(len(rows), 2)
        completed = next(row for row in rows if row["request_id"] == request.id)
        accepted = next(row for row in rows if row["request_id"] == accepted_request.id)
        self.assertEqual(completed["company_name"], "Test Solar")
        self.assertEqual(completed["project_title"], "Completed revenue installation")
        self.assertEqual(completed["total_agreed_price_iqd"], 10_000_000)
        self.assertEqual(completed["commission_rate"], 0.05)
        self.assertEqual(completed["commission_fee_iqd"], 500_000)
        self.assertEqual(completed["status"], "completed")
        self.assertEqual(accepted["total_agreed_price_iqd"], 4_000_000)
        self.assertEqual(accepted["commission_fee_iqd"], 200_000)
        self.assertEqual(accepted["status"], "accepted")
        self.assertFalse(completed["is_estimate"])

    def test_admin_revenue_skips_completed_projects_without_an_accepted_quote(self):
        company_result = self.register()
        company_id = company_result["id"]
        project = Project(
            title="Portfolio completion without quote",
            company_id=company_id,
            location_governorate="Baghdad",
            location_district="Mansour",
            system_kwp=2.5,
            installation_type="Hybrid rooftop",
            image_url="https://example.test/project.jpg",
            status="completed",
        )
        self.session.add(project)
        self.session.commit()
        admin = User(
            id=999,
            email="admin@example.com",
            hashed_password="not-used",
            full_name="Platform Admin",
            role="admin",
            is_active=True,
        )

        rows = admin_revenue(session=self.session, current_user=admin)

        # No accepted quote means no agreed price, so no revenue row is invented.
        self.assertEqual(rows, [])

    def test_user_policy_report_can_be_reviewed_by_admin(self):
        reporter = User(
            email="reporter@example.com",
            hashed_password="not-used",
            full_name="Test Reporter",
            role="client",
            is_active=True,
        )
        self.session.add(reporter)
        self.session.commit()
        self.session.refresh(reporter)
        report = create_policy_report(
            PolicyReportCreate(
                subject="Inappropriate chat message",
                description="A reported message needs moderation.",
            ),
            session=self.session,
            current_user=reporter,
        )
        admin = User(
            id=999,
            email="admin@example.com",
            hashed_password="not-used",
            full_name="Platform Admin",
            role="admin",
            is_active=True,
        )

        self.assertEqual(admin_policy_reports(session=self.session, current_user=admin)[0].id, report.id)
        updated = update_policy_report_status(
            report.id,
            PolicyReportStatusUpdate(status="resolved"),
            session=self.session,
            current_user=admin,
        )
        self.assertEqual(updated.status, "resolved")
        self.assertEqual(self.session.get(PolicyReport, report.id).status, "resolved")

    def test_request_chat_delivers_messages_masks_contact_and_logs_admin_report(self):
        company = self.register()
        request = self.request_for(company["id"])
        company_token = self.company_token(company["id"])

        normal = create_chat_message(
            request["group_id"],
            company["id"],
            ChatMessageCreate(content="Hello, I can prepare the requested solar system."),
            request["access_token"],
            None,
            self.session,
            None,
        )
        company_inbox = list_chat_messages(
            request["group_id"],
            company["id"],
            None,
            f"Bearer {company_token}",
            self.session,
            None,
        )
        self.assertEqual(normal.content, "Hello, I can prepare the requested solar system.")
        self.assertEqual(len(company_inbox), 1)
        self.assertEqual(company_inbox[0].sender_role, "client")

        blocked = create_chat_message(
            request["group_id"],
            company["id"],
            ChatMessageCreate(content="Please call 077 123 45678"),
            request["access_token"],
            None,
            self.session,
            None,
        )
        blocked_location = create_chat_message(
            request["group_id"],
            company["id"],
            ChatMessageCreate(content="My address is 14 Baker Street"),
            request["access_token"],
            None,
            self.session,
            None,
        )
        legacy_contact_message = ChatMessage(
            request_company_id=normal.request_company_id,
            sender_role="client",
            sender_name="Test Customer",
            content="Email me at customer@example.com",
        )
        self.session.add(legacy_contact_message)
        self.session.commit()
        restricted_history = list_chat_messages(
            request["group_id"],
            company["id"],
            request["access_token"],
            None,
            self.session,
            None,
        )
        legacy_hidden = next(
            message for message in restricted_history if message.id == legacy_contact_message.id
        )
        self.assertEqual(legacy_hidden.content, "[تم حجب معلومات التواصل المباشر لحماية الاتفاقية]")

        self.session.add(DepositPayment(
            assignment_id=normal.request_company_id,
            transaction_id="UTU-CHAT-CONTACT-UNLOCK",
            payment_method="zaincash",
            phone_number="07711111111",
            total_iqd=1_000_000,
            deposit_iqd=50_000,
            remaining_iqd=950_000,
            commission_iqd=50_000,
            payment_status="simulated",
            commission_status="simulated",
            project_status="ready_for_installation",
        ))
        self.session.commit()
        allowed_contact = create_chat_message(
            request["group_id"],
            company["id"],
            ChatMessageCreate(content="Call 07712345678 or see https://example.com"),
            request["access_token"],
            None,
            self.session,
            None,
        )
        stored_messages = self.session.exec(
            select(ChatMessage).where(ChatMessage.request_company_id == normal.request_company_id)
        ).all()
        reports = self.session.exec(select(PolicyReport)).all()

        self.assertEqual(blocked.content, "[تم حجب معلومات التواصل المباشر لحماية الاتفاقية]")
        self.assertEqual(blocked.violation_type, "Attempted phone number sharing in chat")
        self.assertEqual(blocked_location.violation_type, "Attempted exact location sharing in chat")
        self.assertNotIn("077", " ".join(message.content for message in stored_messages if message.id != allowed_contact.id))
        self.assertEqual(allowed_contact.content, "Call 07712345678 or see https://example.com")
        self.assertIsNone(allowed_contact.violation_type)
        unlocked_history = list_chat_messages(
            request["group_id"],
            company["id"],
            request["access_token"],
            None,
            self.session,
            None,
        )
        self.assertEqual(
            next(message for message in unlocked_history if message.id == legacy_contact_message.id).content,
            "Email me at customer@example.com",
        )
        self.assertEqual(len(reports), 2)
        self.assertIn("sender: client", reports[0].description)
        self.assertIn("Pending", reports[0].status.title())

    def test_chat_http_flow_exposes_blocked_attempt_in_admin_reports(self):
        company = self.register()
        request = self.request_for(company["id"])
        company_token = self.company_token(company["id"])

        app = FastAPI()
        app.include_router(company_portal_router)
        app.include_router(quote_requests_router)
        app.include_router(companies_router)

        def override_session():
            yield self.session

        app.dependency_overrides[get_session] = override_session
        path = (
            f"/api/quote-requests/{request['group_id']}/companies/"
            f"{company['id']}/messages"
        )
        with TestClient(app) as client:
            delivered = client.post(
                f"{path}?access_token={request['access_token']}",
                json={"content": "Your request is received; we will prepare a quote."},
            )
            company_history = client.get(
                path,
                headers={"Authorization": f"Bearer {company_token}"},
            )
            blocked = client.post(
                f"{path}?access_token={request['access_token']}",
                json={"content": "My WhatsApp is 078-123-45678"},
            )
            admin_reports = client.get(
                "/api/companies/admin/reports",
                headers={"Authorization": f"Bearer {self.admin_bearer()}"},
            )

        self.assertEqual(delivered.status_code, 201)
        self.assertEqual(company_history.status_code, 200)
        self.assertEqual(len(company_history.json()), 1)
        self.assertEqual(blocked.status_code, 201)
        self.assertEqual(
            blocked.json()["content"],
            "[تم حجب معلومات التواصل المباشر لحماية الاتفاقية]",
        )
        self.assertEqual(admin_reports.status_code, 200)
        self.assertEqual(len(admin_reports.json()), 1)
        self.assertIn("Attempted phone number sharing in chat", admin_reports.json()[0]["subject"])
        self.assertIn("[تم حجب معلومات التواصل المباشر", admin_reports.json()[0]["description"])

    def test_customer_cancellation_workflow_refunds_forfeits_and_routes_cost_review(self):
        company = self.register()
        self.approve(company["id"])
        owner = User(
            email="cancellation-owner@example.com",
            phone="07722223333",
            hashed_password="not-used",
            full_name="Cancellation Owner",
            role="client",
            is_active=True,
        )
        self.session.add(owner)
        self.session.commit()
        self.session.refresh(owner)
        owner_headers = {"Authorization": f"Bearer {create_access_token(owner)}"}
        company_headers = {"Authorization": f"Bearer {self.company_token(company['id'])}"}
        admin_headers = {"Authorization": f"Bearer {self.admin_bearer()}"}

        def create_owned_request():
            return create_quote_request(
                QuoteRequestCreate(
                    company_ids=[company["id"]],
                    customer_name=owner.full_name,
                    customer_phone=owner.phone,
                    system_kwp=8.4,
                    battery_kwh=10,
                    panel_count=12,
                ),
                self.session,
                owner,
            )

        app = FastAPI()
        app.include_router(quote_requests_router)
        app.include_router(project_lifecycle_router)

        def override_session():
            yield self.session

        app.dependency_overrides[get_session] = override_session
        with TestClient(app) as client:
            def create_installing_request():
                request = create_owned_request()
                submit_company_quote(
                    request["group_id"],
                    company["id"],
                    self.simple_quote(),
                    self.company_auth(),
                    self.session,
                )
                client.post(
                    f"/api/quote-requests/{request['group_id']}/choose/{company['id']}",
                    params={"access_token": request["access_token"]},
                )
                deposited = client.post(
                    f"/api/quote-requests/{request['group_id']}/choose/{company['id']}/deposit",
                    params={"access_token": request["access_token"]},
                    json={"payment_method": "zaincash", "phone_number": owner.phone},
                )
                assignment_id = deposited.json()["companies"][0]["id"]
                client.post(
                    f"/api/project-lifecycle/requests/{request['group_id']}/companies/{company['id']}/sign-contract/customer",
                    params={"access_token": request["access_token"]},
                )
                client.post(
                    f"/api/project-lifecycle/requests/{request['group_id']}/companies/{company['id']}/sign-contract/company",
                    headers=company_headers,
                )
                started = client.post(
                    f"/api/project-lifecycle/admin/{assignment_id}/start",
                    headers=admin_headers,
                )
                self.assertEqual(started.status_code, 200, started.text)
                return request, assignment_id

            pending = create_owned_request()
            pending_cancelled = client.post(
                f"/api/quote-requests/{pending['group_id']}/cancel",
                headers=owner_headers,
            )
            self.assertEqual(pending_cancelled.status_code, 200, pending_cancelled.text)
            self.assertEqual(pending_cancelled.json()["status"], "cancelled")
            self.assertEqual(pending_cancelled.json()["companies"][0]["status"], "cancelled")
            self.assertEqual(
                client.post(
                    f"/api/quote-requests/{pending['group_id']}/cancel",
                    headers=owner_headers,
                ).status_code,
                409,
            )
            self.assertEqual(
                client.post(
                    f"/api/quote-requests/{pending['group_id']}/cancel",
                    headers=company_headers,
                ).status_code,
                403,
            )

            accepted = create_owned_request()
            submit_company_quote(
                accepted["group_id"],
                company["id"],
                self.simple_quote(),
                self.company_auth(),
                self.session,
            )
            accepted_by_company = client.post(
                f"/api/quote-requests/{accepted['group_id']}/choose/{company['id']}",
                params={"access_token": accepted["access_token"]},
            )
            self.assertEqual(accepted_by_company.status_code, 200, accepted_by_company.text)
            deposit = client.post(
                f"/api/quote-requests/{accepted['group_id']}/choose/{company['id']}/deposit",
                params={"access_token": accepted["access_token"]},
                json={"payment_method": "zaincash", "phone_number": owner.phone},
            )
            self.assertEqual(deposit.status_code, 200, deposit.text)
            accepted_cancelled = client.post(
                f"/api/quote-requests/{accepted['group_id']}/cancel",
                headers=owner_headers,
            )
            self.assertEqual(accepted_cancelled.status_code, 200, accepted_cancelled.text)
            accepted_payment = self.session.exec(
                select(DepositPayment).where(
                    DepositPayment.assignment_id == accepted_cancelled.json()["companies"][0]["id"]
                )
            ).one()
            self.assertEqual(accepted_payment.payment_status, "forfeited")
            self.assertEqual(accepted_payment.project_status, "cancelled")

            installing, assignment_id = create_installing_request()
            request_cancellation = client.post(
                f"/api/quote-requests/{installing['group_id']}/cancel",
                headers=owner_headers,
            )
            self.assertEqual(request_cancellation.status_code, 200, request_cancellation.text)
            self.assertEqual(request_cancellation.json()["status"], "cancellation_pending_review")
            self.assertEqual(
                request_cancellation.json()["companies"][0]["lifecycle_status"],
                "cancellation_pending_review",
            )
            admin_queue = client.get("/api/project-lifecycle/admin", headers=admin_headers)
            pending_review = next(item for item in admin_queue.json() if item["assignment_id"] == assignment_id)
            self.assertEqual(pending_review["stage"], "cancellation_pending_review")

            decision = client.post(
                f"/api/project-lifecycle/admin/{assignment_id}/cancellation-decision",
                headers=admin_headers,
                json={
                    "decision": "approved",
                    "materials_cost_iqd": 200_000,
                    "customer_share_percent": 50,
                    "feedback": "Materials verified",
                },
            )
            self.assertEqual(decision.status_code, 200, decision.text)
            self.assertEqual(decision.json()["customer_deduction_iqd"], 100_000)
            self.assertEqual(decision.json()["deposit_refund_iqd"], 400_000)
            self.assertEqual(decision.json()["customer_balance_due_iqd"], 0)
            installing_payment = self.session.exec(
                select(DepositPayment).where(DepositPayment.assignment_id == assignment_id)
            ).one()
            self.assertEqual(installing_payment.payment_status, "partially_refunded")
            self.assertEqual(installing_payment.project_status, "cancelled")
            installing_group = client.get(
                f"/api/quote-requests/{installing['group_id']}",
                params={"access_token": installing["access_token"]},
            )
            self.assertEqual(installing_group.status_code, 200, installing_group.text)
            self.assertEqual(
                installing_group.json()["companies"][0]["cancellation_result"],
                {
                    "materials_cost_iqd": 200_000,
                    "customer_share_percent": 50,
                    "customer_deduction_iqd": 100_000,
                    "deposit_refund_iqd": 400_000,
                    "customer_balance_due_iqd": 0,
                },
            )

            high_cost_request, high_cost_assignment_id = create_installing_request()
            high_cost_payment = self.session.exec(
                select(DepositPayment).where(DepositPayment.assignment_id == high_cost_assignment_id)
            ).one()
            high_cost_payment.deposit_iqd = 50_000
            self.session.add(high_cost_payment)
            self.session.commit()
            submitted_for_review = client.post(
                f"/api/quote-requests/{high_cost_request['group_id']}/cancel",
                headers=owner_headers,
            )
            self.assertEqual(submitted_for_review.status_code, 200, submitted_for_review.text)
            high_cost_decision = client.post(
                f"/api/project-lifecycle/admin/{high_cost_assignment_id}/cancellation-decision",
                headers=admin_headers,
                json={
                    "decision": "approved",
                    "materials_cost_iqd": 200_000,
                    "customer_share_percent": 100,
                },
            )
            self.assertEqual(high_cost_decision.status_code, 200, high_cost_decision.text)
            self.assertEqual(high_cost_decision.json()["customer_deduction_iqd"], 200_000)
            self.assertEqual(high_cost_decision.json()["deposit_refund_iqd"], 0)
            self.assertEqual(high_cost_decision.json()["customer_balance_due_iqd"], 150_000)
            high_cost_group = client.get(
                f"/api/quote-requests/{high_cost_request['group_id']}",
                params={"access_token": high_cost_request["access_token"]},
            )
            self.assertEqual(high_cost_group.status_code, 200, high_cost_group.text)
            self.assertEqual(
                high_cost_group.json()["companies"][0]["cancellation_result"]["customer_balance_due_iqd"],
                150_000,
            )

    def test_project_lifecycle_contract_proof_review_and_publish_workflow(self):
        company = self.register()
        self.approve(company["id"])
        request = self.request_for(company["id"])
        self.assertEqual(
            submit_company_quote(
                request["group_id"],
                company["id"],
                self.simple_quote(),
                self.company_auth(),
                self.session,
            )["total_iqd"],
            10_000_000,
        )

        app = FastAPI()
        app.include_router(company_portal_router)
        app.include_router(quote_requests_router)
        app.include_router(projects_router)
        app.include_router(project_lifecycle_router)

        def override_session():
            yield self.session

        app.dependency_overrides[get_session] = override_session
        with TestClient(app) as client:
            accepted = client.post(
                f"/api/quote-requests/{request['group_id']}/choose/{company['id']}",
                params={"access_token": request["access_token"]},
            )
            self.assertEqual(accepted.status_code, 200)
            contract = accepted.json()["companies"][0]["contract"]
            self.assertEqual(contract["price_iqd"], 10_000_000)
            self.assertEqual(contract["specifications"]["panel_count"], 12)
            self.assertTrue(contract["signatures"]["platform_stamp"])
            self.assertEqual(accepted.json()["companies"][0]["lifecycle_status"], "awaiting_signatures")
            premature_signature = client.post(
                f"/api/project-lifecycle/requests/{request['group_id']}/companies/{company['id']}/sign-contract/customer",
                params={"access_token": request["access_token"]},
            )
            self.assertEqual(premature_signature.status_code, 409)

            deposited = client.post(
                f"/api/quote-requests/{request['group_id']}/choose/{company['id']}/deposit",
                params={"access_token": request["access_token"]},
                json={"payment_method": "zaincash", "phone_number": "07711111111"},
            )
            self.assertEqual(deposited.status_code, 200, deposited.text)
            customer_signed = client.post(
                f"/api/project-lifecycle/requests/{request['group_id']}/companies/{company['id']}/sign-contract/customer",
                params={"access_token": request["access_token"]},
            )
            self.assertEqual(customer_signed.status_code, 200, customer_signed.text)
            self.assertTrue(customer_signed.json()["customer_contract_signed"])
            self.assertFalse(customer_signed.json()["company_contract_signed"])
            admin_headers = {"Authorization": f"Bearer {self.admin_bearer()}"}
            premature_start = client.post(
                f"/api/project-lifecycle/admin/{deposited.json()['companies'][0]['id']}/start",
                headers=admin_headers,
            )
            self.assertEqual(premature_start.status_code, 409)

            headers = {"Authorization": f"Bearer {self.company_token(company['id'])}"}
            completion_url = f"/api/quote-requests/{request['group_id']}/complete"
            proof_data = base64.b64encode(b"\x89PNG\r\n\x1a\nUTU-test-proof").decode("ascii")
            completion = {
                "title": "Baghdad rooftop",
                "description": "Array and inverter installed",
                "installation_type": "Hybrid rooftop",
                "proof_data_base64": proof_data,
                "proof_content_type": "image/png",
                "proof_file_name": "installation.png",
            }
            premature = client.post(completion_url, headers=headers, json=completion)
            self.assertEqual(premature.status_code, 409)
            company_signed = client.post(
                f"/api/project-lifecycle/requests/{request['group_id']}/companies/{company['id']}/sign-contract/company",
                headers=headers,
            )
            self.assertEqual(company_signed.status_code, 200, company_signed.text)
            self.assertEqual(company_signed.json()["lifecycle_status"], "awaiting_admin_approval")
            self.assertTrue(company_signed.json()["customer_contract_signed"])
            self.assertTrue(company_signed.json()["company_contract_signed"])

            pending_authorization = client.get("/api/project-lifecycle/admin", headers=admin_headers)
            self.assertEqual(pending_authorization.status_code, 200)
            self.assertEqual(pending_authorization.json()[0]["stage"], "pending_work_approval")
            started = client.post(
                f"/api/project-lifecycle/admin/{pending_authorization.json()[0]['assignment_id']}/start",
                headers=admin_headers,
            )
            self.assertEqual(started.status_code, 200, started.text)
            self.assertEqual(started.json()["stage"], "contract_in_progress")
            self.assertIsNotNone(started.json()["work_authorized_at"])
            self.assertEqual(
                self.session.exec(select(DepositPayment)).one().project_status,
                "in_progress",
            )
            self.assertIn("تمت موافقة الأدمن على العقد والمباشرة بالعمل", started.json()["audit"][-1]["notification"])
            authorized_requests = client.get(
                "/api/quote-requests",
                params={"access_token": request["access_token"]},
            )
            self.assertEqual(authorized_requests.status_code, 200)
            authorized_assignment = authorized_requests.json()[0]["companies"][0]
            self.assertEqual(authorized_assignment["lifecycle_status"], "in_progress")
            self.assertIsNotNone(authorized_assignment["work_authorized_at"])
            company_requests = client.get("/api/company/requests", headers=headers)
            self.assertEqual(company_requests.status_code, 200)
            self.assertEqual(company_requests.json()[0]["companies"][0]["work_authorized_at"], started.json()["work_authorized_at"])

            missing_photo = client.post(
                completion_url,
                headers=headers,
                json={"title": "Baghdad rooftop", "installation_type": "Hybrid rooftop"},
            )
            self.assertEqual(missing_photo.status_code, 422)

            submitted = client.post(completion_url, headers=headers, json=completion)
            self.assertEqual(submitted.status_code, 201, submitted.text)
            self.assertEqual(submitted.json()["status"], "in_progress")
            record = self.session.exec(select(ProjectLifecycleRecord)).one()
            self.assertEqual(record.status, "pending_review")

            active = client.get("/api/project-lifecycle/admin", headers=admin_headers)
            self.assertEqual(active.status_code, 200)
            self.assertEqual(active.json()[0]["stage"], "completion_pending_review")
            proof = client.get(
                f"/api/project-lifecycle/admin/{record.request_company_id}/proof",
                headers=admin_headers,
            )
            self.assertEqual(proof.status_code, 200)
            self.assertEqual(proof.json()["file_name"], "installation.png")
            self.assertEqual(proof.json()["data_base64"], proof_data)

            rejected = client.post(
                f"/api/project-lifecycle/admin/{record.request_company_id}/decision",
                headers=admin_headers,
                json={"decision": "changes_requested", "feedback": "Show the inverter label clearly"},
            )
            self.assertEqual(rejected.status_code, 200)
            self.assertEqual(rejected.json()["stage"], "changes_requested")
            self.assertEqual(record.status, "changes_requested")

            replacement = {
                **completion,
                "proof_data_base64": base64.b64encode(b"\x89PNG\r\n\x1a\nUTU-updated-proof").decode("ascii"),
                "proof_file_name": "installation-updated.png",
            }
            resubmitted = client.post(completion_url, headers=headers, json=replacement)
            self.assertEqual(resubmitted.status_code, 201, resubmitted.text)
            self.assertEqual(record.status, "pending_review")
            approved = client.post(
                f"/api/project-lifecycle/admin/{record.request_company_id}/decision",
                headers=admin_headers,
                json={"decision": "approved"},
            )
            self.assertEqual(approved.status_code, 200)
            self.assertEqual(approved.json()["stage"], "approved")
            self.assertEqual(approved.json()["project"]["status"], "completed")
            public_projects = client.get("/api/projects?status=completed")
            self.assertEqual(public_projects.status_code, 200)
            self.assertTrue(any(project["id"] == submitted.json()["id"] for project in public_projects.json()))

            featured = client.patch(
                f"/api/project-lifecycle/admin/projects/{submitted.json()['id']}/featured",
                params={"featured": True},
                headers=admin_headers,
            )
            self.assertEqual(featured.status_code, 200)
            self.assertEqual(featured.json()["status"], "featured")

    def test_chat_filter_detects_spelled_iraqi_phone_social_handles_and_external_domains(self):
        from chat_moderation import detect_contact_violation

        self.assertEqual(
            detect_contact_violation("صفر سبعة سبعة واحد اثنين ثلاثة أربعة خمسة ستة سبعة ثمانية"),
            "Attempted phone number sharing in chat",
        )
        self.assertEqual(
            detect_contact_violation("Contact me on Telegram @solar_team"),
            "Attempted social media contact sharing in chat",
        )
        self.assertEqual(
            detect_contact_violation("See solar-example.com for details"),
            "External link detected",
        )
        self.assertEqual(
            detect_contact_violation("https://example.net/contact"),
            "External link detected",
        )
        self.assertEqual(
            detect_contact_violation("Meet me at 33.3152, 44.3661"),
            "Attempted exact location sharing in chat",
        )

    def test_admin_reporting_routes_are_protected_and_return_empty_data_cleanly(self):
        app = FastAPI()
        app.include_router(companies_router)

        def override_session():
            yield self.session

        app.dependency_overrides[get_session] = override_session
        with TestClient(app) as client:
            self.assertEqual(client.get("/api/companies/admin/revenue").status_code, 401)
            headers = {"Authorization": f"Bearer {self.admin_bearer()}"}
            revenue = client.get("/api/companies/admin/revenue", headers=headers)
            reports = client.get("/api/companies/admin/reports", headers=headers)
        self.assertEqual(revenue.status_code, 200)
        self.assertEqual(revenue.json(), [])
        self.assertEqual(reports.status_code, 200)
        self.assertEqual(reports.json(), [])

    def test_public_company_profile_never_exposes_phone_or_email(self):
        company_result = self.register()
        company = self.session.get(Company, company_result["id"])
        with self.assertRaises(HTTPException) as error:
            get_company(company.id, self.session)
        self.assertEqual(error.exception.status_code, 404)

        self.approve(company.id)
        public_profile = CompanyPublic.model_validate(
            get_company(company.id, self.session), from_attributes=True
        )
        public_fields = public_profile.model_dump().keys()
        self.assertIn("phone", public_fields)
        self.assertIsNone(public_profile.phone)
        self.assertNotIn("email", public_fields)
        self.assertEqual(public_profile.verification_status, "verified")
        self.assertIsNone(public_profile.support_phone)

        project = Project(
            company_id=company.id,
            title="Test rooftop installation",
            description="A completed hybrid home system",
            system_kwp=8.4,
            location_governorate="Baghdad",
            location_district="Mansour",
            installation_type="Hybrid rooftop",
            image_url="/projects/test.jpg",
            status="completed",
        )
        self.session.add(project)
        self.session.commit()
        public_projects = get_company_projects(company.id, self.session)
        self.assertEqual(public_projects[0]["title"], "Test rooftop installation")
        self.assertEqual(public_projects[0]["location"], "Baghdad · Mansour")

    def test_public_company_directory_only_lists_approved_companies_without_phones(self):
        pending_company = self.register(email="pending@example.com", projects_count=99, phone="07700000009")
        fewer_projects = self.register(email="fewer-projects@example.com", projects_count=4, phone="07700000001")
        more_projects_lower_rating = self.register(email="more-projects@example.com", projects_count=8, phone="07700000002")
        more_projects_higher_rating = self.register(email="higher-rating@example.com", projects_count=8, phone="07700000003")
        for company in (fewer_projects, more_projects_lower_rating, more_projects_higher_rating):
            self.approve(company["id"])
        self.session.get(Company, fewer_projects["id"]).rating = 5.0
        self.session.get(Company, more_projects_lower_rating["id"]).rating = 3.0
        self.session.get(Company, more_projects_higher_rating["id"]).rating = 4.0
        self.session.commit()

        listed = get_companies(self.session)
        listed_ids = [item.id for item in listed]
        self.assertNotIn(pending_company["id"], listed_ids)
        self.assertEqual(
            listed_ids,
            [more_projects_higher_rating["id"], more_projects_lower_rating["id"], fewer_projects["id"]],
        )
        self.assertIsNone(listed[0].phone)
        self.assertIsNone(listed[0].support_phone)

    def test_public_company_directory_ranks_a_varied_set_by_completed_portfolio(self):
        companies = [
            self.register(
                email=f"portfolio-{index}@example.com",
                projects_count=0,
                phone=f"077000000{index:02d}",
            )
            for index in range(1, 4)
        ]
        for company in companies:
            self.session.get(Company, company["id"]).verification_status = "verified"
        self.session.commit()

        for company_index, project_count in ((0, 1), (1, 3), (2, 2)):
            for project_index in range(project_count):
                self.session.add(Project(
                    title=f"Portfolio {company_index}-{project_index}",
                    company_id=companies[company_index]["id"],
                    location_governorate="Baghdad",
                    location_district="Test",
                    system_kwp=5,
                    installation_type="Hybrid",
                    image_url="",
                    status="completed",
                ))
        self.session.commit()

        listed = get_companies(self.session)
        listed_ids = [company.id for company in listed]

        self.assertEqual(
            listed_ids,
            [companies[1]["id"], companies[2]["id"], companies[0]["id"]],
        )
        self.assertEqual(
            [company.projects_count for company in listed],
            [3, 2, 1],
        )

    def test_public_company_endpoints_hide_new_company_until_admin_approves(self):
        company = self.register()
        rejected_company = self.register(email="rejected@example.com", phone="07700000001")
        app = FastAPI()
        app.include_router(companies_router)

        def override_session():
            yield self.session

        app.dependency_overrides[get_session] = override_session
        with TestClient(app) as client:
            listing = client.get("/api/companies")
            self.assertEqual(listing.status_code, 200)
            self.assertNotIn(company["id"], {row["id"] for row in listing.json()})
            self.assertNotIn(rejected_company["id"], {row["id"] for row in listing.json()})
            self.assertEqual(client.get(f"/api/companies/{company['id']}").status_code, 404)
            self.assertEqual(client.get(f"/api/companies/{company['id']}/projects").status_code, 404)

            approved = client.post(
                f"/api/companies/{company['id']}/verification",
                headers={"Authorization": f"Bearer {self.admin_bearer()}"},
                json={
                    "decision": "verified",
                    "identity_document_checked": True,
                    "business_document_checked": True,
                    "project_evidence_checked": True,
                    "license_checked": True,
                    "tax_record_checked": True,
                    "projects_checked": True,
                },
            )
            self.assertEqual(approved.status_code, 200)
            rejected = client.post(
                f"/api/companies/{rejected_company['id']}/verification",
                headers={"Authorization": f"Bearer {self.admin_bearer()}"},
                json={"decision": "rejected"},
            )
            self.assertEqual(rejected.status_code, 200)

            listing = client.get("/api/companies")
            self.assertIn(company["id"], {row["id"] for row in listing.json()})
            self.assertNotIn(rejected_company["id"], {row["id"] for row in listing.json()})
            self.assertEqual(client.get(f"/api/companies/{company['id']}").status_code, 200)
            self.assertEqual(client.get(f"/api/companies/{rejected_company['id']}").status_code, 404)

    def test_development_company_preview_is_explicit_and_never_changes_verification(self):
        pending_company = self.register()
        rejected_company = self.register(email="rejected-preview@example.com", phone="07700000002")
        rejected_record = self.session.get(Company, rejected_company["id"])
        if rejected_record is None:
            self.fail("Expected the seeded company record to exist")
        rejected_record.verification_status = "rejected"
        self.session.add(rejected_record)
        self.session.commit()
        app = FastAPI()
        app.include_router(companies_router)

        def override_session():
            yield self.session

        app.dependency_overrides[get_session] = override_session
        with patch.dict(
            os.environ,
            {"APP_ENV": "development", "UTU_COMPANY_PREVIEW_ENABLED": "true"},
        ), TestClient(app) as client:
            regular_listing = client.get("/api/companies")
            self.assertEqual(regular_listing.status_code, 200)
            self.assertNotIn(pending_company["id"], {row["id"] for row in regular_listing.json()})

            preview_response = client.get("/api/companies?include_preview=true")
            self.assertEqual(preview_response.status_code, 200)
            preview_rows = {row["id"]: row for row in preview_response.json()}
            self.assertIn(pending_company["id"], preview_rows)
            self.assertTrue(preview_rows[pending_company["id"]]["is_preview"])
            self.assertEqual(preview_rows[pending_company["id"]]["verification_status"], "pending")
            self.assertNotIn(rejected_company["id"], preview_rows)

        with patch.dict(
            os.environ,
            {"APP_ENV": "production", "UTU_COMPANY_PREVIEW_ENABLED": "true"},
        ), TestClient(app) as client:
            production_response = client.get("/api/companies?include_preview=true")
            self.assertEqual(production_response.status_code, 200)
            production_ids = {row["id"] for row in production_response.json()}
            self.assertNotIn(pending_company["id"], production_ids)

    def test_company_cannot_be_verified_without_all_checks_and_three_projects(self):
        company = self.register(projects_count=2)
        with self.assertRaises(HTTPException) as error:
            review_company(
                company["id"],
                CompanyVerificationReview(
                    decision="verified",
                    license_checked=True,
                    tax_record_checked=True,
                    projects_checked=True,
                ),
                self.session,
                self.admin_user(),
            )
        self.assertEqual(error.exception.status_code, 422)

    def test_admin_manual_override_approves_silver_and_gold_without_documents_or_projects(self):
        company_result = self.register(projects_count=0)
        company_id = company_result["id"]
        admin = self.admin_user()

        silver = review_company(
            company_id,
            CompanyVerificationReview(
                decision="identity_verified",
                identity_document_checked=True,
            ),
            self.session,
            admin,
        )
        self.assertEqual(silver.verification_status, "identity_verified")

        verification = self.session.get(CompanyVerification, company_id)
        self.assertTrue(verification.identity_document_checked)
        self.assertFalse(verification.business_document_checked)
        self.assertFalse(verification.project_evidence_checked)

        gold = review_company(
            company_id,
            CompanyVerificationReview(
                decision="verified",
                identity_document_checked=True,
                business_document_checked=True,
                project_evidence_checked=True,
            ),
            self.session,
            admin,
        )
        self.assertEqual(gold.verification_status, "verified")
        self.assertEqual(gold.projects_count, 0)
        self.assertTrue(verification.identity_document_checked)
        self.assertTrue(verification.business_document_checked)
        self.assertTrue(verification.project_evidence_checked)

    def test_admin_must_check_each_evidence_category(self):
        company = self.register()
        queue = list_pending_companies(self.session, self.admin_user())
        self.assertEqual(queue[0]["business_license_number"], "LIC-12345")
        self.assertEqual(queue[0]["tax_registration_number"], "TAX-12345")
        with self.assertRaises(HTTPException) as error:
            review_company(
                company["id"],
                CompanyVerificationReview(
                    decision="verified",
                    license_checked=True,
                    tax_record_checked=True,
                    projects_checked=False,
                ),
                self.session,
                self.admin_user(),
            )
        self.assertEqual(error.exception.status_code, 422)

    def test_legacy_verified_company_retains_status_without_evidence(self):
        company = Company(
            name="Legacy Solar",
            founded_year=2010,
            projects_count=0,
            phone="+9647700000000",
            verification_status="verified",
        )
        self.session.add(company)
        self.session.commit()
        self.session.refresh(company)

        migrate_company_verification(self.session)

        self.session.refresh(company)
        self.assertEqual(company.verification_status, "verified")
        self.assertIsNotNone(self.session.get(CompanyVerification, company.id))
        company.verification_status = "verified"
        self.session.add(company)
        self.session.commit()
        migrate_company_verification(self.session)
        self.session.refresh(company)
        self.assertEqual(company.verification_status, "verified")

    def test_company_can_resubmit_verification_evidence(self):
        company = self.register()
        self.approve(company["id"])
        login = self.login_company_user(email="solar@example.com", password="a-long-test-password")
        result = update_verification_application(
            VerificationApplicationUpdate(
                business_license_number="LIC-NEW",
                tax_registration_number="TAX-NEW",
                projects_count=4,
            ),
            f"Bearer {login['access_token']}",
            self.session,
        )
        self.assertEqual(result["verification_status"], "verified")
        self.assertEqual(self.session.get(Company, company["id"]).projects_count, 4)

    def test_request_access_token_is_required_to_retrieve_request(self):
        company = self.register()
        self.approve(company["id"])
        request = self.request_for(company["id"])
        self.assertEqual(list_quote_requests(request["access_token"], self.session)[0]["group_id"], request["group_id"])
        with self.assertRaises(HTTPException) as error:
            list_quote_requests("x" * 40, self.session)
        self.assertEqual(error.exception.status_code, 404)

    def test_company_login_can_read_inbox_and_submit_real_quote(self):
        company = self.register()
        self.approve(company["id"])
        login = self.login_company_user(email="solar@example.com", password="a-long-test-password")
        request = self.request_for(company["id"])
        authorization = f"Bearer {login['access_token']}"
        inbox = company_requests(authorization, self.session)
        # Reading the inbox (also done by background polling) does not mark
        # anything as viewed; opening the request does.
        self.assertEqual(inbox[0]["companies"][0]["status"], "sent")
        viewed = mark_request_viewed(inbox[0]["group_id"], authorization, self.session)
        self.assertEqual(viewed["status"], "viewed")
        inbox = company_requests(authorization, self.session)
        self.assertEqual(inbox[0]["companies"][0]["status"], "viewed")

        submit_company_quote(
            request["group_id"],
            company["id"],
            QuoteCreate(
                total_iqd=12_000_000,
                panel_iqd=4_000_000,
                inverter_iqd=3_000_000,
                battery_iqd=2_000_000,
                installation_iqd=3_000_000,
                capacity_kwp=8.4,
                panel_brand="Test Panel",
                inverter_brand="Test Inverter",
                battery_brand="Test Battery",
                warranty="10 years",
                install_days=5,
            ),
            authorization,
            self.session,
        )
        customer_view = list_quote_requests(request["access_token"], self.session)[0]
        self.assertEqual(customer_view["companies"][0]["status"], "quoted")
        self.assertEqual(customer_view["companies"][0]["quote"]["total_iqd"], 12_000_000)
        self.assertEqual(customer_view["companies"][0]["quote"]["panel_iqd"], 4_000_000)

    def test_company_login_normalizes_email_case_and_surrounding_whitespace(self):
        registered = self.register()

        response = auth_login(
            LoginRequest(email="  SOLAR@EXAMPLE.COM  ", password="a-long-test-password"),
            self.session,
        )

        self.assertEqual(response.user.company_id, registered["id"])
        self.assertTrue(response.access_token)

    def test_pending_company_is_hidden_but_can_receive_direct_requests(self):
        company = self.register()
        listings = get_companies(self.session)
        self.assertNotIn(company["id"], {item.id for item in listings})
        self.assertEqual(self.request_for(company["id"])["companies"][0]["status"], "sent")

    def test_quote_request_api_returns_validated_created_and_private_read_shapes(self):
        company = self.register()
        app = FastAPI()
        app.include_router(quote_requests_router)

        def override_session():
            yield self.session

        app.dependency_overrides[get_session] = override_session
        with TestClient(app) as client:
            created = client.post("/api/quote-requests", json={
                "company_ids": [company["id"]],
                "customer_name": "Test Customer",
                "customer_phone": "07711111111",
                "system_kwp": 8.4,
                "battery_kwh": 10.2,
                "panel_count": 12,
                "details": {"governorate": "baghdad"},
            })
            self.assertEqual(created.status_code, 201)
            created_body = created.json()
            self.assertTrue(created_body["access_token"])
            self.assertEqual(created_body["companies"][0]["status"], "sent")
            self.assertEqual(len(created_body["companies"]), 1)

            fetched = client.get(
                "/api/quote-requests",
                params={"access_token": created_body["access_token"]},
            )
            self.assertEqual(fetched.status_code, 200)
            self.assertNotIn("access_token", fetched.json()[0])
            self.assertEqual(fetched.json()[0]["group_id"], created_body["group_id"])

    def test_company_with_no_portfolio_projects_returns_empty_list(self):
        company = self.register()
        self.approve(company["id"])
        app = FastAPI()
        app.include_router(companies_router)

        def override_session():
            yield self.session

        app.dependency_overrides[get_session] = override_session
        with TestClient(app) as client:
            response = client.get(f"/api/companies/{company['id']}/projects")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_pending_company_cannot_open_inbox_or_submit_quote(self):
        company = self.register()
        visible_companies = {item.id: item for item in get_companies(self.session)}
        self.assertNotIn(company["id"], visible_companies)
        login = self.login_company_user(email="solar@example.com", password="a-long-test-password")
        request = self.request_for(company["id"])
        authorization = f"Bearer {login['access_token']}"
        # Unverified companies cannot read customer requests at all.
        with self.assertRaises(HTTPException) as inbox_error:
            company_requests(authorization, self.session)
        self.assertEqual(inbox_error.exception.status_code, 403)
        with self.assertRaises(HTTPException) as error:
            submit_company_quote(
                request["group_id"],
                company["id"],
                QuoteCreate(
                    total_iqd=11_000_000,
                    capacity_kwp=8.4,
                    panel_brand="Pending Panel",
                    inverter_brand="Pending Inverter",
                    battery_brand="Pending Battery",
                    warranty="5 years",
                    install_days=7,
                ),
                authorization,
                self.session,
            )
        self.assertEqual(error.exception.status_code, 403)
        result = list_quote_requests(request["access_token"], self.session)[0]
        self.assertEqual(result["companies"][0]["status"], "sent")
        self.assertEqual(self.session.get(Company, company["id"]).verification_status, "pending")

    def test_customer_can_select_only_a_submitted_quote(self):
        company = self.register()
        self.approve(company["id"])
        login = self.login_company_user(email="solar@example.com", password="a-long-test-password")
        request = self.request_for(company["id"])
        submit_company_quote(
            request["group_id"],
            company["id"],
            QuoteCreate(
                total_iqd=10_000_000,
                capacity_kwp=8.4,
                panel_brand="Panel",
                inverter_brand="Inverter",
                battery_brand="Battery",
                warranty="5 years",
                install_days=5,
            ),
            f"Bearer {login['access_token']}",
            self.session,
        )

        chosen = choose_company_quote(
            request["group_id"], company["id"], request["access_token"], self.session
        )
        self.assertEqual(chosen["companies"][0]["status"], "selected")
        with self.assertRaises(HTTPException) as error:
            choose_company_quote(
                request["group_id"], company["id"], "x" * 40, self.session
            )
        self.assertEqual(error.exception.status_code, 404)

    def test_company_can_mark_a_quoted_request_completed_and_link_customer_project(self):
        company_result = self.register()
        self.approve(company_result["id"])
        login = self.login_company_user(email="solar@example.com", password="a-long-test-password")
        request = self.request_for(company_result["id"])
        authorization = f"Bearer {login['access_token']}"
        submit_company_quote(
            request["group_id"],
            company_result["id"],
            QuoteCreate(
                total_iqd=12_000_000,
                capacity_kwp=8.4,
                panel_brand="Test Panel",
                inverter_brand="Test Inverter",
                battery_brand="Test Battery",
                warranty="10 years",
                install_days=5,
            ),
            authorization,
            self.session,
        )
        with self.assertRaises(HTTPException) as unaccepted:
            complete_company_installation(
                request["group_id"],
                CompletedInstallation(
                    title="Premature completion",
                    installation_type="Hybrid rooftop",
                    proof_data_base64=base64.b64encode(b"\x89PNG\r\n\x1a\nUTU-test-proof").decode("ascii"),
                    proof_content_type="image/png",
                    proof_file_name="installation.png",
                ),
                authorization,
                self.session,
            )
        self.assertEqual(unaccepted.exception.status_code, 409)
        choose_company_quote(request["group_id"], company_result["id"], request["access_token"], self.session)
        confirm_deposit_payment(
            request["group_id"],
            company_result["id"],
            DepositPaymentCreate(payment_method="zaincash", phone_number="07711111111"),
            request["access_token"],
            self.session,
            None,
        )
        company_user = self.session.exec(
            select(User).where(User.company_id == company_result["id"])
        ).one()
        completion_payload = CompletedInstallation(
            title="Completed customer system",
            description="Installed and commissioned.",
            installation_type="Hybrid rooftop",
            proof_data_base64=base64.b64encode(b"\x89PNG\r\n\x1a\nUTU-test-proof").decode("ascii"),
            proof_content_type="image/png",
            proof_file_name="installation.png",
        )
        with self.assertRaises(HTTPException) as unauthorized_start:
            complete_company_installation(
                request["group_id"], completion_payload, authorization, self.session
            )
        self.assertEqual(unauthorized_start.exception.status_code, 409)
        sign_contract_as_customer(
            request["group_id"],
            company_result["id"],
            request["access_token"],
            self.session,
            None,
        )
        sign_contract_as_company(
            request["group_id"],
            company_result["id"],
            authorization,
            self.session,
            company_user,
        )
        lifecycle = self.session.exec(select(ProjectLifecycleRecord)).one()
        authorize_project_work(lifecycle.request_company_id, self.session, self.admin_user())

        completed = complete_company_installation(
            request["group_id"], completion_payload, authorization, self.session
        )

        self.assertEqual(completed["status"], "in_progress")
        lifecycle = self.session.exec(select(ProjectLifecycleRecord)).one()
        self.assertEqual(lifecycle.status, "pending_review")
        self.assertEqual(completed["quote_request_id"], self.session.exec(
            select(QuoteRequest).where(QuoteRequest.group_id == request["group_id"])
        ).first().id)
        self.assertEqual(completed["client_name"], "Test C.")

    def test_rejected_company_is_hidden_and_cannot_receive_requests(self):
        company = self.register()
        review_company(
            company["id"],
            CompanyVerificationReview(decision="rejected"),
            self.session,
            self.admin_user(),
        )
        listings = get_companies(self.session)
        self.assertNotIn(company["id"], {item.id for item in listings})
        with self.assertRaises(HTTPException) as error:
            self.request_for(company["id"])
        self.assertEqual(error.exception.status_code, 422)

    def test_old_company_login_and_admin_token_are_gone(self):
        self.register()
        app = FastAPI()
        app.include_router(companies_router)
        app.include_router(company_portal_router)

        def override_session():
            yield self.session

        app.dependency_overrides[get_session] = override_session
        with patch.dict(os.environ, {"UTU_ADMIN_TOKEN": "old-shared-admin-token"}):
            with TestClient(app) as client:
                old_login = client.post(
                    "/api/companies/login",
                    json={"email": "solar@example.com", "password": "a-long-test-password"},
                )
                old_register = client.post(
                    "/api/companies/register",
                    json={"name": "Legacy Solar", "email": "legacy@example.com", "password": "a-long-test-password"},
                )
                old_logout = client.post("/api/companies/logout")
                shared_token = client.get(
                    "/api/companies/admin/pending",
                    headers={"X-Admin-Token": "old-shared-admin-token"},
                )
                random_session = client.get(
                    "/api/company/requests",
                    headers={"Authorization": "Bearer an-old-opaque-company-session-token"},
                )
                admin_jwt = client.get(
                    "/api/companies/admin/pending",
                    headers={"Authorization": f"Bearer {self.admin_bearer()}"},
                )
        self.assertIn(old_login.status_code, {404, 405})
        self.assertIn(old_register.status_code, {404, 405})
        self.assertIn(old_logout.status_code, {404, 405})
        self.assertEqual(shared_token.status_code, 401)
        self.assertEqual(random_session.status_code, 401)
        self.assertEqual(admin_jwt.status_code, 200)

    def test_non_admin_accounts_cannot_use_admin_endpoints(self):
        company = self.register()
        company_user = self.session.exec(select(User).where(User.company_id == company["id"])).one()
        with self.assertRaises(HTTPException) as as_company:
            list_pending_companies(self.session, company_user)
        self.assertEqual(as_company.exception.status_code, 403)
        with self.assertRaises(HTTPException) as anonymous:
            list_pending_companies(self.session, None)
        self.assertEqual(anonymous.exception.status_code, 401)

    def test_password_reset_requires_email_configuration(self):
        self.register()
        with patch("companies.smtp_is_configured", return_value=False):
            with self.assertRaises(HTTPException) as error:
                request_password_reset(PasswordResetRequest(email="solar@example.com"), self.session)
        self.assertEqual(error.exception.status_code, 503)
        self.assertEqual(error.exception.detail, "Company password recovery email is not configured")

    def test_expired_password_reset_link_is_rejected(self):
        self.register()
        with patch("companies.smtp_is_configured", return_value=True), patch(
            "companies.send_password_reset_email"
        ) as send_email:
            request_password_reset(PasswordResetRequest(email="solar@example.com"), self.session)
        reset_token = send_email.call_args.args[1]
        reset = self.session.exec(select(CompanyPasswordResetToken)).one()
        reset.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        self.session.add(reset)
        self.session.commit()
        with self.assertRaises(HTTPException) as error:
            confirm_password_reset(
                PasswordResetConfirm(token=reset_token, new_password="another-long-password"),
                self.session,
            )
        self.assertEqual(error.exception.status_code, 400)

    def test_password_reset_is_generic_one_time_and_revokes_sessions(self):
        self.register()
        original_login = self.login_company_user(email="solar@example.com", password="a-long-test-password")
        with patch("companies.smtp_is_configured", return_value=True), patch(
            "companies.send_password_reset_email"
        ) as send_email:
            unknown = request_password_reset(
                PasswordResetRequest(email="unknown@example.com"), self.session
            )
            accepted = request_password_reset(
                PasswordResetRequest(email="solar@example.com"), self.session
            )
        self.assertEqual(unknown, accepted)
        reset_token = send_email.call_args.args[1]

        confirm_password_reset(
            PasswordResetConfirm(token=reset_token, new_password="another-long-password"),
            self.session,
        )
        with self.assertRaises(HTTPException) as expired:
            confirm_password_reset(
                PasswordResetConfirm(token=reset_token, new_password="third-long-password"),
                self.session,
            )
        self.assertEqual(expired.exception.status_code, 400)

        with self.assertRaises(HTTPException) as old_session:
            company_requests(f"Bearer {original_login['access_token']}", self.session)
        self.assertEqual(old_session.exception.status_code, 401)
        self.login_company_user(email="solar@example.com", password="another-long-password")


    def test_quote_is_locked_once_the_customer_accepts(self):
        first = self.register(email="first@example.com", phone="07700000001")
        second = self.register(email="second@example.com", phone="07700000002")
        self.approve(first["id"])
        self.approve(second["id"])
        request = create_quote_request(
            QuoteRequestCreate(
                company_ids=[first["id"], second["id"]],
                customer_name="Test Customer",
                customer_phone="07711111111",
                system_kwp=8.4,
                battery_kwh=10.2,
                panel_count=12,
                details={"governorate": "baghdad"},
            ),
            self.session,
        )
        first_auth = self.company_auth("first@example.com")
        second_auth = self.company_auth("second@example.com")
        submit_company_quote(request["group_id"], first["id"], self.simple_quote(), first_auth, self.session)
        submit_company_quote(request["group_id"], second["id"], self.simple_quote(9_000_000), second_auth, self.session)
        choose_company_quote(request["group_id"], first["id"], request["access_token"], self.session)

        with self.assertRaises(HTTPException) as changed_price:
            submit_company_quote(
                request["group_id"], first["id"], self.simple_quote(15_000_000), first_auth, self.session
            )
        self.assertEqual(changed_price.exception.status_code, 409)
        with self.assertRaises(HTTPException) as late_competitor:
            submit_company_quote(
                request["group_id"], second["id"], self.simple_quote(8_000_000), second_auth, self.session
            )
        self.assertEqual(late_competitor.exception.status_code, 409)

        view = list_quote_requests(request["access_token"], self.session)[0]
        accepted = next(item for item in view["companies"] if item["company_id"] == first["id"])
        self.assertEqual(accepted["status"], "selected")
        self.assertEqual(accepted["quote"]["total_iqd"], 10_000_000)

    def test_completion_review_preserves_active_deposit_status_until_admin_approval(self):
        company = self.register()
        self.approve(company["id"])
        authorization = self.company_auth()
        request = self.request_for(company["id"])
        submit_company_quote(request["group_id"], company["id"], self.simple_quote(), authorization, self.session)
        with_deposit = confirm_deposit_payment(
            request["group_id"],
            company["id"],
            DepositPaymentCreate(payment_method="zaincash", phone_number="07711111111"),
            request["access_token"],
            self.session,
            None,
        )
        self.assertEqual(with_deposit["status"], "in_progress")
        self.assertEqual(with_deposit["companies"][0]["payment"]["payment_status"], "simulated")
        self.assertEqual(with_deposit["companies"][0]["payment"]["commission_status"], "simulated")

        company_user = self.session.exec(select(User).where(User.company_id == company["id"])).one()
        sign_contract_as_customer(
            request["group_id"],
            company["id"],
            request["access_token"],
            self.session,
            None,
        )
        sign_contract_as_company(
            request["group_id"],
            company["id"],
            authorization,
            self.session,
            company_user,
        )
        lifecycle = self.session.exec(select(ProjectLifecycleRecord)).one()
        authorize_project_work(lifecycle.request_company_id, self.session, self.admin_user())
        complete_company_installation(
            request["group_id"],
            CompletedInstallation(
                title="Finished system",
                installation_type="Hybrid rooftop",
                proof_data_base64=base64.b64encode(b"\x89PNG\r\n\x1a\nUTU-test-proof").decode("ascii"),
                proof_content_type="image/png",
                proof_file_name="installation.png",
            ),
            authorization,
            self.session,
        )
        finished = list_quote_requests(request["access_token"], self.session)[0]
        self.assertEqual(finished["status"], "in_progress")

    def test_a_request_can_go_to_at_most_three_companies(self):
        with self.assertRaises(ValidationError):
            QuoteRequestCreate(
                company_ids=[1, 2, 3, 4],
                customer_name="Test Customer",
                customer_phone="07711111111",
                system_kwp=8.4,
                battery_kwh=10.2,
                panel_count=12,
            )
        allowed = QuoteRequestCreate(
            company_ids=[1, 2, 3],
            customer_name="Test Customer",
            customer_phone="07711111111",
            system_kwp=8.4,
            battery_kwh=10.2,
            panel_count=12,
        )
        self.assertEqual(allowed.company_ids, [1, 2, 3])


if __name__ == "__main__":
    unittest.main()
