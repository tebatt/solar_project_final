import json
import os
from datetime import datetime, timezone

from sqlmodel import Session, select

from database import engine, create_db_and_tables
from models import Company, Project, User
from security import hash_password

DEMO_PASSWORD = os.getenv("UTU_DEMO_PASSWORD")
MIN_DEMO_PASSWORD_LENGTH = 10

DEMO_COMPANIES = [
    ("Utu for Energy Solutions", 1989, "07700010001", "Baghdad", "Installation, Maintenance, Provider, Software, Trainings"),
    ("GlobalTek iq", 2004, "07700010002", "Erbil", "Installation, Maintenance, Provider"),
    ("Bilad", 2001, "07700010003", "Basra", "Installation, Provider, Trainings"),
    ("QHC Solar", 2012, "07700010004", "Baghdad", "Installation, Maintenance, Software"),
    ("Tesla panels - for solar energy", 2015, "07700010005", "Najaf", "Installation, Provider"),
    ("Tanweer energy solutions", 2018, "07700010006", "Sulaymaniyah", "Installation, Maintenance, Trainings"),
    ("Qimah Al Safinah", 2007, "07700010007", "Mosul", "Provider, Installation"),
    ("Power max", 2011, "07700010008", "Kirkuk", "Installation, Maintenance, Provider"),
    ("Alwadi alakhdar company", 1998, "07700010009", "Diyala", "Provider, Trainings"),
    ("Kol Al-Manafith for Renewable Energy", 2020, "07700010010", "Duhok", "Installation, Maintenance, Software, Trainings"),
]

DEMO_CUSTOMERS = [
    ("Demo Customer 01", "07700020001", "Baghdad"),
    ("Demo Customer 02", "07700020002", "Basra"),
    ("Demo Customer 03", "07700020003", "Erbil"),
    ("Demo Customer 04", "07700020004", "Najaf"),
    ("Demo Customer 05", "07700020005", "Kirkuk"),
    ("Demo Customer 06", "07700020006", "Mosul"),
    ("Demo Customer 07", "07700020007", "Duhok"),
    ("Demo Customer 08", "07700020008", "Sulaymaniyah"),
    ("Demo Customer 09", "07700020009", "Baghdad"),
    ("Demo Customer 10", "07700020010", "Basra"),
]

