import { useEffect, useRef, useState } from 'react'
import './PostingCardDetails.css'
import type {
  PostingCard,
  UpdatePostingCardRequest,
} from '../../../postings/types/postingCard'
import type {
  CompensationEntry,
  PostingLocation,
  PostingSource,
  Requirement,
  RequirementImportance,
  WeeklyHours,
} from '../../../postings/types/postingDetails'
import {
  PostingCardUserArea,
} from './PostingCardUserArea'
import {
  PostingCardQuickFacts,
  type PostingCardQuickFact,
} from './PostingCardQuickFacts'
import { PostingCardDetailsTopbar } from './PostingCardDetailsTopbar'
import { usePostingCardEditor } from './usePostingCardEditor'
import { PostingCardPostingInfo } from './PostingCardPostingInfo'
import { PostingCardRoleSummary } from './PostingCardRoleSummary'
import { PostingCardResponsibilities } from './PostingCardResponsibilities'
import { PostingCardRoleDomains } from './PostingCardRoleDomains'
import { PostingCardWorkConditions } from './PostingCardWorkConditions'

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

function formatEnumValue(value: string) {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatLocation(location: PostingLocation) {
  return [location.city, location.region, location.country]
    .filter((part): part is string => part !== null && part.trim().length > 0)
    .join(', ')
}

function formatWeeklyHours(weeklyHours: WeeklyHours) {
  const { minimum, maximum } = weeklyHours

  if (minimum !== null && maximum !== null) {
    return minimum === maximum
      ? `${minimum} hours/week`
      : `${minimum}–${maximum} hours/week`
  }

  if (minimum !== null) {
    return `From ${minimum} hours/week`
  }

  if (maximum !== null) {
    return `Up to ${maximum} hours/week`
  }

  return null
}

function formatCompensation(entry: CompensationEntry) {
  let amount: string

  if (entry.minimum_amount !== null && entry.maximum_amount !== null) {
    amount =
      entry.minimum_amount === entry.maximum_amount
        ? `${entry.minimum_amount}`
        : `${entry.minimum_amount}–${entry.maximum_amount}`
  } else if (entry.minimum_amount !== null) {
    amount = `From ${entry.minimum_amount}`
  } else if (entry.maximum_amount !== null) {
    amount = `Up to ${entry.maximum_amount}`
  } else {
    return null
  }

  const salary = [
    amount,
    entry.currency,
    entry.period === null ? null : `per ${entry.period}`,
    entry.pay_basis === 'unknown' ? null : entry.pay_basis,
  ]
    .filter((part): part is string => part !== null)
    .join(' ')

  if (entry.applicable_groups.length === 0) {
    return salary
  }

  return `${entry.applicable_groups.join(', ')}: ${salary}`
}

function getSafeSourceUrl(sourceUrl: string | null) {
  if (sourceUrl === null) {
    return null
  }

  try {
    const parsedUrl = new URL(sourceUrl)

    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      return parsedUrl.href
    }
  } catch {
    return null
  }

  return null
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
              const safeSourceUrl = getSafeSourceUrl(sourceUrl)

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

function getItemRuleLabel(itemRule: Requirement['item_rule']) {
  if (itemRule === 'any_of') {
    return 'Choose any one'
  }

  if (itemRule === 'all_of') {
    return 'All required together'
  }

  return 'Combination unclear'
}

function getItemConnector(itemRule: Requirement['item_rule']) {
  if (itemRule === 'any_of') {
    return 'OR'
  }

  if (itemRule === 'all_of') {
    return 'AND'
  }

  return null
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
          const itemRuleLabel = getItemRuleLabel(requirement.item_rule)
          const itemConnector = getItemConnector(requirement.item_rule)
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

  const locations = posting.work_conditions.locations
    .map(formatLocation)
    .filter((location) => location.length > 0)
  const weeklyHours =
    posting.work_conditions.weekly_hours === null
      ? null
      : formatWeeklyHours(posting.work_conditions.weekly_hours)
  const quickFacts: PostingCardQuickFact[] = []

  if (locations.length > 0) {
    quickFacts.push({ label: 'Location', value: locations.join(' · ') })
  }

  if (posting.work_conditions.work_modes !== null) {
    quickFacts.push({
      label: 'Work mode',
      value: posting.work_conditions.work_modes.value
        .map(formatEnumValue)
        .join(' · '),
    })
  }

  if (posting.classification.original_employment_type !== null) {
    quickFacts.push({
      label: 'Job type',
      value: posting.classification.original_employment_type.value,
    })
  } else if (posting.classification.role_families !== null) {
    quickFacts.push({
      label: 'Job type',
      value: posting.classification.role_families.value
        .map(formatEnumValue)
        .join(' · '),
    })
  }

  if (weeklyHours !== null) {
    quickFacts.push({
      label: 'Weekly hours',
      value: weeklyHours,
    })
  }

  if (posting.application_instructions.application_deadline !== null) {
    quickFacts.push({
      label: 'Deadline',
      value: posting.application_instructions.application_deadline.value,
    })
  }

  const salaries = posting.compensation.entries
    .filter((entry) => entry.compensation_type === 'base_salary')
    .map(formatCompensation)
    .filter((salary): salary is string => salary !== null)

  if (salaries.length > 0) {
    quickFacts.push({
      label: 'Salary',
      value: salaries.join(' · '),
    })
  }

  const requiredRequirements = posting.requirements.groups.filter(
    (requirement) => requirement.importance === 'required',
  )
  const preferredRequirements = posting.requirements.groups.filter(
    (requirement) => requirement.importance === 'preferred',
  )
  const unknownRequirements = posting.requirements.groups.filter(
    (requirement) => requirement.importance === 'unknown',
  )

  const hasRoleContent =
    posting.role_content.role_summary !== null ||
    posting.role_content.responsibilities.length > 0 ||
    posting.role_content.domains.length > 0
  const hasWorkConditions =
    weeklyHours !== null ||
    posting.work_conditions.schedule !== null ||
    posting.work_conditions.travel_requirement !== null ||
    posting.work_conditions.start_on !== null ||
    posting.work_conditions.duration !== null
  const hasCompensation =
    posting.compensation.entries.length > 0 ||
    posting.compensation.benefits.length > 0 ||
    posting.compensation.vacation_days !== null
  const hasApplicationDetails =
    (posting.application_instructions.channels !== null &&
      posting.application_instructions.channels.value.length > 0) ||
    posting.application_instructions.application_url !== null ||
    posting.application_instructions.required_email_subject !== null ||
    posting.application_instructions.required_documents.length > 0 ||
    posting.application_instructions.special_instructions.length > 0 ||
    posting.application_instructions.application_deadline !== null
  const contact = posting.contact
  const hasContactDetails =
    contact !== null &&
    (contact.name !== null ||
      contact.role !== null ||
      contact.email !== null ||
      contact.phone !== null)
  const hasCompanyDetails =
    posting.company.company_summary !== null ||
    posting.company.industry_tags.length > 0 ||
    posting.company.employee_range !== null
  const hasPostingSourceDetails =
    posting.identity.canonical_posting_url !== null ||
    posting.identity.source_platform !== null ||
    posting.identity.published_on !== null ||
    posting.identity.posting_language !== null
  const postingUrl = posting.identity.canonical_posting_url?.value ?? null
  const safePostingUrl = getSafeSourceUrl(postingUrl)
  const applicationUrlField =
    posting.application_instructions.application_url
  const applicationUrl = applicationUrlField?.value ?? null
  const safeApplicationUrl = getSafeSourceUrl(applicationUrl)
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

        <PostingCardQuickFacts facts={quickFacts} />

        {hasPostingSourceDetails && isPostingInfoOpen && (
          <PostingCardPostingInfo
            identity={posting.identity}
            safePostingUrl={safePostingUrl}
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
        {hasRoleContent && (
          <section className="posting-card-details__section">
            <h3>What you’ll do</h3>

            <PostingCardRoleSummary
              summary={posting.role_content.role_summary}
            />

            <PostingCardResponsibilities
              responsibilities={posting.role_content.responsibilities}
            />

            <PostingCardRoleDomains
              domains={posting.role_content.domains}
            />

            <PostingSourceEvidence
              source={posting.role_content.source}
              areSourcesVisible={areSourcesVisible}
            />
          </section>
        )}

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

        {hasWorkConditions && (
          <section className="posting-card-details__section">
            <h3>Work conditions</h3>

            <PostingCardWorkConditions
              workConditions={posting.work_conditions}
              weeklyHours={weeklyHours}
            />

            <PostingSourceEvidence
              source={posting.work_conditions.source}
              areSourcesVisible={areSourcesVisible}
            />
          </section>
        )}

        {hasCompensation && (
          <section className="posting-card-details__section">
            <h3>Salary and benefits</h3>

            {posting.compensation.entries.length > 0 && (
              <ul className="posting-card-details__compensation-list">
                {posting.compensation.entries.map((entry, index) => {
                  const compensation = formatCompensation(entry)

                  return (
                    <li key={`${entry.compensation_type}-${index}`}>
                      <strong>{formatEnumValue(entry.compensation_type)}</strong>

                      {compensation !== null && <span>{compensation}</span>}

                      {entry.payment_conditions !== null && (
                        <span>{entry.payment_conditions}</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            {posting.compensation.benefits.length > 0 && (
              <div className="posting-card-details__benefits">
                <h4>Benefits</h4>

                <ul className="posting-card-details__content-list">
                  {posting.compensation.benefits.map((benefit, index) => (
                    <li key={`${benefit.value}-${index}`}>
                      <span>{benefit.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {posting.compensation.vacation_days !== null && (
              <div className="posting-card-details__vacation">
                <strong>Vacation</strong>
                <span>
                  {posting.compensation.vacation_days.value} days per year
                </span>
              </div>
            )}

            <PostingSourceEvidence
              source={posting.compensation.source}
              areSourcesVisible={areSourcesVisible}
            />
          </section>
        )}

        {hasApplicationDetails && (
          <section className="posting-card-details__section">
            <h3>Application</h3>

            <dl className="posting-card-details__application-facts">
              {posting.application_instructions.channels !== null &&
                posting.application_instructions.channels.value.length > 0 && (
                  <div>
                    <dt>Channels</dt>
                    <dd>
                      {posting.application_instructions.channels.value
                        .map(formatEnumValue)
                        .join(' · ')}
                    </dd>
                  </div>
                )}

              {applicationUrlField !== null && (
                <div>
                  <dt>Application URL</dt>
                  <dd>
                    {safeApplicationUrl === null ? (
                      applicationUrlField.value
                    ) : (
                      <a
                        href={safeApplicationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {applicationUrlField.value}
                      </a>
                    )}
                  </dd>
                </div>
              )}

              {posting.application_instructions.application_deadline !==
                null && (
                <div>
                  <dt>Deadline</dt>
                  <dd>
                    {
                      posting.application_instructions.application_deadline
                        .value
                    }
                  </dd>
                </div>
              )}

              {posting.application_instructions.required_email_subject !==
                null && (
                <div>
                  <dt>Email subject</dt>
                  <dd>
                    {
                      posting.application_instructions.required_email_subject
                        .value
                    }
                  </dd>
                </div>
              )}
            </dl>

            {posting.application_instructions.required_documents.length > 0 && (
              <div className="posting-card-details__application-list">
                <h4>Required documents</h4>
                <ul className="posting-card-details__content-list">
                  {posting.application_instructions.required_documents.map(
                    (document, index) => (
                      <li key={`${document.value}-${index}`}>
                        <span>{document.value}</span>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}

            {posting.application_instructions.special_instructions.length >
              0 && (
              <div className="posting-card-details__application-list">
                <h4>Special instructions</h4>
                <ul className="posting-card-details__content-list">
                  {posting.application_instructions.special_instructions.map(
                    (instruction, index) => (
                      <li key={`${instruction.value}-${index}`}>
                        <span>{instruction.value}</span>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}

            <PostingSourceEvidence
              source={posting.application_instructions.source}
              areSourcesVisible={areSourcesVisible}
            />
          </section>
        )}

        {hasContactDetails && contact !== null && (
          <details className="posting-card-details__disclosure">
            <summary>Contact</summary>

            <div className="posting-card-details__disclosure-content">
              <dl className="posting-card-details__contact-list">
                {contact.name !== null && (
                  <div>
                    <dt>Name</dt>
                    <dd>{contact.name}</dd>
                  </div>
                )}

                {contact.role !== null && (
                  <div>
                    <dt>Role</dt>
                    <dd>{contact.role}</dd>
                  </div>
                )}

                {contact.email !== null && (
                  <div>
                    <dt>Email</dt>
                    <dd>{contact.email}</dd>
                  </div>
                )}

                {contact.phone !== null && (
                  <div>
                    <dt>Phone</dt>
                    <dd>{contact.phone}</dd>
                  </div>
                )}
              </dl>

              <PostingSourceEvidence
                source={contact.source}
                areSourcesVisible={areSourcesVisible}
              />
            </div>
          </details>
        )}

        {hasCompanyDetails && (
          <details className="posting-card-details__disclosure">
            <summary>About the company</summary>

            <div className="posting-card-details__disclosure-content">
              {posting.company.company_summary !== null && (
                <div>
                  <p>{posting.company.company_summary.value}</p>
                </div>
              )}

              {posting.company.industry_tags.length > 0 && (
                <div className="posting-card-details__tag-group">
                  <strong>Industries</strong>
                  <div className="posting-card-details__pill-list">
                    {posting.company.industry_tags.map((industry, index) => (
                      <span
                        className="posting-card-details__pill"
                        key={`${industry.value}-${index}`}
                      >
                        {industry.value}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {posting.company.employee_range !== null && (
                <p>
                  <strong>Company size:</strong>{' '}
                  {posting.company.employee_range.value}
                </p>
              )}

              <PostingSourceEvidence
                source={posting.company.source}
                areSourcesVisible={areSourcesVisible}
              />
            </div>
          </details>
        )}

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
