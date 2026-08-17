from datetime import date
from enum import StrEnum
from typing import Annotated, Generic, TypeVar

from pydantic import (
    AnyHttpUrl,
    BaseModel,
    ConfigDict,
    Field,
    WithJsonSchema,
)


OutputHttpUrl = Annotated[
    AnyHttpUrl,
    WithJsonSchema({"type": "string"}),
]


class _PostingDetailsModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
    )


class SourceExcerpt(_PostingDetailsModel):
    """One passage copied from the source content."""

    text: str
    source_url: OutputHttpUrl | None


ValueType = TypeVar("ValueType")


class ParsedValue(_PostingDetailsModel, Generic[ValueType]):
    """One parsed value with its original source."""

    value: ValueType
    sources: tuple[SourceExcerpt, ...]


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


class RequirementItemRule(StrEnum):
    """How the core items combine within one requirement."""

    SINGLE = "single"
    ALL_OF = "all_of"
    ANY_OF = "any_of"
    UNKNOWN = "unknown"


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

    company_name: ParsedValue[str] | None
    department_name: ParsedValue[str] | None
    position_title: ParsedValue[str] | None
    external_job_id: ParsedValue[str] | None
    canonical_posting_url: ParsedValue[OutputHttpUrl] | None
    source_platform: ParsedValue[str] | None
    published_on: ParsedValue[date] | None
    posting_language: ParsedValue[str] | None


class CompanyInfo(_PostingDetailsModel):
    """Company information stated by the posting source."""

    industry_tags: tuple[ParsedValue[str], ...]
    employee_range: ParsedValue[str] | None
    company_summary: ParsedValue[str] | None


class PostingClassification(_PostingDetailsModel):
    """Normalized job and student-role classifications."""

    role_families: ParsedValue[tuple[RoleFamily, ...]] | None
    original_employment_type: ParsedValue[str] | None
    contract_type: ParsedValue[ContractType] | None
    seniority: ParsedValue[Seniority] | None
    internship_requirement: ParsedValue[InternshipRequirement] | None
    eligible_groups: ParsedValue[tuple[str, ...]] | None
    study_fields: ParsedValue[tuple[str, ...]] | None
    student_status_required: ParsedValue[bool] | None
    target_semester: ParsedValue[str] | None


class PostingLocation(_PostingDetailsModel):
    """One work location stated by the posting."""

    city: str | None
    region: str | None
    country: str | None
    sources: tuple[SourceExcerpt, ...]


class WeeklyHours(_PostingDetailsModel):
    """A normalized weekly-hours range."""

    minimum: float | None = Field(..., ge=0)
    maximum: float | None = Field(..., ge=0)
    sources: tuple[SourceExcerpt, ...]


class WorkConditions(_PostingDetailsModel):
    """Location, schedule and timing information for the job."""

    locations: tuple[PostingLocation, ...]
    work_modes: ParsedValue[tuple[WorkMode, ...]] | None
    weekly_hours: WeeklyHours | None
    schedule: ParsedValue[str] | None
    travel_requirement: ParsedValue[str] | None
    start_on: ParsedValue[date] | None
    duration: ParsedValue[str] | None


class RoleDescription(_PostingDetailsModel):
    """Summary, responsibilities and domain information."""

    role_summary: ParsedValue[str] | None
    responsibilities: tuple[ParsedValue[str], ...]
    domains: tuple[ParsedValue[str], ...]


class RequirementItem(_PostingDetailsModel):
    """One independently matchable item in a job requirement."""

    name: str
    category: RequirementCategory
    normalized_name: str | None
    is_example: bool


class Requirement(_PostingDetailsModel):
    """One source-level requirement and its matchable items."""

    text: str
    importance: RequirementImportance
    item_rule: RequirementItemRule
    items: tuple[RequirementItem, ...]
    sources: tuple[SourceExcerpt, ...]


class CompensationEntry(_PostingDetailsModel):
    """One salary, bonus or allowance statement."""

    compensation_type: CompensationType
    minimum_amount: float | None = Field(..., ge=0)
    maximum_amount: float | None = Field(..., ge=0)
    currency: str | None
    period: CompensationPeriod | None
    pay_basis: PayBasis
    applicable_groups: tuple[str, ...]
    payment_conditions: str | None
    sources: tuple[SourceExcerpt, ...]


class Compensation(_PostingDetailsModel):
    """Compensation statements and benefits from the posting."""

    entries: tuple[CompensationEntry, ...]
    benefits: tuple[ParsedValue[str], ...]
    vacation_days: ParsedValue[int] | None


class ApplicationInstructions(_PostingDetailsModel):
    """Instructions stated by the employer for applying."""

    channels: ParsedValue[tuple[ApplicationChannel, ...]] | None
    application_url: ParsedValue[OutputHttpUrl] | None
    required_email_subject: ParsedValue[str] | None
    required_documents: tuple[ParsedValue[str], ...]
    special_instructions: tuple[ParsedValue[str], ...]
    application_deadline: ParsedValue[date] | None


class PostingContact(_PostingDetailsModel):
    """The contact selected as most relevant to this posting."""

    name: str | None
    role: str | None
    email: str | None
    phone: str | None
    sources: tuple[SourceExcerpt, ...]


class PostingDetails(_PostingDetailsModel):
    """Complete details for one job posting."""

    identity: PostingIdentity
    company: CompanyInfo
    classification: PostingClassification
    work_conditions: WorkConditions
    role_content: RoleDescription
    requirements: tuple[Requirement, ...]
    compensation: Compensation
    application_instructions: ApplicationInstructions
    contact: PostingContact | None