DEMO_PROJECTS = [
    {
        "title": "Demo Solar Project 01 - Baghdad Residence",
        "description": "Demo dataset: residential 5 kW hybrid rooftop installation. Illustrative planning details, not a verified customer installation.",
        "status": "completed",
        "budget_iqd": 8_500_000,
        "system_kwp": 5,
        "battery_kwh": 10,
        "installation_type": "Hybrid rooftop",
        "panel_count": 8,
        "inverter_details": "5 kW hybrid inverter; 10 kWh battery storage",
        "annual_generation_kwh": 9_000,
        "milestones": ["Site survey completed", "Equipment installed", "Handover completed"],
        "before_metrics": {"grid_supply": "8 hours/day", "diesel_backup": "4 hours/day"},
        "after_metrics": {"solar_capacity": "5 kW", "battery_storage": "10 kWh", "estimated_generation": "9,000 kWh/year"},
    },
    {
        "title": "Demo Solar Project 02 - Basra Villa",
        "description": "Demo dataset: 10 kW off-grid residence with battery backup. Illustrative planning details, not a verified customer installation.",
        "status": "completed",
        "budget_iqd": 17_000_000,
        "system_kwp": 10,
        "battery_kwh": 20,
        "installation_type": "Off-grid rooftop",
        "panel_count": 16,
        "inverter_details": "10 kW off-grid inverter; 20 kWh battery storage",
        "annual_generation_kwh": 18_000,
        "milestones": ["Load assessment completed", "Installation completed", "System commissioning completed"],
        "before_metrics": {"grid_supply": "6 hours/day", "diesel_backup": "6 hours/day"},
        "after_metrics": {"solar_capacity": "10 kW", "battery_storage": "20 kWh", "estimated_generation": "18,000 kWh/year"},
    },
    {
        "title": "Demo Solar Project 03 - Erbil Workshop",
        "description": "Demo dataset: 20 kW hybrid system for a small commercial workshop. Illustrative planning details, not a verified customer installation.",
        "status": "completed",
        "budget_iqd": 34_000_000,
        "system_kwp": 20,
        "battery_kwh": 30,
        "installation_type": "Commercial hybrid",
        "panel_count": 32,
        "inverter_details": "20 kW three-phase hybrid inverter; 30 kWh battery storage",
        "annual_generation_kwh": 36_000,
        "milestones": ["Engineering design approved", "Installation completed", "Monitoring handover completed"],
        "before_metrics": {"grid_supply": "10 hours/day", "diesel_backup": "5 hours/day"},
        "after_metrics": {"solar_capacity": "20 kW", "battery_storage": "30 kWh", "estimated_generation": "36,000 kWh/year"},
    },
    {
        "title": "Demo Solar Project 04 - Najaf Family Home",
        "description": "Demo dataset: 5 kW hybrid system. Active installation; milestone notes are simulated.",
        "status": "in_progress",
        "budget_iqd": 8_800_000,
        "system_kwp": 5,
        "battery_kwh": 10,
        "installation_type": "Hybrid rooftop",
        "panel_count": 8,
        "inverter_details": "5 kW hybrid inverter; 10 kWh battery storage",
        "annual_generation_kwh": None,
        "milestones": ["Site survey completed", "Equipment delivery in progress", "Installation pending"],
        "before_metrics": {},
        "after_metrics": {},
    },
    {
        "title": "Demo Solar Project 05 - Kirkuk Farm",
        "description": "Demo dataset: 10 kW off-grid system for farm loads and water pumping. Active installation; milestone notes are simulated.",
        "status": "in_progress",
        "budget_iqd": 16_500_000,
        "system_kwp": 10,
        "battery_kwh": 15,
        "installation_type": "Off-grid ground mount",
        "panel_count": 16,
        "inverter_details": "10 kW off-grid inverter; 15 kWh battery storage",
        "annual_generation_kwh": None,
        "milestones": ["Load review completed", "Mounting structure installed", "Wiring and commissioning in progress"],
        "before_metrics": {},
        "after_metrics": {},
    },
    {
        "title": "Demo Solar Project 06 - Mosul Clinic",
        "description": "Demo dataset: 20 kW hybrid system for a clinic. Active installation; milestone notes are simulated.",
        "status": "in_progress",
        "budget_iqd": 35_500_000,
        "system_kwp": 20,
        "battery_kwh": 40,
        "installation_type": "Commercial hybrid",
        "panel_count": 32,
        "inverter_details": "20 kW hybrid inverter; 40 kWh battery storage",
        "annual_generation_kwh": None,
        "milestones": ["Design approved", "Equipment delivered", "Installation in progress"],
        "before_metrics": {},
        "after_metrics": {},
    },
    {
        "title": "Demo Solar Project 07 - Duhok Office",
        "description": "Demo dataset: 10 kW hybrid system for an office building. Active installation; milestone notes are simulated.",
        "status": "in_progress",
        "budget_iqd": 18_000_000,
        "system_kwp": 10,
        "battery_kwh": 20,
        "installation_type": "Commercial hybrid rooftop",
        "panel_count": 16,
        "inverter_details": "10 kW hybrid inverter; 20 kWh battery storage",
        "annual_generation_kwh": None,
        "milestones": ["Site survey completed", "Materials being prepared", "Installation scheduled"],
        "before_metrics": {},
        "after_metrics": {},
    },
    {
        "title": "Demo Solar Project 08 - Sulaymaniyah Apartment",
        "description": "Demo dataset: new 5 kW residential hybrid system. Pending customer approval; milestone notes are simulated.",
        "status": "pending",
        "budget_iqd": 9_200_000,
        "system_kwp": 5,
        "battery_kwh": 10,
        "installation_type": "Hybrid rooftop",
        "panel_count": 8,
        "inverter_details": "5 kW hybrid inverter; 10 kWh battery storage",
        "annual_generation_kwh": None,
        "milestones": ["Quote prepared", "Customer approval pending", "Installation not started"],
        "before_metrics": {},
        "after_metrics": {},
    },
    {
        "title": "Demo Solar Project 09 - Baghdad Grocery",
        "description": "Demo dataset: proposed 10 kW commercial off-grid system. Draft estimate; installation has not started.",
        "status": "draft",
        "budget_iqd": 19_000_000,
        "system_kwp": 10,
        "battery_kwh": 20,
        "installation_type": "Commercial off-grid",
        "panel_count": 16,
        "inverter_details": "10 kW off-grid inverter; 20 kWh battery storage",
        "annual_generation_kwh": None,
        "milestones": ["Initial estimate drafted", "Site visit pending", "Installation not started"],
        "before_metrics": {},
        "after_metrics": {},
    },
    {
        "title": "Demo Solar Project 10 - Basra Water Pump",
        "description": "Demo dataset: proposed 20 kW solar water-pumping system. Pending project scope confirmation; installation has not started.",
        "status": "pending",
        "budget_iqd": 32_000_000,
        "system_kwp": 20,
        "battery_kwh": 0,
        "installation_type": "Off-grid solar water pumping",
        "panel_count": 32,
        "inverter_details": "20 kW solar pump inverter",
        "annual_generation_kwh": None,
        "milestones": ["Initial assessment completed", "Customer scope confirmation pending", "Installation not started"],
        "before_metrics": {},
        "after_metrics": {},
    },
]


