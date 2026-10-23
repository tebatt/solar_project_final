import sqlite3
import os
from datetime import datetime, timezone
from pathlib import Path

from security import hash_password, verify_password

TEST_DATABASE = Path(__file__).resolve().with_name("solar_test.db")
PRODUCTION_DATABASE = Path(__file__).resolve().with_name("solar.db")
DEFAULT_ADMIN_EMAIL = "admin@solar.iq"
MIN_ADMIN_PASSWORD_LENGTH = 10
SEED_KEY_PREFIX = "real-solar-test-company-"
PROJECT_SEED_KEY_PREFIX = "real-solar-test-project-"

COMPANIES = (
    ("Al-Makhzoumi for Renewable Solar Energy", "Najaf", "Ammarmusa324@gmail.com", "0782 622 2206", 0),
    ("Alwadi Alakhdar Company", "Baghdad", "info@alwadialakhdar.com", "0772 240 0662", 0),
    ("Free Lights Company", "Baghdad", None, "0772 190 2552", 0),
    ("Powerzone Solar Energy", "Baghdad", "powerzone.solarenergy@gmail.com", "0783 400 0073", 0),
    ("EBT (أسس الابتكار)", "Baghdad", "info@ebt-iq.com", "0772 600 0650", 2022),
    ("Green Power (الطاقة الخضراء)", "Salah Al-Din", "greenpower.tik@gmail.com", "0774 066 4422", 2024),
    ("The Sun Solar Solutions", "Baghdad", None, "0783 100 8200", 0),
    ("Alhadbaa Company for Contracting", "Erbil", "info@alhadbaa.com", "0770 200 0002", 1991),
    ("Alnabaa Solar Systems", "Baghdad", "info@alnabaa.com", "0772 991 9871", 0),
    ("Al-Aman Company", "Al-Qadisiyyah", "info@alamancompany.iq", "0780 921 9980", 2007),
    ("Bilad Utu for Energy Solutions", "Baghdad", "info@biladutu.com", "0770 541 2514", 2017),
    ("Helio Solar Energy & Smart Solutions", "Baghdad", "heliosolar.iq@gmail.com", "0783 838 7475", 2022),
)

COMPANY_COLUMNS = {
    "name",
    "founded_year",
    "projects_count",
    "phone",
    "email",
    "address",
    "verification_status",
    "service_offerings",
    "rating",
    "reviews_count",
    "demo_key",
}

PROJECTS = (
    {
        "title": "نظام طاقة شمسية هجين 10KVA لحي الجامعة",
        "company_name": "Alwadi Alakhdar Company",
        "category": "residential",
        "system_size_label": "10 KVA / 16 Panels",
        "system_kwp": 10,
        "panel_count": 16,
        "location_governorate": "Baghdad",
        "location_district": "Al-Jami'a",
        "installation_type": "Hybrid rooftop solar",
        "battery_kwh": 0,
        "image_url": "/projects/project_image/project_img1.jpeg",
    },
    {
        "title": "منظومة طاقة شمسية صناعية 50kW لمصنع بلاستيك",
        "company_name": "EBT (أسس الابتكار)",
        "category": "commercial",
        "system_size_label": "50 kW / On-Grid",
        "system_kwp": 50,
        "panel_count": None,
        "location_governorate": "Baghdad",
        "location_district": "Owaireej",
        "installation_type": "On-grid commercial solar",
        "battery_kwh": 0,
        "image_url": "/projects/project_image/project_img2.jpeg",
    },
    {
        "title": "مشروع تشغيل مضخة مياه زراعية على الطاقة الشمسية",
        "company_name": "Al-Makhzoumi for Renewable Solar Energy",
        "category": "agricultural",
        "system_size_label": "25 HP Solar Pump",
        "system_kwp": 18.65,
        "panel_count": None,
        "location_governorate": "Najaf",
        "location_district": "Agriculture Area",
        "installation_type": "Solar water pump",
        "battery_kwh": 0,
        "image_url": "/projects/project_image/project_img3.jpeg",
    },
    {
        "title": "منظومة منزلية متكاملة 15KVA مع بطاريات ليثيوم",
        "company_name": "Helio Solar Energy & Smart Solutions",
        "category": "residential",
        "system_size_label": "15 KVA / 20kWh Lithium",
        "system_kwp": 15,
        "panel_count": None,
        "location_governorate": "Baghdad",
        "location_district": "Zayona",
        "installation_type": "Hybrid system with lithium batteries",
        "battery_kwh": 20,
        "image_url": "/projects/project_image/project_img4.jpeg",
    },
    {
        "title": "مشروع إنارة شمسية مستقلة لمجمع تجاري",
        "company_name": "Bilad Utu for Energy Solutions",
        "category": "commercial",
        "system_size_label": "30 kW Hybrid",
        "system_kwp": 30,
        "panel_count": None,
        "location_governorate": "Erbil",
        "location_district": "Downtown",
        "installation_type": "Commercial hybrid solar",
        "battery_kwh": 0,
        "image_url": "/projects/project_image/project_img5.jpeg",
    },
)


