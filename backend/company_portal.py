import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field as PydanticField
from sqlmodel import Session, select

from chat_moderation import detect_contact_violation
from database import get_session
from companies import CompanyRead
from models import (
    Company,
    CompanyBranch,
    CompanyVerification,
    DepositPayment,
    ProjectLifecycleRecord,
    QuoteRequest,
    QuoteRequestCompany,
    User,
    VerificationDocument,
)
from quote_requests import (
    ACTIVE_DEPOSIT_STATUSES,
    QuoteRequestRead,
    _as_group,
    _authenticated_company_id,
)
from verification import can_submit_quotes, verification_tier

router = APIRouter(prefix="/api/company", tags=["Company portal"])


class VerificationApplicationUpdate(BaseModel):
    business_license_number: Optional[str] = PydanticField(default=None, min_length=2, max_length=100)
    tax_registration_number: Optional[str] = PydanticField(default=None, min_length=2, max_length=100)
    projects_count: Optional[int] = PydanticField(default=None, ge=0, le=100000)


class CompanyProfileUpdate(BaseModel):
    name: Optional[str] = PydanticField(default=None, min_length=2, max_length=120)
    founded_year: Optional[int] = PydanticField(default=None, ge=1900, le=2100)
    address: Optional[str] = PydanticField(default=None, max_length=500)
    phone: Optional[str] = PydanticField(default=None, min_length=11, max_length=11, pattern=r"^07\d{9}$")
    support_phone: Optional[str] = PydanticField(
        default=None,
        max_length=11,
        pattern=r"^(?:07\d{9}|\d{3,6}|\d{7,11})$",
    )
    business_license_number: Optional[str] = PydanticField(default=None, max_length=100)
    tax_registration_number: Optional[str] = PydanticField(default=None, max_length=100)


class BranchLocationInput(BaseModel):
    governorate: str = PydanticField(min_length=1, max_length=100)
    address: str = PydanticField(min_length=1, max_length=500)


class CompanyBranchesUpdate(BaseModel):
    branches: list[BranchLocationInput] = PydanticField(default_factory=list, max_length=30)


class TechnicalDetailsUpdate(BaseModel):
    roof_area: Optional[str] = PydanticField(default=None, max_length=120)
    site_dimensions: Optional[str] = PydanticField(default=None, max_length=120)


class CompanyProfileDocumentRead(BaseModel):
    document_type: str
    file_name: str
    content_type: str
    uploaded_at: datetime


class VerificationRead(BaseModel):
    company_id: int
    business_license_number: str
    tax_registration_number: str
    license_checked: bool
    tax_record_checked: bool
    projects_checked: bool
    reviewed_at: Optional[datetime]


class CompanyProfileRead(CompanyRead):
    verification: Optional[VerificationRead]
    documents: list[CompanyProfileDocumentRead] = PydanticField(default_factory=list)


class VerificationStatusRead(BaseModel):
    verification_status: str


class CompanySupportPhoneRead(BaseModel):
    support_phone: Optional[str]


class CompanyProfileContactsRead(BaseModel):
    phone: Optional[str]
    support_phone: Optional[str]


@router.get("/requests", response_model=list[QuoteRequestRead])
def company_requests(
    authorization: Optional[str] = Header(default=None),
    session: Session = Depends(get_session),
    is_green_initiative: Optional[bool] = None,
):
    company_id = _authenticated_company_id(authorization, session)
    company = session.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    if not can_submit_quotes(company.verification_status):
        raise HTTPException(
            status_code=403,
            detail="Identity verification is required to access quote requests",
        )
    assignments = session.exec(
        select(QuoteRequestCompany).where(QuoteRequestCompany.company_id == company_id)
    ).all()
    results = []
    for assignment in assignments:
        request = session.get(QuoteRequest, assignment.request_id)
        if request is None:
            continue
        if is_green_initiative is not None and request.is_green_initiative != is_green_initiative:
            continue
        result = _as_group(session, request)
        result["companies"] = [
            company for company in result["companies"] if company["company_id"] == company_id
        ]
        # The customer's phone is shared only after the customer has placed a
        # deposit with this company; until then contact stays on the platform.
        if not _has_active_deposit(session, assignment.id):
            result["customer_phone"] = None
            notes = result["details"].get("notes")
            if isinstance(notes, str) and detect_contact_violation(notes):
                result["details"]["notes"] = "Location and contact details are available after deposit confirmation."
        results.append(result)
    # Reading the inbox does not change any status; see mark_request_viewed.
    return sorted(results, key=lambda item: item["created_at"], reverse=True)


def _has_active_deposit(session: Session, assignment_id: int) -> bool:
    payment = session.exec(
        select(DepositPayment).where(DepositPayment.assignment_id == assignment_id)
    ).first()
    return payment is not None and payment.payment_status in ACTIVE_DEPOSIT_STATUSES


class RequestViewedRead(BaseModel):
    status: str


