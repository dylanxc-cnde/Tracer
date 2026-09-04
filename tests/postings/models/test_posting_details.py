from datetime import date

import pytest
from pydantic import ValidationError

from tracer.postings.models.posting_details import (
    ApplicationChannel,
    ContractType,
    FactOrigin,
    ParsedValue,
    PostingDetails,
    PostingRequirements,
    PostingSource,
    Requirement,
    RequirementCategory,
    RequirementImportance,
    RequirementItem,
    RequirementItemRule,
    RoleFamily,
    WorkMode,
)


def source(*excerpts: str, urls: tuple[str, ...] = ()) -> dict[str, object]:
    return {
        "excerpts": excerpts,
        "source_urls": urls,
    }


def value(parsed_value: object) -> dict[str, object]:
    return {
        "value": parsed_value,
        "origin": "source",
    }


def make_requirement(
    *names: str,
    importance: RequirementImportance = RequirementImportance.REQUIRED,
    item_rule: RequirementItemRule = RequirementItemRule.ALL_OF,
    origin: FactOrigin = FactOrigin.SOURCE,
) -> Requirement:
    return Requirement(
        origin=origin,
        importance=importance,
        item_rule=item_rule,
        items=tuple(
            RequirementItem(
                name=name,
                category=RequirementCategory.SKILL,
                is_example=False,
            )
            for name in names
        ),
    )


def make_posting_details() -> PostingDetails:
    title = (
        "Anlagenmechaniker SHK (m/w/d) - "
        "Mobiles Arbeiten Region München"
    )
    return PostingDetails(
        identity={
            "source": source(
                "Thermondo GmbH",
                title,
                "Erschienen: vor 2 Tagen",
            ),
            "company_name": value("Thermondo GmbH"),
            "department_name": None,
            "position_title": value(title),
            "external_job_id": None,
            "canonical_posting_url": None,
            "source_platform": value("Stepstone"),
            "published_on": value("2026-08-13"),
            "posting_language": value("de"),
        },
        company={
            "source": source(
                "Thermondo installiert klimaneutrale Haustechnik."
            ),
            "industry_tags": [value("Handwerk"), value("Baugewerbe")],
            "employee_range": value("251-1000"),
            "company_summary": value(
                "Thermondo installs climate-neutral home technology."
            ),
        },
        classification={
            "source": source("Feste Anstellung"),
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
            "source": source(
                "München",
                "Mobiles Arbeiten Region München",
                "Bereitschaft zur Reisetätigkeit",
            ),
            "locations": [
                {
                    "origin": "source",
                    "city": "München",
                    "region": "Bayern",
                    "country": "Germany",
                }
            ],
            "work_modes": value(["field_based"]),
            "weekly_hours": None,
            "schedule": None,
            "travel_requirement": value("Travel within the assigned region"),
            "start_on": None,
            "duration": None,
        },
        role_content={
            "source": source(
                "Installation und Inbetriebnahme der Wärmepumpen"
            ),
            "role_summary": value(
                "Install and commission heat pumps in a two-person team."
            ),
            "responsibilities": [value("Install and commission heat pumps.")],
            "domains": [
                value("Climate-neutral housing"),
                value("Heat-pump technology"),
            ],
        },
        requirements={
            "source": source("Du besitzt einen Führerschein Klasse B"),
            "groups": [
                {
                    "origin": "source",
                    "importance": "required",
                    "item_rule": "all_of",
                    "items": [
                        {
                            "name": "Führerschein Klasse B",
                            "category": "license",
                            "is_example": False,
                        }
                    ],
                }
            ],
        },
        compensation={
            "source": source(
                "bis zu 6.000 € brutto pro Monat",
                "bis zu 5.000 EUR brutto pro Monat",
                "Bonus von bis zu 350,00 EUR pro Woche",
                "30 Tagen Urlaub",
            ),
            "entries": [
                {
                    "origin": "source",
                    "compensation_type": "base_salary",
                    "minimum_amount": None,
                    "maximum_amount": 6000,
                    "currency": "EUR",
                    "period": "month",
                    "pay_basis": "gross",
                    "applicable_groups": [],
                    "payment_conditions": None,
                },
                {
                    "origin": "source",
                    "compensation_type": "base_salary",
                    "minimum_amount": None,
                    "maximum_amount": 5000,
                    "currency": "EUR",
                    "period": "month",
                    "pay_basis": "gross",
                    "applicable_groups": [],
                    "payment_conditions": None,
                },
                {
                    "origin": "source",
                    "compensation_type": "bonus",
                    "minimum_amount": None,
                    "maximum_amount": 350,
                    "currency": "EUR",
                    "period": "week",
                    "pay_basis": "gross",
                    "applicable_groups": [],
                    "payment_conditions": None,
                },
            ],
            "benefits": [value("Structured training and professional education")],
            "vacation_days": value(30),
        },
        application_instructions={
            "source": source(),
            "channels": None,
            "application_url": None,
            "required_email_subject": None,
            "required_documents": [],
            "special_instructions": [],
            "application_deadline": None,
        },
        contact=None,
    )