def _ensure_test_admin(connection: sqlite3.Connection) -> tuple[str, str]:
    columns = {
        row[1] for row in connection.execute('PRAGMA table_info("user")')
    }
    required_columns = {"email", "hashed_password", "full_name", "role", "is_active"}
    if not required_columns.issubset(columns):
        missing = sorted(required_columns - columns)
        raise RuntimeError(f"solar_test.db user schema is missing columns: {missing}")

    email = os.getenv("UTU_ADMIN_EMAIL", DEFAULT_ADMIN_EMAIL).strip().lower()
    if not email or "@" not in email:
        raise RuntimeError("UTU_ADMIN_EMAIL must be a valid email address.")

    select_columns = ["email", "role", "is_active"]
    for optional_column in ("company_id", "token_version"):
        if optional_column in columns:
            select_columns.append(optional_column)
    existing = connection.execute(
        f'SELECT {", ".join(f"{column}" for column in select_columns)} '
        'FROM "user" WHERE lower(email) = ?',
        (email,),
    ).fetchone()
    if existing is not None:
        account = dict(zip(select_columns, existing))
        if account.get("company_id") is not None:
            raise RuntimeError(
                f"Refusing to grant administrator access to company account {email!r}."
            )
        if not account["is_active"]:
            raise RuntimeError(f"Administrator account {email!r} is inactive.")
        assignments: list[str] = []
        values: list[object] = []
        changes: list[str] = []
        if account["role"] != "admin":
            assignments.append('"role" = ?')
            values.append("admin")
            changes.append("promoted")

        password = os.getenv("UTU_ADMIN_PASSWORD")
        if password is not None:
            if len(password) < MIN_ADMIN_PASSWORD_LENGTH:
                raise RuntimeError(
                    f"UTU_ADMIN_PASSWORD must be at least {MIN_ADMIN_PASSWORD_LENGTH} characters."
                )
            stored_hash = connection.execute(
                'SELECT "hashed_password" FROM "user" WHERE lower("email") = ?',
                (email,),
            ).fetchone()[0]
            if not verify_password(password, stored_hash):
                assignments.append('"hashed_password" = ?')
                values.append(hash_password(password))
                changes.append("password updated")

        if not assignments:
            return email, "verified"
        if "token_version" in columns:
            assignments.append('"token_version" = "token_version" + 1')
        values.append(email)
        connection.execute(
            f'UPDATE "user" SET {", ".join(assignments)} WHERE lower("email") = ?',
            values,
        )
        return email, " and ".join(changes)

    password = os.getenv("UTU_ADMIN_PASSWORD", "")
    if len(password) < MIN_ADMIN_PASSWORD_LENGTH:
        raise RuntimeError(
            f"Set UTU_ADMIN_PASSWORD to at least {MIN_ADMIN_PASSWORD_LENGTH} characters "
            f"to create {email!r} in solar_test.db."
        )

    account_values: dict[str, object] = {
        "email": email,
        "hashed_password": hash_password(password),
        "full_name": os.getenv("UTU_ADMIN_NAME", "Platform Administrator").strip()
        or "Platform Administrator",
        "role": "admin",
        "is_active": True,
    }
    optional_values: dict[str, object] = {
        "is_verified": True,
        "company_id": None,
        "token_version": 0,
        "demo_key": "real-solar-test-admin",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    account_values.update({
        column: value
        for column, value in optional_values.items()
        if column in columns
    })
    insert_columns = list(account_values)
    connection.execute(
        f'INSERT INTO "user" ({", ".join(f"{column}" for column in insert_columns)}) '
        f'VALUES ({", ".join("?" for _ in insert_columns)})',
        [account_values[column] for column in insert_columns],
    )
    return email, "created"


def seed_test_admin() -> None:
    test_path = TEST_DATABASE.resolve()
    if test_path == PRODUCTION_DATABASE.resolve() or test_path.name != "solar_test.db":
        raise RuntimeError(f"Refusing to seed unexpected database: {test_path}")
    if not test_path.is_file():
        raise FileNotFoundError(
            f"{test_path} does not exist. Start the API first to initialize its test database."
        )

    with sqlite3.connect(f"{test_path.as_uri()}?mode=rw", uri=True) as connection:
        email, status = _ensure_test_admin(connection)
    print(f"Administrator {email} {status} in {test_path}.")


def seed_test_companies() -> None:
    test_path = TEST_DATABASE.resolve()
    if test_path == PRODUCTION_DATABASE.resolve() or test_path.name != "solar_test.db":
        raise RuntimeError(f"Refusing to seed unexpected database: {test_path}")
    if not test_path.is_file():
        raise FileNotFoundError(
            f"{test_path} does not exist. Start the API first to initialize its test database."
        )

    database_uri = f"{test_path.as_uri()}?mode=rw"
    with sqlite3.connect(database_uri, uri=True) as connection:
        columns = {
            row[1] for row in connection.execute("PRAGMA table_info(company)")
        }
        if not COMPANY_COLUMNS.issubset(columns):
            missing = sorted(COMPANY_COLUMNS - columns)
            raise RuntimeError(f"solar_test.db company schema is missing columns: {missing}")

        for index, (name, city, email, phone, founded_year) in enumerate(COMPANIES, 1):
            demo_key = f"{SEED_KEY_PREFIX}{index:02}"
            collision = connection.execute(
                "SELECT id FROM company WHERE name = ? AND (demo_key IS NULL OR demo_key != ?)",
                (name, demo_key),
            ).fetchone()
            if collision is not None:
                raise RuntimeError(
                    f"Refusing to modify company {name!r}; its row is not owned by this seeder."
                )

            connection.execute(
                """
                INSERT INTO company (
                    name, founded_year, projects_count, phone, support_phone, email, address,
                    verification_status, service_offerings, rating, reviews_count, is_blocked, demo_key
                )
                VALUES (?, ?, 0, ?, NULL, ?, ?, 'pending', '', 0, 0, 0, ?)
                ON CONFLICT(demo_key) DO UPDATE SET
                    name = excluded.name,
                    founded_year = excluded.founded_year,
                    projects_count = excluded.projects_count,
                    phone = excluded.phone,
                    support_phone = excluded.support_phone,
                    email = excluded.email,
                    address = excluded.address,
                    verification_status = excluded.verification_status,
                    service_offerings = excluded.service_offerings,
                    rating = excluded.rating,
                    reviews_count = excluded.reviews_count
                """,
                (name, founded_year, phone, email, city, demo_key),
            )

        seeded_keys = tuple(
            f"{SEED_KEY_PREFIX}{index:02}" for index in range(1, len(COMPANIES) + 1)
        )
        placeholders = ", ".join("?" for _ in seeded_keys)
        seeded_count = connection.execute(
            f"SELECT COUNT(*) FROM company WHERE demo_key IN ({placeholders})",
            seeded_keys,
        ).fetchone()[0]
        if seeded_count != len(COMPANIES):
            raise RuntimeError(
                f"Expected {len(COMPANIES)} seeded companies, found {seeded_count}."
            )

    print(f"Seeded or refreshed {len(COMPANIES)} companies in {test_path}.")


def seed_test_projects() -> None:
    test_path = TEST_DATABASE.resolve()
    if test_path == PRODUCTION_DATABASE.resolve() or test_path.name != "solar_test.db":
        raise RuntimeError(f"Refusing to seed unexpected database: {test_path}")
    if not test_path.is_file():
        raise FileNotFoundError(
            f"{test_path} does not exist. Start the API first to initialize its test database."
        )

    required_columns = {
        "title",
        "description",
        "category",
        "system_size_label",
        "company_id",
        "location_governorate",
        "location_district",
        "system_kwp",
        "battery_kwh",
        "installation_type",
        "rating",
        "image_url",
        "gallery_urls_json",
        "status",
        "created_at",
        "panel_count",
        "demo_key",
    }
    repository_root = Path(__file__).resolve().parent.parent
    database_uri = f"{test_path.as_uri()}?mode=rw"
    with sqlite3.connect(database_uri, uri=True) as connection:
        columns = {
            row[1] for row in connection.execute("PRAGMA table_info(project)")
        }
        if not required_columns.issubset(columns):
            missing = sorted(required_columns - columns)
            raise RuntimeError(
                f"solar_test.db project schema is missing columns: {missing}. "
                "Start the API to apply its additive migrations."
            )

        for index, project in enumerate(PROJECTS, 1):
            company_index = next(
                (
                    company_index
                    for company_index, company in enumerate(COMPANIES, 1)
                    if company[0] == project["company_name"]
                ),
                None,
            )
            if company_index is None:
                raise RuntimeError(
                    f"Project company {project['company_name']!r} is absent from the company seed data."
                )
            company_key = f"{SEED_KEY_PREFIX}{company_index:02}"
            company = connection.execute(
                "SELECT id, name FROM company WHERE demo_key = ?",
                (company_key,),
            ).fetchone()
            if company is None or company[1] != project["company_name"]:
                raise RuntimeError(
                    f"Expected seeded company {project['company_name']!r} in solar_test.db."
                )

            image_file = repository_root / "frontend" / "public" / project["image_url"].lstrip("/")
            if not image_file.is_file():
                raise FileNotFoundError(
                    f"Project image {project['image_url']!r} is missing: {image_file}"
                )

            demo_key = f"{PROJECT_SEED_KEY_PREFIX}{index:02}"
            collision = connection.execute(
                "SELECT id FROM project WHERE title = ? AND (demo_key IS NULL OR demo_key != ?)",
                (project["title"], demo_key),
            ).fetchone()
            if collision is not None:
                raise RuntimeError(
                    f"Refusing to modify project {project['title']!r}; its row is not owned by this seeder."
                )

            now = datetime.now(timezone.utc).isoformat()
            connection.execute(
                """
                INSERT INTO project (
                    title, description, category, system_size_label, company_id, client_name,
                    location_governorate, location_district, system_kwp, battery_kwh,
                    installation_type, rating, image_url, gallery_urls_json, status,
                    completed_at, created_at, panel_count, roof_type, inverter_details,
                    annual_generation_kwh, testimonial, milestones_json,
                    before_metrics_json, after_metrics_json, demo_key
                )
                VALUES (
                    ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 0, ?, '[]', 'completed',
                    ?, ?, ?, NULL, NULL, NULL, NULL, '[]', '{}', '{}', ?
                )
                ON CONFLICT(demo_key) DO UPDATE SET
                    title = excluded.title,
                    description = excluded.description,
                    category = excluded.category,
                    system_size_label = excluded.system_size_label,
                    company_id = excluded.company_id,
                    client_name = excluded.client_name,
                    location_governorate = excluded.location_governorate,
                    location_district = excluded.location_district,
                    system_kwp = excluded.system_kwp,
                    battery_kwh = excluded.battery_kwh,
                    installation_type = excluded.installation_type,
                    rating = excluded.rating,
                    image_url = excluded.image_url,
                    gallery_urls_json = excluded.gallery_urls_json,
                    status = excluded.status,
                    completed_at = excluded.completed_at,
                    created_at = excluded.created_at,
                    panel_count = excluded.panel_count,
                    roof_type = excluded.roof_type,
                    inverter_details = excluded.inverter_details,
                    annual_generation_kwh = excluded.annual_generation_kwh,
                    testimonial = excluded.testimonial,
                    milestones_json = excluded.milestones_json,
                    before_metrics_json = excluded.before_metrics_json,
                    after_metrics_json = excluded.after_metrics_json
                """,
                (
                    project["title"],
                    "Demonstration dataset entry; details are illustrative and not a verified installation.",
                    project["category"],
                    project["system_size_label"],
                    company[0],
                    project["location_governorate"],
                    project["location_district"],
                    project["system_kwp"],
                    project["battery_kwh"],
                    project["installation_type"],
                    project["image_url"],
                    now,
                    now,
                    project["panel_count"],
                    demo_key,
                ),
            )

        seeded_keys = tuple(
            f"{PROJECT_SEED_KEY_PREFIX}{index:02}" for index in range(1, len(PROJECTS) + 1)
        )
        placeholders = ", ".join("?" for _ in seeded_keys)
        seeded_count = connection.execute(
            f"SELECT COUNT(*) FROM project WHERE demo_key IN ({placeholders})",
            seeded_keys,
        ).fetchone()[0]
        if seeded_count != len(PROJECTS):
            raise RuntimeError(
                f"Expected {len(PROJECTS)} seeded projects, found {seeded_count}."
            )

        company_keys = tuple(
            f"{SEED_KEY_PREFIX}{index:02}"
            for index in {
                next(
                    company_index
                    for company_index, company in enumerate(COMPANIES, 1)
                    if company[0] == project["company_name"]
                )
                for project in PROJECTS
            }
        )
        company_placeholders = ", ".join("?" for _ in company_keys)
        connection.execute(
            f"""
            UPDATE company
            SET projects_count = (
                SELECT COUNT(*) FROM project WHERE project.company_id = company.id
            )
            WHERE demo_key IN ({company_placeholders})
            """,
            company_keys,
        )

    print(f"Seeded or refreshed {len(PROJECTS)} projects in {test_path}.")


if __name__ == "__main__":
    seed_test_admin()
    seed_test_companies()
    seed_test_projects()
