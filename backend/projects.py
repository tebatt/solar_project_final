import json
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field as PydanticField
from sqlmodel import Session, select

from database import get_session
from companies import _require_admin
from models import Company, Project, ProjectLifecycleRecord, QuoteRequest, QuoteRequestCompany, Review, User
from security import get_optional_current_user

router = APIRouter(prefix="/api/projects", tags=["Projects"])
ProjectStatus = Literal["pending", "draft", "in_progress", "completed", "featured"]


class ProjectCompanyRead(BaseModel):
    id: int
    name: str
    logo_url: Optional[str]
    founded_year: int
    projects_count: int
    address: Optional[str]
    verification_status: str


class ProjectReviewSummary(BaseModel):
    rating: float
    client_name: str
    comment: str
    is_verified: bool


class ProjectRead(BaseModel):
    id: int
    title: str
    description: str
    category: Optional[str] = None
    system_size_label: Optional[str] = None
    company_id: int
    company: ProjectCompanyRead
    client_name: Optional[str]
    location_governorate: str
    location_district: str
    system_kwp: float
    battery_kwh: Optional[float]
    installation_type: str
    rating: float
    image_url: str
    gallery_urls: list[str]
    status: str
    completed_at: Optional[datetime]
    created_at: datetime
    panel_count: Optional[int]
    roof_type: Optional[str]
    inverter_details: Optional[str]
    annual_generation_kwh: Optional[float]
    testimonial: Optional[str]
    budget_iqd: Optional[int] = None
    milestones: list[str] = PydanticField(default_factory=list)
    before_metrics: dict[str, str] = PydanticField(default_factory=dict)
    after_metrics: dict[str, str] = PydanticField(default_factory=dict)
    verified_review: Optional[ProjectReviewSummary] = None


class ProjectCreate(BaseModel):
    title: str = PydanticField(min_length=2, max_length=200)
    description: str = ""
    category: Optional[Literal["residential", "commercial", "agricultural", "hybrid"]] = None
    system_size_label: Optional[str] = PydanticField(default=None, max_length=100)
    company_id: int
    client_name: Optional[str] = None
    location_governorate: str
    location_district: str
    system_kwp: float = PydanticField(gt=0, le=5000)
    battery_kwh: Optional[float] = PydanticField(default=None, ge=0, le=10000)
    installation_type: str
    rating: float = PydanticField(default=4.9, ge=0, le=5)
    image_url: str
    gallery_urls: list[str] = PydanticField(default_factory=list)
    status: ProjectStatus = "completed"
    completed_at: Optional[datetime] = None
    panel_count: Optional[int] = PydanticField(default=None, ge=1)
    roof_type: Optional[str] = None
    inverter_details: Optional[str] = None
    annual_generation_kwh: Optional[float] = PydanticField(default=None, ge=0)
    testimonial: Optional[str] = None
    quote_request_id: Optional[int] = None
    budget_iqd: Optional[int] = PydanticField(default=None, ge=0)
    milestones: list[str] = PydanticField(default_factory=list)
    before_metrics: dict[str, str] = PydanticField(default_factory=dict)
    after_metrics: dict[str, str] = PydanticField(default_factory=dict)


class ProjectStatusUpdate(BaseModel):
    status: ProjectStatus


def _project_payload(project: Project, company: Company, session: Session) -> dict:
    result = project.model_dump()
    try:
        result["gallery_urls"] = json.loads(project.gallery_urls_json)
    except (TypeError, json.JSONDecodeError):
        result["gallery_urls"] = []
    result["company"] = ProjectCompanyRead.model_validate(company, from_attributes=True).model_dump()
    try:
        result["milestones"] = json.loads(project.milestones_json)
        result["before_metrics"] = json.loads(project.before_metrics_json)
        result["after_metrics"] = json.loads(project.after_metrics_json)
    except (TypeError, json.JSONDecodeError):
        result["milestones"] = []
        result["before_metrics"] = {}
        result["after_metrics"] = {}
    review = session.exec(
        select(Review).where(
            Review.project_id == project.id,
            Review.company_id == company.id,
            Review.is_verified.is_(True),
            Review.is_hidden.is_(False),
            Review.is_deleted.is_(False),
        )
    ).first()
    result["verified_review"] = (
        ProjectReviewSummary.model_validate(review, from_attributes=True).model_dump()
        if review is not None
        and project.status == "completed"
        and company.verification_status == "verified"
        else None
    )
    return result


