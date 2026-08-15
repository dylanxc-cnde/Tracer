from datetime import date

import pytest
from pydantic import ValidationError

from tracer.postings.posting_details_models import (
    ApplicationChannel,
    ContractType,
    DegreeLevel,
    ParsedValue,
    PostingDetails,
    RequirementCategory,
    RequirementImportance,
    RoleFamily,
    SourceExcerpt,
    WorkMode,
)


def value(parsed_value, *, source_text=None):
    sources = []
    if source_text is not None:
        sources.append({"text": source_text})
    return {
        "value": parsed_value,
        "sources": sources,
    }


def make_posting_details() -> PostingDetails:
    title = (
        "Anlagenmechaniker SHK (m/w/d) - "
        "Mobiles Arbeiten Region München"
    )
    return PostingDetails(
        identity={
            "company_name": value(
                "Thermondo GmbH",
                source_text="Thermondo GmbH",
            ),
            "department_name": None,
            "position_title": value(title, source_text=title),
            "external_job_id": None,
            "canonical_posting_url": None,
            "source_platform": value("Stepstone"),
            "published_on": value(
                "2026-08-13",
                source_text="Erschienen: vor 2 Tagen",
            ),
            "posting_language": value("de"),
        },
        company={
            "industry_tags": [
                {"value": "Handwerk"},
                {"value": "Baugewerbe"},
            ],
            "employee_range": value("251-1000"),
            "company_summary": value(
                "Thermondo installs climate-neutral home technology."
            ),
        },
        classification={
            "role_families": value(["full_time"]),
            "original_employment_type": value("Feste Anstellung"),
            "contract_type": value("permanent"),
            "seniority": value("experienced"),
            "internship_requirement": value("not_applicable"),
            "eligible_degrees": None,
            "study_fields": None,
            "student_status_required": value(False),
            "target_semester": None,
        },
        work_conditions={
            "locations": [
                {
                    "city": "München",
                    "region": "Bayern",
                    "country": "Germany",
                    "sources": [{"text": "München"}],
                }
            ],
            "work_modes": value(
                ["field_based"],
                source_text="Mobiles Arbeiten Region München",
            ),
            "weekly_hours": None,
            "schedule": None,
            "travel_requirement": value(
                "Travel within the assigned region",
                source_text="Bereitschaft zur Reisetätigkeit",
            ),
            "start_on": None,
            "duration": None,
        },
        role_content={
            "role_summary": value(
                "Install and commission heat pumps in a two-person team."
            ),
            "responsibilities": [
                {
                    "value": "Install and commission heat pumps.",
                    "sources": [
                        {
                            "text": (
                                "Installation und Inbetriebnahme "
                                "der Wärmepumpen"
                            )
                        }
                    ],
                }
            ],
            "domains": [
                {"value": "Climate-neutral housing"},
                {"value": "Heat-pump technology"},
            ],
        },
        requirements={
            "items": [
                {
                    "text": "Führerschein Klasse B",
                    "importance": "required",
                    "category": "license",
                    "normalized_name": "Driving licence class B",
                    "sources": [
                        {"text": "Du besitzt einen Führerschein Klasse B"}
                    ],
                }
            ]
        },
        compensation={
            "items": [
                {
                    "compensation_type": "base_salary",
                    "maximum_amount": 6000,
                    "currency": "EUR",
                    "period": "month",
                    "pay_basis": "gross",
                    "sources": [
                        {"text": "bis zu 6.000 € brutto pro Monat"}
                    ],
                },
                {
                    "compensation_type": "base_salary",
                    "maximum_amount": 5000,
                    "currency": "EUR",
                    "period": "month",
                    "pay_basis": "gross",
                    "sources": [
                        {"text": "bis zu 5.000 EUR brutto pro Monat"}
                    ],
                },
                {
                    "compensation_type": "bonus",
                    "maximum_amount": 350,
                    "currency": "EUR",
                    "period": "week",
                    "pay_basis": "gross",
                    "sources": [
                        {
                            "text": (
                                "Bonus von bis zu 350,00 EUR pro Woche"
                            )
                        }
                    ],
                },
            ],
            "benefits": [
                {
                    "value": (
                        "Structured training and professional education"
                    )
                }
            ],
            "vacation_days": value(
                30,
                source_text="30 Tagen Urlaub",
            ),
        },
        application_instructions={
            "channels": None,
            "application_url": None,
            "required_email_subject": None,
            "required_documents": [],
            "special_instructions": [],
            "application_deadline": None,
        },
        contact={},
        ambiguities=[
            {
                "field_path": "compensation.items",
                "description": "The page states two different monthly maxima.",
                "alternatives": ["6000 EUR/month", "5000 EUR/month plus bonus"],
            },
        ],
    )


def test_source_excerpt_is_the_only_owner_of_source_text():
    parsed_value = ParsedValue[str](
        value="Thermondo GmbH",
        sources=[{"text": "Thermondo GmbH"}],
    )

    assert parsed_value.sources[0].text == "Thermondo GmbH"

    with pytest.raises(ValidationError, match="Field required"):
        ParsedValue[str]()

    with pytest.raises(ValidationError, match="original_text"):
        ParsedValue[str](
            value="Thermondo GmbH",
            original_text="Thermondo GmbH",
        )

    with pytest.raises(ValidationError, match="source_locator"):
        SourceExcerpt(
            text="Thermondo GmbH",
            source_locator="section.company",
        )


