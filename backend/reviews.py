import os
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field as PydanticField
from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from database import get_session
from models import Company, Project, QuoteRequest, QuoteRequestCompany, Review, User
from quote_requests import _token_hash
from security import get_optional_current_user, require_role

router = APIRouter(prefix="/api", tags=["Reviews"])
UNVERIFIED_REVIEW_MESSAGE = "You can only review companies after completing a project with them."
DEMO_REVIEW_MARKERS = (
    "بيانات توضيحية:",
    "Seeded demo review (not customer testimony):",
    "تقييم تجريبي غير حقيقي ولا يمثل شهادة عميل:",
)


class ReviewCreate(BaseModel):
    project_id: int = PydanticField(gt=0)
    access_token: Optional[str] = PydanticField(default=None, min_length=32, max_length=128)
    rating: float = PydanticField(ge=1, le=5)
    communication_rating: float = PydanticField(ge=1, le=5)
    work_quality_rating: float = PydanticField(ge=1, le=5)
    comment: str = PydanticField(min_length=10, max_length=2000)


class ReviewUpdate(BaseModel):
    project_id: int = PydanticField(gt=0)
    rating: float = PydanticField(ge=1, le=5)
    communication_rating: float = PydanticField(ge=1, le=5)
    work_quality_rating: float = PydanticField(ge=1, le=5)
    comment: str = PydanticField(min_length=10, max_length=2000)


class ReviewRead(BaseModel):
    id: int
    company_id: int
    company_name: str
    project_id: int
    project_title: str
    system_kwp: float
    location_governorate: str
    location_district: str
    client_name: str
    rating: float
    communication_rating: float
    work_quality_rating: float
    comment: str
    is_verified: bool
    is_demo: bool = False
    created_at: datetime


class AdminReviewRead(ReviewRead):
    is_hidden: bool
    is_deleted: bool


class ReviewVisibilityUpdate(BaseModel):
    is_hidden: bool


def _review_payload(review: Review, project: Project, company: Company) -> dict:
    return {
        "id": review.id,
        "company_id": review.company_id,
        "company_name": company.name,
        "project_id": review.project_id,
        "project_title": project.title,
        "system_kwp": project.system_kwp,
        "location_governorate": project.location_governorate,
        "location_district": project.location_district,
        "client_name": review.client_name,
        "rating": review.rating,
        "communication_rating": review.communication_rating,
        "work_quality_rating": review.work_quality_rating,
        "comment": review.comment,
        "is_verified": review.is_verified,
        "is_demo": not review.is_verified and review.comment.startswith(DEMO_REVIEW_MARKERS),
        "created_at": review.created_at,
    }


def _admin_review_payload(review: Review, project: Project, company: Company) -> dict:
    return {
        **_review_payload(review, project, company),
        "is_hidden": review.is_hidden,
        "is_deleted": review.is_deleted,
    }


def _review_rows(session: Session, where_clause, *, include_demo: bool = False):
    query = (
        select(Review, Project, Company)
        .join(Project, Review.project_id == Project.id)
        .join(Company, Review.company_id == Company.id)
        .where(
            Review.is_hidden.is_(False),
            Review.is_deleted.is_(False),
            Project.status == "completed",
            Company.is_blocked.is_(False),
            where_clause,
        )
    )
    if include_demo:
        query = query.where(
            or_(
                and_(
                    Review.is_verified.is_(True),
                    Company.verification_status == "verified",
                ),
                and_(
                    Review.is_verified.is_(False),
                    or_(*(Review.comment.startswith(marker) for marker in DEMO_REVIEW_MARKERS)),
                    Company.verification_status.in_(
                        ["pending", "identity_verified", "verified"]
                    ),
                ),
            )
        )
    else:
        query = query.where(
            Review.is_verified.is_(True),
            Company.verification_status == "verified",
        )
    return session.exec(query).all()


def _demo_review_preview_enabled() -> bool:
    return (
        os.getenv("APP_ENV", "development").strip().casefold() in {"development", "dev", "test"}
        and os.getenv("UTU_DEMO_REVIEW_PREVIEW_ENABLED", "").strip().casefold() == "true"
    )