def test_posting_source_keeps_section_context_and_validates_urls():
    posting_source = PostingSource(
        excerpts=("Apply online", "Applications close Friday"),
        source_urls=(
            "https://example.com/jobs/123",
            "https://example.com/apply/123",
        ),
    )

    assert posting_source.excerpts == (
        "Apply online",
        "Applications close Friday",
    )
    assert str(posting_source.source_urls[0]) == "https://example.com/jobs/123"

    with pytest.raises(ValidationError, match="URL"):
        PostingSource(excerpts=(), source_urls=("not a url",))

    with pytest.raises(ValidationError, match="source_url"):
        PostingSource(
            excerpts=("Apply online",),
            source_urls=(),
            source_url="https://example.com/jobs/123",
        )


def test_parsed_values_keep_only_value_and_origin():
    parsed_value = ParsedValue[str](
        value="Edited company name",
        origin="user_defined",
    )

    assert parsed_value.origin is FactOrigin.USER_DEFINED

    with pytest.raises(ValidationError, match="origin"):
        ParsedValue[str].model_validate({"value": "Thermondo GmbH"})

    with pytest.raises(ValidationError, match="sources"):
        ParsedValue[str](
            value="Thermondo GmbH",
            origin="source",
            sources=[],
        )


def test_posting_details_accept_detailed_job_data():
    posting = make_posting_details()

    assert posting.identity.company_name is not None
    assert posting.identity.company_name.value == "Thermondo GmbH"
    assert posting.identity.published_on is not None
    assert posting.identity.published_on.value == date(2026, 8, 13)
    assert posting.classification.role_families is not None
    assert posting.classification.role_families.value == (RoleFamily.FULL_TIME,)
    assert posting.classification.contract_type is not None
    assert posting.classification.contract_type.value is ContractType.PERMANENT
    assert posting.work_conditions.work_modes is not None
    assert posting.work_conditions.work_modes.value == (WorkMode.FIELD_BASED,)

    requirement = posting.requirements.groups[0]
    assert requirement.importance is RequirementImportance.REQUIRED
    assert requirement.item_rule is RequirementItemRule.ALL_OF
    assert requirement.items[0].category is RequirementCategory.LICENSE
    assert len(posting.compensation.entries) == 3
    assert posting.contact is None


