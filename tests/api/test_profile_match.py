"""Contract tests for confirmed Profile/Goal facts and the local match review API.

Expected values come from the approved match decision (D05680601, cases M1-M5 and the
five-state / ALL_OF / ANY_OF / example / UNKNOWN rules), the data-ownership decision
(D9f69e312) and the stage acceptance. They are written as literals; nothing here is
derived from production aggregation or serialization code. Every test uses a temporary
SQLite database, the existing API factories and no credentials, provider or model.
"""

import sqlite3
from contextlib import closing
from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tracer.api.app import create_app
from tracer.postings import PostingCard, PostingDetails
from tracer.postings.stores.posting_card_store import PostingCardStore
from tracer.settings.api_key_store import ApiKeyStore

from tests.api.factories import (
    make_card_update_request,
    make_create_ai_provider_request,
    make_posting_details,
)


NEW_TABLES = {"personal_revisions", "match_revisions"}
FORBIDDEN_KEY_PARTS = ("score", "probability", "rank", "weight", "percent")
ENROLLED = "Must be currently enrolled at a German university"
NOT_ENROLLED = "Not currently enrolled (graduated in 2025)"


@pytest.fixture(autouse=True)
def block_external_services(monkeypatch):
    def fail_access(*args, **kwargs):
        pytest.fail("Profile/match tests must not use credentials, AI clients or suppliers")

    monkeypatch.setattr("tracer.settings.api_key_store._create_system_backend", fail_access)
    monkeypatch.setattr("tracer.api.postings.OpenAI", fail_access)


@pytest.fixture
def database_path(tmp_path):
    return tmp_path / "tracer.sqlite3"


@pytest.fixture
def key_store():
    store = Mock(spec=ApiKeyStore)
    store.save.side_effect = lambda key, secret: None
    return store


@pytest.fixture
def client(database_path, key_store):
    with TestClient(create_app(database_path=database_path, api_key_store=key_store)) as client:
        yield client


# ---------------------------------------------------------------- data builders


def requirement(importance, item_rule, *items):
    """Build one raw requirement group; an item is a name or (name, category, is_example)."""
    normalized = [
        item if isinstance(item, tuple) else (item, "skill", False) for item in items
    ]
    return {
        "importance": importance,
        "item_rule": item_rule,
        "origin": "source",
        "items": [
            {"name": name, "category": category, "is_example": is_example}
            for name, category, is_example in normalized
        ],
    }


def make_card(*, eligibility=None, address=None, weekly_hours=None, groups=()):
    payload = make_posting_details().model_dump(mode="json")
    if eligibility is not None:
        payload["classification"]["eligibility"] = {"origin": "source", "value": eligibility}
    if address is not None:
        payload["work_conditions"]["primary_address"] = {"origin": "source", "value": address}
    if weekly_hours is not None:
        payload["work_conditions"]["weekly_hours"] = {
            "origin": "source", "minimum": weekly_hours, "maximum": weekly_hours,
        }
    payload["requirements"]["groups"] = list(groups)
    return PostingCard(import_key=uuid4(), posting=PostingDetails.model_validate(payload))


def add_card(database_path, **details) -> PostingCard:
    card = make_card(**details)
    PostingCardStore(database_path).add(card)
    return card


def save_profile(client, evidence, revision=0):
    response = client.put("/profile", json={"expected_revision": revision, "evidence": evidence})
    assert response.status_code == 200, response.text
    return response.json()


def save_goal(client, constraints=(), objective=None, revision=0):
    response = client.put("/goal", json={
        "expected_revision": revision, "objective": objective, "constraints": list(constraints),
    })
    assert response.status_code == 200, response.text
    return response.json()


def ids_by_label(document, field):
    id_name = "evidence_id" if field == "evidence" else "constraint_id"
    return {entry["label"]: entry[id_name] for entry in document[field]}


def profile_ref(entry_id):
    return {"kind": "profile", "entry_id": entry_id}


def goal_ref(entry_id):
    return {"kind": "goal", "entry_id": entry_id}


# ---------------------------------------------------------------- review helpers


def match_url(card, suffix=""):
    return f"/matching/card/{card.card_key}{suffix}"


def read_view(client, card):
    response = client.get(match_url(card))
    assert response.status_code == 200, response.text
    return response.json()


def start_review(client, card):
    view = read_view(client, card)
    response = client.post(
        match_url(card, "/evaluate"),
        json={"expected_inputs": view["current_inputs"]["fingerprint"]},
    )
    assert response.status_code == 200, response.text
    return response.json()


def find_target(view, label, importance=None, dimension=None):
    found = [
        (group, target)
        for group in view["match"]["groups"]
        for target in group["targets"]
        if target["label"] == label
        and (importance is None or group["importance"] == importance)
        and (dimension is None or group["dimension"] == dimension)
    ]
    assert len(found) == 1, f"expected exactly one target {label!r}, found {len(found)}"
    return found[0]