def _get_project_and_company(project_id: int, session: Session) -> tuple[Project, Company]:
    record = session.exec(
        select(Project, Company)
        .join(Company, Project.company_id == Company.id)
        .where(Project.id == project_id, Company.verification_status != "rejected")
    ).first()
    if record is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return record


@router.get("", response_model=list[ProjectRead])
def list_projects(
    status: Optional[ProjectStatus] = Query(default=None),
    featured: Optional[bool] = Query(default=None),
    company_id: Optional[int] = Query(default=None, gt=0),
    session: Session = Depends(get_session),
):
    query = select(Project, Company).join(Company, Project.company_id == Company.id).where(
        Company.verification_status != "rejected",
        Company.is_blocked.is_(False),
        Project.id.not_in(
            select(ProjectLifecycleRecord.project_id).where(
                ProjectLifecycleRecord.status != "approved",
                ProjectLifecycleRecord.project_id.is_not(None),
            )
        ),
    )
    if status == "completed":
        query = query.where(Project.status.in_(["completed", "featured"]))
    elif status is not None:
        query = query.where(Project.status == status)
    if featured is True:
        query = query.where(Project.status == "featured")
    elif featured is False:
        query = query.where(Project.status != "featured")
    if company_id is not None:
        query = query.where(Project.company_id == company_id)
    rows = session.exec(query.order_by(Project.created_at.desc(), Project.id.desc())).all()
    return [_project_payload(project, company, session) for project, company in rows]


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(project_id: int, session: Session = Depends(get_session)):
    project, company = _get_project_and_company(project_id, session)
    if company.is_blocked:
        raise HTTPException(status_code=404, detail="Project not found")
    lifecycle = session.exec(
        select(ProjectLifecycleRecord).where(
            ProjectLifecycleRecord.project_id == project_id,
            ProjectLifecycleRecord.status != "approved",
        )
    ).first()
    if lifecycle is not None:
        raise HTTPException(status_code=404, detail="Project not found")
    return _project_payload(project, company, session)


@router.post("", response_model=ProjectRead, status_code=201)
def create_project(
    payload: ProjectCreate,
    session: Session = Depends(get_session),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    _require_admin(current_user)
    company = session.get(Company, payload.company_id)
    if company is None or company.verification_status == "rejected":
        raise HTTPException(status_code=422, detail="A listed company is required")
    if payload.quote_request_id is not None:
        request = session.get(QuoteRequest, payload.quote_request_id)
        assignment = session.exec(
            select(QuoteRequestCompany).where(
                QuoteRequestCompany.request_id == payload.quote_request_id,
                QuoteRequestCompany.company_id == payload.company_id,
            )
        ).first()
        if request is None or assignment is None:
            raise HTTPException(status_code=422, detail="The request must be assigned to this company")
    values = payload.model_dump(exclude={
        "gallery_urls", "completed_at", "milestones", "before_metrics", "after_metrics"
    })
    project = Project(
        **values,
        gallery_urls_json=json.dumps(payload.gallery_urls),
        milestones_json=json.dumps(payload.milestones),
        before_metrics_json=json.dumps(payload.before_metrics),
        after_metrics_json=json.dumps(payload.after_metrics),
        completed_at=payload.completed_at or (
            datetime.now(timezone.utc) if payload.status in {"completed", "featured"} else None
        ),
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return _project_payload(project, company, session)


@router.patch("/{project_id}/status", response_model=ProjectRead)
def update_project_status(
    project_id: int,
    payload: ProjectStatusUpdate,
    session: Session = Depends(get_session),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    _require_admin(current_user)
    project, company = _get_project_and_company(project_id, session)
    previous_status = project.status
    project.status = payload.status
    if payload.status in {"completed", "featured"} and project.completed_at is None:
        project.completed_at = datetime.now(timezone.utc)
    if payload.status in {"pending", "draft", "in_progress"} and previous_status in {"completed", "featured"}:
        project.completed_at = None
    session.add(project)
    session.commit()
    session.refresh(project)
    return _project_payload(project, company, session)