def _recalculate_company_rating(session: Session, company: Company) -> None:
    visible_reviews = session.exec(
        select(Review).where(
            Review.company_id == company.id,
            Review.is_verified.is_(True),
            Review.is_hidden.is_(False),
            Review.is_deleted.is_(False),
        )
    ).all()
    if visible_reviews:
        average = sum(
            (Decimal(str(item.rating)) for item in visible_reviews), Decimal(0)
        ) / len(visible_reviews)
        company.rating = float(average.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    else:
        company.rating = 0
    company.reviews_count = len(visible_reviews)
    session.add(company)


@router.get("/reviews", response_model=list[ReviewRead])
def list_reviews(
    include_demo: bool = Query(default=False),
    session: Session = Depends(get_session),
):
    rows = _review_rows(
        session,
        True,
        include_demo=include_demo and _demo_review_preview_enabled(),
    )
    rows.sort(key=lambda row: (row[0].created_at, row[0].id or 0), reverse=True)
    return [_review_payload(review, project, company) for review, project, company in rows]


@router.get("/companies/{company_id}/reviews", response_model=list[ReviewRead])
def list_company_reviews(company_id: int, session: Session = Depends(get_session)):
    company = session.get(Company, company_id)
    if company is None or company.verification_status == "rejected":
        raise HTTPException(status_code=404, detail="Company not found")
    rows = _review_rows(session, Review.company_id == company_id)
    rows.sort(key=lambda row: row[0].created_at, reverse=True)
    return [_review_payload(review, project, installer) for review, project, installer in rows]


@router.get("/reviews/featured", response_model=list[ReviewRead])
def list_featured_reviews(
    limit: int = Query(default=6, ge=1, le=20),
    session: Session = Depends(get_session),
):
    rows = _review_rows(session, Review.rating >= 4)
    rows.sort(key=lambda row: (row[0].rating, row[0].created_at), reverse=True)
    return [_review_payload(review, project, company) for review, project, company in rows[:limit]]


@router.get("/admin/reviews", response_model=list[AdminReviewRead])
def list_admin_reviews(
    company_id: Optional[int] = Query(default=None, gt=0),
    is_verified: Optional[bool] = Query(default=None),
    is_hidden: Optional[bool] = Query(default=None),
    is_deleted: Optional[bool] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    _admin: User = Depends(require_role(["admin"])),
):
    query = (
        select(Review, Project, Company)
        .join(Project, Review.project_id == Project.id)
        .join(Company, Review.company_id == Company.id)
    )
    if company_id is not None:
        query = query.where(Review.company_id == company_id)
    if is_verified is not None:
        query = query.where(Review.is_verified.is_(is_verified))
    if is_hidden is not None:
        query = query.where(Review.is_hidden.is_(is_hidden))
    if is_deleted is not None:
        query = query.where(Review.is_deleted.is_(is_deleted))
    rows = session.exec(
        query.order_by(Review.created_at.desc(), Review.id.desc()).offset(offset).limit(limit)
    ).all()
    return [
        _admin_review_payload(review, project, company)
        for review, project, company in rows
    ]


@router.patch("/admin/reviews/{review_id}/visibility", response_model=AdminReviewRead)
def update_review_visibility(
    review_id: int,
    update: ReviewVisibilityUpdate,
    session: Session = Depends(get_session),
    _admin: User = Depends(require_role(["admin"])),
):
    row = session.exec(
        select(Review, Project, Company)
        .join(Project, Review.project_id == Project.id)
        .join(Company, Review.company_id == Company.id)
        .where(Review.id == review_id)
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Review not found")
    review, project, company = row
    if not review.is_deleted and review.is_hidden != update.is_hidden:
        review.is_hidden = update.is_hidden
        session.add(review)
        _recalculate_company_rating(session, company)
        session.commit()
        session.refresh(review)
    return _admin_review_payload(review, project, company)


@router.delete("/admin/reviews/{review_id}", response_model=AdminReviewRead)
def delete_admin_review(
    review_id: int,
    session: Session = Depends(get_session),
    _admin: User = Depends(require_role(["admin"])),
):
    row = session.exec(
        select(Review, Project, Company)
        .join(Project, Review.project_id == Project.id)
        .join(Company, Review.company_id == Company.id)
        .where(Review.id == review_id)
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Review not found")
    review, project, company = row
    if not review.is_deleted:
        review.is_deleted = True
        session.add(review)
        _recalculate_company_rating(session, company)
        session.commit()
        session.refresh(review)
    return _admin_review_payload(review, project, company)


@router.post("/reviews", response_model=ReviewRead, status_code=201)
def create_review(
    payload: ReviewCreate,
    session: Session = Depends(get_session),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    project = session.get(Project, payload.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    request = _request_for_project(session, project, payload.access_token, current_user)
    company = _validate_review_eligibility(session, project, request)

    existing = session.exec(select(Review).where(Review.project_id == project.id)).first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="A review already exists for this completed project")

    review = Review(
        company_id=company.id,
        project_id=project.id,
        client_name=_masked_name(request.customer_name),
        rating=payload.rating,
        communication_rating=payload.communication_rating,
        work_quality_rating=payload.work_quality_rating,
        comment=payload.comment.strip(),
        is_verified=True,
    )
    session.add(review)
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="A review already exists for this completed project")

    _recalculate_company_rating(session, company)
    session.commit()
    session.refresh(review)
    return _review_payload(review, project, company)


@router.get("/reviews/projects/{project_id}/mine", response_model=Optional[ReviewRead])
def get_my_project_review(
    project_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_role(["client"])),
):
    project = session.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    request = _owned_request_for_project(session, project, current_user)
    _validate_review_eligibility(session, project, request)
    review = session.exec(select(Review).where(Review.project_id == project.id)).first()
    if review is None:
        return None
    company = session.get(Company, project.company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    return _review_payload(review, project, company)


@router.put("/reviews/{project_id}", response_model=ReviewRead)
def update_review(
    project_id: int,
    payload: ReviewUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_role(["client"])),
):
    if payload.project_id != project_id:
        raise HTTPException(status_code=422, detail="Project ID does not match the request path")
    project = session.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    request = _owned_request_for_project(session, project, current_user)
    company = _validate_review_eligibility(session, project, request)
    review = session.exec(select(Review).where(Review.project_id == project.id)).first()
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")
    if review.is_deleted:
        raise HTTPException(status_code=404, detail="Review not found")

    review.rating = payload.rating
    review.communication_rating = payload.communication_rating
    review.work_quality_rating = payload.work_quality_rating
    review.comment = payload.comment.strip()
    session.add(review)

    _recalculate_company_rating(session, company)
    session.commit()
    session.refresh(review)
    return _review_payload(review, project, company)


def _request_for_project(
    session: Session,
    project: Project,
    access_token: Optional[str],
    current_user: Optional[User],
) -> QuoteRequest:
    if current_user is not None:
        if current_user.role != "client":
            raise HTTPException(status_code=403, detail="Only clients can submit reviews")
        return _owned_request_for_project(session, project, current_user)
    if not access_token:
        raise HTTPException(status_code=401, detail="Client authentication or request access token is required")
    request = session.exec(
        select(QuoteRequest).where(QuoteRequest.access_token_hash == _token_hash(access_token))
    ).first()
    if request is None:
        raise HTTPException(status_code=401, detail="Request access token is invalid")
    return request


def _owned_request_for_project(session: Session, project: Project, current_user: User) -> QuoteRequest:
    if project.quote_request_id is None:
        raise HTTPException(status_code=403, detail=UNVERIFIED_REVIEW_MESSAGE)
    request = session.exec(
        select(QuoteRequest).where(
            QuoteRequest.id == project.quote_request_id,
            QuoteRequest.user_id == current_user.id,
        )
    ).first()
    if request is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return request


def _validate_review_eligibility(
    session: Session,
    project: Project,
    request: QuoteRequest,
) -> Company:
    if project.status != "completed" or project.quote_request_id != request.id:
        raise HTTPException(status_code=403, detail=UNVERIFIED_REVIEW_MESSAGE)
    assignment = session.exec(
        select(QuoteRequestCompany).where(
            QuoteRequestCompany.request_id == request.id,
            QuoteRequestCompany.company_id == project.company_id,
        )
    ).first()
    company = session.get(Company, project.company_id)
    if assignment is None or assignment.status != "selected" or company is None or company.verification_status != "verified":
        raise HTTPException(status_code=403, detail=UNVERIFIED_REVIEW_MESSAGE)
    return company


def _masked_name(name: str) -> str:
    parts = name.strip().split()
    if len(parts) < 2:
        return parts[0] if parts else "Customer"
    return f"{parts[0]} {parts[-1][0]}."