def seed_companies() -> None:
    if not DEMO_PASSWORD or len(DEMO_PASSWORD) < MIN_DEMO_PASSWORD_LENGTH:
        raise RuntimeError(
            "Set UTU_DEMO_PASSWORD (at least 10 characters) before seeding. "
            "Seed demo data only into a local demo database."
        )
    create_db_and_tables()
    generated_accounts: list[tuple[str, str, str, str, str]] = []

    with Session(engine) as session:
        company_records: list[Company] = []
        customer_users: list[User] = []

        for index, (name, founded_year, phone, governorate, offerings) in enumerate(DEMO_COMPANIES, 1):
            demo_key = f"utu-seed-company-{index:02}"
            company = session.exec(select(Company).where(Company.demo_key == demo_key)).first()
            if company is None:
                collision = session.exec(select(Company).where(Company.name == name)).first()
                if collision is not None:
                    raise RuntimeError(f"Refusing to modify existing company named {name!r}.")
                company = Company(
                    name=name,
                    founded_year=founded_year,
                    projects_count=0,
                    phone=phone,
                    email=f"company{index:02}@solar-demo.test",
                    address=f"{governorate}, Iraq (Demo data)",
                    verification_status="pending",
                    service_offerings=offerings,
                    demo_key=demo_key,
                )
                session.add(company)
                session.flush()
            company_records.append(company)

            email = f"company{index:02}@solar-demo.test"
            user = _seed_user(
                session,
                demo_key=f"utu-seed-company-user-{index:02}",
                email=email,
                full_name=name,
                role="company",
                phone=phone,
                company_id=company.id,
            )
            generated_accounts.append(("Company", name, email, DEMO_PASSWORD, "company"))

        for index, (name, phone, governorate) in enumerate(DEMO_CUSTOMERS, 1):
            email = f"customer{index:02}@solar-demo.test"
            user = _seed_user(
                session,
                demo_key=f"utu-seed-customer-{index:02}",
                email=email,
                full_name=name,
                role="client",
                phone=phone,
                company_id=None,
            )
            customer_users.append(user)
            generated_accounts.append(("Customer", f"{name} ({governorate})", email, DEMO_PASSWORD, "client"))

        session.flush()
        for index, values in enumerate(DEMO_PROJECTS, 1):
            demo_key = f"utu-seed-project-{index:02}"
            existing = session.exec(select(Project).where(Project.demo_key == demo_key)).first()
            if existing is not None:
                continue
            collision = session.exec(select(Project).where(Project.title == values["title"])).first()
            if collision is not None:
                raise RuntimeError(f"Refusing to modify existing project named {values['title']!r}.")

            company_index = (index - 1) % len(company_records)
            customer = customer_users[index - 1]
            company = company_records[company_index]
            completed = values["status"] == "completed"
            session.add(Project(
                title=values["title"],
                description=values["description"],
                company_id=company.id,
                client_name=customer.full_name,
                location_governorate=DEMO_CUSTOMERS[index - 1][2],
                location_district="Demo district",
                system_kwp=values["system_kwp"],
                battery_kwh=values["battery_kwh"],
                installation_type=values["installation_type"],
                rating=0,
                image_url="",
                status=values["status"],
                completed_at=datetime(2026, 1, index, tzinfo=timezone.utc) if completed else None,
                panel_count=values["panel_count"],
                roof_type="Demo site; survey required",
                inverter_details=values["inverter_details"],
                annual_generation_kwh=values["annual_generation_kwh"],
                budget_iqd=values["budget_iqd"],
                milestones_json=json.dumps(values["milestones"]),
                before_metrics_json=json.dumps(values["before_metrics"]),
                after_metrics_json=json.dumps(values["after_metrics"]),
                customer_user_id=customer.id,
                demo_key=demo_key,
            ))

        session.commit()

    print(
        "\nSeeded 10 demo companies, 10 demo customer accounts, and 10 demo projects "
        "(3 completed, 4 in progress, 2 pending, 1 draft). "
        "Company and phone verification remain pending; project metrics are illustrative."
    )
    _print_credentials(generated_accounts)


def _seed_user(
    session: Session,
    *,
    demo_key: str,
    email: str,
    full_name: str,
    role: str,
    phone: str,
    company_id: int | None,
) -> User:
    user = session.exec(select(User).where(User.demo_key == demo_key)).first()
    if user is None:
        email_collision = session.exec(select(User).where(User.email == email)).first()
        if email_collision is not None:
            raise RuntimeError(f"Refusing to modify existing account {email!r}.")
        user = User(
            email=email,
            phone=phone,
            hashed_password=hash_password(DEMO_PASSWORD),
            full_name=full_name,
            role=role,
            is_active=True,
            is_verified=False,
            company_id=company_id,
            demo_key=demo_key,
        )
        session.add(user)
        session.flush()
    else:
        user.hashed_password = hash_password(DEMO_PASSWORD)
        session.add(user)
    return user


def _print_credentials(accounts: list[tuple[str, str, str, str, str]]) -> None:
    print("| Account Type | Entity / User Name | Email | Password | Role |")
    print("|---|---|---|---|---|")
    for account_type, name, email, password, role in accounts:
        print(f"| {account_type} | {name} | {email} | {password} | {role} |")


if __name__ == "__main__":
    try:
        seed_companies()
    except RuntimeError as error:
        raise SystemExit(str(error))