@router.post("/requests/{group_id}/viewed", response_model=RequestViewedRead)
def mark_request_viewed(
    group_id: str,
    authorization: Optional[str] = Header(default=None),
    session: Session = Depends(get_session),
):
    """Record that the company actually opened this request."""
    company_id = _authenticated_company_id(authorization, session)
    company = session.get(Company, company_id)
    if company is None or not can_submit_quotes(company.verification_status):
        raise HTTPException(
            status_code=403,
            detail="Identity verification is required to access quote requests",
        )
    request = session.exec(select(QuoteRequest).where(QuoteRequest.group_id == group_id)).first()
    assignment = (
        session.exec(
            select(QuoteRequestCompany).where(
                QuoteRequestCompany.request_id == request.id,
                QuoteRequestCompany.company_id == company_id,
            )
        ).first()
        if request is not None
        else None
    )
    if assignment is None:
        raise HTTPException(status_code=404, detail="This request was not sent to your company")
    if assignment.status == "sent":
        assignment.status = "viewed"
        session.add(assignment)
        session.commit()
    return {"status": assignment.status}


@router.get("/profile", response_model=CompanyProfileRead)
def company_profile(
    authorization: Optional[str] = Header(default=None),
    session: Session = Depends(get_session),
):
    company_id = _authenticated_company_id(authorization, session)
    company = session.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    verification = session.get(CompanyVerification, company_id)
    documents = session.exec(
        select(VerificationDocument)
        .where(VerificationDocument.company_id == company_id)
        .order_by(VerificationDocument.document_type)
    ).all()
    return {
        **company.model_dump(),
        "branches": [
            {"governorate": branch.governorate, "address": branch.address}
            for branch in session.exec(
                select(CompanyBranch)
                .where(CompanyBranch.company_id == company_id)
                .order_by(CompanyBranch.id)
            ).all()
        ],
        "verification": verification.model_dump() if verification else None,
        "documents": [
            {
                "document_type": document.document_type,
                "file_name": document.file_name,
                "content_type": document.content_type,
                "uploaded_at": document.uploaded_at,
            }
            for document in documents
        ],
    }


@router.put("/profile/branches", response_model=list[BranchLocationInput])
def update_company_branches(
    payload: CompanyBranchesUpdate,
    authorization: Optional[str] = Header(default=None),
    session: Session = Depends(get_session),
):
    company_id = _authenticated_company_id(authorization, session)
    company = session.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    branches = [
        CompanyBranch(
            company_id=company_id,
            governorate=branch.governorate.strip(),
            address=branch.address.strip(),
        )
        for branch in payload.branches
    ]
    if any(not branch.governorate or not branch.address for branch in branches):
        raise HTTPException(status_code=422, detail="Branch governorate and address are required")
    existing = session.exec(
        select(CompanyBranch).where(CompanyBranch.company_id == company_id)
    ).all()
    for branch in existing:
        session.delete(branch)
    session.add_all(branches)
    session.commit()
    return [
        {"governorate": branch.governorate, "address": branch.address}
        for branch in branches
    ]


@router.put("/profile/support-phone", response_model=CompanySupportPhoneRead)
def update_company_support_phone(
    payload: CompanyProfileUpdate,
    authorization: Optional[str] = Header(default=None),
    session: Session = Depends(get_session),
):
    company_id = _authenticated_company_id(authorization, session)
    company = session.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    company.support_phone = payload.support_phone.strip() if payload.support_phone else None
    session.add(company)
    session.commit()
    session.refresh(company)
    return {"support_phone": company.support_phone}


@router.put("/profile", response_model=CompanyProfileContactsRead)
def update_company_profile_contacts(
    payload: CompanyProfileUpdate,
    authorization: Optional[str] = Header(default=None),
    session: Session = Depends(get_session),
):
    company_id = _authenticated_company_id(authorization, session)
    company = session.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    if "name" in payload.model_fields_set and payload.name is not None:
        company.name = payload.name.strip()
    if "founded_year" in payload.model_fields_set and payload.founded_year is not None:
        company.founded_year = payload.founded_year
    if "address" in payload.model_fields_set:
        company.address = payload.address.strip() if payload.address else ""
    if "phone" in payload.model_fields_set:
        company.phone = payload.phone.strip() if payload.phone else ""
    if "support_phone" in payload.model_fields_set:
        company.support_phone = payload.support_phone.strip() if payload.support_phone else None
    verification = session.get(CompanyVerification, company_id)
    if verification is None and (
        "business_license_number" in payload.model_fields_set
        or "tax_registration_number" in payload.model_fields_set
    ):
        verification = CompanyVerification(company_id=company_id)
    if verification is not None:
        if "business_license_number" in payload.model_fields_set:
            verification.business_license_number = payload.business_license_number.strip() if payload.business_license_number else ""
        if "tax_registration_number" in payload.model_fields_set:
            verification.tax_registration_number = payload.tax_registration_number.strip() if payload.tax_registration_number else ""
        session.add(verification)
    session.add(company)
    session.commit()
    session.refresh(company)
    return {"phone": company.phone or None, "support_phone": company.support_phone}


