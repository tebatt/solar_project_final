import os
from pathlib import Path

from sqlalchemy import inspect
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlmodel import SQLModel, Session, create_engine, select

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{Path(__file__).resolve().with_name('solar_test.db').as_posix()}",
)
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

engine_options = {"connect_args": {"check_same_thread": False}} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, **engine_options)


@event.listens_for(Engine, "connect")
def _enable_sqlite_foreign_keys(connection, _record) -> None:
    if connection.__class__.__module__.startswith("sqlite3"):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)
    migrate_admin_dashboard_columns()
    migrate_review_columns()
    migrate_auth_columns()
    migrate_quote_breakdown_columns()
    migrate_green_initiative_columns()
    migrate_company_support_phone_column()
    migrate_demo_seed_columns()
    migrate_project_display_columns()
    migrate_company_verification_review_columns()
    with Session(engine) as session:
        migrate_company_verification(session)


def migrate_admin_dashboard_columns() -> None:
    """Add admin moderation fields to databases created before the dashboard API."""
    with engine.begin() as connection:
        tables = set(inspect(connection).get_table_names())
        if "company" in tables:
            company_columns = {
                column["name"] for column in inspect(connection).get_columns("company")
            }
            if "is_blocked" not in company_columns:
                connection.exec_driver_sql(
                    "ALTER TABLE company ADD COLUMN is_blocked BOOLEAN NOT NULL DEFAULT 0"
                )
            connection.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_company_is_blocked ON company (is_blocked)"
            )
        if "review" in tables:
            review_columns = {
                column["name"] for column in inspect(connection).get_columns("review")
            }
            for name in ("is_hidden", "is_deleted"):
                if name not in review_columns:
                    connection.exec_driver_sql(
                        f"ALTER TABLE review ADD COLUMN {name} BOOLEAN NOT NULL DEFAULT 0"
                    )
                connection.exec_driver_sql(
                    f"CREATE INDEX IF NOT EXISTS ix_review_{name} ON review ({name})"
                )


def migrate_project_display_columns() -> None:
    with engine.begin() as connection:
        inspector = inspect(connection)
        tables = set(inspector.get_table_names())
        if "project" not in tables:
            return

        columns = {column["name"] for column in inspector.get_columns("project")}
        if "category" not in columns:
            connection.exec_driver_sql("ALTER TABLE project ADD COLUMN category VARCHAR")
        if "system_size_label" not in columns:
            connection.exec_driver_sql("ALTER TABLE project ADD COLUMN system_size_label VARCHAR")


def migrate_company_verification_review_columns() -> None:
    with engine.begin() as connection:
        tables = set(inspect(connection).get_table_names())
        if "companyverification" not in tables:
            return
        columns = {
            column["name"]
            for column in inspect(connection).get_columns("companyverification")
        }
        for name in (
            "identity_document_checked",
            "business_document_checked",
            "project_evidence_checked",
        ):
            if name not in columns:
                connection.exec_driver_sql(
                    f"ALTER TABLE companyverification ADD COLUMN {name} BOOLEAN NOT NULL DEFAULT 0"
                )


def migrate_review_columns() -> None:
    with engine.begin() as connection:
        inspector = inspect(connection)
        company_columns = {column["name"] for column in inspector.get_columns("company")}
        if "rating" not in company_columns:
            connection.exec_driver_sql("ALTER TABLE company ADD COLUMN rating FLOAT NOT NULL DEFAULT 0")
        if "reviews_count" not in company_columns:
            connection.exec_driver_sql("ALTER TABLE company ADD COLUMN reviews_count INTEGER NOT NULL DEFAULT 0")

        project_columns = {column["name"] for column in inspector.get_columns("project")}
        if "quote_request_id" not in project_columns:
            connection.exec_driver_sql(
                "ALTER TABLE project ADD COLUMN quote_request_id INTEGER REFERENCES quoterequest(id)"
            )
        connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_project_quote_request_id ON project (quote_request_id)"
        )


def migrate_auth_columns() -> None:
    with engine.begin() as connection:
        inspector = inspect(connection)
        tables = set(inspector.get_table_names())
        if "user" in tables:
            user_columns = {column["name"] for column in inspector.get_columns("user")}
            if "token_version" not in user_columns:
                connection.exec_driver_sql("ALTER TABLE user ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0")
            if "company_id" not in user_columns:
                connection.exec_driver_sql("ALTER TABLE user ADD COLUMN company_id INTEGER REFERENCES company(id)")
                connection.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_user_company_id ON user (company_id)")
            if "phone" not in user_columns:
                connection.exec_driver_sql("ALTER TABLE user ADD COLUMN phone VARCHAR")
                connection.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_user_phone ON user (phone)")
        if "quoterequest" in tables:
            quote_columns = {column["name"] for column in inspector.get_columns("quoterequest")}
            if "user_id" not in quote_columns:
                connection.exec_driver_sql(
                    "ALTER TABLE quoterequest ADD COLUMN user_id INTEGER REFERENCES user(id)"
                )
            connection.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_quoterequest_user_id ON quoterequest (user_id)"
            )


