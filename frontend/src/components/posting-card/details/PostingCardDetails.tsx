import { useEffect, useRef, useState } from 'react'
import './PostingCardDetails.css'
import type {
  PostingCard,
  UpdatePostingCardRequest,
} from '../../../postings/types/postingCard'
import type { PostingDetails } from '../../../postings/types/postingDetails'
import { getOriginalPostingCard } from '../../../postings/api/postings'
import {
  PostingCardUserArea,
} from './PostingCardUserArea'
import {
  PostingCardQuickFacts,
} from './PostingCardQuickFacts'
import { PostingCardDetailsTopbar } from './PostingCardDetailsTopbar'
import { usePostingCardEditor } from './usePostingCardEditor'
import { PostingCardPostingInfo } from './PostingCardPostingInfo'
import { PostingCardRoleSummary } from './PostingCardRoleSummary'
import { PostingCardResponsibilities } from './PostingCardResponsibilities'
import { PostingCardRoleDomains } from './PostingCardRoleDomains'
import { PostingCardRequirements } from './PostingCardRequirements'
import {
  PostingCardWorkConditions,
  PostingCardWorkConditionAdd,
} from './PostingCardWorkConditions'
import {
  PostingCardCompensation,
  PostingCardCompensationAdd,
} from './PostingCardCompensation'
import { PostingCardBenefits } from './PostingCardBenefits'
import { PostingCardVacation } from './PostingCardVacation'
import { PostingCardApplicationFacts } from './PostingCardApplicationFacts'
import { PostingCardRequiredDocuments } from './PostingCardRequiredDocuments'
import { PostingCardSpecialInstructions } from './PostingCardSpecialInstructions'
import { PostingCardContact } from './PostingCardContact'
import { PostingCardAboutCompany } from './PostingCardAboutCompany'
import { PostingCardSourceEvidence } from './PostingCardSourceEvidence'
import { PostingCardSaveError } from './PostingCardSaveError'

type PostingCardDetailsProps = {
  card: PostingCard
  isReadOnly?: boolean
  onClose: () => void
  onUpdate: (
    cardKey: string,
    request: UpdatePostingCardRequest,
  ) => Promise<PostingCard>
}

