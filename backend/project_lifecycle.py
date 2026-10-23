import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field as PydanticField
from sqlmodel import Session, select

from companies import _require_admin
from database import get_session
from models import (
    Company,
    CompanyQuote,
    DepositPayment,
    Project,
    ProjectLifecycleRecord,
    QuoteRequest,
    QuoteRequestCompany,
    Review,
    User,
)
from projects import ProjectRead, _project_payload
from security import company_id_from_authorization, get_optional_current_user

router = APIRouter(prefix="/api/project-lifecycle", tags=["Project lifecycle"])


class LifecycleReview(BaseModel):
    decision: Literal["approved", "changes_requested"]
    feedback: str = PydanticField(default="", max_length=2000)


class CancellationDecision(BaseModel):
    decision: Literal["approved", "rejected"]
    materials_cost_iqd: Optional[int] = PydanticField(default=None, ge=0)
    customer_share_percent: Optional[int] = PydanticField(default=None, ge=50, le=100)
    feedback: str = PydanticField(default="", max_length=2000)


class CancellationDecisionRead(BaseModel):
    assignment_id: int
    lifecycle_status: str
    decision: str
    materials_cost_iqd: Optional[int]
    customer_share_percent: Optional[int]
    customer_deduction_iqd: Optional[int]
    deposit_refund_iqd: Optional[int]
    customer_balance_due_iqd: Optional[int]
    feedback: Optional[str]


class LifecycleAdminItem(BaseModel):
    assignment_id: int
    request_id: str
    customer_name: str
    company_id: int
    company_name: str
    assignment_status: str
    stage: Literal[
        "rfq_submitted",
        "quotes_received",
        "contract_signatures_pending",
        "contract_in_progress",
        "pending_work_approval",
        "completion_pending_review",
        "cancellation_pending_review",
        "changes_requested",
        "approved",
    ]
    quote: Optional[dict] = None
    contract: Optional[dict] = None
    project: Optional[ProjectRead] = None
    has_completion_proof: bool = False
    customer_contract_signed: bool = False
    company_contract_signed: bool = False
    work_authorized_at: Optional[str] = None
    admin_feedback: Optional[str] = None
    audit: list[dict]
    customer_review: Optional[dict] = None
    featured: bool = False


class ContractSignatureStatus(BaseModel):
    lifecycle_status: str
    customer_contract_signed: bool
    company_contract_signed: bool


def _signature_state(lifecycle: ProjectLifecycleRecord) -> tuple[dict, bool, bool]:
    contract = json.loads(lifecycle.contract_json)
    signatures = contract.setdefault("signatures", {})
    legacy_signed = lifecycle.status in {
        "in_progress", "pending_review", "changes_requested", "approved",
    }
    customer_signed = bool(signatures.get("customer_signed", legacy_signed))
    company_signed = bool(signatures.get("company_signed", legacy_signed))
    return contract, customer_signed, company_signed


def _audit(lifecycle: ProjectLifecycleRecord) -> list[dict]:
    return json.loads(lifecycle.audit_json)


def _signature_response(lifecycle: ProjectLifecycleRecord) -> ContractSignatureStatus:
    _, customer_signed, company_signed = _signature_state(lifecycle)
    return ContractSignatureStatus(
        lifecycle_status=lifecycle.status,
        customer_contract_signed=customer_signed,
        company_contract_signed=company_signed,
    )


def _selected_assignment(
    session: Session,
    group_id: str,
    company_id: int,
) -> tuple[QuoteRequestCompany, ProjectLifecycleRecord]:
    request = session.exec(
        select(QuoteRequest).where(QuoteRequest.group_id == group_id)
    ).first()
    if request is None:
        raise HTTPException(status_code=404, detail="Request not found")
    assignment = session.exec(
        select(QuoteRequestCompany).where(
            QuoteRequestCompany.request_id == request.id,
            QuoteRequestCompany.company_id == company_id,
            QuoteRequestCompany.status == "selected",
        )
    ).first()
    if assignment is None:
        raise HTTPException(status_code=404, detail="Selected company assignment not found")
    payment = session.exec(
        select(DepositPayment).where(DepositPayment.assignment_id == assignment.id)
    ).first()
    if payment is None or payment.payment_status not in {"simulated", "paid"}:
        raise HTTPException(status_code=409, detail="An active deposit is required before signing")
    lifecycle = session.get(ProjectLifecycleRecord, assignment.id)
    if lifecycle is None:
        raise HTTPException(status_code=409, detail="The contract has not been generated")
    return assignment, lifecycle