def test_requirement_groups_keep_rules_and_examples():
    payload = make_posting_details().model_dump(mode="json")
    payload["requirements"] = {
        "source": source(
            "Power Query, Power Pivot und VBA sind wünschenswert.",
            "Kenntnisse in R, Python oder KNIME sind von Vorteil.",
            "Datenvisualisierung, zum Beispiel Power BI oder Tableau.",
            urls=("https://example.com/jobs/123", "https://example.com/careers"),
        ),
        "groups": [
            {
                "origin": "source",
                "importance": "preferred",
                "item_rule": "all_of",
                "items": [
                    {
                        "name": name,
                        "category": "skill",
                        "is_example": False,
                    }
                    for name in ("Power Query", "Power Pivot", "VBA")
                ],
            },
            {
                "origin": "source",
                "importance": "preferred",
                "item_rule": "any_of",
                "items": [
                    {
                        "name": name,
                        "category": "skill",
                        "is_example": False,
                    }
                    for name in ("R", "Python", "KNIME")
                ],
            },
            {
                "origin": "source",
                "importance": "preferred",
                "item_rule": "all_of",
                "items": [
                    {
                        "name": "Datenvisualisierung",
                        "category": "skill",
                        "is_example": False,
                    },
                    {
                        "name": "Power BI",
                        "category": "skill",
                        "is_example": True,
                    },
                    {
                        "name": "Tableau",
                        "category": "skill",
                        "is_example": True,
                    },
                ],
            },
        ],
    }

    posting = PostingDetails.model_validate(payload)
    all_of, any_of = posting.requirements.groups

    assert all_of.item_rule is RequirementItemRule.ALL_OF
    assert tuple(item.name for item in all_of.items) == (
        "Power Query",
        "Power Pivot",
        "VBA",
        "Datenvisualisierung",
        "Power BI",
        "Tableau",
    )
    assert all(not item.is_example for item in all_of.items[:4])
    assert all(item.is_example for item in all_of.items[4:])
    assert all_of.origin is FactOrigin.SOURCE
    assert any_of.item_rule is RequirementItemRule.ANY_OF
    assert tuple(item.name for item in any_of.items) == ("R", "Python", "KNIME")
    assert posting.requirements.source == PostingSource.model_validate(
        payload["requirements"]["source"]
    )
    assert len(payload["requirements"]["groups"]) == 3
    assert PostingDetails.model_validate_json(posting.model_dump_json()) == posting

    payload["requirements"]["groups"][0]["text"] = "Legacy text"
    with pytest.raises(ValidationError, match="text"):
        PostingDetails.model_validate(payload)


def test_all_of_groups_merge_separately_for_each_importance():
    importance_levels = tuple(RequirementImportance)
    groups = tuple(
        make_requirement(name, importance=importance)
        for name in ("Python", "SQL")
        for importance in importance_levels
    )

    requirements = PostingRequirements(source=source(), groups=groups)

    assert tuple(group.importance for group in requirements.groups) == importance_levels
    for group in requirements.groups:
        assert group.item_rule is RequirementItemRule.ALL_OF
        assert tuple(item.name for item in group.items) == ("Python", "SQL")


@pytest.mark.parametrize("importance", tuple(RequirementImportance))
@pytest.mark.parametrize(
    "item_rule", (RequirementItemRule.ANY_OF, RequirementItemRule.UNKNOWN)
)
def test_other_requirement_groups_keep_their_boundaries_and_order(
    importance, item_rule
):
    first_group = make_requirement(
        "Python", "SQL", importance=importance, item_rule=item_rule
    )
    second_group = make_requirement(
        "English", "German", importance=importance, item_rule=item_rule
    )
    first_all_of = make_requirement("Communication", importance=importance)
    second_all_of = make_requirement("Excel", importance=importance)

    requirements = PostingRequirements(
        source=source(),
        groups=(first_group, first_all_of, second_group, second_all_of),
    )

    assert len(requirements.groups) == 3
    assert requirements.groups[0] == first_group
    assert requirements.groups[2] == second_group
    assert requirements.groups[1].items == first_all_of.items + second_all_of.items
    assert requirements.groups[1].importance is importance
    assert requirements.groups[1].item_rule is RequirementItemRule.ALL_OF