def find_dimension_target(view, dimension):
    found = [
        (group, target)
        for group in view["match"]["groups"] if group["dimension"] == dimension
        for target in group["targets"]
    ]
    assert len(found) >= 1
    return found[0]


def group_result(view, group):
    return next(
        result for result in view["match"]["summary"]["groups"]
        if result["group_id"] == group["group_id"]
    )


def judgment_of(view, target):
    return next(
        judgment for judgment in view["match"]["judgments"]
        if judgment["target_id"] == target["target_id"]
    )


def judge_request(view, status, *, reason=None, evidence=(), importance=None):
    return {
        "expected_inputs": view["current_inputs"]["fingerprint"],
        "expected_revision": view["match"]["revision"],
        "status": status,
        "reason": reason,
        "evidence": list(evidence),
        "confirmed_importance": importance,
    }


def put_judgment(client, card, view, target, request):
    return client.put(
        match_url(card, f"/{view['match']['match_id']}/judgment/{target['target_id']}"),
        json=request,
    )


def judge(client, card, view, label, status, *, reason=None, evidence=(), importance=None, **find):
    _, target = find_target(view, label, **find)
    response = put_judgment(
        client, card, view, target,
        judge_request(view, status, reason=reason, evidence=evidence, importance=importance),
    )
    assert response.status_code == 200, response.text
    return response.json()


def assert_no_score_fields(value):
    """The first version has no total score, weight, ranking or probability anywhere."""
    if isinstance(value, dict):
        for key, child in value.items():
            assert not any(part in key.lower() for part in FORBIDDEN_KEY_PARTS), key
            assert_no_score_fields(child)
    elif isinstance(value, list):
        for child in value:
            assert_no_score_fields(child)


def review_body(view):
    return {key: value for key, value in view["match"].items() if key != "posting_snapshot"}


def legacy_rows(database_path):
    """Every pre-existing table's rows; the new personal/match tables are excluded."""
    with closing(sqlite3.connect(database_path)) as connection:
        names = [row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' "
            "ORDER BY name"
        )]
        return {
            name: connection.execute(f'SELECT * FROM "{name}" ORDER BY 1').fetchall()
            for name in names if name not in NEW_TABLES
        }


# ------------------------------------------------------------------ PM_M1 ... M5


def test_m1_confirmed_non_enrollment_marks_eligibility_missing_without_hiding_strong_skills(
    client, database_path,
):
    card = add_card(
        database_path, eligibility=ENROLLED,
        groups=[requirement("required", "all_of", "Python")],
    )
    card_before = client.get(f"/posting/card/{card.card_key}").json()
    profile = save_profile(client, [
        {"kind": "qualification", "label": NOT_ENROLLED, "description": "Graduated in 2025"},
        {"kind": "skill", "label": "Python data analysis", "description": "Three course projects"},
    ])
    ids = ids_by_label(profile, "evidence")

    view = start_review(client, card)
    # A new review confirms nothing: every judgment starts as unknown.
    assert {judgment["status"] for judgment in view["match"]["judgments"]} == {"unknown"}
    assert view["match"]["summary"]["qualification_warnings"] == []

    view = judge(
        client, card, view, ENROLLED, "missing",
        reason="Confirmed non-enrollment contradicts the posting's enrollment requirement",
        evidence=[profile_ref(ids[NOT_ENROLLED])], importance="required",
    )
    view = judge(
        client, card, view, "Python", "met",
        reason="Three course projects analysing real data",
        evidence=[profile_ref(ids["Python data analysis"])],
    )

    eligibility_group, eligibility_target = find_target(view, ENROLLED)
    capability_group, _ = find_target(view, "Python")
    summary = view["match"]["summary"]
    assert group_result(view, eligibility_group)["status"] == "missing"
    assert group_result(view, eligibility_group)["importance"] == "required"
    assert group_result(view, capability_group)["status"] == "met"
    # The eligibility gate is a separate warning that strong skills cannot offset.
    assert summary["qualification_warnings"] == [eligibility_group["group_id"]]
    assert summary["capability_gaps"] == []
    assert summary["preference_conflicts"] == []
    assert summary["evidence_coverage"]["linked"] == 2
    judgment = judgment_of(view, eligibility_target)
    assert judgment["evidence"] == [profile_ref(ids[NOT_ENROLLED])]
    assert judgment["confirmed_importance"] == "required"
    assert_no_score_fields(review_body(view))

    # The Card stays visible and unchanged: matching never rewrites posting facts.
    assert client.get(f"/posting/card/{card.card_key}").json() == card_before
    assert client.get("/posting/card").json() == [card_before]
    assert card_before["posting"]["classification"]["eligibility"]["value"] == ENROLLED


