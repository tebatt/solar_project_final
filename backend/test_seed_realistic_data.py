import csv

import pytest
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from auth import _authenticate
from models import Company, Project, Review, User
from security import verify_password
from seed_realistic_data import (
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    COMPANY_PASSWORD,
    CUSTOMER_PASSWORD,
    CUSTOMERS,
    DEMO_REVIEW_MARKER,
    PROJECTS,
    REVIEW_PROJECT_NUMBERS,
    SEED_PREFIX,
    read_companies_csv,
    seed_data,
)


@pytest.fixture
def seed_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def _write_csv(path, companies):
    headers = [
        "Company Name",
        "License Type",
        "Type of Services",
        "Sub Category",
        "Description",
        "Founded Date (Year)",
        "Operation Location (city)",
        "Email",
        "Phone Number",
    ]
    with path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=headers)
        writer.writeheader()
        writer.writerows(companies)


def _company_rows(count=15):
    return [
        {
            "Company Name": f"Seed Solar Company {index:03d}",
            "Type of Services": "Installation, Maintenance",
            "Sub Category": "Solar energy",
            "Description": "Demo company profile",
            "Founded Date (Year)": str(2000 + index),
            "Operation Location (city)": "Erbil",
            "Email": f"info{index}@example.iq",
            "Phone Number": f"0770000{index:04d}",
        }
        for index in range(1, count + 1)
    ]


def test_csv_parser_supports_multiline_fields_and_skips_blank_names(tmp_path):
    path = tmp_path / "companies.csv"
    rows = _company_rows(2)
    rows[0]["Description"] = "First line\nSecond line"
    rows[1]["Company Name"] = "  "
    _write_csv(path, rows)

    companies = read_companies_csv(path)

    assert len(companies) == 1
    assert companies[0]["name"] == "Seed Solar Company 001"
    assert companies[0]["description"] == "First line Second line"
    assert companies[0]["email"] == "info1@example.iq"


def test_csv_parser_rejects_missing_company_name_column(tmp_path):
    path = tmp_path / "companies.csv"
    path.write_text("Name,Email\nExample,info@example.iq\n", encoding="utf-8")

    with pytest.raises(ValueError, match="Company Name"):
        read_companies_csv(path)


def test_seed_creates_15_completed_projects_reviews_and_login_accounts(tmp_path, seed_session):
    path = tmp_path / "companies.csv"
    _write_csv(path, _company_rows())

    summary = seed_data(seed_session, path)

    projects = seed_session.exec(
        select(Project).where(Project.demo_key.like(f"{SEED_PREFIX}-project-%"))
    ).all()
    reviews = seed_session.exec(select(Review)).all()
    companies = seed_session.exec(
        select(Company).where(Company.demo_key.like(f"{SEED_PREFIX}-company-%"))
    ).all()
    accounts = seed_session.exec(
        select(User).where(User.demo_key.like(f"{SEED_PREFIX}-%"))
    ).all()

    assert summary.company_count == 15
    assert summary.customer_count == 15
    assert summary.project_count == 15
    assert summary.review_count == 8
    assert len(projects) == len(PROJECTS) == 15
    assert all(project.status == "completed" and project.completed_at for project in projects)
    assert len(reviews) == len(REVIEW_PROJECT_NUMBERS) == 8
    assert all(not review.is_verified and review.comment.startswith(DEMO_REVIEW_MARKER) for review in reviews)
    assert {account.full_name for account in accounts if account.role == "client"} == {
        name for name, _city in CUSTOMERS
    }
    assert all("تجريبي" not in name for name, _city in CUSTOMERS)
    assert all(DEMO_REVIEW_MARKER in review.comment for review in reviews)
    projects_by_key = {project.demo_key: project for project in projects}
    reviewed_projects = {review.project_id for review in reviews}
    assert reviewed_projects == {
        projects_by_key[f"{SEED_PREFIX}-project-{index:02d}"].id
        for index in REVIEW_PROJECT_NUMBERS
    }
    assert len(companies) == 15
    assert all(company.verification_status == "pending" for company in companies)
    assert len(accounts) == 31
    assert all(
        not account.is_verified
        for account in accounts
        if account.role == "company"
    )

    admin = seed_session.exec(select(User).where(User.email == ADMIN_EMAIL)).one()
    assert admin.role == "admin"
    assert verify_password(ADMIN_PASSWORD, admin.hashed_password)
    assert _authenticate(ADMIN_EMAIL, ADMIN_PASSWORD, seed_session).id == admin.id
    company_user = seed_session.exec(select(User).where(User.email == "company001@seed.utu.iq")).one()
    assert company_user.role == "company"
    assert company_user.company_id is not None
    assert verify_password(COMPANY_PASSWORD, company_user.hashed_password)
    assert _authenticate(company_user.email, COMPANY_PASSWORD, seed_session).id == company_user.id
    customer = seed_session.exec(select(User).where(User.email == "customer01@seed.utu.iq")).one()
    assert customer.role == "client"
    assert verify_password(CUSTOMER_PASSWORD, customer.hashed_password)
    assert _authenticate(customer.email, CUSTOMER_PASSWORD, seed_session).id == customer.id

    descriptions = [project.description for project in projects]
    assert sum("تقسيط مالي" in description for description in descriptions) == 5
    assert sum("المبادرة الخضراء" in description for description in descriptions) == 5
    assert sum("طلب عادي / دفع مباشر" in description for description in descriptions) == 5
    assert all(any("\u0600" <= char <= "\u06ff" for char in review.comment) for review in reviews)
    assert all(not any("A" <= char <= "Z" or "a" <= char <= "z" for char in review.comment) for review in reviews)
    assert all("\u0600" <= project.title[0] <= "\u06ff" for project in projects)