@pytest.mark.parametrize("first_origin", tuple(FactOrigin))
@pytest.mark.parametrize("second_origin", tuple(FactOrigin))
def test_all_of_merging_preserves_existing_user_origin_and_duplicate_items(
    first_origin, second_origin
):
    first_group = make_requirement("Python", origin=first_origin)
    second_group = Requirement(
        origin=second_origin,
        importance=RequirementImportance.REQUIRED,
        item_rule=RequirementItemRule.ALL_OF,
        items=(
            RequirementItem(
                name="Python",
                category=RequirementCategory.OTHER,
                is_example=True,
            ),
        ),
    )

    requirements = PostingRequirements(
        source=source(), groups=(first_group, first_group, second_group)
    )

    (merged_group,) = requirements.groups
    assert merged_group.items == first_group.items * 2 + second_group.items
    expected_origin = (
        FactOrigin.USER_DEFINED
        if FactOrigin.USER_DEFINED in (first_origin, second_origin)
        else FactOrigin.SOURCE
    )
    assert merged_group.origin is expected_origin
    assert first_group.origin is first_origin
    assert len(first_group.items) == 1
    assert second_group.origin is second_origin
    assert len(second_group.items) == 1


@pytest.mark.parametrize(
    "groups",
    (
        (),
        (make_requirement("Python"),),
        (
            make_requirement("Python", "SQL", item_rule=RequirementItemRule.ANY_OF),
            make_requirement("R", "SQL", item_rule=RequirementItemRule.UNKNOWN),
        ),
    ),
)
def test_already_normalized_requirements_stay_unchanged(groups):
    requirements = PostingRequirements(source=source(), groups=groups)

    assert requirements.groups == groups
    assert PostingRequirements.model_validate_json(
        requirements.model_dump_json()
    ) == requirements


def test_compensation_entries_keep_applicable_groups_structured():
    payload = make_posting_details().model_dump(mode="json")
    payload["compensation"]["entries"] = [
        {
            "origin": "source",
            "compensation_type": "base_salary",
            "minimum_amount": 16,
            "maximum_amount": 18,
            "currency": "EUR",
            "period": "hour",
            "pay_basis": "gross",
            "applicable_groups": ["Bachelor students"],
            "payment_conditions": "Depending on study progress.",
        },
        {
            "origin": "source",
            "compensation_type": "base_salary",
            "minimum_amount": 18,
            "maximum_amount": 20,
            "currency": "EUR",
            "period": "hour",
            "pay_basis": "gross",
            "applicable_groups": ["Apprentices"],
            "payment_conditions": None,
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


def test_posting_details_keep_one_selected_contact():
    payload = make_posting_details().model_dump(mode="json")
    payload["application_instructions"]["channels"] = value(["email"])
    payload["application_instructions"]["source"] = source(
        "Bewerbungen bitte per E-Mail senden."
    )
    payload["contact"] = {
        "source": source(
            "Bewerbungen bitte per E-Mail an anna@example.com senden."
        ),
        "name": "Anna Beispiel",
        "role": "Recruiter",
        "email": "anna@example.com",
        "phone": None,
        "origin": "source",
    }

    posting = PostingDetails.model_validate(payload)

    assert posting.contact is not None
    assert posting.contact.email == "anna@example.com"
    assert posting.application_instructions.channels is not None
    assert posting.application_instructions.channels.value == (
        ApplicationChannel.EMAIL,
    )

    payload["contacts"] = []
    with pytest.raises(ValidationError, match="contacts"):
        PostingDetails.model_validate(payload)

    payload = make_posting_details().model_dump(mode="json")
    payload["application_instructions"]["application_email"] = value(
        "jobs@example.com"
    )
    with pytest.raises(ValidationError, match="application_email"):
        PostingDetails.model_validate(payload)


def test_work_modes_support_multiple_options():
    payload = make_posting_details().model_dump(mode="json")
    source_text = "Hybrides oder vollständig mobiles Arbeiten ist möglich."
    payload["work_conditions"]["source"] = source(source_text)
    payload["work_conditions"]["work_modes"] = value(["hybrid", "remote"])

    posting = PostingDetails.model_validate(payload)

    assert posting.work_conditions.work_modes is not None
    assert posting.work_conditions.work_modes.value == (
        WorkMode.HYBRID,
        WorkMode.REMOTE,
    )
    assert posting.work_conditions.source.excerpts == (source_text,)