@pytest.mark.parametrize("with_profile", [False, True])
def test_m2_missing_language_evidence_is_unknown_not_missing_and_cannot_be_forced(
    client, database_path, with_profile,
):
    card = add_card(
        database_path,
        groups=[requirement("required", "all_of", ("Deutsch B2", "language", False))],
    )
    if with_profile:
        save_profile(client, [{"kind": "skill", "label": "Python data analysis"}])
    view = start_review(client, card)
    group, target = find_target(view, "Deutsch B2")

    judgment = judgment_of(view, target)
    assert judgment["status"] == "unknown"
    assert judgment["reason"] is None and judgment["evidence"] == []
    assert group_result(view, group)["status"] == "unknown"
    summary = view["match"]["summary"]
    # Unknown means evidence to add, not a confirmed capability gap.
    assert summary["capability_gaps"] == []
    assert summary["evidence_coverage"]["linked"] == 0

    # Without a confirmed basis no confirmed status can be recorded.
    for status in ("met", "partial", "missing"):
        response = put_judgment(client, card, view, target, judge_request(
            view, status, reason="A reason without linked confirmed evidence",
        ))
        assert response.status_code == 422, status
    assert read_view(client, card) == view

    # The user may still record an explicit, reasoned unknown; it stays unknown.
    view = judge(client, card, view, "Deutsch B2", "unknown", reason="Certificate not yet collected")
    assert judgment_of(view, target)["status"] == "unknown"
    assert judgment_of(view, target)["reason"] == "Certificate not yet collected"
    assert group_result(view, group)["status"] == "unknown"
    assert view["match"]["summary"]["capability_gaps"] == []
    assert view["match"]["summary"]["evidence_coverage"]["linked"] == 0


def test_m3_any_of_is_met_by_one_confirmed_option_and_examples_do_not_decide(client, database_path):
    card = add_card(database_path, groups=[
        requirement("required", "any_of", "Python", "SQL", ("Pandas", "skill", True)),
    ])
    profile = save_profile(client, [
        {"kind": "skill", "label": "Python course project", "description": "Evaluated traffic data"},
    ])
    evidence_id = ids_by_label(profile, "evidence")["Python course project"]
    view = start_review(client, card)

    view = judge(
        client, card, view, "Python", "met",
        reason="Confirmed project work in Python", evidence=[profile_ref(evidence_id)],
    )

    group, _ = find_target(view, "Python")
    assert group_result(view, group)["status"] == "met"
    assert group_result(view, group)["importance"] == "required"
    # The other option and the example are never asked to be satisfied.
    assert judgment_of(view, find_target(view, "SQL")[1])["status"] == "unknown"
    assert judgment_of(view, find_target(view, "Pandas")[1])["status"] == "unknown"
    assert view["match"]["summary"]["capability_gaps"] == []
    assert view["match"]["summary"]["qualification_warnings"] == []


def test_m4_skills_met_but_confirmed_location_conflict_is_a_preference_conflict_only(
    client, database_path,
):
    card = add_card(
        database_path, address="Munich", weekly_hours=40.0,
        groups=[requirement("required", "all_of", "Python")],
    )
    profile = save_profile(client, [{"kind": "skill", "label": "Python course project"}])
    goal = save_goal(client, objective="Working-student role", constraints=[
        {"kind": "location", "label": "Berlin only", "description": "No relocation",
         "importance": "required"},
        {"kind": "hours", "label": "At most 20 hours per week", "importance": "required"},
    ])
    skill_id = ids_by_label(profile, "evidence")["Python course project"]
    location_id = ids_by_label(goal, "constraints")["Berlin only"]
    view = start_review(client, card)

    view = judge(
        client, card, view, "Python", "met", reason="Course project",
        evidence=[profile_ref(skill_id)],
    )
    view = judge(
        client, card, view, "Berlin only", "missing",
        reason="Posting is in Munich while the confirmed Goal requires Berlin",
        evidence=[goal_ref(location_id)],
    )

    capability_group, _ = find_target(view, "Python")
    preference_group, preference_target = find_target(view, "Berlin only")
    eligibility_group, _ = find_dimension_target(view, "qualification")
    summary = view["match"]["summary"]
    assert preference_group["dimension"] == "preference"
    assert group_result(view, capability_group)["status"] == "met"
    assert group_result(view, preference_group)["status"] == "missing"
    assert summary["preference_conflicts"] == [preference_group["group_id"]]
    # A preference conflict neither makes the applicant ineligible nor a skill gap.
    assert summary["qualification_warnings"] == []
    assert summary["capability_gaps"] == []
    assert group_result(view, eligibility_group)["status"] == "unknown"
    assert judgment_of(view, preference_target)["evidence"] == [goal_ref(location_id)]
    assert location_id in {c["constraint_id"] for c in view["match"]["goal_snapshot"]["constraints"]}
    # The untouched hours constraint remains unknown rather than inferred.
    hours_group, _ = find_target(view, "At most 20 hours per week")
    assert group_result(view, hours_group)["status"] == "unknown"


