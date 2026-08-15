from datetime import date
from enum import StrEnum
from typing import Generic, TypeVar

from pydantic import (
    AnyHttpUrl,
    BaseModel,
    ConfigDict,
    Field,
)


class _PostingDetailsModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
    )


class SourceExcerpt(_PostingDetailsModel):
    """One passage copied from the source content."""

    text: str
    source_url: AnyHttpUrl | None = None


ValueType = TypeVar("ValueType")


class ParsedValue(_PostingDetailsModel, Generic[ValueType]):
    """One parsed value with its original source."""

    value: ValueType
    sources: tuple[SourceExcerpt, ...] = ()


class RoleFamily(StrEnum):
    INTERNSHIP = "internship"
    WORKING_STUDENT = "working_student"
    STUDENT_ASSISTANT = "student_assistant"
    THESIS = "thesis"
    FULL_TIME = "full_time"
    PART_TIME = "part_time"
    APPRENTICESHIP = "apprenticeship"
    GRADUATE = "graduate"
    OTHER = "other"


class ContractType(StrEnum):
    PERMANENT = "permanent"
    FIXED_TERM = "fixed_term"
    TEMPORARY = "temporary"
    FREELANCE = "freelance"
    OTHER = "other"


class Seniority(StrEnum):
    STUDENT = "student"
    ENTRY = "entry"
    EXPERIENCED = "experienced"
    LEAD = "lead"
    OTHER = "other"


class InternshipRequirement(StrEnum):
    MANDATORY = "mandatory"
    VOLUNTARY = "voluntary"
    EITHER = "either"
    NOT_APPLICABLE = "not_applicable"


class WorkMode(StrEnum):
    ONSITE = "onsite"
    HYBRID = "hybrid"
    REMOTE = "remote"
    FIELD_BASED = "field_based"
    OTHER = "other"


class RequirementImportance(StrEnum):
    REQUIRED = "required"
    PREFERRED = "preferred"
    UNKNOWN = "unknown"


class RequirementCategory(StrEnum):
    SKILL = "skill"
    EXPERIENCE = "experience"
    EDUCATION = "education"
    LANGUAGE = "language"
    CERTIFICATION = "certification"
    LICENSE = "license"
    OTHER = "other"


class CompensationType(StrEnum):
    BASE_SALARY = "base_salary"
    BONUS = "bonus"
    ALLOWANCE = "allowance"
    OTHER = "other"


class CompensationPeriod(StrEnum):
    HOUR = "hour"
    WEEK = "week"
    MONTH = "month"
    YEAR = "year"
    ONE_TIME = "one_time"


class PayBasis(StrEnum):
    GROSS = "gross"
    NET = "net"
    UNKNOWN = "unknown"


class ApplicationChannel(StrEnum):
    PORTAL = "portal"
    EMAIL = "email"
    POSTAL = "postal"
    OTHER = "other"


class PostingIdentity(_PostingDetailsModel):
    """Fields used to identify one job posting."""

    company_name: ParsedValue[str] | None = None
    department_name: ParsedValue[str] | None = None
    position_title: ParsedValue[str] | None = None
    external_job_id: ParsedValue[str] | None = None
    canonical_posting_url: ParsedValue[AnyHttpUrl] | None = None
    source_platform: ParsedValue[str] | None = None
    published_on: ParsedValue[date] | None = None
    posting_language: ParsedValue[str] | None = None


class CompanyInfo(_PostingDetailsModel):
    """Company information stated by the posting source."""

    industry_tags: tuple[ParsedValue[str], ...] = ()
    employee_range: ParsedValue[str] | None = None
    company_summary: ParsedValue[str] | None = None


