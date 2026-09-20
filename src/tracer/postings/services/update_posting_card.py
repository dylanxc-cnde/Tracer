from typing import TYPE_CHECKING
from uuid import UUID

from ..models.posting_card import PostingCard
from ..models.posting_details import FactOrigin
from ..stores.posting_card_store import PostingCardStore

if TYPE_CHECKING:
    from tracer.api.models import UpdatePostingCardRequest


class UpdatePostingCardService:
    """Update the editable content of stored posting cards.

    Args:
        store: The posting card store to use.
    """

    def __init__(self, store: PostingCardStore):
        self._posting_card_store = store

    def update_user_content(
        self,
        card_key: UUID,
        request: "UpdatePostingCardRequest",
    ) -> PostingCard | None:
        """Update allowed fields while preserving sources and card metadata.

        Args:
            card_key: The posting card to update.
            request: The editable content submitted by the user.

        Returns:
            The updated card, or None if it does not exist.
        """
        card = self._posting_card_store.get_by_card_key(card_key)
        if card is None:
            return None

        original_card = self._posting_card_store.get_original_by_card_key(card_key)
        if original_card is None:
            return None

        payload = card.model_dump()
        saved_summary = card.posting.role_content.role_summary
        saved_summary_value = (
            saved_summary.value if saved_summary is not None else None
        )

        if request.role_summary != saved_summary_value:
            if request.role_summary is None:
                payload["posting"]["role_content"]["role_summary"] = None
            else:
                original_summary = original_card.posting.role_content.role_summary
                origin = FactOrigin.USER_DEFINED
                if (
                    original_summary is not None
                    and request.role_summary == original_summary.value
                ):
                    origin = original_summary.origin

                payload["posting"]["role_content"]["role_summary"] = {
                    "value": request.role_summary,
                    "origin": origin,
                }

        saved_responsibilities = tuple(
            responsibility.value
            for responsibility in card.posting.role_content.responsibilities
        )
        if request.responsibilities != saved_responsibilities:
            updated_responsibilities = []
            original_responsibilities = (
                original_card.posting.role_content.responsibilities
            )

            for value in request.responsibilities:
                origin = FactOrigin.USER_DEFINED
                for original_responsibility in original_responsibilities:
                    if value == original_responsibility.value:
                        origin = original_responsibility.origin
                        break

                updated_responsibilities.append({"value": value, "origin": origin})

            payload["posting"]["role_content"]["responsibilities"] = (
                updated_responsibilities
            )

        saved_domains = tuple(
            domain.value for domain in card.posting.role_content.domains
        )
        if request.role_domains != saved_domains:
            updated_domains = []
            original_domains = original_card.posting.role_content.domains

            for value in request.role_domains:
                origin = FactOrigin.USER_DEFINED
                for original_domain in original_domains:
                    if value == original_domain.value:
                        origin = original_domain.origin
                        break

                updated_domains.append({"value": value, "origin": origin})

            payload["posting"]["role_content"]["domains"] = updated_domains

        saved_classification = card.posting.classification
        original_classification = original_card.posting.classification
        classification_values = {
            "workload_type": request.workload_type,
            "contract_type": request.contract_type,
            "seniority": request.seniority,
            "internship_requirement": request.internship_requirement,
            "eligibility": request.eligibility,
        }
        for field, value in classification_values.items():
            saved_field = getattr(saved_classification, field)
            saved_value = saved_field.value if saved_field is not None else None
            if value == saved_value:
                continue

            if value is None:
                payload["posting"]["classification"][field] = None
            else:
                original_field = getattr(original_classification, field)
                origin = FactOrigin.USER_DEFINED
                if original_field is not None and value == original_field.value:
                    origin = original_field.origin
                payload["posting"]["classification"][field] = {
                    "value": value,
                    "origin": origin,
                }

        # Multi-select order has no meaning, just like application channels.
        selection_values = (
            ("classification", "role_families", request.role_families),
            ("work_conditions", "work_modes", request.work_modes),
        )
        for section, field, values in selection_values:
            saved_field = getattr(getattr(card.posting, section), field)
            saved_values = saved_field.value if saved_field is not None else ()
            if set(values) == set(saved_values):
                continue

            original_field = getattr(getattr(original_card.posting, section), field)
            if original_field is not None and set(values) == set(original_field.value):
                field_payload = original_field.model_dump()
            elif not values:
                field_payload = None
            else:
                field_payload = {"value": values, "origin": FactOrigin.USER_DEFINED}
            payload["posting"][section][field] = field_payload

        saved_work_conditions = card.posting.work_conditions
        original_work_conditions = original_card.posting.work_conditions
        work_condition_values = {
            "primary_address": request.primary_address,
            "schedule": request.schedule,
            "travel_requirement": request.travel_requirement,
            "start_on": request.start_on,
            "duration": request.duration,
        }
        for field, value in work_condition_values.items():
            saved_field = getattr(saved_work_conditions, field)
            saved_value = saved_field.value if saved_field is not None else None
            if value == saved_value:
                continue

            if value is None:
                payload["posting"]["work_conditions"][field] = None
            else:
                original_field = getattr(original_work_conditions, field)
                origin = FactOrigin.USER_DEFINED
                if original_field is not None and value == original_field.value:
                    origin = original_field.origin
                payload["posting"]["work_conditions"][field] = {
                    "value": value,
                    "origin": origin,
                }

        # Candidates are plain address strings, without per-item origin metadata.
        payload["posting"]["work_conditions"]["address_candidates"] = request.address_candidates

        saved_hours = saved_work_conditions.weekly_hours
        saved_minimum = saved_hours.minimum if saved_hours is not None else None
        saved_maximum = saved_hours.maximum if saved_hours is not None else None
        if (
            request.weekly_hours_minimum != saved_minimum
            or request.weekly_hours_maximum != saved_maximum
        ):
            if (
                request.weekly_hours_minimum is None
                and request.weekly_hours_maximum is None
            ):
                payload["posting"]["work_conditions"]["weekly_hours"] = None
            else:
                original_hours = original_work_conditions.weekly_hours
                origin = FactOrigin.USER_DEFINED
                if (
                    original_hours is not None
                    and request.weekly_hours_minimum == original_hours.minimum
                    and request.weekly_hours_maximum == original_hours.maximum
                ):
                    origin = original_hours.origin
                payload["posting"]["work_conditions"]["weekly_hours"] = {
                    "minimum": request.weekly_hours_minimum,
                    "maximum": request.weekly_hours_maximum,
                    "origin": origin,
                }

        saved_entries = [
            entry.model_dump(exclude={"origin"})
            for entry in card.posting.compensation.entries
        ]
        requested_entries = [
            entry.model_dump() for entry in request.compensation_entries
        ]
        if requested_entries != saved_entries:
            updated_entries = []
            original_entries = original_card.posting.compensation.entries

            for entry in requested_entries:
                origin = FactOrigin.USER_DEFINED
                for original_entry in original_entries:
                    if entry == original_entry.model_dump(exclude={"origin"}):
                        origin = original_entry.origin
                        break

                updated_entries.append({**entry, "origin": origin})

            payload["posting"]["compensation"]["entries"] = updated_entries

        saved_benefits = tuple(
            benefit.value for benefit in card.posting.compensation.benefits
        )
        if request.benefits != saved_benefits:
            updated_benefits = []
            original_benefits = original_card.posting.compensation.benefits

            for value in request.benefits:
                origin = FactOrigin.USER_DEFINED
                for original_benefit in original_benefits:
                    if value == original_benefit.value:
                        origin = original_benefit.origin
                        break

                updated_benefits.append({"value": value, "origin": origin})

            payload["posting"]["compensation"]["benefits"] = updated_benefits

        saved_vacation = card.posting.compensation.vacation_days
        saved_vacation_value = (
            saved_vacation.value if saved_vacation is not None else None
        )
        if request.vacation_days != saved_vacation_value:
            if request.vacation_days is None:
                payload["posting"]["compensation"]["vacation_days"] = None
            else:
                original_vacation = original_card.posting.compensation.vacation_days
                origin = FactOrigin.USER_DEFINED
                if (
                    original_vacation is not None
                    and request.vacation_days == original_vacation.value
                ):
                    origin = original_vacation.origin

                payload["posting"]["compensation"]["vacation_days"] = {
                    "value": request.vacation_days,
                    "origin": origin,
                }

        saved_application = card.posting.application_instructions
        original_application = original_card.posting.application_instructions
        saved_channels = saved_application.channels
        saved_channel_values = saved_channels.value if saved_channels is not None else ()
        if set(request.application_channels) != set(saved_channel_values):
            original_channels = original_application.channels
            if (
                original_channels is not None
                and set(request.application_channels) == set(original_channels.value)
            ):
                channels_payload = original_channels.model_dump()
            elif not request.application_channels:
                channels_payload = None
            else:
                channels_payload = {
                    "value": request.application_channels,
                    "origin": FactOrigin.USER_DEFINED,
                }
            payload["posting"]["application_instructions"]["channels"] = channels_payload

        application_values = {
            "application_url": request.application_url,
            "application_deadline": request.application_deadline,
            "required_email_subject": request.required_email_subject,
        }
        for field, value in application_values.items():
            saved_field = getattr(saved_application, field)
            saved_value = saved_field.value if saved_field is not None else None
            if value == saved_value:
                continue

            if value is None:
                payload["posting"]["application_instructions"][field] = None
            else:
                original_field = getattr(original_application, field)
                origin = FactOrigin.USER_DEFINED
                if original_field is not None and value == original_field.value:
                    origin = original_field.origin
                payload["posting"]["application_instructions"][field] = {
                    "value": value,
                    "origin": origin,
                }

        saved_documents = tuple(
            document.value
            for document in card.posting.application_instructions.required_documents
        )
        if request.required_documents != saved_documents:
            updated_documents = []
            original_documents = (
                original_card.posting.application_instructions.required_documents
            )

            for value in request.required_documents:
                origin = FactOrigin.USER_DEFINED
                for original_document in original_documents:
                    if value == original_document.value:
                        origin = original_document.origin
                        break

                updated_documents.append({"value": value, "origin": origin})

            payload["posting"]["application_instructions"]["required_documents"] = (
                updated_documents
            )

        saved_instructions = tuple(
            instruction.value
            for instruction in card.posting.application_instructions.special_instructions
        )
        if request.special_instructions != saved_instructions:
            updated_instructions = []
            original_instructions = (
                original_card.posting.application_instructions.special_instructions
            )

            for value in request.special_instructions:
                origin = FactOrigin.USER_DEFINED
                for original_instruction in original_instructions:
                    if value == original_instruction.value:
                        origin = original_instruction.origin
                        break

                updated_instructions.append({"value": value, "origin": origin})

            payload["posting"]["application_instructions"]["special_instructions"] = (
                updated_instructions
            )

        saved_contact = card.posting.contact
        contact_values = {
            "name": request.contact_name,
            "role": request.contact_role,
            "email": request.contact_email,
            "phone": request.contact_phone,
        }
        saved_contact_values = {
            field: getattr(saved_contact, field, None) for field in contact_values
        }
        if contact_values != saved_contact_values:
            original_contact = original_card.posting.contact
            has_contact_values = any(
                value is not None for value in contact_values.values()
            )

            if not has_contact_values and original_contact is None:
                payload["posting"]["contact"] = None
            else:
                # Keep the source even when every contact value is cleared.
                source = {"excerpts": (), "source_urls": ()}
                if saved_contact is not None:
                    source = saved_contact.source.model_dump()
                elif original_contact is not None:
                    source = original_contact.source.model_dump()

                origin = FactOrigin.USER_DEFINED
                if original_contact is not None and all(
                    value == getattr(original_contact, field)
                    for field, value in contact_values.items()
                ):
                    origin = original_contact.origin

                payload["posting"]["contact"] = {
                    "source": source,
                    **contact_values,
                    "origin": origin,
                }

        saved_company_summary = card.posting.company.company_summary
        saved_company_summary_value = (
            saved_company_summary.value if saved_company_summary is not None else None
        )
        if request.company_summary != saved_company_summary_value:
            if request.company_summary is None:
                payload["posting"]["company"]["company_summary"] = None
            else:
                original_company_summary = original_card.posting.company.company_summary
                origin = FactOrigin.USER_DEFINED
                if (
                    original_company_summary is not None
                    and request.company_summary == original_company_summary.value
                ):
                    origin = original_company_summary.origin

                payload["posting"]["company"]["company_summary"] = {
                    "value": request.company_summary,
                    "origin": origin,
                }

        saved_industries = tuple(
            industry.value for industry in card.posting.company.industry_tags
        )
        if request.industry_tags != saved_industries:
            updated_industries = []
            original_industries = original_card.posting.company.industry_tags

            for value in request.industry_tags:
                origin = FactOrigin.USER_DEFINED
                for original_industry in original_industries:
                    if value == original_industry.value:
                        origin = original_industry.origin
                        break

                updated_industries.append({"value": value, "origin": origin})

            payload["posting"]["company"]["industry_tags"] = updated_industries

        saved_employee_range = card.posting.company.employee_range
        saved_employee_range_value = (
            saved_employee_range.value if saved_employee_range is not None else None
        )
        if request.employee_range != saved_employee_range_value:
            if request.employee_range is None:
                payload["posting"]["company"]["employee_range"] = None
            else:
                original_employee_range = original_card.posting.company.employee_range
                origin = FactOrigin.USER_DEFINED
                if (
                    original_employee_range is not None
                    and request.employee_range == original_employee_range.value
                ):
                    origin = original_employee_range.origin

                payload["posting"]["company"]["employee_range"] = {
                    "value": request.employee_range,
                    "origin": origin,
                }

        payload["posting_alias"] = request.posting_alias
        payload["user_notes"] = request.user_notes
        payload["tags"] = request.tags
        updated_card = PostingCard.model_validate(payload)

        if not self._posting_card_store.update(updated_card):
            return None

        return updated_card