def test_evidence_must_come_from_the_matching_dimension_and_own_confirmed_entry(
    client, database_path,
):
    card = add_card(
        database_path, eligibility="Enrolled student", address="Munich",
        groups=[requirement("required", "all_of", "Python")],
    )
    profile = save_profile(client, [
        {"kind": "qualification", "label": "Enrolled in a bachelor programme"},
        {"kind": "skill", "label": "Python course project"},
    ])
    goal = save_goal(client, constraints=[
        {"kind": "location", "label": "Berlin only", "importance": "required"},
        {"kind": "hours", "label": "At most 20 hours per week", "importance": "preferred"},
    ])
    profile_ids = ids_by_label(profile, "evidence")
    goal_ids = ids_by_label(goal, "constraints")
    view = start_review(client, card)

    wrong_basis = [
        ("Berlin only", [profile_ref(profile_ids["Python course project"])]),   # Profile for a preference
        ("Python", [goal_ref(goal_ids["Berlin only"])]),                         # Goal for a capability
        ("Python", [profile_ref(profile_ids["Enrolled in a bachelor programme"])]),  # eligibility for a skill
        ("Enrolled student", [profile_ref(profile_ids["Python course project"])]),   # skill for eligibility
        ("Berlin only", [goal_ref(goal_ids["At most 20 hours per week"])]),      # another constraint
        ("Python", [profile_ref(str(uuid4()))]),                                 # nonexistent entry
    ]
    for label, evidence in wrong_basis:
        _, target = find_target(view, label)
        response = put_judgment(client, card, view, target, judge_request(
            view, "met", reason="Basis from the wrong place", evidence=evidence,
        ))
        assert response.status_code == 422, label

    # Importance of a posting requirement is never rewritten through a judgment.
    _, python_target = find_target(view, "Python")
    response = put_judgment(client, card, view, python_target, judge_request(
        view, "met", reason="Try to upgrade", importance="required",
        evidence=[profile_ref(profile_ids["Python course project"])],
    ))
    assert response.status_code == 422
    assert read_view(client, card) == view


def test_m5_missing_posting_information_stays_unknown_and_cannot_be_guessed(client, database_path):
    card = add_card(database_path, groups=[requirement("required", "unknown", "Python", "SQL")])
    profile = save_profile(client, [
        {"kind": "qualification", "label": "Enrolled in a bachelor programme"},
        {"kind": "skill", "label": "Python course project"},
        {"kind": "skill", "label": "SQL course project"},
    ])
    goal = save_goal(client, constraints=[
        {"kind": "location", "label": "Berlin", "importance": "required"},
    ])
    profile_ids = ids_by_label(profile, "evidence")
    goal_ids = ids_by_label(goal, "constraints")
    view = start_review(client, card)

    eligibility_group, eligibility_target = find_dimension_target(view, "qualification")
    preference_group, preference_target = find_target(view, "Berlin")
    requirement_group, _ = find_target(view, "Python")
    # The posting states no eligibility and no location: both are unavailable targets.
    assert eligibility_target["posting_available"] is False
    assert preference_target["posting_available"] is False
    for group in (eligibility_group, preference_group, requirement_group):
        assert group_result(view, group)["status"] == "unknown"

    for status in ("met", "partial", "missing"):
        response = put_judgment(client, card, view, eligibility_target, judge_request(
            view, status, reason="Guessing the unstated eligibility",
            evidence=[profile_ref(profile_ids["Enrolled in a bachelor programme"])],
        ))
        assert response.status_code == 422, status
        response = put_judgment(client, card, view, preference_target, judge_request(
            view, status, reason="Guessing the unstated location", evidence=[goal_ref(goal_ids["Berlin"])],
        ))
        assert response.status_code == 422, status
    assert read_view(client, card) == view

    # An unknown relationship shows the single items but does not guess a combination.
    view = judge(
        client, card, view, "Python", "met", reason="Course project",
        evidence=[profile_ref(profile_ids["Python course project"])],
    )
    view = judge(
        client, card, view, "SQL", "met", reason="Course project",
        evidence=[profile_ref(profile_ids["SQL course project"])],
    )
    assert judgment_of(view, find_target(view, "Python")[1])["status"] == "met"
    assert judgment_of(view, find_target(view, "SQL")[1])["status"] == "met"
    assert group_result(view, requirement_group)["status"] == "unknown"
    summary = view["match"]["summary"]
    assert summary["qualification_warnings"] == []
    assert summary["preference_conflicts"] == []
    assert summary["capability_gaps"] == []


def test_posting_without_stated_requirements_is_one_unconfirmable_unknown(client, database_path):
    card = add_card(database_path)
    save_profile(client, [{"kind": "skill", "label": "Python course project"}])
    view = start_review(client, card)

    group, target = find_dimension_target(view, "capability")
    assert target["posting_available"] is False
    assert group_result(view, group)["status"] == "unknown"
    profile_id = read_view(client, card)["match"]["profile_snapshot"]["evidence"][0]["evidence_id"]
    response = put_judgment(client, card, view, target, judge_request(
        view, "met", reason="Nothing to compare", evidence=[profile_ref(profile_id)],
    ))
    assert response.status_code == 422
    assert read_view(client, card) == view


