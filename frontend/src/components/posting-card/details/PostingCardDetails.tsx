import { useEffect, useRef, useState } from 'react'
import './PostingCardDetails.css'
import type {
  PostingCard,
  UpdatePostingCardRequest,
} from '../../../postings/types/postingCard'
import type {
  PostingSource,
  Requirement,
  RequirementImportance,
} from '../../../postings/types/postingDetails'
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
import { PostingCardWorkConditions } from './PostingCardWorkConditions'
import { PostingCardCompensation } from './PostingCardCompensation'
import { PostingCardBenefits } from './PostingCardBenefits'
import { PostingCardVacation } from './PostingCardVacation'
import { PostingCardApplicationFacts } from './PostingCardApplicationFacts'
import { PostingCardRequiredDocuments } from './PostingCardRequiredDocuments'
import { PostingCardSpecialInstructions } from './PostingCardSpecialInstructions'
import { PostingCardContact } from './PostingCardContact'
import { PostingCardAboutCompany } from './PostingCardAboutCompany'
import { getSafeHttpUrl } from './PostingCardSanitizers'
import {
  formatEnumValue,
  formatRequirementItemRuleConnector,
  formatRequirementItemRuleLabel,
} from './PostingCardFormatters'

type PostingCardDetailsProps = {
  card: PostingCard
  onClose: () => void
  onUpdate: (
    cardKey: string,
    request: UpdatePostingCardRequest,
  ) => Promise<PostingCard>
}

type RequirementGroupProps = {
  title: string
  importance: RequirementImportance
  requirements: Requirement[]
}

type DisplayRequirement = Pick<Requirement, 'item_rule' | 'items'>

type PostingSourceEvidenceProps = {
  source: PostingSource
  areSourcesVisible: boolean
}