@router.post(
    "/requests/{group_id}/companies/{company_id}/sign-contract/customer",
    response_model=ContractSignatureStatus,
)
def sign_contract_as_customer(
    group_id: str,
    company_id: int,
    access_token: Optional[str] = Query(default=None, min_length=32, max_length=128),
    session: Session = Depends(get_session),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    request = session.exec(
        select(QuoteRequest).where(QuoteRequest.group_id == group_id)
    ).first()
    if request is None:
        raise HTTPException(status_code=404, detail="Request not found")
    if isinstance(current_user, User):
        if current_user.role != "client" or request.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Only the request owner can sign this contract")
        signer_id = current_user.id
    else:
        if not access_token or request.access_token_hash != hashlib.sha256(access_token.encode()).hexdigest():
            raise HTTPException(status_code=401, detail="A valid request access token is required")
        signer_id = None
    _, lifecycle = _selected_assignment(session, group_id, company_id)
    return _record_signature(session, lifecycle, "customer", signer_id)


@router.post(
    "/requests/{group_id}/companies/{company_id}/sign-contract/company",
    response_model=ContractSignatureStatus,
)
def sign_contract_as_company(
    group_id: str,
    company_id: int,
    authorization: Optional[str] = Header(default=None),
    session: Session = Depends(get_session),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    authenticated_company_id = company_id_from_authorization(authorization, session)
    if authenticated_company_id != company_id:
        raise HTTPException(status_code=403, detail="This account cannot sign for that company")
    _, lifecycle = _selected_assignment(session, group_id, company_id)
    return _record_signature(
        session,
        lifecycle,
        "company",
        current_user.id if isinstance(current_user, User) else None,
    )


def _record_signature(
    session: Session,
    lifecycle: ProjectLifecycleRecord,
    signer: Literal["customer", "company"],
    user_id: Optional[int],
) -> ContractSignatureStatus:
    if lifecycle.status not in {"awaiting_signatures", "awaiting_admin_approval"}:
        _, customer_signed, company_signed = _signature_state(lifecycle)
        if customer_signed and company_signed:
            return _signature_response(lifecycle)
        raise HTTPException(status_code=409, detail="This contract is not awaiting signatures")

    contract, customer_signed, company_signed = _signature_state(lifecycle)
    already_signed = customer_signed if signer == "customer" else company_signed
    if not already_signed:
        now = datetime.now(timezone.utc)
        contract["signatures"][f"{signer}_signed"] = True
        contract["signatures"][signer] = "تم التوقيع إلكترونياً"
        lifecycle.contract_json = json.dumps(contract, ensure_ascii=False)
        audit = _audit(lifecycle)
        audit.append({
            "event": f"{signer}_contract_signed",
            "at": now.isoformat(),
            "signer_id": user_id,
        })
        lifecycle.audit_json = json.dumps(audit, ensure_ascii=False)
        lifecycle.updated_at = now
        customer_signed, company_signed = _signature_state(lifecycle)[1:]
        if customer_signed and company_signed:
            lifecycle.status = "awaiting_admin_approval"
            audit.append({
                "event": "contract_submitted_for_work_approval",
                "at": now.isoformat(),
            })
            lifecycle.audit_json = json.dumps(audit, ensure_ascii=False)
        session.add(lifecycle)
        session.commit()
        session.refresh(lifecycle)
    return _signature_response(lifecycle)


def _is_admin(current_user: Optional[User]) -> User:
    _require_admin(current_user)
    if current_user is None:
        raise HTTPException(status_code=403, detail="Administrator access is required")
    return current_user


@router.get("/admin", response_model=list[LifecycleAdminItem])
def list_admin_lifecycle(
    session: Session = Depends(get_session),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    _is_admin(current_user)
    assignments = session.exec(
        select(QuoteRequestCompany).order_by(QuoteRequestCompany.created_at.desc())
    ).all()
    result = []
    for assignment in assignments:
        if assignment.status == "declined":
            continue
        request = session.get(QuoteRequest, assignment.request_id)
        company = session.get(Company, assignment.company_id)
        if request is None or company is None:
            continue
        quote = session.exec(
            select(CompanyQuote).where(CompanyQuote.request_company_id == assignment.id)
        ).first()
        lifecycle = session.get(ProjectLifecycleRecord, assignment.id)
        if assignment.status == "cancelled" and (
            lifecycle is None or lifecycle.status != "cancellation_pending_review"
        ):
            continue
        project = session.get(Project, lifecycle.project_id) if lifecycle and lifecycle.project_id else None
        contract, customer_signed, company_signed = _signature_state(lifecycle) if lifecycle else (None, False, False)
        lifecycle_audit = _audit(lifecycle) if lifecycle else []
        work_authorized_at = next(
            (event.get("at") for event in reversed(lifecycle_audit)
             if event.get("event") == "work_authorized"),
            None,
        )
        if lifecycle and lifecycle.status == "cancellation_pending_review":
            stage = "cancellation_pending_review"
        elif lifecycle and lifecycle.status == "cancelled":
            continue
        elif lifecycle and lifecycle.status == "approved":
            stage = "approved"
        elif lifecycle and lifecycle.status == "awaiting_admin_approval":
            stage = "pending_work_approval"
        elif lifecycle and lifecycle.status == "awaiting_signatures":
            stage = "contract_signatures_pending"
        elif lifecycle and lifecycle.status == "pending_review":
            stage = "completion_pending_review"
        elif lifecycle and lifecycle.status == "changes_requested":
            stage = "changes_requested"
        elif assignment.status == "selected":
            stage = "contract_in_progress"
        elif quote is not None:
            stage = "quotes_received"
        else:
            stage = "rfq_submitted"
        review = session.exec(select(Review).where(Review.project_id == project.id)).first() if project else None
        result.append(LifecycleAdminItem(
            assignment_id=assignment.id,
            request_id=request.group_id,
            customer_name=request.customer_name,
            company_id=company.id,
            company_name=company.name,
            assignment_status=assignment.status,
            stage=stage,
            quote=quote.model_dump(mode="json", exclude={"id", "request_company_id"}) if quote else None,
            contract=contract,
            project=_project_payload(project, company, session) if project else None,
            has_completion_proof=bool(lifecycle and lifecycle.proof_data_base64),
            customer_contract_signed=customer_signed,
            company_contract_signed=company_signed,
            work_authorized_at=work_authorized_at,
            admin_feedback=lifecycle.admin_feedback if lifecycle else None,
            audit=lifecycle_audit,
            customer_review=review.model_dump(mode="json") if review else None,
            featured=bool(project and project.status == "featured"),
        ))
    return result


@router.post("/admin/{assignment_id}/cancellation-decision", response_model=CancellationDecisionRead)
def decide_project_cancellation(
    assignment_id: int,
    payload: CancellationDecision,
    session: Session = Depends(get_session),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    reviewer = _is_admin(current_user)
    lifecycle = session.get(ProjectLifecycleRecord, assignment_id)
    assignment = session.get(QuoteRequestCompany, assignment_id)
    if lifecycle is None or assignment is None:
        raise HTTPException(status_code=404, detail="Project lifecycle record not found")
    if lifecycle.status != "cancellation_pending_review":
        raise HTTPException(status_code=409, detail="This cancellation is not awaiting admin review")

    now = datetime.now(timezone.utc)
    audit = _audit(lifecycle)
    feedback = payload.feedback.strip() or None
    materials_cost = payload.materials_cost_iqd
    share_percent = payload.customer_share_percent
    deduction = None
    refund = None
    balance_due = None
    payment = session.exec(
        select(DepositPayment).where(DepositPayment.assignment_id == assignment.id)
    ).first()

    if payload.decision == "approved":
        if materials_cost is None or share_percent is None:
            raise HTTPException(
                status_code=422,
                detail="Materials cost and customer share are required to approve a cancellation",
            )
        quote = session.exec(
            select(CompanyQuote).where(CompanyQuote.request_company_id == assignment.id)
        ).first()
        if quote is not None and materials_cost > quote.total_iqd:
            raise HTTPException(status_code=422, detail="Materials cost cannot exceed the accepted quote")
        deduction = int(
            (Decimal(materials_cost) * Decimal(share_percent) / Decimal(100)).quantize(
                Decimal("1"), rounding=ROUND_HALF_UP,
            )
        )
        deposit_amount = payment.deposit_iqd if payment is not None else 0
        refund = max(0, deposit_amount - deduction)
        balance_due = max(0, deduction - deposit_amount)
        lifecycle.status = "cancelled"
        assignment.status = "cancelled"
        if payment is not None:
            payment.project_status = "cancelled"
            payment.payment_status = (
                "refunded" if refund == deposit_amount
                else "partially_refunded" if refund > 0
                else "forfeited"
            )
            payment.commission_status = "reversed" if refund > 0 else "forfeited"
            payment.refunded_at = now if refund > 0 else None
            session.add(payment)
        audit.append({
            "event": "cancellation_approved",
            "reviewer_id": reviewer.id,
            "materials_cost_iqd": materials_cost,
            "customer_share_percent": share_percent,
            "customer_deduction_iqd": deduction,
            "deposit_refund_iqd": refund,
            "customer_balance_due_iqd": balance_due,
            "feedback": feedback,
            "at": now.isoformat(),
        })
    else:
        lifecycle.status = "in_progress"
        assignment.status = "selected"
        if payment is not None:
            payment.project_status = "in_progress"
            session.add(payment)
        audit.append({
            "event": "cancellation_rejected",
            "reviewer_id": reviewer.id,
            "feedback": feedback,
            "at": now.isoformat(),
        })

    lifecycle.admin_feedback = feedback
    lifecycle.audit_json = json.dumps(audit, ensure_ascii=False)
    lifecycle.updated_at = now
    session.add(lifecycle)
    session.add(assignment)
    session.commit()
    return CancellationDecisionRead(
        assignment_id=assignment_id,
        lifecycle_status=lifecycle.status,
        decision=payload.decision,
        materials_cost_iqd=materials_cost if payload.decision == "approved" else None,
        customer_share_percent=share_percent if payload.decision == "approved" else None,
        customer_deduction_iqd=deduction,
        deposit_refund_iqd=refund,
        customer_balance_due_iqd=balance_due,
        feedback=feedback,
    )


@router.post("/admin/{assignment_id}/start", response_model=LifecycleAdminItem)
def authorize_project_work(
    assignment_id: int,
    session: Session = Depends(get_session),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    reviewer = _is_admin(current_user)
    lifecycle = session.get(ProjectLifecycleRecord, assignment_id)
    assignment = session.get(QuoteRequestCompany, assignment_id)
    if lifecycle is None or assignment is None:
        raise HTTPException(status_code=404, detail="Project lifecycle record not found")
    if lifecycle.status != "awaiting_admin_approval":
        raise HTTPException(status_code=409, detail="This contract is not awaiting work authorization")
    contract, customer_signed, company_signed = _signature_state(lifecycle)
    if not customer_signed or not company_signed:
        raise HTTPException(status_code=409, detail="Both parties must sign before work can be authorized")
    payment = session.exec(
        select(DepositPayment).where(DepositPayment.assignment_id == assignment.id)
    ).first()
    if payment is None or payment.payment_status not in {"simulated", "paid"}:
        raise HTTPException(status_code=409, detail="An active deposit is required before authorizing work")
    company = session.get(Company, assignment.company_id)
    request = session.get(QuoteRequest, assignment.request_id)
    if company is None or request is None:
        raise HTTPException(status_code=404, detail="Project participant not found")
    now = datetime.now(timezone.utc)
    lifecycle.status = "in_progress"
    lifecycle.updated_at = now
    audit = _audit(lifecycle)
    audit.append({
        "event": "work_authorized",
        "reviewer_id": reviewer.id,
        "notification": "تمت موافقة الأدمن على العقد والمباشرة بالعمل. يمكن للشركة الآن البدء بتنفيذ المشروع.",
        "at": now.isoformat(),
    })
    lifecycle.audit_json = json.dumps(audit, ensure_ascii=False)
    session.add(lifecycle)
    payment.project_status = "in_progress"
    session.add(payment)
    session.commit()
    session.refresh(lifecycle)

    quote = session.exec(
        select(CompanyQuote).where(CompanyQuote.request_company_id == assignment.id)
    ).first()
    return LifecycleAdminItem(
        assignment_id=assignment.id,
        request_id=request.group_id,
        customer_name=request.customer_name,
        company_id=company.id,
        company_name=company.name,
        assignment_status=assignment.status,
        stage="contract_in_progress",
        quote=quote.model_dump(mode="json", exclude={"id", "request_company_id"}) if quote else None,
        contract=contract,
        customer_contract_signed=customer_signed,
        company_contract_signed=company_signed,
        work_authorized_at=now.isoformat(),
        audit=audit,
    )


@router.get("/admin/{assignment_id}/proof")
def get_completion_proof(
    assignment_id: int,
    session: Session = Depends(get_session),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    _is_admin(current_user)
    lifecycle = session.get(ProjectLifecycleRecord, assignment_id)
    if lifecycle is None or not lifecycle.proof_data_base64 or not lifecycle.proof_content_type:
        raise HTTPException(status_code=404, detail="Completion proof not found")
    return {
        "content_type": lifecycle.proof_content_type,
        "file_name": lifecycle.proof_file_name,
        "data_base64": lifecycle.proof_data_base64,
    }


@router.post("/admin/{assignment_id}/decision", response_model=LifecycleAdminItem)
def review_lifecycle(
    assignment_id: int,
    payload: LifecycleReview,
    session: Session = Depends(get_session),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    reviewer = _is_admin(current_user)
    lifecycle = session.get(ProjectLifecycleRecord, assignment_id)
    if lifecycle is None or lifecycle.status != "pending_review":
        raise HTTPException(status_code=409, detail="This project is not awaiting admin review")
    project = session.get(Project, lifecycle.project_id) if lifecycle.project_id else None
    assignment = session.get(QuoteRequestCompany, assignment_id)
    if project is None or assignment is None:
        raise HTTPException(status_code=404, detail="Project lifecycle record is incomplete")
    company = session.get(Company, assignment.company_id)
    request = session.get(QuoteRequest, assignment.request_id)
    if company is None or request is None:
        raise HTTPException(status_code=404, detail="Project participant not found")

    now = datetime.now(timezone.utc)
    lifecycle.status = payload.decision
    lifecycle.admin_feedback = payload.feedback.strip() or None
    lifecycle.updated_at = now
    audit = json.loads(lifecycle.audit_json)
    audit.append({
        "event": payload.decision,
        "reviewer_id": reviewer.id,
        "feedback": lifecycle.admin_feedback,
        "at": now.isoformat(),
    })
    lifecycle.audit_json = json.dumps(audit, ensure_ascii=False)
    if payload.decision == "approved":
        project.status = "completed"
        project.completed_at = now
        project.image_url = (
            f"data:{lifecycle.proof_content_type};base64,{lifecycle.proof_data_base64}"
        )
        project.gallery_urls_json = json.dumps([project.image_url])
        company.projects_count += 1
        session.add(company)
    session.add(project)
    session.add(lifecycle)
    session.commit()
    session.refresh(lifecycle)

    quote = session.exec(
        select(CompanyQuote).where(CompanyQuote.request_company_id == assignment.id)
    ).first()
    review = session.exec(select(Review).where(Review.project_id == project.id)).first()
    return LifecycleAdminItem(
        assignment_id=assignment.id,
        request_id=request.group_id,
        customer_name=request.customer_name,
        company_id=company.id,
        company_name=company.name,
        assignment_status=assignment.status,
        stage="approved" if payload.decision == "approved" else "changes_requested",
        quote=quote.model_dump(mode="json", exclude={"id", "request_company_id"}) if quote else None,
        contract=json.loads(lifecycle.contract_json),
        project=_project_payload(project, company, session),
        has_completion_proof=bool(lifecycle.proof_data_base64),
        admin_feedback=lifecycle.admin_feedback,
        audit=json.loads(lifecycle.audit_json),
        customer_review=review.model_dump(mode="json") if review else None,
        featured=project.status == "featured",
    )


@router.patch("/admin/projects/{project_id}/featured")
def set_project_featured(
    project_id: int,
    featured: bool,
    session: Session = Depends(get_session),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    _is_admin(current_user)
    project = session.get(Project, project_id)
    if project is None or project.status not in {"completed", "featured"}:
        raise HTTPException(status_code=409, detail="Only approved projects can be featured")
    company = session.get(Company, project.company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    project.status = "featured" if featured else "completed"
    session.add(project)
    session.commit()
    session.refresh(project)
    return _project_payload(project, company, session)
