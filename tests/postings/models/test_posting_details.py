from datetime import date

import pytest
from pydantic import ValidationError

from tracer.postings.models.posting_details import (
    ApplicationChannel,
    ContractType,
    FactOrigin,
    ParsedValue,
    PostingDetails,
    RequirementCategory,
    RequirementImportance,
    RequirementItemRule,
    RoleFamily,
    SourceExcerpt,
    WorkMode,
)


def source(text):
    return {
        "text": text,
        "source_url": None,
    }


def value(parsed_value, *, source_text=None):
    sources = []
    if source_text is not None:
        sources.append(source(source_text))
    return {
        "value": parsed_value,
        "origin": "source",
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
                value("Handwerk"),
                value("Baugewerbe"),
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
            "eligible_groups": None,
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
                    "origin": "source",
                    "sources": [source("München")],
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
                    "origin": "source",
                    "sources": [
                        source(
                            "Installation und Inbetriebnahme "
                            "der Wärmepumpen"
                        )
                    ],
                }
            ],
            "domains": [
                value("Climate-neutral housing"),
                value("Heat-pump technology"),
            ],
        },
        requirements=[
            {
                "text": "Führerschein Klasse B",
                "importance": "required",
                "item_rule": "single",
                "items": [
                    {
                        "name": "Führerschein Klasse B",
                        "category": "license",
                        "normalized_name": "Driving licence class B",
                        "is_example": False,
                    }
                ],
                "origin": "source",
                "sources": [
                    source("Du besitzt einen Führerschein Klasse B")
                ],
            }
        ],
        compensation={
            "entries": [
                {
                    "compensation_type": "base_salary",
                    "minimum_amount": None,
                    "maximum_amount": 6000,
                    "currency": "EUR",
                    "period": "month",
                    "pay_basis": "gross",
                    "applicable_groups": [],
                    "payment_conditions": None,
                    "origin": "source",
                    "sources": [
                        source("bis zu 6.000 € brutto pro Monat")
                    ],
                },
                {
                    "compensation_type": "base_salary",
                    "minimum_amount": None,
                    "maximum_amount": 5000,
                    "currency": "EUR",
                    "period": "month",
                    "pay_basis": "gross",
                    "applicable_groups": [],
                    "payment_conditions": None,
                    "origin": "source",
                    "sources": [
                        source("bis zu 5.000 EUR brutto pro Monat")
                    ],
                },
                {
                    "compensation_type": "bonus",
                    "minimum_amount": None,
                    "maximum_amount": 350,
                    "currency": "EUR",
                    "period": "week",
                    "pay_basis": "gross",
                    "applicable_groups": [],
                    "payment_conditions": None,
                    "origin": "source",
                    "sources": [
                        source(
                            "Bonus von bis zu 350,00 EUR pro Woche"
                        )
                    ],
                },
            ],
            "benefits": [
                value("Structured training and professional education")
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
        contact=None,
    )


def test_source_excerpt_is_the_only_owner_of_source_text():
    parsed_value = ParsedValue[str](
        value="Thermondo GmbH",
        origin="source",
        sources=[source("Thermondo GmbH")],
    )

    assert parsed_value.origin is FactOrigin.SOURCE
    assert parsed_value.sources[0].text == "Thermondo GmbH"

    with pytest.raises(ValidationError, match="Field required"):
        ParsedValue[str]()

    with pytest.raises(ValidationError, match="original_text"):
        ParsedValue[str](
            value="Thermondo GmbH",
            origin="source",
            sources=[],
            original_text="Thermondo GmbH",
        )

    with pytest.raises(ValidationError, match="source_locator"):
        SourceExcerpt(
            text="Thermondo GmbH",
            source_url=None,
            source_locator="section.company",
        )


def test_source_backed_values_track_user_defined_origin():
    parsed_value = ParsedValue[str](
        value="Edited company name",
        origin="user_defined",
        sources=[],
    )

    assert parsed_value.origin is FactOrigin.USER_DEFINED

    with pytest.raises(
        ValidationError,
        match="user-defined values cannot keep source excerpts",
    ):
        ParsedValue[str](
            value="Edited company name",
            origin="user_defined",
            sources=[source("Original company name")],
        )


def test_source_backed_values_require_origin():
    with pytest.raises(ValidationError, match="origin"):
        ParsedValue[str].model_validate(
            {
                "value": "Thermondo GmbH",
                "sources": [source("Thermondo GmbH")],
            }
        )


def test_source_excerpt_keeps_http_url_validation():
    excerpt = SourceExcerpt(
        text="Apply online",
        source_url="https://example.com/jobs/123",
    )

    assert str(excerpt.source_url) == "https://example.com/jobs/123"

    with pytest.raises(ValidationError, match="URL"):
        SourceExcerpt(
            text="Apply online",
            source_url="not a url",
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
    assert posting.requirements[0].importance is (
        RequirementImportance.REQUIRED
    )
    assert posting.requirements[0].item_rule is RequirementItemRule.SINGLE
    assert posting.requirements[0].items[0].category is (
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
    assert len(posting.compensation.entries) == 3
    assert posting.contact is None
    assert tuple(
        domain.value for domain in posting.role_content.domains
    ) == (
        "Climate-neutral housing",
        "Heat-pump technology",
    )


def test_requirement_items_keep_rules_and_examples():
    payload = make_posting_details().model_dump(mode="json")
    payload["requirements"] = [
        {
            "text": "Power Query, Power Pivot und VBA sind wünschenswert.",
            "importance": "preferred",
            "item_rule": "all_of",
            "items": [
                {
                    "name": name,
                    "category": "skill",
                    "normalized_name": name,
                    "is_example": False,
                }
                for name in ("Power Query", "Power Pivot", "VBA")
            ],
            "origin": "source",
            "sources": [
                source(
                    "Power Query, Power Pivot und VBA sind wünschenswert."
                )
            ],
        },
        {
            "text": "Kenntnisse in R, Python oder KNIME sind von Vorteil.",
            "importance": "preferred",
            "item_rule": "any_of",
            "items": [
                {
                    "name": name,
                    "category": "skill",
                    "normalized_name": name,
                    "is_example": False,
                }
                for name in ("R", "Python", "KNIME")
            ],
            "origin": "source",
            "sources": [
                source(
                    "Kenntnisse in R, Python oder KNIME sind von Vorteil."
                )
            ],
        },
        {
            "text": (
                "Erfahrung mit Datenvisualisierung, zum Beispiel Power BI "
                "oder Tableau, ist von Vorteil."
            ),
            "importance": "preferred",
            "item_rule": "single",
            "items": [
                {
                    "name": "Datenvisualisierung",
                    "category": "skill",
                    "normalized_name": "Data visualization",
                    "is_example": False,
                },
                {
                    "name": "Power BI",
                    "category": "skill",
                    "normalized_name": "Microsoft Power BI",
                    "is_example": True,
                },
                {
                    "name": "Tableau",
                    "category": "skill",
                    "normalized_name": "Tableau",
                    "is_example": True,
                },
            ],
            "origin": "source",
            "sources": [
                source(
                    "Erfahrung mit Datenvisualisierung, zum Beispiel "
                    "Power BI oder Tableau, ist von Vorteil."
                )
            ],
        },
    ]

    posting = PostingDetails.model_validate(payload)
    all_of, any_of, example = posting.requirements

    assert all_of.item_rule is RequirementItemRule.ALL_OF
    assert any_of.item_rule is RequirementItemRule.ANY_OF
    assert tuple(item.name for item in any_of.items) == (
        "R",
        "Python",
        "KNIME",
    )
    assert example.item_rule is RequirementItemRule.SINGLE
    assert example.items[0].is_example is False
    assert all(item.is_example for item in example.items[1:])


def test_compensation_entries_keep_applicable_groups_structured():
    payload = make_posting_details().model_dump(mode="json")
    payload["compensation"]["entries"] = [
        {
            "compensation_type": "base_salary",
            "minimum_amount": 16,
            "maximum_amount": 18,
            "currency": "EUR",
            "period": "hour",
            "pay_basis": "gross",
            "applicable_groups": ["Bachelor students"],
            "payment_conditions": "Depending on study progress.",
            "origin": "source",
            "sources": [
                source(
                    "Bachelorstudierende erhalten je nach "
                    "Studienfortschritt 16 bis 18 EUR pro Stunde."
                )
            ],
        },
        {
            "compensation_type": "base_salary",
            "minimum_amount": 18,
            "maximum_amount": 20,
            "currency": "EUR",
            "period": "hour",
            "pay_basis": "gross",
            "applicable_groups": ["Apprentices"],
            "payment_conditions": None,
            "origin": "source",
            "sources": [
                source("Auszubildende erhalten 18 bis 20 EUR pro Stunde.")
            ],
        },
    ]

    posting = PostingDetails.model_validate(payload)

    bachelor_pay, apprentice_pay = posting.compensation.entries
    assert bachelor_pay.applicable_groups == ("Bachelor students",)
    assert bachelor_pay.minimum_amount == 16
    assert bachelor_pay.maximum_amount == 18
    assert bachelor_pay.payment_conditions == "Depending on study progress."
    assert apprentice_pay.applicable_groups == ("Apprentices",)

    payload["compensation"]["entries"][0]["conditions"] = "Bachelor only"
    with pytest.raises(ValidationError, match="conditions"):
        PostingDetails.model_validate(payload)

    payload = make_posting_details().model_dump(mode="json")
    payload["compensation"]["entries"][0][
        "applicable_degree_levels"
    ] = ["bachelor"]
    with pytest.raises(ValidationError, match="applicable_degree_levels"):
        PostingDetails.model_validate(payload)


def test_posting_details_keep_one_selected_contact():
    payload = make_posting_details().model_dump(mode="json")
    assert payload["contact"] is None
    payload["application_instructions"]["channels"] = value(
        ["email"],
        source_text="Bewerbungen bitte per E-Mail senden.",
    )
    payload["contact"] = {
        "name": "Anna Beispiel",
        "role": "Recruiter",
        "email": "anna@example.com",
        "phone": None,
        "origin": "source",
        "sources": [
            source(
                "Bewerbungen bitte per E-Mail an "
                "anna@example.com senden."
            )
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
        "email": None,
        "phone": "+49 241 123456",
        "origin": "source",
        "sources": [
            source("Kontakt: Max Beispiel, Telefon +49 241 123456")
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
