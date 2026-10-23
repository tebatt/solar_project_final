import logging
import os

from sqlalchemy import func
from sqlmodel import Session, select

from models import User
from security import hash_password

logger = logging.getLogger(__name__)

DEFAULT_ADMIN_EMAIL = "admin@solar.iq"
DEFAULT_ADMIN_PASSWORD = "adminpassword"
MIN_ADMIN_PASSWORD_LENGTH = 10
LOCAL_ENVIRONMENTS = {"development", "dev", "test", "testing"}


def ensure_startup_admin(session: Session) -> bool:
    """Create one bootstrap admin only when the database has no admin account."""
    existing_admin = session.exec(select(User).where(User.role == "admin")).first()
    if existing_admin is not None:
        return False

    email = os.getenv("UTU_ADMIN_EMAIL", DEFAULT_ADMIN_EMAIL).strip().lower()
    if not email or "@" not in email:
        raise RuntimeError("UTU_ADMIN_EMAIL must be a valid email address.")

    conflicting_user = session.exec(
        select(User).where(func.lower(User.email) == email)
    ).first()
    if conflicting_user is not None:
        raise RuntimeError(
            f"Cannot bootstrap administrator {email!r}: that email belongs to a non-admin account."
        )

    password = os.getenv("UTU_ADMIN_PASSWORD")
    environment = os.getenv("APP_ENV", "development").strip().lower()
    used_default_password = False
    if not password:
        if environment not in LOCAL_ENVIRONMENTS:
            raise RuntimeError(
                "Set UTU_ADMIN_PASSWORD to a private password before starting without an admin account."
            )
        password = DEFAULT_ADMIN_PASSWORD
        used_default_password = True
    elif len(password) < MIN_ADMIN_PASSWORD_LENGTH:
        raise RuntimeError(
            f"UTU_ADMIN_PASSWORD must be at least {MIN_ADMIN_PASSWORD_LENGTH} characters."
        )

    admin = User(
        email=email,
        hashed_password=hash_password(password),
        full_name=os.getenv("UTU_ADMIN_NAME", "Platform Administrator").strip()
        or "Platform Administrator",
        role="admin",
        is_active=True,
        is_verified=True,
    )
    session.add(admin)
    session.commit()
    if used_default_password:
        logger.warning(
            "Created the local bootstrap administrator %s with the development default password; "
            "change it before exposing this server.",
            email,
        )
    logger.info("Created bootstrap administrator account %s.", email)
    return True
