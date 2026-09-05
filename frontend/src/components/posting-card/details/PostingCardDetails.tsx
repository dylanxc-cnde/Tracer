import { useEffect, useRef, useState } from 'react'
import './PostingCardDetails.css'
import type {
  PostingCard,
  UpdatePostingCardRequest,
} from '../../../postings/types/postingCard'
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
import { PostingCardWorkConditions } from './PostingCardWorkConditions'
import { PostingCardCompensation } from './PostingCardCompensation'
import { PostingCardBenefits } from './PostingCardBenefits'
import { PostingCardVacation } from './PostingCardVacation'
import { PostingCardApplicationFacts } from './PostingCardApplicationFacts'
import { PostingCardRequiredDocuments } from './PostingCardRequiredDocuments'
import { PostingCardSpecialInstructions } from './PostingCardSpecialInstructions'
import { PostingCardContact } from './PostingCardContact'
import { PostingCardAboutCompany } from './PostingCardAboutCompany'
import { PostingCardSourceEvidence } from './PostingCardSourceEvidence'

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
  const editor = usePostingCardEditor(card, onUpdate, isReadOnly)
  const posting = card.posting

  useEffect(() => {
    const dialog = dialogRef.current

    if (dialog !== null && !dialog.open) {
      dialog.showModal()
      dialog.focus({ preventScroll: true })
    }
  }, [])

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
        if (editor.isEditing) {
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
        <p className="posting-card-details__edit-error" role="alert">
          {editor.saveError}
        </p>
      )}

      <header className="posting-card-details__header">
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
        />

        <label className="posting-card-details__source-toggle">
          <input
            type="checkbox"
            checked={areSourcesVisible}
            onChange={(event) => setAreSourcesVisible(event.target.checked)}
          />
          <span>Show sources</span>
        </label>
      </header>

      <div className="posting-card-details__content">
        <section className="posting-card-details__section">
          <h3>What you’ll do</h3>

          <div className="posting-card-details__field">
            <h4>Role summary</h4>

            <PostingCardRoleSummary
              summary={posting.role_content.role_summary}
            />
          </div>

          <div className="posting-card-details__field">
            <h4>Responsibilities</h4>

            <PostingCardResponsibilities
              responsibilities={posting.role_content.responsibilities}
            />
          </div>

          <div className="posting-card-details__field">
            <h4>Role domains</h4>

            <PostingCardRoleDomains
              domains={posting.role_content.domains}
            />
          </div>

          <PostingCardSourceEvidence
            source={posting.role_content.source}
            areSourcesVisible={areSourcesVisible}
          />
        </section>

        {posting.requirements.groups.length > 0 && (
          <section className="posting-card-details__section">
            <h3>What they’re looking for</h3>

            <PostingCardRequirements groups={posting.requirements.groups} />

            <PostingCardSourceEvidence
              source={posting.requirements.source}
              areSourcesVisible={areSourcesVisible}
            />
          </section>
        )}

        <section className="posting-card-details__section">
          <h3>Work conditions</h3>

          <PostingCardWorkConditions
            workConditions={posting.work_conditions}
          />

          <PostingCardSourceEvidence
            source={posting.work_conditions.source}
            areSourcesVisible={areSourcesVisible}
          />
        </section>

        <section className="posting-card-details__section">
          <h3>Salary and benefits</h3>

          <div className="posting-card-details__field">
            <h4>Salary</h4>

            <PostingCardCompensation
              entries={posting.compensation.entries}
            />
          </div>

          <div className="posting-card-details__benefits">
            <h4>Benefits</h4>

            <PostingCardBenefits
              benefits={posting.compensation.benefits}
            />
          </div>

          <div className="posting-card-details__field">
            <h4>Vacation</h4>

            <PostingCardVacation
              vacationDays={posting.compensation.vacation_days}
            />
          </div>

          <PostingCardSourceEvidence
            source={posting.compensation.source}
            areSourcesVisible={areSourcesVisible}
          />
        </section>

        <section className="posting-card-details__section">
          <h3>Application</h3>

          <PostingCardApplicationFacts
            applicationInstructions={posting.application_instructions}
          />

          <div className="posting-card-details__application-field">
            <h4>Required documents</h4>
            <PostingCardRequiredDocuments
              requiredDocuments={
                posting.application_instructions.required_documents
              }
            />
          </div>

          <div className="posting-card-details__application-field">
            <h4>Special instructions</h4>
            <PostingCardSpecialInstructions
              specialInstructions={
                posting.application_instructions.special_instructions
              }
            />
          </div>

          <PostingCardSourceEvidence
            source={posting.application_instructions.source}
            areSourcesVisible={areSourcesVisible}
          />
        </section>

        <details className="posting-card-details__disclosure" open>
          <summary>Contact</summary>

          <div className="posting-card-details__disclosure-content">
            <PostingCardContact contact={posting.contact} />

            {posting.contact !== null && (
              <PostingCardSourceEvidence
                source={posting.contact.source}
                areSourcesVisible={areSourcesVisible}
              />
            )}
          </div>
        </details>

        <details className="posting-card-details__disclosure" open>
          <summary>About the company</summary>

          <div className="posting-card-details__disclosure-content">
            <PostingCardAboutCompany company={posting.company} />

            <PostingCardSourceEvidence
              source={posting.company.source}
              areSourcesVisible={areSourcesVisible}
            />
          </div>
        </details>

        <PostingCardUserArea
          draft={editor.draft}
          isEditing={editor.isEditing}
          onAliasChange={editor.updateDraftAlias}
          onTagsChange={editor.updateDraftTags}
          onNotesChange={editor.updateDraftNotes}
        />

        <p className="posting-card-details__created-at">
          Created at <time dateTime={card.created_at}>{card.created_at}</time>
        </p>
      </div>
    </dialog>
  )
}