# --------------------------------------------------------------------- PM_RULES

# (importance, rule, [(status or None, is_example)], expected group status)
RULE_CASES = {
    "all_of_explicit_missing_dominates_unknown": (
        "required", "all_of", [("met", False), ("missing", False), (None, False)], "missing"),
    "all_of_unknown_without_failure_stays_unknown": (
        "required", "all_of", [("met", False), (None, False)], "unknown"),
    "all_of_all_core_met_ignores_unknown_example": (
        "preferred", "all_of", [("met", False), ("met", False), (None, True)], "met"),
    "any_of_all_missing_is_missing": (
        "preferred", "any_of", [("missing", False), ("missing", False)], "missing"),
    "any_of_missing_plus_unknown_is_unknown": (
        "required", "any_of", [("missing", False), (None, False)], "unknown"),
    "any_of_missing_plus_partial_is_partial": (
        "required", "any_of", [("missing", False), ("partial", False)], "partial"),
    "any_of_partial_plus_unknown_is_unknown": (
        "required", "any_of", [("partial", False), (None, False)], "unknown"),
    "all_of_single_partial_is_partial_and_keeps_unknown_priority": (
        "unknown", "all_of", [("partial", False)], "partial"),
    "unknown_relationship_never_guesses_a_combination": (
        "required", "unknown", [("met", False), ("met", False)], "unknown"),
}


@pytest.mark.parametrize("case", RULE_CASES)
def test_group_aggregation_follows_the_approved_rules(client, database_path, case):
    importance, rule, items, expected = RULE_CASES[case]
    names = [f"Item {case} {index}" for index in range(len(items))]
    card = add_card(database_path, groups=[requirement(
        importance, rule,
        *[(name, "skill", is_example) for name, (_, is_example) in zip(names, items)],
    )])
    profile = save_profile(client, [
        {"kind": "skill", "label": "Confirmed relevant work", "description": "Project evidence"},
    ])
    evidence_id = ids_by_label(profile, "evidence")["Confirmed relevant work"]
    view = start_review(client, card)

    for name, (status, _) in zip(names, items):
        if status is not None:
            view = judge(
                client, card, view, name, status, reason=f"Confirmed {status}",
                evidence=[profile_ref(evidence_id)],
            )

    group, _ = find_target(view, names[0])
    result = group_result(view, group)
    assert result["status"] == expected
    # Posting importance is shown as written; nothing is upgraded or weighted.
    assert result["importance"] == importance
    for name, (status, _) in zip(names, items):
        _, target = find_target(view, name)
        assert judgment_of(view, target)["status"] == (status or "unknown")
    summary = view["match"]["summary"]
    # Required/preferred capability results never create an eligibility warning.
    assert summary["qualification_warnings"] == []
    assert_no_score_fields(review_body(view))


def test_not_applicable_needs_an_explicit_reason_and_is_not_counted_as_unknown(
    client, database_path,
):
    card = add_card(database_path, groups=[requirement("required", "all_of", "Driving licence")])
    view = start_review(client, card)
    group, target = find_target(view, "Driving licence")
    unknown_before = view["match"]["summary"]["evidence_coverage"]["unknown"]

    # Silence is not "not applicable"; the user must say why it does not apply.
    response = put_judgment(client, card, view, target, judge_request(view, "not_applicable"))
    assert response.status_code == 422
    assert read_view(client, card) == view

    view = judge(
        client, card, view, "Driving licence", "not_applicable",
        reason="The role is fully remote; no vehicle is needed",
    )
    assert judgment_of(view, target)["status"] == "not_applicable"
    assert judgment_of(view, target)["reason"] == "The role is fully remote; no vehicle is needed"
    assert group_result(view, group)["status"] == "not_applicable"
    coverage = view["match"]["summary"]["evidence_coverage"]
    assert coverage["explicitly_not_applicable"] == 1
    assert coverage["unknown"] == unknown_before - 1


# -------------------------------------------------------------------- PM_PERSIST


def test_fresh_database_reads_no_profile_or_goal_and_reading_confirms_nothing(client):
    for _ in range(2):
        for path in ("/profile", "/goal"):
            response = client.get(path)
            assert response.status_code == 200
            assert response.json() is None


def test_profile_and_goal_are_confirmed_separately_and_unknown_fields_can_be_skipped(client):
    profile = save_profile(client, [{"kind": "skill", "label": "Python course project"}])
    assert profile["revision"] == 1
    assert [e["description"] for e in profile["evidence"]] == [None]
    # Saving a Profile confirms no Goal: it stays unrecorded, not an empty confirmation.
    assert client.get("/goal").json() is None

    goal = save_goal(client, objective="Working-student role in data analysis")
    assert goal["revision"] == 1
    assert goal["constraints"] == []
    assert goal["objective"] == "Working-student role in data analysis"
    assert client.get("/profile").json() == profile
    assert client.get("/goal").json() == goal
    # Profile facts and Goal constraints are separate documents with separate identities.
    assert profile["profile_id"] != goal["goal_id"]