export function PostingCardDetails({
  card,
  isReadOnly = false,
  onClose,
  onUpdate,
}: PostingCardDetailsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [areSourcesVisible, setAreSourcesVisible] = useState(false)
  const [isPostingInfoOpen, setIsPostingInfoOpen] = useState(false)
  const [sourceComparison, setSourceComparison] = useState<{
    cardKey: string
    originalCard: PostingCard | null
  } | null>(null)
  const editor = usePostingCardEditor(card, onUpdate, isReadOnly)
  const posting = card.posting

  useEffect(() => {
    const dialog = dialogRef.current

    if (dialog !== null && !dialog.open) {
      dialog.showModal()
      dialog.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    if (!areSourcesVisible || isReadOnly) {
      return
    }

    // Read the saved baseline only for source inspection; never replace the card or draft.
    let isCurrentRequest = true

    getOriginalPostingCard(card.card_key).then(
      (originalCard) => {
        if (isCurrentRequest) {
          setSourceComparison({ cardKey: card.card_key, originalCard })
        }
      },
      () => {
        if (isCurrentRequest) {
          setSourceComparison({ cardKey: card.card_key, originalCard: null })
        }
      },
    )

    return () => {
      isCurrentRequest = false
    }
  }, [areSourcesVisible, card.card_key, isReadOnly])

  function handleDismissSaveError() {
    editor.dismissSaveError()
    dialogRef.current?.focus({ preventScroll: true })
  }

  function isSectionModified(section: keyof PostingDetails): boolean {
    if (
      isReadOnly ||
      sourceComparison?.cardKey !== card.card_key ||
      sourceComparison.originalCard === null
    ) {
      return false
    }

    // Compare whole saved sections so removal and empty values count as changes too.
    return JSON.stringify(posting[section]) !==
      JSON.stringify(sourceComparison.originalCard.posting[section])
  }

  const hasPostingSourceDetails =
    posting.identity.canonical_posting_url !== null ||
    posting.identity.source_platform !== null ||
    posting.identity.published_on !== null ||
    posting.identity.posting_language !== null
  return (
    <dialog
      ref={dialogRef}
      className="posting-card-details"
      tabIndex={-1}
      onClose={onClose}
      onCancel={(event) => {
        if (editor.saveError !== null) {
          event.preventDefault()
          handleDismissSaveError()
        } else if (editor.isEditing) {
          event.preventDefault()
          editor.cancelEditing()
        }
      }}
    >
      <PostingCardDetailsTopbar
        displayedTitle={editor.displayedTitle}
        originalTitle={editor.originalTitle}
        isOriginalTitleVisible={editor.isOriginalTitleVisible}
        isEditing={editor.isEditing}
        isSavingCardChanges={editor.isSavingCardChanges}
        hasChanges={editor.hasChanges}
        onCancel={editor.cancelEditing}
        onClose={() => dialogRef.current?.close()}
        onEdit={editor.startEditing}
        onSave={editor.saveCardChanges}
        isReadOnly={isReadOnly}
      />

      {editor.saveError !== null && (
        <PostingCardSaveError
          message={editor.saveError}
          onDismiss={handleDismissSaveError}
        />
      )}

      <header
        className={`posting-card-details__header${editor.isEditing && !isReadOnly ? ' posting-card-details__header--editing' : ''}`}
      >
        <div className="posting-card-details__metadata-row">
          <p className="posting-card-details__company">
            {posting.identity.company_name?.value ?? 'Unknown Company'}
            {posting.identity.department_name !== null && (
              <span> · {posting.identity.department_name.value}</span>
            )}
            {posting.identity.external_job_id !== null && (
              <span> · Job ID: {posting.identity.external_job_id.value}</span>
            )}
          </p>

          {hasPostingSourceDetails && (
            <button
              className="posting-card-details__posting-info-toggle"
              type="button"
              aria-expanded={isPostingInfoOpen}
              aria-controls="posting-card-details-posting-info"
              onClick={() => setIsPostingInfoOpen((current) => !current)}
            >
              Posting info
              <span aria-hidden="true">▾</span>
            </button>
          )}
        </div>

        <PostingCardQuickFacts posting={posting} />

        {hasPostingSourceDetails && isPostingInfoOpen && (
          <PostingCardPostingInfo
            identity={posting.identity}
          />
        )}

        <PostingCardSourceEvidence
          source={posting.identity.source}
          areSourcesVisible={areSourcesVisible}
          isModified={isSectionModified('identity')}
        />

        <label className="posting-card-details__source-toggle">
          <input
            type="checkbox"
            checked={areSourcesVisible}
            onChange={(event) => setAreSourcesVisible(event.target.checked)}
          />
          <span>Show sources</span>
        </label>

        {areSourcesVisible && !isReadOnly && (
          sourceComparison?.cardKey !== card.card_key ? (
            <p className="posting-card-details__source-comparison-notice" role="status">
              Checking changes against the original…
            </p>
          ) : sourceComparison.originalCard === null ? (
            <p className="posting-card-details__source-comparison-notice" role="status">
              Could not compare with the original. Hide and show sources to retry.
            </p>
          ) : null
        )}
      </header>

      <div className="posting-card-details__content">
        <section className="posting-card-details__section">
          <h3>What you’ll do</h3>

          <div className="posting-card-details__field">
            <h4>Role summary</h4>

            <PostingCardRoleSummary
              summary={posting.role_content.role_summary}
              draft={editor.draft.roleSummary}
              isEditing={editor.isEditing}
              isSavingCardChanges={editor.isSavingCardChanges}
              onSummaryChange={editor.updateDraftRoleSummary}
            />
          </div>

          <div className="posting-card-details__field">
            <div className="posting-card-details__field-heading">
              <h4>Responsibilities</h4>

              {editor.isEditing && (
                <button
                  className="posting-card-details__add-responsibility button--primary"
                  type="button"
                  aria-label="Add responsibility"
                  title="Add responsibility"
                  disabled={editor.isSavingCardChanges}
                  onClick={editor.addDraftResponsibility}
                >
                  +
                </button>
              )}
            </div>

            <PostingCardResponsibilities
              responsibilities={posting.role_content.responsibilities}
              draft={editor.draft.responsibilities}
              isEditing={editor.isEditing}
              isSavingCardChanges={editor.isSavingCardChanges}
              onResponsibilityChange={editor.updateDraftResponsibility}
              onResponsibilityDelete={editor.deleteDraftResponsibility}
            />
          </div>

          <div className="posting-card-details__field">
            <div className="posting-card-details__field-heading">
              <h4>Role domains</h4>

              {editor.isEditing && (
                <button
                  className="posting-card-details__add-role-domain button--primary"
                  type="button"
                  aria-label="Add role domain"
                  title="Add role domain"
                  disabled={editor.isSavingCardChanges}
                  onClick={editor.addDraftRoleDomain}
                >
                  +
                </button>
              )}
            </div>

            <PostingCardRoleDomains
              domains={posting.role_content.domains}
              draft={editor.draft.roleDomains}
              isEditing={editor.isEditing}
              isSavingCardChanges={editor.isSavingCardChanges}
              onDomainChange={editor.updateDraftRoleDomain}
              onDomainDelete={editor.deleteDraftRoleDomain}
            />
          </div>

          <PostingCardSourceEvidence
            source={posting.role_content.source}
            areSourcesVisible={areSourcesVisible}
            isModified={isSectionModified('role_content')}
          />
        </section>

        {posting.requirements.groups.length > 0 && (
          <section className="posting-card-details__section">
            <h3>What they’re looking for</h3>

            <PostingCardRequirements groups={posting.requirements.groups} />

            <PostingCardSourceEvidence
              source={posting.requirements.source}
              areSourcesVisible={areSourcesVisible}
              isModified={isSectionModified('requirements')}
            />
          </section>
        )}

        <section className="posting-card-details__section">
          <div className="posting-card-work-conditions__heading">
            <h3>Work conditions</h3>
            {editor.isEditing && (
              <PostingCardWorkConditionAdd
                draft={editor.draft.workConditions}
                isSavingCardChanges={editor.isSavingCardChanges}
                onAdd={editor.addDraftWorkCondition}
              />
            )}
          </div>

          <PostingCardWorkConditions
            key={editor.isEditing ? 'editing' : 'reading'}
            workConditions={posting.work_conditions}
            draft={editor.draft.workConditions}
            isEditing={editor.isEditing}
            isSavingCardChanges={editor.isSavingCardChanges}
            onTextChange={editor.updateDraftWorkConditionText}
            onWeeklyHoursChange={editor.updateDraftWeeklyHours}
            onDelete={editor.deleteDraftWorkCondition}
          />

          <PostingCardSourceEvidence
            source={posting.work_conditions.source}
            areSourcesVisible={areSourcesVisible}
            isModified={isSectionModified('work_conditions')}
          />
        </section>

        <section className="posting-card-details__section">
          <h3>Salary and benefits</h3>

          <div className="posting-card-details__field">
            <div className="posting-card-compensation__heading">
              <h4>Salary</h4>
              {editor.isEditing && (
                <PostingCardCompensationAdd
                  isSavingCardChanges={editor.isSavingCardChanges}
                  onAdd={editor.addDraftCompensationEntry}
                />
              )}
            </div>

            <PostingCardCompensation
              key={editor.isEditing ? 'editing' : 'reading'}
              entries={posting.compensation.entries}
              draft={editor.draft.compensationEntries}
              isEditing={editor.isEditing}
              isSavingCardChanges={editor.isSavingCardChanges}
              onEntryChange={editor.updateDraftCompensationEntry}
              onEntryDelete={editor.deleteDraftCompensationEntry}
            />
          </div>

          <div className="posting-card-details__benefits">
            <div className="posting-card-details__field-heading">
              <h4>Benefits</h4>

              {editor.isEditing && (
                <button
                  className="posting-card-details__add-benefit button--primary"
                  type="button"
                  aria-label="Add benefit"
                  title="Add benefit"
                  disabled={editor.isSavingCardChanges}
                  onClick={editor.addDraftBenefit}
                >
                  +
                </button>
              )}
            </div>

            <PostingCardBenefits
              benefits={posting.compensation.benefits}
              draft={editor.draft.benefits}
              isEditing={editor.isEditing}
              isSavingCardChanges={editor.isSavingCardChanges}
              onBenefitChange={editor.updateDraftBenefit}
              onBenefitDelete={editor.deleteDraftBenefit}
            />
          </div>

          <div className="posting-card-details__field">
            <h4>Vacation</h4>

            <PostingCardVacation
              vacationDays={posting.compensation.vacation_days}
              draft={editor.draft.vacationDays}
              isEditing={editor.isEditing}
              isSavingCardChanges={editor.isSavingCardChanges}
              onVacationDaysChange={editor.updateDraftVacationDays}
            />
          </div>

          <PostingCardSourceEvidence
            source={posting.compensation.source}
            areSourcesVisible={areSourcesVisible}
            isModified={isSectionModified('compensation')}
          />
        </section>

        <section className="posting-card-details__section">
          <h3>Application</h3>

          <PostingCardApplicationFacts
            applicationInstructions={posting.application_instructions}
          />

          <div className="posting-card-details__application-field">
            <div className="posting-card-details__field-heading">
              <h4>Required documents</h4>

              {editor.isEditing && (
                <button
                  className="posting-card-details__add-required-document button--primary"
                  type="button"
                  aria-label="Add required document"
                  title="Add required document"
                  disabled={editor.isSavingCardChanges}
                  onClick={editor.addDraftRequiredDocument}
                >
                  +
                </button>
              )}
            </div>

            <PostingCardRequiredDocuments
              requiredDocuments={
                posting.application_instructions.required_documents
              }
              draft={editor.draft.requiredDocuments}
              isEditing={editor.isEditing}
              isSavingCardChanges={editor.isSavingCardChanges}
              onRequiredDocumentChange={editor.updateDraftRequiredDocument}
              onRequiredDocumentDelete={editor.deleteDraftRequiredDocument}
            />
          </div>

          <div className="posting-card-details__application-field">
            <div className="posting-card-details__field-heading">
              <h4>Special instructions</h4>

              {editor.isEditing && (
                <button
                  className="posting-card-details__add-special-instruction button--primary"
                  type="button"
                  aria-label="Add special instruction"
                  title="Add special instruction"
                  disabled={editor.isSavingCardChanges}
                  onClick={editor.addDraftSpecialInstruction}
                >
                  +
                </button>
              )}
            </div>

            <PostingCardSpecialInstructions
              specialInstructions={
                posting.application_instructions.special_instructions
              }
              draft={editor.draft.specialInstructions}
              isEditing={editor.isEditing}
              isSavingCardChanges={editor.isSavingCardChanges}
              onSpecialInstructionChange={editor.updateDraftSpecialInstruction}
              onSpecialInstructionDelete={editor.deleteDraftSpecialInstruction}
            />
          </div>

          <PostingCardSourceEvidence
            source={posting.application_instructions.source}
            areSourcesVisible={areSourcesVisible}
            isModified={isSectionModified('application_instructions')}
          />
        </section>

        <details className="posting-card-details__disclosure" open>
          <summary>Contact</summary>

          <div className="posting-card-details__disclosure-content">
            <PostingCardContact
              contact={posting.contact}
              nameDraft={editor.draft.contactName}
              roleDraft={editor.draft.contactRole}
              emailDraft={editor.draft.contactEmail}
              phoneDraft={editor.draft.contactPhone}
              isEditing={editor.isEditing}
              isSavingCardChanges={editor.isSavingCardChanges}
              onNameChange={editor.updateDraftContactName}
              onRoleChange={editor.updateDraftContactRole}
              onEmailChange={editor.updateDraftContactEmail}
              onPhoneChange={editor.updateDraftContactPhone}
            />

            {posting.contact !== null && (
              <PostingCardSourceEvidence
                source={posting.contact.source}
                areSourcesVisible={areSourcesVisible}
                isModified={isSectionModified('contact')}
              />
            )}
          </div>
        </details>

        <details className="posting-card-details__disclosure" open>
          <summary>About the company</summary>

          <div className="posting-card-details__disclosure-content">
            <PostingCardAboutCompany
              company={posting.company}
              companySummaryDraft={editor.draft.companySummary}
              industryTagsDraft={editor.draft.industryTags}
              employeeRangeDraft={editor.draft.employeeRange}
              isEditing={editor.isEditing}
              isSavingCardChanges={editor.isSavingCardChanges}
              onCompanySummaryChange={editor.updateDraftCompanySummary}
              onIndustryAdd={editor.addDraftIndustry}
              onIndustryChange={editor.updateDraftIndustry}
              onIndustryDelete={editor.deleteDraftIndustry}
              onEmployeeRangeChange={editor.updateDraftEmployeeRange}
            />

            <PostingCardSourceEvidence
              source={posting.company.source}
              areSourcesVisible={areSourcesVisible}
              isModified={isSectionModified('company')}
            />
          </div>
        </details>

        <PostingCardUserArea
          draft={editor.draft}
          isEditing={editor.isEditing}
          isSavingCardChanges={editor.isSavingCardChanges}
          onAliasChange={editor.updateDraftAlias}
          onTagAdd={editor.addDraftTag}
          onTagChange={editor.updateDraftTag}
          onTagDelete={editor.deleteDraftTag}
          onNotesChange={editor.updateDraftNotes}
        />

        <p className="posting-card-details__created-at">
          Created at <time dateTime={card.created_at}>{card.created_at}</time>
        </p>
      </div>
    </dialog>
  )
}