function PostingSourceEvidence({
  source,
  areSourcesVisible,
}: PostingSourceEvidenceProps) {
  if (!areSourcesVisible) {
    return null
  }

  if (source.excerpts.length === 0 && source.source_urls.length === 0) {
    return (
      <p className="posting-card-details__source-unavailable">
        No source available
      </p>
    )
  }

  return (
    <details className="posting-card-details__source">
      <summary>View source</summary>

      {source.excerpts.length > 0 && (
        <ul className="posting-card-details__source-list">
          {source.excerpts.map((excerpt, index) => (
            <li key={`${excerpt}-${index}`}>
              <blockquote>{excerpt}</blockquote>
            </li>
          ))}
        </ul>
      )}

      {source.source_urls.length > 0 && (
        <div className="posting-card-details__source-url">
          <strong>Source URLs</strong>

          <ul>
            {source.source_urls.map((sourceUrl, index) => {
              const safeSourceUrl = getSafeHttpUrl(sourceUrl)

              return (
                <li key={`${sourceUrl}-${index}`}>
                  {safeSourceUrl === null ? (
                    <span>{sourceUrl}</span>
                  ) : (
                    <a
                      href={safeSourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {sourceUrl}
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </details>
  )
}

function mergeAllOfRequirements(
  requirements: Requirement[],
): DisplayRequirement[] {
  const allOfItems = requirements
    .filter((requirement) => requirement.item_rule === 'all_of')
    .flatMap((requirement) => requirement.items)
  
  const otherRequirements = requirements.filter(
    (requirement) => requirement.item_rule !== 'all_of',
  )

  return [
    ...(allOfItems.length > 0
      ? [{ item_rule: 'all_of' as const, items: allOfItems }]
      : []),
    ...otherRequirements,
  ]
}

function RequirementGroup({
  title,
  importance,
  requirements,
}: RequirementGroupProps) {
  if (requirements.length === 0) {
    return null
  }

  const displayRequirements = mergeAllOfRequirements(requirements)

  return (
    <section
      className={`posting-card-details__requirement-group posting-card-details__requirement-group--${importance}`}
    >
      <h4>{title}</h4>

      <div className="posting-card-details__requirement-list">
        {displayRequirements.map((requirement, requirementIndex) => {
          const itemRuleLabel = formatRequirementItemRuleLabel(
            requirement.item_rule,
          )
          const itemConnector = formatRequirementItemRuleConnector(
            requirement.item_rule,
          )
          const coreItems = requirement.items.filter(
            (item) => !item.is_example,
          )
          const exampleItems = requirement.items.filter(
            (item) => item.is_example,
          )

          return (
            <article
              className={`posting-card-details__requirement posting-card-details__requirement--${requirement.item_rule.replace('_', '-')}`}
              key={`${requirement.item_rule}-${requirementIndex}`}
            >
              {requirement.items.length > 0 && (
                <div className="posting-card-details__requirement-items">
                  {itemRuleLabel !== null && (
                    <span className="posting-card-details__item-rule">
                      {itemRuleLabel}
                    </span>
                  )}

                  {coreItems.length > 0 && (
                    <div className="posting-card-details__pill-list">
                      {coreItems.map((item, itemIndex) => (
                        <span
                          className="posting-card-details__pill-with-connector"
                          key={`${item.name}-${itemIndex}`}
                        >
                          {itemIndex > 0 && itemConnector !== null && (
                            <span className="posting-card-details__item-connector">
                              {itemConnector}
                            </span>
                          )}

                          <span
                            className="posting-card-details__pill"
                            title={formatEnumValue(item.category)}
                          >
                            {item.name}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}

                  {exampleItems.length > 0 && (
                    <div className="posting-card-details__pill-list posting-card-details__example-list">
                      {exampleItems.map((item, itemIndex) => (
                        <span
                          className="posting-card-details__pill posting-card-details__pill--example"
                          title={formatEnumValue(item.category)}
                          key={`${item.name}-${itemIndex}`}
                        >
                          <span className="posting-card-details__example-prefix">
                            e.g.
                          </span>
                          {item.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

export function PostingCardDetails({
  card,
  onClose,
  onUpdate,
}: PostingCardDetailsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [areSourcesVisible, setAreSourcesVisible] = useState(false)
  const [isPostingInfoOpen, setIsPostingInfoOpen] = useState(false)
  const editor = usePostingCardEditor(card, onUpdate)
  const posting = card.posting

  useEffect(() => {
    const dialog = dialogRef.current

    if (dialog !== null && !dialog.open) {
      dialog.showModal()
      dialog.focus({ preventScroll: true })
    }
  }, [])

  const requiredRequirements = posting.requirements.groups.filter(
    (requirement) => requirement.importance === 'required',
  )
  const preferredRequirements = posting.requirements.groups.filter(
    (requirement) => requirement.importance === 'preferred',
  )
  const unknownRequirements = posting.requirements.groups.filter(
    (requirement) => requirement.importance === 'unknown',
  )

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

        <PostingSourceEvidence
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

          <PostingSourceEvidence
            source={posting.role_content.source}
            areSourcesVisible={areSourcesVisible}
          />
        </section>

        {posting.requirements.groups.length > 0 && (
          <section className="posting-card-details__section">
            <h3>What they’re looking for</h3>

            <RequirementGroup
              title="Required"
              importance="required"
              requirements={requiredRequirements}
            />
            <RequirementGroup
              title="Nice to have"
              importance="preferred"
              requirements={preferredRequirements}
            />
            <RequirementGroup
              title="Unclear"
              importance="unknown"
              requirements={unknownRequirements}
            />

            <PostingSourceEvidence
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

          <PostingSourceEvidence
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

          <PostingSourceEvidence
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

          <PostingSourceEvidence
            source={posting.application_instructions.source}
            areSourcesVisible={areSourcesVisible}
          />
        </section>

        <details className="posting-card-details__disclosure" open>
          <summary>Contact</summary>

          <div className="posting-card-details__disclosure-content">
            <PostingCardContact contact={posting.contact} />

            {posting.contact !== null && (
              <PostingSourceEvidence
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

            <PostingSourceEvidence
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