def test_confirmed_facts_and_reviews_survive_app_reconstruction_without_touching_legacy_data(
    database_path, key_store,
):
    card = add_card(
        database_path, eligibility=ENROLLED, address="Munich",
        groups=[requirement("required", "all_of", "Python")],
    )
    with TestClient(create_app(database_path=database_path, api_key_store=key_store)) as client:
        provider = client.post(
            "/settings/ai/providers", json=make_create_ai_provider_request(),
        ).json()
        card_path = f"/posting/card/{card.card_key}"
        before = {
            "card": client.get(card_path).json(), "original": client.get(card_path + "/original").json(),
            "cards": client.get("/posting/card").json(), "settings": client.get("/settings").json(),
            "rows": legacy_rows(database_path),
        }

        profile = save_profile(client, [
            {"kind": "skill", "label": "Python course project", "description": "Traffic data"},
        ])
        goal = save_goal(client, objective="Working student", constraints=[
            {"kind": "location", "label": "Berlin only", "importance": "required"},
        ])
        view = start_review(client, card)
        view = judge(
            client, card, view, "Python", "met", reason="Course project",
            evidence=[profile_ref(ids_by_label(profile, "evidence")["Python course project"])],
        )
        after = {
            "card": client.get(card_path).json(), "original": client.get(card_path + "/original").json(),
            "cards": client.get("/posting/card").json(), "settings": client.get("/settings").json(),
            "rows": legacy_rows(database_path),
        }

    # Confirmed personal writes never alter Card current/original, Settings or Provider rows.
    assert after == before
    assert before["settings"]["ai"]["providers"] == [provider]

    # A fresh application on the same database restores the facts and the saved review.
    with TestClient(create_app(database_path=database_path)) as reopened:
        assert reopened.get("/profile").json() == profile
        assert reopened.get("/goal").json() == goal
        assert reopened.get(match_url(card)).json() == view
        assert reopened.get("/settings").json() == before["settings"]
        assert reopened.get("/settings").json()["ai"]["providers"][0]["provider_key"] == provider["provider_key"]
    assert legacy_rows(database_path) == before["rows"]


def test_rejected_or_conflicting_saves_never_replace_saved_facts_or_echo_private_text(client):
    profile = save_profile(client, [{"kind": "skill", "label": "Python course project"}])
    goal = save_goal(client, constraints=[
        {"kind": "location", "label": "Berlin only", "importance": "required"},
    ])
    private = "PRIVATE-TEXT-MUST-NOT-BE-ECHOED"
    stale_profile = {"expected_revision": 0, "evidence": [{"kind": "skill", "label": private}]}
    unknown_id = {"expected_revision": 1, "evidence": [
        {"evidence_id": str(uuid4()), "kind": "skill", "label": private},
    ]}
    duplicate_id = {"expected_revision": 1, "evidence": [
        {"evidence_id": profile["evidence"][0]["evidence_id"], "kind": "skill", "label": private},
        {"evidence_id": profile["evidence"][0]["evidence_id"], "kind": "skill", "label": private},
    ]}
    invalid_kind = {"expected_revision": 1, "evidence": [{"kind": "hobby", "label": private}]}
    empty_label = {"expected_revision": 1, "evidence": [{"kind": "skill", "label": "   "}]}
    extra_field = {"expected_revision": 1, "evidence": [], "note": private}

    expected = [(stale_profile, 409), (unknown_id, 422), (duplicate_id, 422),
                (invalid_kind, 422), (empty_label, 422), (extra_field, 422)]
    for body, status_code in expected:
        response = client.put("/profile", json=body)
        assert response.status_code == status_code, body
        assert private not in response.text
        assert client.get("/profile").json() == profile

    stale_goal = {"expected_revision": 0, "objective": private, "constraints": []}
    bad_constraint = {"expected_revision": 1, "objective": None, "constraints": [
        {"kind": "mood", "label": private, "importance": "required"},
    ]}
    for body, status_code in [(stale_goal, 409), (bad_constraint, 422)]:
        response = client.put("/goal", json=body)
        assert response.status_code == status_code, body
        assert private not in response.text
        assert client.get("/goal").json() == goal


def test_match_requests_for_an_unknown_card_are_not_found(client):
    missing = uuid4()
    assert client.get(f"/matching/card/{missing}").status_code == 404
    response = client.post(
        f"/matching/card/{missing}/evaluate", json={"expected_inputs": "anything"},
    )
    assert response.status_code == 404


# ------------------------------------------------------------------- PM_IDENTITY