def test_seed_is_idempotent_and_preserves_unrelated_rows(tmp_path, seed_session):
    path = tmp_path / "companies.csv"
    _write_csv(path, _company_rows())
    unrelated = User(
        email="existing@example.iq",
        hashed_password="untouched",
        full_name="Existing Account",
        role="client",
    )
    seed_session.add(unrelated)
    seed_session.commit()

    seed_data(seed_session, path)
    first_ids = {
        "company": [item.id for item in seed_session.exec(select(Company)).all()],
        "project": [item.id for item in seed_session.exec(select(Project)).all()],
        "review": [item.id for item in seed_session.exec(select(Review)).all()],
    }
    admin_hash = seed_session.exec(select(User).where(User.email == ADMIN_EMAIL)).one().hashed_password
    first_company = seed_session.exec(
        select(Company).where(Company.demo_key == f"{SEED_PREFIX}-company-001")
    ).one()
    first_company.verification_status = "verified"
    seed_session.add(first_company)
    seed_session.commit()
    seed_data(seed_session, path)

    assert len(seed_session.exec(select(Company)).all()) == 15
    assert len(seed_session.exec(select(Project)).all()) == 15
    assert len(seed_session.exec(select(Review)).all()) == 8
    assert {
        "company": [item.id for item in seed_session.exec(select(Company)).all()],
        "project": [item.id for item in seed_session.exec(select(Project)).all()],
        "review": [item.id for item in seed_session.exec(select(Review)).all()],
    } == first_ids
    assert seed_session.get(User, unrelated.id).hashed_password == "untouched"
    assert seed_session.exec(select(User).where(User.email == ADMIN_EMAIL)).one().hashed_password == admin_hash
    assert seed_session.get(Company, first_company.id).verification_status == "verified"


def test_seed_reduces_legacy_demo_reviews_to_half_and_preserves_unrelated_reviews(tmp_path, seed_session):
    path = tmp_path / "companies.csv"
    _write_csv(path, _company_rows())
    seed_data(seed_session, path)

    projects = seed_session.exec(
        select(Project).where(Project.demo_key.like(f"{SEED_PREFIX}-project-%"))
    ).all()
    company = seed_session.exec(select(Company).limit(1)).one()
    for project in projects:
        if project.id not in {review.project_id for review in seed_session.exec(select(Review)).all()}:
            seed_session.add(Review(
                project_id=project.id,
                company_id=company.id,
                client_name="عميل تجريبي",
                rating=4.5,
                communication_rating=4.5,
                work_quality_rating=4.5,
                comment=f"{DEMO_REVIEW_MARKER} مراجعة تجريبية قديمة",
                is_verified=False,
            ))
    unreviewed_project = next(
        project for project in projects
        if int(project.demo_key.rsplit("-", 1)[1]) not in REVIEW_PROJECT_NUMBERS
    )
    unrelated = seed_session.exec(
        select(Review).where(Review.project_id == unreviewed_project.id)
    ).one()
    unrelated.comment = "مراجعة مستقلة يجب الحفاظ عليها"
    seed_session.add(unrelated)
    seed_session.commit()

    seed_data(seed_session, path)

    remaining = seed_session.exec(select(Review)).all()
    assert len(remaining) == len(REVIEW_PROJECT_NUMBERS) + 1
    assert seed_session.get(Review, unrelated.id).comment == "مراجعة مستقلة يجب الحفاظ عليها"
    assert all(
        review.comment.startswith(DEMO_REVIEW_MARKER)
        for review in remaining
        if review.id != unrelated.id
    )