def test_posting_details_accept_detailed_job_data():
    posting = make_posting_details()

    assert posting.identity.company_name.value == "Thermondo GmbH"
    assert posting.identity.published_on.value == date(2026, 8, 13)
    assert posting.classification.role_families.value == (
        RoleFamily.FULL_TIME,
    )
    assert posting.classification.contract_type.value is ContractType.PERMANENT
    assert posting.work_conditions.work_modes is not None
    assert posting.work_conditions.work_modes.value == (
        WorkMode.FIELD_BASED,
    )
    assert posting.requirements.items[0].importance is (
        RequirementImportance.REQUIRED
    )
    assert posting.requirements.items[0].category is (
        RequirementCategory.LICENSE
    )
    assert posting.work_conditions.travel_requirement.value == (
        "Travel within the assigned region"
    )
    requirement_categories = {
        category.value for category in RequirementCategory
    }
    assert "mobility" not in requirement_categories
    assert "availability" not in requirement_categories
    assert len(posting.compensation.items) == 3
    assert len(posting.ambiguities) == 1
    assert tuple(
        domain.value for domain in posting.role_content.domains
    ) == (
        "Climate-neutral housing",
        "Heat-pump technology",
    )


def test_compensation_entries_keep_degree_specific_pay_structured():
    payload = make_posting_details().model_dump(mode="json")
    payload["compensation"]["items"] = [
        {
            "compensation_type": "base_salary",
            "minimum_amount": 16,
            "maximum_amount": 18,
            "currency": "EUR",
            "period": "hour",
            "pay_basis": "gross",
            "applicable_degree_levels": ["bachelor"],
            "payment_conditions": "Depending on study progress.",
            "sources": [
                {
                    "text": (
                        "Bachelorstudierende erhalten je nach "
                        "Studienfortschritt 16 bis 18 EUR pro Stunde."
                    )
                }
            ],
        },
        {
            "compensation_type": "base_salary",
            "minimum_amount": 18,
            "maximum_amount": 20,
            "currency": "EUR",
            "period": "hour",
            "pay_basis": "gross",
            "applicable_degree_levels": ["master"],
            "sources": [
                {
                    "text": (
                        "Masterstudierende erhalten 18 bis 20 EUR "
                        "pro Stunde."
                    )
                }
            ],
        },
    ]

    posting = PostingDetails.model_validate(payload)

    bachelor_pay, master_pay = posting.compensation.items
    assert bachelor_pay.applicable_degree_levels == (
        DegreeLevel.BACHELOR,
    )
    assert bachelor_pay.minimum_amount == 16
    assert bachelor_pay.maximum_amount == 18
    assert bachelor_pay.payment_conditions == "Depending on study progress."
    assert master_pay.applicable_degree_levels == (DegreeLevel.MASTER,)

    payload["compensation"]["items"][0]["conditions"] = "Bachelor only"
    with pytest.raises(ValidationError, match="conditions"):
        PostingDetails.model_validate(payload)


def test_posting_details_keep_one_selected_contact():
    payload = make_posting_details().model_dump(mode="json")
    payload["application_instructions"]["channels"] = value(
        ["email"],
        source_text="Bewerbungen bitte per E-Mail senden.",
    )
    payload["contact"] = {
        "name": "Anna Beispiel",
        "role": "Recruiter",
        "email": "anna@example.com",
        "sources": [
            {
                "text": (
                    "Bewerbungen bitte per E-Mail an "
                    "anna@example.com senden."
                )
            }
        ],
    }

    posting = PostingDetails.model_validate(payload)

    assert posting.contact is not None
    assert posting.contact.email == "anna@example.com"
    assert posting.application_instructions.channels.value == (
        ApplicationChannel.EMAIL,
    )

    payload_without_email = make_posting_details().model_dump(mode="json")
    payload_without_email["application_instructions"]["channels"] = value(
        ["portal"],
        source_text="Bitte bewerben Sie sich über unser Karriereportal.",
    )
    payload_without_email["contact"] = {
        "name": "Max Beispiel",
        "role": "Scientific supervisor",
        "phone": "+49 241 123456",
        "sources": [
            {
                "text": (
                    "Kontakt: Max Beispiel, Telefon +49 241 123456"
                )
            }
        ],
    }

    posting_without_email = PostingDetails.model_validate(
        payload_without_email
    )

    assert posting_without_email.contact is not None
    assert posting_without_email.contact.email is None
    assert posting_without_email.contact.phone == "+49 241 123456"
    assert posting_without_email.application_instructions.channels.value == (
        ApplicationChannel.PORTAL,
    )

    payload_with_contacts = make_posting_details().model_dump(mode="json")
    payload_with_contacts["contacts"] = []
    with pytest.raises(ValidationError, match="contacts"):
        PostingDetails.model_validate(payload_with_contacts)

    payload_with_application_email = make_posting_details().model_dump(
        mode="json"
    )
    payload_with_application_email["application_instructions"][
        "application_email"
    ] = value("jobs@example.com")
    with pytest.raises(ValidationError, match="application_email"):
        PostingDetails.model_validate(payload_with_application_email)


def test_work_modes_support_multiple_options():
    payload = make_posting_details().model_dump(mode="json")
    payload["work_conditions"]["work_modes"] = value(
        ["hybrid", "remote"],
        source_text=(
            "Hybrides oder vollständig mobiles Arbeiten ist nach "
            "Absprache möglich."
        ),
    )
    posting = PostingDetails.model_validate(payload)

    assert posting.work_conditions.work_modes is not None
    assert posting.work_conditions.work_modes.value == (
        WorkMode.HYBRID,
        WorkMode.REMOTE,
    )
    assert posting.work_conditions.work_modes.sources[0].text == (
        "Hybrides oder vollständig mobiles Arbeiten ist nach "
        "Absprache möglich."
    )