def test_repeated_evaluation_with_the_same_inputs_returns_the_same_review_and_keeps_judgments(
    client, database_path,
):
    card = add_card(database_path, groups=[requirement("required", "all_of", "Python")])
    profile = save_profile(client, [{"kind": "skill", "label": "Python course project"}])
    first = start_review(client, card)
    assert start_review(client, card) == first
    assert read_view(client, card) == first

    judged = judge(
        client, card, first, "Python", "met", reason="Course project",
        evidence=[profile_ref(ids_by_label(profile, "evidence")["Python course project"])],
    )
    again = start_review(client, card)
    # Re-starting never discards a confirmed judgment or changes any stable identity.
    assert again == judged
    assert again["match"]["match_id"] == first["match"]["match_id"]
    assert [g["group_id"] for g in again["match"]["groups"]] == [
        g["group_id"] for g in first["match"]["groups"]
    ]


def test_same_named_requirements_and_cards_have_distinct_targets_and_do_not_share_judgments(
    client, database_path,
):
    groups = [
        requirement("required", "any_of", "Python", "SQL"),
        requirement("preferred", "all_of", "Python"),
    ]
    card = add_card(database_path, groups=groups)
    other = add_card(database_path, groups=groups)
    profile = save_profile(client, [{"kind": "skill", "label": "Python course project"}])
    evidence_id = ids_by_label(profile, "evidence")["Python course project"]
    view = start_review(client, card)

    required_group, required_python = find_target(view, "Python", importance="required")
    preferred_group, preferred_python = find_target(view, "Python", importance="preferred")
    assert required_python["target_id"] != preferred_python["target_id"]
    assert required_group["group_id"] != preferred_group["group_id"]

    # Judge only the required occurrence; `judge` selects targets by label, so address it directly.
    response = put_judgment(client, card, view, required_python, judge_request(
        view, "met", reason="Course project", evidence=[profile_ref(evidence_id)],
    ))
    assert response.status_code == 200, response.text
    view = response.json()

    assert judgment_of(view, required_python)["status"] == "met"
    # The same name in another requirement is a different target and stays unknown.
    assert judgment_of(view, preferred_python)["status"] == "unknown"
    other_view = start_review(client, other)
    other_ids = {t["target_id"] for g in other_view["match"]["groups"] for t in g["targets"]}
    own_ids = {t["target_id"] for g in view["match"]["groups"] for t in g["targets"]}
    assert other_ids.isdisjoint(own_ids)
    assert {j["status"] for j in other_view["match"]["judgments"]} == {"unknown"}


@pytest.mark.parametrize("changed", ["profile", "goal", "posting"])
def test_changed_inputs_mark_the_review_stale_keep_it_readable_and_reject_old_writes(
    client, database_path, changed,
):
    card = add_card(database_path, groups=[requirement("required", "all_of", "Python")])
    profile = save_profile(client, [{"kind": "skill", "label": "Python course project"}])
    save_goal(client, constraints=[{"kind": "location", "label": "Berlin only", "importance": "required"}])
    old = start_review(client, card)
    old = judge(
        client, card, old, "Python", "met", reason="Course project",
        evidence=[profile_ref(ids_by_label(profile, "evidence")["Python course project"])],
    )
    assert old["stale"] is False and old["stale_reasons"] == []

    if changed == "profile":
        # Omitting the old evidence removes it from the current Profile only.
        save_profile(client, [{"kind": "skill", "label": "Different confirmed evidence"}], revision=1)
    elif changed == "goal":
        save_goal(client, constraints=[
            {"kind": "location", "label": "Potsdam only", "importance": "required"},
        ], revision=1)
    else:
        response = client.patch(
            f"/posting/card/{card.card_key}",
            json=make_card_update_request(
                position_title="Senior Data Analyst",
                requirement_groups=[
                    group.model_dump(mode="json", exclude={"origin"})
                    for group in card.posting.requirements.groups
                ],
            ),
        )
        assert response.status_code == 200, response.text

    stale = read_view(client, card)
    assert stale["stale"] is True
    assert stale["stale_reasons"] == [changed]
    # The old assessment stays readable exactly as confirmed; nothing is silently moved.
    assert stale["match"] == old["match"]
    assert stale["current_inputs"]["fingerprint"] != old["current_inputs"]["fingerprint"]

    # Neither the old nor the new fingerprint can write to the obsolete assessment.
    _, target = find_target(stale, "Python")
    for basis in (stale, old):
        response = put_judgment(client, card, basis, target, {
            **judge_request(basis, "unknown", reason="Late write"),
            "expected_revision": old["match"]["revision"],
        })
        assert response.status_code == 409
    response = client.post(
        match_url(card, "/evaluate"),
        json={"expected_inputs": old["current_inputs"]["fingerprint"]},
    )
    assert response.status_code == 409
    assert read_view(client, card) == stale

    fresh = start_review(client, card)
    assert fresh["stale"] is False and fresh["stale_reasons"] == []
    assert fresh["match"]["match_id"] != old["match"]["match_id"]
    old_ids = {t["target_id"] for g in old["match"]["groups"] for t in g["targets"]}
    new_ids = {t["target_id"] for g in fresh["match"]["groups"] for t in g["targets"]}
    assert old_ids.isdisjoint(new_ids)
    # No judgment is carried over by name: the new review starts from unknown.
    for judgment in fresh["match"]["judgments"]:
        assert judgment["status"] == "unknown"
        assert judgment["reason"] is None and judgment["evidence"] == []
    assert fresh["match"]["inputs"]["rule_revision"]
    assert fresh["match"]["inputs"]["rule_revision"] == old["match"]["inputs"]["rule_revision"]
    assert fresh["current_inputs"] == fresh["match"]["inputs"]

    history = client.get(match_url(card, "/history"))
    assert history.status_code == 200
    by_id = {entry["match"]["match_id"]: entry for entry in history.json()}
    assert set(by_id) == {old["match"]["match_id"], fresh["match"]["match_id"]}
    assert by_id[old["match"]["match_id"]]["match"] == old["match"]
    assert by_id[old["match"]["match_id"]]["stale_reasons"] == [changed]
    assert by_id[fresh["match"]["match_id"]]["stale"] is False
    if changed == "profile":
        retained = [e["label"] for e in by_id[old["match"]["match_id"]]["match"]["profile_snapshot"]["evidence"]]
        assert retained == ["Python course project"]
        assert [e["label"] for e in client.get("/profile").json()["evidence"]] == [
            "Different confirmed evidence"
        ]