def test_seed_upgrades_legacy_english_demo_reviews_to_arabic(tmp_path, seed_session):
    path = tmp_path / "companies.csv"
    _write_csv(path, _company_rows())
    seed_data(seed_session, path)
    review = seed_session.exec(select(Review)).first()
    review.comment = "Seeded demo review (not customer testimony): legacy seeded review"
    seed_session.add(review)
    seed_session.commit()

    seed_data(seed_session, path)

    upgraded = seed_session.get(Review, review.id)
    assert upgraded.comment.startswith(DEMO_REVIEW_MARKER)
    assert any("\u0600" <= char <= "\u06ff" for char in upgraded.comment)


def test_seed_skips_existing_account_email_collision_and_continues(tmp_path, seed_session):
    path = tmp_path / "companies.csv"
    _write_csv(path, _company_rows())
    seed_session.add(User(
        email=ADMIN_EMAIL,
        hashed_password="existing",
        full_name="Existing non-seed account",
        role="client",
    ))
    seed_session.commit()

    summary = seed_data(seed_session, path)

    assert len(seed_session.exec(select(Company)).all()) == 15
    assert len(seed_session.exec(select(Project)).all()) == 15
    assert len(seed_session.exec(select(Review)).all()) == 8
    assert len(seed_session.exec(select(User)).all()) == 31
    assert "admin@utu.iq" not in {account.email for account in summary.accounts}
    assert any("admin@utu.iq" in item for item in summary.skipped_records)
    assert seed_session.exec(select(User).where(User.email == ADMIN_EMAIL)).one().role == "client"


def test_seed_reuses_existing_company_without_changing_it_or_aborting(tmp_path, seed_session):
    path = tmp_path / "companies.csv"
    _write_csv(path, _company_rows())
    original = Company(
        name="Seed Solar Company 001",
        founded_year=1998,
        phone="07700000000",
        verification_status="verified",
    )
    seed_session.add(original)
    seed_session.commit()

    summary = seed_data(seed_session, path)

    assert len(seed_session.exec(select(Company)).all()) == 15
    assert len(seed_session.exec(select(Project)).all()) == 15
    assert len(seed_session.exec(select(Review)).all()) == 8
    assert original.founded_year == 1998
    assert original.verification_status == "verified"
    assert any("Seed Solar Company 001" in item for item in summary.skipped_records)


def test_seed_skips_company_login_email_collision_and_continues(tmp_path, seed_session):
    path = tmp_path / "companies.csv"
    _write_csv(path, _company_rows())
    original = Company(
        name="Seed Solar Company 001",
        founded_year=1998,
        phone="07700000000",
        verification_status="verified",
    )
    conflicting_user = User(
        email="company001@seed.utu.iq",
        hashed_password="do-not-change",
        full_name="Existing Account",
        role="client",
    )
    seed_session.add(original)
    seed_session.add(conflicting_user)
    seed_session.commit()

    summary = seed_data(seed_session, path)

    assert len(seed_session.exec(select(Company)).all()) == 15
    assert len(seed_session.exec(select(Project)).all()) == 15
    assert len(seed_session.exec(select(Review)).all()) == 8
    assert "company001@seed.utu.iq" not in {account.email for account in summary.accounts}
    assert any("company001@seed.utu.iq" in item for item in summary.skipped_records)
    assert seed_session.get(User, conflicting_user.id).hashed_password == "do-not-change"
    assert seed_session.get(Company, original.id).verification_status == "verified"