class PostingClassification(_PostingDetailsModel):
    """Normalized job and student-role classifications."""

    role_families: ParsedValue[tuple[RoleFamily, ...]] | None = None
    original_employment_type: ParsedValue[str] | None = None
    contract_type: ParsedValue[ContractType] | None = None
    seniority: ParsedValue[Seniority] | None = None
    internship_requirement: ParsedValue[InternshipRequirement] | None = None
    eligible_groups: ParsedValue[tuple[str, ...]] | None = None
    study_fields: ParsedValue[tuple[str, ...]] | None = None
    student_status_required: ParsedValue[bool] | None = None
    target_semester: ParsedValue[str] | None = None


class PostingLocation(_PostingDetailsModel):
    """One work location stated by the posting."""

    city: str | None = None
    region: str | None = None
    country: str | None = None
    sources: tuple[SourceExcerpt, ...] = ()


class WeeklyHours(_PostingDetailsModel):
    """A normalized weekly-hours range."""

    minimum: float | None = Field(default=None, ge=0)
    maximum: float | None = Field(default=None, ge=0)
    sources: tuple[SourceExcerpt, ...] = ()


class WorkConditions(_PostingDetailsModel):
    """Location, schedule and timing information for the job."""

    locations: tuple[PostingLocation, ...] = ()
    work_modes: ParsedValue[tuple[WorkMode, ...]] | None = None
    weekly_hours: WeeklyHours | None = None
    schedule: ParsedValue[str] | None = None
    travel_requirement: ParsedValue[str] | None = None
    start_on: ParsedValue[date] | None = None
    duration: ParsedValue[str] | None = None


class RoleDescription(_PostingDetailsModel):
    """Summary, responsibilities and domain information."""

    role_summary: ParsedValue[str] | None = None
    responsibilities: tuple[ParsedValue[str], ...] = ()
    domains: tuple[ParsedValue[str], ...] = ()


class Requirement(_PostingDetailsModel):
    """One required, preferred or unclear job requirement."""

    text: str
    importance: RequirementImportance
    category: RequirementCategory
    normalized_name: str | None = None
    sources: tuple[SourceExcerpt, ...] = ()


class CompensationEntry(_PostingDetailsModel):
    """One salary, bonus or allowance statement."""

    compensation_type: CompensationType
    minimum_amount: float | None = Field(default=None, ge=0)
    maximum_amount: float | None = Field(default=None, ge=0)
    currency: str | None = None
    period: CompensationPeriod | None = None
    pay_basis: PayBasis = PayBasis.UNKNOWN
    applicable_groups: tuple[str, ...] = ()
    payment_conditions: str | None = None
    sources: tuple[SourceExcerpt, ...] = ()


class Compensation(_PostingDetailsModel):
    """Compensation statements and benefits from the posting."""

    entries: tuple[CompensationEntry, ...] = ()
    benefits: tuple[ParsedValue[str], ...] = ()
    vacation_days: ParsedValue[int] | None = None


class ApplicationInstructions(_PostingDetailsModel):
    """Instructions stated by the employer for applying."""

    channels: ParsedValue[tuple[ApplicationChannel, ...]] | None = None
    application_url: ParsedValue[AnyHttpUrl] | None = None
    required_email_subject: ParsedValue[str] | None = None
    required_documents: tuple[ParsedValue[str], ...] = ()
    special_instructions: tuple[ParsedValue[str], ...] = ()
    application_deadline: ParsedValue[date] | None = None


class PostingContact(_PostingDetailsModel):
    """The contact selected as most relevant to this posting."""

    name: str | None = None
    role: str | None = None
    email: str | None = None
    phone: str | None = None
    sources: tuple[SourceExcerpt, ...] = ()


class PostingDetails(_PostingDetailsModel):
    """Complete details for one job posting."""

    identity: PostingIdentity
    company: CompanyInfo
    classification: PostingClassification
    work_conditions: WorkConditions
    role_content: RoleDescription
    requirements: tuple[Requirement, ...] = ()
    compensation: Compensation
    application_instructions: ApplicationInstructions
    contact: PostingContact | None = None