def migrate_quote_breakdown_columns() -> None:
    with engine.begin() as connection:
        tables = set(inspect(connection).get_table_names())
        if "companyquote" not in tables:
            return
        columns = {column["name"] for column in inspect(connection).get_columns("companyquote")}
        for name in ("panel_iqd", "inverter_iqd", "battery_iqd", "installation_iqd"):
            if name not in columns:
                connection.exec_driver_sql(
                    f"ALTER TABLE companyquote ADD COLUMN {name} INTEGER NOT NULL DEFAULT 0"
                )


def migrate_green_initiative_columns() -> None:
    with engine.begin() as connection:
        tables = set(inspect(connection).get_table_names())
        if "quoterequest" in tables:
            columns = {column["name"] for column in inspect(connection).get_columns("quoterequest")}
            if "is_green_initiative" not in columns:
                connection.exec_driver_sql(
                    "ALTER TABLE quoterequest ADD COLUMN is_green_initiative BOOLEAN NOT NULL DEFAULT 0"
                )
            if "green_initiative_budget_iqd" not in columns:
                connection.exec_driver_sql(
                    "ALTER TABLE quoterequest ADD COLUMN green_initiative_budget_iqd INTEGER"
                )
        if "companyquote" in tables:
            columns = {column["name"] for column in inspect(connection).get_columns("companyquote")}
            if "green_initiative_supported" not in columns:
                connection.exec_driver_sql(
                    "ALTER TABLE companyquote ADD COLUMN green_initiative_supported BOOLEAN NOT NULL DEFAULT 0"
                )
        if "quoterequestcompany" in tables:
            columns = {column["name"] for column in inspect(connection).get_columns("quoterequestcompany")}
            if "green_verification_id" not in columns:
                connection.exec_driver_sql(
                    "ALTER TABLE quoterequestcompany ADD COLUMN green_verification_id VARCHAR"
                )
            connection.exec_driver_sql(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_quoterequestcompany_green_verification_id "
                "ON quoterequestcompany (green_verification_id)"
            )


def migrate_company_support_phone_column() -> None:
    with engine.begin() as connection:
        tables = set(inspect(connection).get_table_names())
        if "company" in tables:
            columns = {column["name"] for column in inspect(connection).get_columns("company")}
            if "support_phone" not in columns:
                connection.exec_driver_sql(
                    "ALTER TABLE company ADD COLUMN support_phone VARCHAR"
                )


def migrate_demo_seed_columns() -> None:
    with engine.begin() as connection:
        tables = set(inspect(connection).get_table_names())
        if "company" in tables:
            columns = {column["name"] for column in inspect(connection).get_columns("company")}
            if "service_offerings" not in columns:
                connection.exec_driver_sql(
                    "ALTER TABLE company ADD COLUMN service_offerings TEXT NOT NULL DEFAULT ''"
                )
            if "demo_key" not in columns:
                connection.exec_driver_sql("ALTER TABLE company ADD COLUMN demo_key VARCHAR")
            connection.exec_driver_sql(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_company_demo_key ON company (demo_key)"
            )
        if "project" in tables:
            columns = {column["name"] for column in inspect(connection).get_columns("project")}
            additions = {
                "budget_iqd": "INTEGER",
                "milestones_json": "TEXT NOT NULL DEFAULT '[]'",
                "before_metrics_json": "TEXT NOT NULL DEFAULT '{}'",
                "after_metrics_json": "TEXT NOT NULL DEFAULT '{}'",
                "customer_user_id": "INTEGER REFERENCES user(id)",
                "demo_key": "VARCHAR",
            }
            for name, sql_type in additions.items():
                if name not in columns:
                    connection.exec_driver_sql(
                        f"ALTER TABLE project ADD COLUMN {name} {sql_type}"
                    )
            connection.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_project_customer_user_id ON project (customer_user_id)"
            )
            connection.exec_driver_sql(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_project_demo_key ON project (demo_key)"
            )
        if "user" in tables:
            columns = {column["name"] for column in inspect(connection).get_columns("user")}
            if "demo_key" not in columns:
                connection.exec_driver_sql("ALTER TABLE user ADD COLUMN demo_key VARCHAR")
            connection.exec_driver_sql(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_user_demo_key ON user (demo_key)"
            )


def migrate_company_verification(session: Session) -> None:
    from models import Company, CompanyVerification

    companies = session.exec(select(Company)).all()
    for company in companies:
        if session.get(CompanyVerification, company.id) is not None:
            continue
        session.add(CompanyVerification(company_id=company.id))
    session.commit()


def get_session():
    with Session(engine) as session:
        yield session