@router.put("/verification-application", response_model=VerificationStatusRead)
def update_verification_application(
    payload: VerificationApplicationUpdate,
    authorization: Optional[str] = Header(default=None),
    session: Session = Depends(get_session),
):
    company_id = _authenticated_company_id(authorization, session)
    company = session.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    verification = session.get(CompanyVerification, company_id)
    if verification is None:
        verification = CompanyVerification(company_id=company_id)
    if payload.business_license_number is not None and payload.business_license_number.strip():
        verification.business_license_number = payload.business_license_number.strip()
    if payload.tax_registration_number is not None and payload.tax_registration_number.strip():
        verification.tax_registration_number = payload.tax_registration_number.strip()
    if verification_tier(company.verification_status) == 0:
        verification.license_checked = False
        verification.tax_record_checked = False
        verification.projects_checked = False
        verification.reviewed_at = None
    if payload.projects_count is not None:
        company.projects_count = payload.projects_count
    if verification_tier(company.verification_status) == 0:
        company.verification_status = "pending"
    linked_user = session.exec(select(User).where(User.company_id == company_id)).first()
    if linked_user is not None:
        linked_user.is_verified = verification_tier(company.verification_status) >= 1
        session.add(linked_user)
    session.add(verification)
    session.add(company)
    session.commit()
    return {"verification_status": company.verification_status}


@router.post("/verification-application/resubmit", response_model=VerificationStatusRead)
def resubmit_verification_application(
    payload: VerificationApplicationUpdate,
    authorization: Optional[str] = Header(default=None),
    session: Session = Depends(get_session),
):
    company_id = _authenticated_company_id(authorization, session)
    company = session.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    has_identity_document = session.exec(
        select(VerificationDocument.id).where(
            VerificationDocument.company_id == company_id,
            VerificationDocument.document_type.in_(
                ["national_id", "syndicate_card", "chamber_id", "office_permit"]
            ),
        )
    ).first()
    if has_identity_document is None:
        raise HTTPException(status_code=422, detail="Upload an identity or office document before resubmitting")

    verification = session.get(CompanyVerification, company_id)
    if verification is None:
        verification = CompanyVerification(company_id=company_id)
    if payload.business_license_number is not None:
        verification.business_license_number = payload.business_license_number.strip()
    if payload.tax_registration_number is not None:
        verification.tax_registration_number = payload.tax_registration_number.strip()
    verification.license_checked = False
    verification.tax_record_checked = False
    verification.projects_checked = False
    verification.reviewed_at = None
    if payload.projects_count is not None:
        company.projects_count = payload.projects_count
    company.verification_status = "pending"
    linked_user = session.exec(select(User).where(User.company_id == company_id)).first()
    if linked_user is not None:
        linked_user.is_verified = False
        session.add(linked_user)
    session.add(verification)
    session.add(company)
    session.commit()
    return {"verification_status": company.verification_status}


@router.put("/requests/{group_id}/technical-details")
def update_company_request_technical_details(
    group_id: str,
    payload: TechnicalDetailsUpdate,
    authorization: Optional[str] = Header(default=None),
    session: Session = Depends(get_session),
):
    company_id = _authenticated_company_id(authorization, session)
    company = session.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    if not can_submit_quotes(company.verification_status):
        raise HTTPException(status_code=403, detail="Identity verification is required to edit project details")
    request = session.exec(select(QuoteRequest).where(QuoteRequest.group_id == group_id)).first()
    if request is None:
        raise HTTPException(status_code=404, detail="Request not found")
    assignment = session.exec(
        select(QuoteRequestCompany).where(
            QuoteRequestCompany.request_id == request.id,
            QuoteRequestCompany.company_id == company_id,
        )
    ).first()
    if assignment is None:
        raise HTTPException(status_code=404, detail="This request was not sent to your company")
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=422, detail="Provide at least one technical detail")

    lifecycle = session.get(ProjectLifecycleRecord, assignment.id)
    if lifecycle is not None:
        contract = json.loads(lifecycle.contract_json)
        signatures = contract.get("signatures", {})
        if (
            signatures.get("customer_signed")
            or signatures.get("company_signed")
            or lifecycle.status in {"in_progress", "pending_review", "approved"}
        ):
            raise HTTPException(
                status_code=409,
                detail="Technical details cannot be changed after a contract is signed or work has started",
            )

    details = json.loads(request.details_json)
    for field, value in changes.items():
        details["roofArea" if field == "roof_area" else "siteDimensions"] = value.strip() if value else ""
    request.details_json = json.dumps(details)
    session.add(request)
    session.commit()
    return {
        "group_id": request.group_id,
        "details": details,
    }