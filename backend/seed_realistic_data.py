"""Seed CSV companies and clearly labelled demo accounts/projects.

This script uses the existing SQLModel schema and never creates tables or runs
migrations. Run it only after the application has initialized its database.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import func, inspect
from sqlmodel import Session, select

from database import engine
from models import Company, Project, Review, User
from security import hash_password, verify_password

ADMIN_EMAIL = "admin@utu.iq"
ADMIN_PASSWORD = "AdminPass123!"
COMPANY_PASSWORD = "CompanyPass123!"
CUSTOMER_PASSWORD = "CustomerPass123!"
EMAIL_DOMAIN = "seed.utu.iq"
SEED_PREFIX = "utu-realistic-seed-v1"
DEMO_REVIEW_MARKER = "بيانات توضيحية:"
LEGACY_DEMO_REVIEW_MARKER = "Seeded demo review (not customer testimony):"
PREVIOUS_DEMO_REVIEW_MARKER = "تقييم تجريبي غير حقيقي ولا يمثل شهادة عميل:"
DEMO_REVIEW_MARKERS = (
    DEMO_REVIEW_MARKER,
    LEGACY_DEMO_REVIEW_MARKER,
    PREVIOUS_DEMO_REVIEW_MARKER,
)
PAYMENT_MODE_AR = {
    "Financial Installment": "تقسيط مالي",
    "Green Initiative": "المبادرة الخضراء",
    "Standard Direct Payment": "طلب عادي / دفع مباشر",
}

CUSTOMERS = [
    ("أحمد الفتلاوي", "Baghdad"),
    ("زينب الحمداني", "Basra"),
    ("عمر المشهداني", "Erbil"),
    ("مريم الساعدي", "Najaf"),
    ("مصطفى الجبوري", "Mosul"),
    ("حيدر الكرخي", "Kirkuk"),
    ("سارة التميمي", "Duhok"),
    ("حسين الخفاجي", "Sulaymaniyah"),
    ("نور اللامي", "Diwaniyah"),
    ("علي الشمري", "Ramadi"),
    ("فاطمة الموسوي", "Karbala"),
    ("كريم العبيدي", "Tikrit"),
    ("هدى الزيدي", "Amarah"),
    ("ياسر الكعبي", "Kut"),
    ("ليث الدليمي", "Baghdad"),
]

PROJECTS: list[dict[str, Any]] = [
    {
        "title": "منظومة منزلية هجينة - بغداد، المنصور",
        "mode": "Financial Installment",
        "category": "residential",
        "district": "Al-Mansour",
        "kwp": 8.8,
        "battery": 15.0,
        "panels": 16,
        "budget": 14_800_000,
        "installation": "Hybrid rooftop",
        "roof": "Reinforced concrete flat roof",
        "inverter": "8 kW hybrid inverter; lithium storage",
        "generation": 15_840,
        "rating": 4.8,
        "communication": 5.0,
        "quality": 4.7,
        "feedback": "الخدمة ممتازة، وتم التنصيب في الموعد مع شرح واضح لطريقة التشغيل والصيانة. تفاصيل الأقساط كانت مرتبة وسهلة المتابعة.",
        "before": {"grid_supply": "8 hours/day", "backup": "Small petrol generator"},
        "after": {"solar_capacity": "8.8 kWp", "battery_storage": "15 kWh", "estimated_generation": "15,840 kWh/year"},
    },
    {
        "title": "منظومة شمسية لمخازن التبريد - البصرة، العشار",
        "mode": "Green Initiative",
        "category": "commercial",
        "district": "Ashar",
        "kwp": 30.0,
        "battery": 40.0,
        "panels": 54,
        "budget": 43_500_000,
        "installation": "Commercial hybrid rooftop",
        "roof": "Insulated metal deck",
        "inverter": "30 kW three-phase hybrid inverter",
        "generation": 54_000,
        "rating": 4.6,
        "communication": 4.5,
        "quality": 4.7,
        "feedback": "كان تنفيذ المنظومة منظماً، ومعلومات الإنتاج والمتابعة واضحة. ساعدت مساهمة المبادرة على تخفيف كلفة المشروع.",
        "before": {"grid_supply": "6 hours/day", "backup": "Diesel generator"},
        "after": {"solar_capacity": "30 kWp", "battery_storage": "40 kWh", "estimated_generation": "54,000 kWh/year"},
    },
    {
        "title": "مشروع ضخ مياه بالطاقة الشمسية - أربيل، طريق كويا",
        "mode": "Standard Direct Payment",
        "category": "agricultural",
        "district": "Koya Road",
        "kwp": 12.0,
        "battery": 5.0,
        "panels": 22,
        "budget": 18_200_000,
        "installation": "Ground-mounted solar pumping system",
        "roof": "Ground-mounted structure",
        "inverter": "12 kW solar pump drive with backup inverter",
        "generation": 21_600,
        "rating": 4.9,
        "communication": 4.8,
        "quality": 5.0,
        "feedback": "تم تركيب منظومة الضخ بصورة مرتبة، وكان شرح تشغيل المضخة ومتابعة أدائها واضحاً.",
        "before": {"pump_supply": "Grid and generator", "operating_cost": "High fuel use"},
        "after": {"solar_capacity": "12 kWp", "battery_storage": "5 kWh", "estimated_generation": "21,600 kWh/year"},
    },
    {
        "title": "منظومة مجمع طبي - النجف، الحيدرية",
        "mode": "Financial Installment",
        "category": "commercial",
        "district": "Al-Haidariya",
        "kwp": 20.0,
        "battery": 30.0,
        "panels": 36,
        "budget": 31_000_000,
        "installation": "Three-phase hybrid rooftop",
        "roof": "Reinforced concrete flat roof",
        "inverter": "20 kW three-phase hybrid inverter",
        "generation": 36_000,
        "rating": 4.7,
        "communication": 4.6,
        "quality": 4.8,
        "feedback": "المنظومة مناسبة للأجهزة الأساسية في المجمع، وجدول الأقساط واضح وموزع على مراحل مفهومة.",
        "before": {"grid_supply": "7 hours/day", "critical_load_backup": "Limited"},
        "after": {"solar_capacity": "20 kWp", "battery_storage": "30 kWh", "estimated_generation": "36,000 kWh/year"},
    },
    {
        "title": "مشروع طاقة شمسية لمدرسة - الموصل، الزهور",
        "mode": "Green Initiative",
        "category": "commercial",
        "district": "Al-Zuhur",
        "kwp": 15.0,
        "battery": 20.0,
        "panels": 27,
        "budget": 22_500_000,
        "installation": "Hybrid rooftop",
        "roof": "Concrete roof with raised mounting",
        "inverter": "15 kW hybrid inverter with remote monitoring",
        "generation": 27_000,
        "rating": 4.9,
        "communication": 5.0,
        "quality": 4.8,
        "feedback": "جرى تنفيذ العمل بتنظيم، وتناسب المنظومة احتياجات المدرسة. ساهم برنامج المبادرة في خفض كلفة التجهيز.",
        "before": {"grid_supply": "9 hours/day", "classroom_backup": "Unreliable"},
        "after": {"solar_capacity": "15 kWp", "battery_storage": "20 kWh", "estimated_generation": "27,000 kWh/year"},
    },
    {
        "title": "منظومة تجارية لورشة صناعية - كركوك، رحيم آوه",
        "mode": "Standard Direct Payment",
        "category": "commercial",
        "district": "Rahimawa",
        "kwp": 25.0,
        "battery": 25.0,
        "panels": 45,
        "budget": 37_000_000,
        "installation": "Commercial hybrid",
        "roof": "Steel-frame workshop roof",
        "inverter": "25 kW three-phase hybrid inverter",
        "generation": 45_000,
        "rating": 4.5,
        "communication": 4.4,
        "quality": 4.6,
        "feedback": "كانت مواصفات المعدات والكلفة موضحة قبل التنفيذ، والمنظومة تلبي احتياجات الورشة خلال ساعات العمل.",
        "before": {"grid_supply": "5 hours/day", "backup": "Diesel generator"},
        "after": {"solar_capacity": "25 kWp", "battery_storage": "25 kWh", "estimated_generation": "45,000 kWh/year"},
    },
    {
        "title": "منظومة سكنية لمجمع شقق - دهوك، سميل",
        "mode": "Financial Installment",
        "category": "residential",
        "district": "Semel",
        "kwp": 10.0,
        "battery": 20.0,
        "panels": 18,
        "budget": 17_500_000,
        "installation": "Shared hybrid rooftop",
        "roof": "Concrete apartment roof",
        "inverter": "10 kW hybrid inverter; modular lithium battery",
        "generation": 18_000,
        "rating": 4.8,
        "communication": 4.8,
        "quality": 4.7,
        "feedback": "كان التواصل جيداً وخطة الأقساط واضحة، وتساعد البطاريات على تشغيل الأحمال الأساسية عند انقطاع الكهرباء.",
        "before": {"grid_supply": "8 hours/day", "shared_backup": "Building generator"},
        "after": {"solar_capacity": "10 kWp", "battery_storage": "20 kWh", "estimated_generation": "18,000 kWh/year"},
    },
    {
        "title": "مشروع طاقة شمسية لمزرعة - السليمانية، دوكان",
        "mode": "Green Initiative",
        "category": "agricultural",
        "district": "Dukan",
        "kwp": 18.0,
        "battery": 15.0,
        "panels": 32,
        "budget": 26_000_000,
        "installation": "Solar irrigation and hybrid backup",
        "roof": "Ground-mounted structure",
        "inverter": "18 kW solar pump inverter and hybrid backup",
        "generation": 32_400,
        "rating": 4.7,
        "communication": 4.8,
        "quality": 4.6,
        "feedback": "تناسب المنظومة تشغيل مضخة الري خلال النهار، وتقلل الحاجة إلى تشغيل مولدة الديزل.",
        "before": {"irrigation": "Diesel pump", "seasonal_fuel": "High"},
        "after": {"solar_capacity": "18 kWp", "battery_storage": "15 kWh", "estimated_generation": "32,400 kWh/year"},
    },
    {
        "title": "منظومة طاقة شمسية لمتجر - الديوانية، السوق المركزي",
        "mode": "Standard Direct Payment",
        "category": "commercial",
        "district": "Central Market",
        "kwp": 6.0,
        "battery": 10.0,
        "panels": 11,
        "budget": 9_900_000,
        "installation": "Hybrid rooftop",
        "roof": "Concrete roof",
        "inverter": "6 kW hybrid inverter",
        "generation": 10_800,
        "rating": 4.6,
        "communication": 4.5,
        "quality": 4.7,
        "feedback": "اكتمل التركيب حسب الجدول، وكان شرح شاشة متابعة الإنتاج مفيداً. تعمل الأجهزة المرتبطة بالمنظومة بصورة مستقرة.",
        "before": {"grid_supply": "7 hours/day", "backup": "Small generator"},
        "after": {"solar_capacity": "6 kWp", "battery_storage": "10 kWh", "estimated_generation": "10,800 kWh/year"},
    },
    {
        "title": "منظومة منزلية لفيلا - الرمادي، التأميم",
        "mode": "Financial Installment",
        "category": "residential",
        "district": "Al-Tamim",
        "kwp": 11.0,
        "battery": 20.0,
        "panels": 20,
        "budget": 18_900_000,
        "installation": "Hybrid rooftop",
        "roof": "Reinforced concrete flat roof",
        "inverter": "10 kW hybrid inverter with 20 kWh battery",
        "generation": 19_800,
        "rating": 4.9,
        "communication": 4.9,
        "quality": 4.8,
        "feedback": "كانت مراحل العمل والدفع موضحة من البداية ومرتبطة بتقدم التنصيب، مما سهّل متابعة المشروع.",
        "before": {"grid_supply": "6 hours/day", "backup": "Portable generator"},
        "after": {"solar_capacity": "11 kWp", "battery_storage": "20 kWh", "estimated_generation": "19,800 kWh/year"},
    },
    {
        "title": "مشروع طاقة شمسية لمكتبة عامة - كربلاء، الحسين",
        "mode": "Green Initiative",
        "category": "commercial",
        "district": "Al-Hussein",
        "kwp": 22.0,
        "battery": 35.0,
        "panels": 40,
        "budget": 34_000_000,
        "installation": "Hybrid rooftop with critical-load backup",
        "roof": "Reinforced concrete roof",
        "inverter": "22 kW three-phase hybrid inverter",
        "generation": 39_600,
        "rating": 4.8,
        "communication": 4.7,
        "quality": 4.9,
        "feedback": "تغطي المنظومة جزءاً من احتياج المكتبة للأحمال الأساسية، وساهمت المبادرة في تيسير تنفيذ المشروع.",
        "before": {"grid_supply": "8 hours/day", "reading_room_backup": "Partial"},
        "after": {"solar_capacity": "22 kWp", "battery_storage": "35 kWh", "estimated_generation": "39,600 kWh/year"},
    },
    {
        "title": "منظومة شمسية لمزرعة دواجن - تكريت، العلم",
        "mode": "Standard Direct Payment",
        "category": "agricultural",
        "district": "Al-Alam",
        "kwp": 16.0,
        "battery": 20.0,
        "panels": 29,
        "budget": 24_500_000,
        "installation": "Off-grid hybrid farm system",
        "roof": "Ground-mounted structure",
        "inverter": "16 kW off-grid inverter with battery backup",
        "generation": 28_800,
        "rating": 4.7,
        "communication": 4.6,
        "quality": 4.8,
        "feedback": "تم التجهيز والتشغيل بصورة منظمة، وتناسب قدرة المنظومة الأحمال المحددة للمزرعة.",
        "before": {"grid_supply": "Intermittent", "backup": "Diesel generator"},
        "after": {"solar_capacity": "16 kWp", "battery_storage": "20 kWh", "estimated_generation": "28,800 kWh/year"},
    },
    {
        "title": "منظومة مجمع طبي - العمارة، المجر",
        "mode": "Financial Installment",
        "category": "commercial",
        "district": "Al-Majar",
        "kwp": 9.0,
        "battery": 18.0,
        "panels": 16,
        "budget": 15_700_000,
        "installation": "Hybrid rooftop",
        "roof": "Concrete roof",
        "inverter": "9 kW hybrid inverter with essential-load circuits",
        "generation": 16_200,
        "rating": 4.5,
        "communication": 4.5,
        "quality": 4.5,
        "feedback": "كان التركيب منظماً وجدول الأقساط واضحاً، وتوفر البطاريات دعماً للأجهزة الأساسية في العيادة.",
        "before": {"grid_supply": "5 hours/day", "clinic_backup": "Unstable"},
        "after": {"solar_capacity": "9 kWp", "battery_storage": "18 kWh", "estimated_generation": "16,200 kWh/year"},
    },
    {
        "title": "مشروع طاقة شمسية لمزرعة نخيل - الكوت، الحي",
        "mode": "Green Initiative",
        "category": "agricultural",
        "district": "Al-Hayy",
        "kwp": 14.0,
        "battery": 12.0,
        "panels": 25,
        "budget": 21_000_000,
        "installation": "Solar irrigation with battery-backed controls",
        "roof": "Ground-mounted structure",
        "inverter": "14 kW solar pump inverter",
        "generation": 25_200,
        "rating": 4.9,
        "communication": 4.8,
        "quality": 5.0,
        "feedback": "تعمل مضخة الري بالطاقة الشمسية خلال النهار، وساعد النظام على تنظيم أوقات السقي.",
        "before": {"irrigation": "Fuel-powered pump", "water_schedule": "Manual"},
        "after": {"solar_capacity": "14 kWp", "battery_storage": "12 kWh", "estimated_generation": "25,200 kWh/year"},
    },
    {
        "title": "منظومة منزلية هجينة - بغداد، الكرادة",
        "mode": "Standard Direct Payment",
        "category": "residential",
        "district": "Al-Karrada",
        "kwp": 7.5,
        "battery": 12.0,
        "panels": 14,
        "budget": 12_600_000,
        "installation": "Hybrid rooftop",
        "roof": "Shaded concrete rooftop with elevated mounting",
        "inverter": "7.5 kW hybrid inverter with lithium storage",
        "generation": 13_500,
        "rating": 4.8,
        "communication": 4.7,
        "quality": 4.9,
        "feedback": "كان التنصيب في الموعد، وشرح الفريق تشغيل المنظومة وصيانتها بوضوح. الأداء مناسب للأحمال المتفق عليها.",
        "before": {"grid_supply": "7 hours/day", "backup": "Shared building generator"},
        "after": {"solar_capacity": "7.5 kWp", "battery_storage": "12 kWh", "estimated_generation": "13,500 kWh/year"},
    },
]

REVIEW_PROJECT_NUMBERS = frozenset(range(1, len(PROJECTS) + 1, 2))


@dataclass(frozen=True)
class SeedAccount:
    account_type: str
    name: str
    email: str
    password: str
    role: str


@dataclass(frozen=True)
class SeedSummary:
    company_count: int
    customer_count: int
    project_count: int
    review_count: int
    accounts: list[SeedAccount]
    skipped_records: list[str]


def _clean(value: Any) -> str:
    if value is None:
        return ""
    text = " ".join(str(value).split()).strip()
    if text.casefold() in {"", "none", "null", "not found", "n/a", "na"}:
        return ""
    return text


def _email(value: Any) -> str | None:
    candidate = _clean(value).lower()
    if re.fullmatch(r"[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+", candidate):
        return candidate
    return None


def _founded_year(value: Any) -> int:
    match = re.search(r"\b(?:19|20)\d{2}\b", _clean(value))
    if match:
        year = int(match.group(0))
        if 1900 <= year <= datetime.now(timezone.utc).year:
            return year
    return 2020


def read_companies_csv(path: Path) -> list[dict[str, Any]]:
    """Read the supplied CSV with multiline-field support and validate its shape."""
    if not path.is_file():
        raise FileNotFoundError(f"Companies CSV not found: {path}")

    with path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file, strict=True)
        if not reader.fieldnames:
            raise ValueError(f"Companies CSV is empty or has no header: {path}")

        headers = {header.strip().casefold(): header for header in reader.fieldnames if header}
        name_header = headers.get("company name")
        if not name_header:
            raise ValueError("Companies CSV must have a 'Company Name' column.")

        companies: list[dict[str, Any]] = []
        for row_number, row in enumerate(reader, start=2):
            if None in row:
                raise ValueError(f"CSV row {row_number} has more columns than the header.")
            name = _clean(row.get(name_header))
            if not name:
                continue
            companies.append({
                "name": name,
                "email": _email(row.get(headers.get("email", ""))),
                "phone": _clean(row.get(headers.get("phone number", ""))) or f"0770999{len(companies) + 1:04d}",
                "founded_year": _founded_year(row.get(headers.get("founded date (year)", ""))),
                "city": _clean(row.get(headers.get("operation location (city)", ""))) or "Iraq",
                "services": ", ".join(
                    value for value in (
                        _clean(row.get(headers.get("type of services", ""))),
                        _clean(row.get(headers.get("sub category", ""))),
                    ) if value
                ),
                "description": _clean(row.get(headers.get("description", ""))),
            })

    if not companies:
        raise ValueError("Companies CSV contains no non-empty company names.")
    return companies


def _find_owned(session: Session, model: Any, demo_key: str) -> Any | None:
    return session.exec(select(model).where(model.demo_key == demo_key)).first()


def _seed_user(
    session: Session,
    *,
    demo_key: str,
    email: str,
    name: str,
    role: str,
    password: str,
    company_id: int | None = None,
    verified: bool = False,
    skipped_records: list[str],
) -> User | None:
    user = _find_owned(session, User, demo_key)
    if user is None:
        email_owner = session.exec(
            select(User).where(User.email.ilike(email))
        ).first()
        if email_owner is not None:
            skipped_records.append(
                f"Account {email!r} was skipped because that email is already in use."
            )
            return None
        if company_id is not None:
            linked_account = session.exec(
                select(User).where(User.company_id == company_id)
            ).first()
            if linked_account is not None:
                skipped_records.append(
                    f"Company login {email!r} was skipped because company_id={company_id} "
                    f"already has account {linked_account.email!r}."
                )
                return None
        user = User(
            email=email,
            hashed_password=hash_password(password),
            full_name=name,
            role=role,
            is_active=True,
            is_verified=verified,
            company_id=company_id,
            demo_key=demo_key,
        )
        session.add(user)
        session.flush()
    else:
        if user.email.casefold() != email.casefold() or user.role != role:
            skipped_records.append(
                f"Account {email!r} was skipped because its seed key is attached "
                "to a different existing identity."
            )
            return None
        if not verify_password(password, user.hashed_password):
            user.hashed_password = hash_password(password)
        user.full_name = name
        user.is_active = True
        user.is_verified = verified
        user.company_id = company_id
        session.add(user)
        session.flush()
    return user


def _upsert_company(
    session: Session,
    data: dict[str, Any],
    index: int,
    skipped_records: list[str],
) -> Company:
    demo_key = f"{SEED_PREFIX}-company-{index:03d}"
    company = _find_owned(session, Company, demo_key)
    if company is None:
        same_name = session.exec(
            select(Company).where(
                func.lower(func.trim(Company.name)) == data["name"].strip().lower()
            )
        ).all()
        if same_name:
            company = same_name[0]
            skipped_records.append(
                f"Company {data['name']!r} matched existing company id={company.id}; "
                "the existing company record was reused without changing its details."
            )
        else:
            company = Company(
                name=data["name"],
                founded_year=data["founded_year"],
                phone=data["phone"],
                email=data["email"],
                address=f"{data['city']}, Iraq" if data["city"] != "Iraq" else "Iraq",
                verification_status="pending",
                service_offerings=data["services"] or data["description"] or "Solar energy services",
                demo_key=demo_key,
            )
            session.add(company)
    else:
        company.name = data["name"]
        company.founded_year = data["founded_year"]
        company.phone = data["phone"]
        company.email = data["email"]
        company.address = f"{data['city']}, Iraq" if data["city"] != "Iraq" else "Iraq"
        company.service_offerings = data["services"] or data["description"] or "Solar energy services"
        session.add(company)
    session.flush()
    return company


def _seed_project(
    session: Session,
    *,
    values: dict[str, Any],
    index: int,
    company: Company,
    customer: User | None,
) -> Project:
    demo_key = f"{SEED_PREFIX}-project-{index:02d}"
    project = _find_owned(session, Project, demo_key)
    if project is None:
        title_collision = session.exec(
            select(Project).where(Project.title == values["title"])
        ).first()
        if title_collision is not None:
            raise RuntimeError(
                f"Refusing to duplicate existing project {values['title']!r}."
            )
    completed_at = datetime(2026, 1 + (index - 1) % 12, 5 + (index - 1) % 22, tzinfo=timezone.utc)
    milestones = [
        "بيانات تجريبية: اكتمل التقييم الأولي للموقع",
        "بيانات تجريبية: اكتمل تركيب المعدات",
        f"بيانات تجريبية: اكتمل التسليم وفق نموذج {PAYMENT_MODE_AR[values['mode']]}",
    ]
    project_values = {
        "title": values["title"],
        "description": (
            "مشروع توضيحي تجريبي لعرض وظائف المنصة، وليس توثيقاً لتركيب حقيقي أو شهادة عميل. "
            f"نموذج الدفع: {PAYMENT_MODE_AR[values['mode']]}. "
            f"قدرة المنظومة {values['kwp']} كيلوواط ذروة مع بطاريات بسعة "
            f"{values['battery']} كيلوواط ساعة. {values['feedback']}"
        ),
        "category": values["category"],
        "system_size_label": f"{values['kwp']} kWp / {values['panels']} panels",
        "company_id": company.id,
        "client_name": customer.full_name if customer else CUSTOMERS[index - 1][0],
        "location_governorate": CUSTOMERS[index - 1][1],
        "location_district": values["district"],
        "system_kwp": values["kwp"],
        "battery_kwh": values["battery"],
        "installation_type": values["installation"],
        "rating": values["rating"],
        "image_url": "",
        "gallery_urls_json": "[]",
        "status": "completed",
        "completed_at": completed_at,
        "panel_count": values["panels"],
        "roof_type": values["roof"],
        "inverter_details": values["inverter"],
        "annual_generation_kwh": values["generation"],
        "testimonial": None,
        "budget_iqd": values["budget"],
        "milestones_json": json.dumps(milestones),
        "before_metrics_json": json.dumps(values["before"]),
        "after_metrics_json": json.dumps(values["after"]),
        "customer_user_id": customer.id if customer else None,
        "demo_key": demo_key,
    }
    if project is None:
        project = Project(**project_values)
        session.add(project)
        session.flush()
        return project

    for key, value in project_values.items():
        setattr(project, key, value)
    session.add(project)
    session.flush()
    return project


def _seed_review(
    session: Session,
    *,
    project: Project,
    company: Company,
    customer: User | None,
    customer_name: str,
    values: dict[str, Any],
) -> None:
    review = session.exec(select(Review).where(Review.project_id == project.id)).first()
    comment = f"{DEMO_REVIEW_MARKER} {values['feedback']}"
    if review is not None and not review.comment.startswith(DEMO_REVIEW_MARKERS):
        raise RuntimeError(
            f"Project {project.title!r} already has a non-seed review; refusing to replace it."
        )
    if review is None:
        review = Review(
            project_id=project.id,
            company_id=company.id,
            client_name=customer.full_name if customer else customer_name,
            rating=values["rating"],
            communication_rating=values["communication"],
            work_quality_rating=values["quality"],
            comment=comment,
            is_verified=False,
        )
    else:
        review.company_id = company.id
        review.client_name = customer.full_name if customer else customer_name
        review.rating = values["rating"]
        review.communication_rating = values["communication"]
        review.work_quality_rating = values["quality"]
        review.comment = comment
        review.is_verified = False
    session.add(review)


def _remove_seed_review(session: Session, project: Project) -> None:
    review = session.exec(select(Review).where(Review.project_id == project.id)).first()
    if review is not None and review.comment.startswith(DEMO_REVIEW_MARKERS):
        session.delete(review)


def seed_data(session: Session, csv_path: Path) -> SeedSummary:
    """Upsert seed-owned rows atomically; unrelated database rows are left alone."""
    companies_data = read_companies_csv(csv_path)
    if len(PROJECTS) != 15 or len(CUSTOMERS) != 15:
        raise RuntimeError("The demo dataset must contain exactly 15 projects and customers.")

    accounts: list[SeedAccount] = []
    skipped_records: list[str] = []
    transaction = session.begin() if not session.in_transaction() else session.begin_nested()
    with transaction:
        admin = _seed_user(
            session,
            demo_key=f"{SEED_PREFIX}-admin",
            email=ADMIN_EMAIL,
            name="UTU Demo Administrator",
            role="admin",
            password=ADMIN_PASSWORD,
            verified=True,
            skipped_records=skipped_records,
        )
        if admin is not None:
            accounts.append(SeedAccount("Admin", admin.full_name, ADMIN_EMAIL, ADMIN_PASSWORD, "admin"))

        companies: list[Company] = []
        seen_company_ids: set[int] = set()
        for index, data in enumerate(companies_data, start=1):
            company = _upsert_company(session, data, index, skipped_records)
            login_email = f"company{index:03d}@{EMAIL_DOMAIN}"
            if company.id not in seen_company_ids:
                seen_company_ids.add(company.id)
                company_user = _seed_user(
                    session,
                    demo_key=f"{SEED_PREFIX}-company-user-{index:03d}",
                    email=login_email,
                    name=company.name,
                    role="company",
                    password=COMPANY_PASSWORD,
                    company_id=company.id,
                    skipped_records=skipped_records,
                )
                if company_user is not None:
                    accounts.append(
                        SeedAccount("Company", company.name, login_email, COMPANY_PASSWORD, "company")
                    )
            else:
                skipped_records.append(
                    f"Company login {login_email!r} was skipped because the CSV contains "
                    "a duplicate company name."
                )
            companies.append(company)

        customers: list[User | None] = []
        for index, customer_data in enumerate(CUSTOMERS, start=1):
            name = customer_data[0]
            email = f"customer{index:02d}@{EMAIL_DOMAIN}"
            customer = _seed_user(
                session,
                demo_key=f"{SEED_PREFIX}-customer-{index:02d}",
                email=email,
                name=name,
                role="client",
                password=CUSTOMER_PASSWORD,
                verified=True,
                skipped_records=skipped_records,
            )
            customers.append(customer)
            if customer is not None:
                accounts.append(SeedAccount("Customer", name, email, CUSTOMER_PASSWORD, "client"))

        for index, values in enumerate(PROJECTS, start=1):
            company = companies[(index - 1) % len(companies)]
            customer = customers[index - 1]
            project = _seed_project(
                session,
                values=values,
                index=index,
                company=company,
                customer=customer,
            )
            if index in REVIEW_PROJECT_NUMBERS:
                _seed_review(
                    session,
                    project=project,
                    company=company,
                    customer=customer,
                    customer_name=CUSTOMERS[index - 1][0],
                    values=values,
                )
            else:
                _remove_seed_review(session, project)
        session.flush()

    return SeedSummary(
        company_count=len({company.id for company in companies}),
        customer_count=sum(customer is not None for customer in customers),
        project_count=len(PROJECTS),
        review_count=len(REVIEW_PROJECT_NUMBERS),
        accounts=accounts,
        skipped_records=skipped_records,
    )


def print_summary(summary: SeedSummary) -> None:
    print("\nSeed completed successfully (all projects/reviews are explicitly unverified demo data).")
    print(
        f"Companies: {summary.company_count} | Customers: {summary.customer_count} | "
        f"Completed projects: {summary.project_count} | Demo reviews: {summary.review_count}"
    )
    if summary.skipped_records:
        print(f"\nSkipped/reused records: {len(summary.skipped_records)}")
        for item in summary.skipped_records:
            print(f"- {item}")
    print("\nLogin credentials (development/testing only; change before any public deployment):")
    print("| Type | Name | Email | Plain-text password | Role |")
    print("|---|---|---|---|---|")
    for account in summary.accounts:
        print(
            f"| {account.account_type} | {account.name.replace('|', '/')} | "
            f"{account.email} | {account.password} | {account.role} |"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--csv",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "companies.csv",
        help="Path to companies.csv (default: project root/companies.csv).",
    )
    parser.add_argument(
        "--allow-non-sqlite",
        action="store_true",
        help="Required safety acknowledgement when DATABASE_URL uses a non-SQLite database.",
    )
    args = parser.parse_args()
    environment = os.environ.get("APP_ENV", "development").strip().casefold()
    if environment in {"prod", "production", "live"}:
        raise SystemExit("Refusing to seed while APP_ENV is production.")
    if engine.dialect.name != "sqlite" and not args.allow_non_sqlite:
        raise SystemExit(
            "Refusing to seed a non-SQLite database without explicit acknowledgement; "
            "review DATABASE_URL, then pass --allow-non-sqlite for a development database."
        )

    required_tables = {"company", "user", "project", "review"}
    existing_tables = set(inspect(engine).get_table_names())
    missing_tables = sorted(required_tables - existing_tables)
    if missing_tables:
        raise SystemExit(
            "Database is not initialized; missing required tables: "
            f"{', '.join(missing_tables)}. Start the backend normally first. "
            "This seed script does not create or migrate tables."
        )

    with Session(engine) as session:
        try:
            summary = seed_data(session, args.csv)
        except (FileNotFoundError, ValueError, RuntimeError) as error:
            raise SystemExit(f"Seed aborted without committing changes: {error}") from error
    print_summary(summary)


if __name__ == "__main__":
    main()