def test_saving_identical_profile_or_goal_content_does_not_stale_a_valid_review(
    client, database_path,
):
    card = add_card(database_path, groups=[requirement("required", "all_of", "Python")])
    profile = save_profile(client, [{"kind": "skill", "label": "Python course project"}])
    goal = save_goal(client, constraints=[
        {"kind": "location", "label": "Berlin only", "importance": "required"},
    ])
    view = start_review(client, card)

    same_profile = client.put("/profile", json={
        "expected_revision": 1,
        "evidence": [{k: v for k, v in profile["evidence"][0].items()}],
    })
    same_goal = client.put("/goal", json={
        "expected_revision": 1, "objective": None,
        "constraints": [dict(goal["constraints"][0])],
    })
    assert same_profile.status_code == 200 and same_profile.json()["revision"] == 1
    assert same_goal.status_code == 200 and same_goal.json()["revision"] == 1
    assert read_view(client, card) == view


def test_deleted_card_keeps_its_history_readable_and_cannot_start_a_new_review(
    client, database_path,
):
    card = add_card(database_path, groups=[requirement("required", "all_of", "Python")])
    profile = save_profile(client, [{"kind": "skill", "label": "Python course project"}])
    view = start_review(client, card)
    view = judge(
        client, card, view, "Python", "met", reason="Course project",
        evidence=[profile_ref(ids_by_label(profile, "evidence")["Python course project"])],
    )

    assert client.delete(f"/posting/card/{card.card_key}").status_code < 300
    assert client.get(match_url(card)).status_code == 404
    response = client.post(
        match_url(card, "/evaluate"),
        json={"expected_inputs": view["current_inputs"]["fingerprint"]},
    )
    assert response.status_code == 404
    history = client.get(match_url(card, "/history"))
    assert history.status_code == 200
    [entry] = history.json()
    # The assessment is not cascaded away or rewritten; it is only flagged as orphaned.
    assert entry["match"] == view["match"]
    assert entry["stale"] is True
    assert "card_missing" in entry["stale_reasons"]


def test_writes_on_a_wrong_basis_are_rejected_without_changing_or_echoing_anything(
    client, database_path,
):
    card = add_card(database_path, groups=[requirement("required", "all_of", "Python")])
    profile = save_profile(client, [{"kind": "skill", "label": "Python course project"}])
    evidence = [profile_ref(ids_by_label(profile, "evidence")["Python course project"])]
    view = start_review(client, card)
    _, target = find_target(view, "Python")
    private = "PRIVATE-REASON-MUST-NOT-BE-ECHOED"

    wrong_revision = {**judge_request(view, "met", reason=private, evidence=evidence),
                      "expected_revision": view["match"]["revision"] + 1}
    wrong_inputs = {**judge_request(view, "met", reason=private, evidence=evidence),
                    "expected_inputs": "not-the-current-fingerprint"}
    for body in (wrong_revision, wrong_inputs):
        response = put_judgment(client, card, view, target, body)
        assert response.status_code == 409
        assert private not in response.text

    wrong_match = client.put(
        match_url(card, f"/{uuid4()}/judgment/{target['target_id']}"),
        json=judge_request(view, "met", reason=private, evidence=evidence),
    )
    assert wrong_match.status_code == 409
    unknown_target = client.put(
        match_url(card, f"/{view['match']['match_id']}/judgment/{uuid4()}"),
        json=judge_request(view, "met", reason=private, evidence=evidence),
    )
    assert unknown_target.status_code == 422
    invalid_status = put_judgment(client, card, view, target, {
        **judge_request(view, "met", reason=private, evidence=evidence), "status": "excellent",
    })
    assert invalid_status.status_code == 422
    assert private not in invalid_status.text + wrong_match.text + unknown_target.text
    assert read_view(client, card) == view
