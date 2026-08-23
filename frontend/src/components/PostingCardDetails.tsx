import { useEffect, useRef, useState } from 'react'
import './PostingCardDetails.css'
import type { PostingCard } from '../postings/types/postingCard'
import type {
  CompensationEntry,
  FactOrigin,
  PostingLocation,
  Requirement,
  RequirementImportance,
  SourceExcerpt,
  WeeklyHours,
} from '../postings/types/postingDetails'

type PostingCardDetailsProps = {
  card: PostingCard
  onClose: () => void
}

type QuickFact = {
  label: string
  value: string
}

type RequirementGroupProps = {
  title: string
  importance: RequirementImportance
  requirements: Requirement[]
  showSources: boolean
}

type SourceEvidenceProps = {
  origin: FactOrigin
  sources: SourceExcerpt[]
  showSources: boolean
}

function formatWords(value: string) {
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

function SourceEvidence({ origin, sources, showSources }: SourceEvidenceProps) {
  if (!showSources) {
    return null
  }

  if (origin === 'user_defined') {
    return (
      <p className="posting-card-details__source-user-defined">
        User-defined
      </p>
    )
  }

  if (sources.length === 0) {
    return (
      <p className="posting-card-details__source-unavailable">
        No source available
      </p>
    )
  }

  return (
    <details className="posting-card-details__source">
      <summary>View source</summary>

      <ul className="posting-card-details__source-list">
        {sources.map((source, index) => {
          const safeSourceUrl = getSafeSourceUrl(source.source_url)

          return (
            <li key={`${source.text}-${source.source_url ?? 'no-url'}-${index}`}>
              <blockquote>{source.text}</blockquote>

              {source.source_url !== null && (
                <div className="posting-card-details__source-url">
                  <strong>Source URL</strong>

                  {safeSourceUrl === null ? (
                    <span>{source.source_url}</span>
                  ) : (
                    <a
                      href={safeSourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {source.source_url}
                    </a>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </details>
  )
}

function getItemRuleLabel(requirement: Requirement) {
  if (requirement.items.length <= 1 || requirement.item_rule === 'single') {
    return null
  }

  if (requirement.item_rule === 'any_of') {
    return 'Choose any one'
  }

  if (requirement.item_rule === 'all_of') {
    return 'All required together'
  }

  return 'Combination unclear'
}

function getItemConnector(requirement: Requirement) {
  if (requirement.item_rule === 'any_of') {
    return 'OR'
  }

  if (requirement.item_rule === 'all_of') {
    return 'AND'
  }

  return null
}

function RequirementGroup({
  title,
  importance,
  requirements,
  showSources,
}: RequirementGroupProps) {
  if (requirements.length === 0) {
    return null
  }

  return (
    <section
      className={`posting-card-details__requirement-group posting-card-details__requirement-group--${importance}`}
    >
      <h4>{title}</h4>

      <div className="posting-card-details__requirement-list">
        {requirements.map((requirement, requirementIndex) => {
          const itemRuleLabel = getItemRuleLabel(requirement)
          const itemConnector = getItemConnector(requirement)

          return (
            <article
              className="posting-card-details__requirement"
              key={`${requirement.text}-${requirementIndex}`}
            >
              <p>{requirement.text}</p>

              {requirement.items.length > 0 && (
                <div className="posting-card-details__requirement-items">
                  {itemRuleLabel !== null && (
                    <span className="posting-card-details__item-rule">
                      {itemRuleLabel}
                    </span>
                  )}

                  <div className="posting-card-details__pill-list">
                    {requirement.items.map((item, itemIndex) => (
                      <span
                        className="posting-card-details__pill-with-connector"
                        key={`${item.normalized_name ?? item.name}-${itemIndex}`}
                      >
                        {itemIndex > 0 && itemConnector !== null && (
                          <span className="posting-card-details__item-connector">
                            {itemConnector}
                          </span>
                        )}

                        <span
                          className={`posting-card-details__pill${item.is_example ? ' posting-card-details__pill--example' : ''}`}
                          title={formatWords(item.category)}
                        >
                          {item.is_example && (
                            <span className="posting-card-details__example-prefix">
                              e.g.
                            </span>
                          )}
                          {item.name}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <SourceEvidence
                origin={requirement.origin}
                sources={requirement.sources}
                showSources={showSources}
              />
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
}: PostingCardDetailsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [showSources, setShowSources] = useState(false)
  const [showPostingInfo, setShowPostingInfo] = useState(false)
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
  const quickFacts: QuickFact[] = []

  if (locations.length > 0) {
    quickFacts.push({ label: 'Location', value: locations.join(' · ') })
  }

  if (posting.work_conditions.work_modes !== null) {
    quickFacts.push({
      label: 'Work mode',
      value: posting.work_conditions.work_modes.value.map(formatWords).join(' · '),
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
        .map(formatWords)
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

  const requiredRequirements = posting.requirements.filter(
    (requirement) => requirement.importance === 'required',
  )
  const preferredRequirements = posting.requirements.filter(
    (requirement) => requirement.importance === 'preferred',
  )
  const unknownRequirements = posting.requirements.filter(
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

  return (
    <dialog
      ref={dialogRef}
      className="posting-card-details"
      tabIndex={-1}
      onClose={onClose}
    >
      <div className="posting-card-details__topbar">
        <h2 className="posting-card-details__title">
          {card.posting_alias ??
            posting.identity.position_title?.value ??
            'Unknown Position'}
        </h2>

        <button
          className="button--primary posting-card-details__close"
          type="button"
          onClick={() => dialogRef.current?.close()}
        >
          Close
        </button>
      </div>

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
              aria-expanded={showPostingInfo}
              aria-controls="posting-card-details-posting-info"
              onClick={() => setShowPostingInfo((current) => !current)}
            >
              Posting info
              <span aria-hidden="true">▾</span>
            </button>
          )}
        </div>

        {quickFacts.length > 0 && (
          <dl className="posting-card-details__quick-facts">
            {quickFacts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {hasPostingSourceDetails && showPostingInfo && (
          <div
            id="posting-card-details-posting-info"
            className="posting-card-details__posting-info"
          >
            <dl className="posting-card-details__posting-info-list">
              {postingUrl !== null && (
                <div>
                  <dt>Posting URL</dt>
                  <dd>
                    {safePostingUrl === null ? (
                      postingUrl
                    ) : (
                      <a
                        href={safePostingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {postingUrl}
                      </a>
                    )}
                  </dd>
                </div>
              )}

              {posting.identity.source_platform !== null && (
                <div>
                  <dt>Source platform</dt>
                  <dd>{posting.identity.source_platform.value}</dd>
                </div>
              )}

              {posting.identity.published_on !== null && (
                <div>
                  <dt>Published</dt>
                  <dd>{posting.identity.published_on.value}</dd>
                </div>
              )}

              {posting.identity.posting_language !== null && (
                <div>
                  <dt>Language</dt>
                  <dd>{posting.identity.posting_language.value}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        <label className="posting-card-details__source-toggle">
          <input
            type="checkbox"
            checked={showSources}
            onChange={(event) => setShowSources(event.target.checked)}
          />
          <span>Show sources</span>
        </label>
      </header>

      <div className="posting-card-details__content">
        {hasRoleContent && (
          <section className="posting-card-details__section">
            <h3>What you’ll do</h3>

            {posting.role_content.role_summary !== null && (
              <div className="posting-card-details__lead">
                <p>{posting.role_content.role_summary.value}</p>
                <SourceEvidence
                  origin={posting.role_content.role_summary.origin}
                  sources={posting.role_content.role_summary.sources}
                  showSources={showSources}
                />
              </div>
            )}

            {posting.role_content.responsibilities.length > 0 && (
              <ul className="posting-card-details__content-list">
                {posting.role_content.responsibilities.map(
                  (responsibility, index) => (
                    <li key={`${responsibility.value}-${index}`}>
                      <span>{responsibility.value}</span>
                      <SourceEvidence
                        origin={responsibility.origin}
                        sources={responsibility.sources}
                        showSources={showSources}
                      />
                    </li>
                  ),
                )}
              </ul>
            )}

            {posting.role_content.domains.length > 0 && (
              <div className="posting-card-details__tag-group">
                <strong>Role domains</strong>
                <div className="posting-card-details__pill-list">
                  {posting.role_content.domains.map((domain, index) => (
                    <span
                      className="posting-card-details__pill"
                      key={`${domain.value}-${index}`}
                    >
                      {domain.value}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {posting.requirements.length > 0 && (
          <section className="posting-card-details__section">
            <h3>What they’re looking for</h3>

            <RequirementGroup
              title="Required"
              importance="required"
              requirements={requiredRequirements}
              showSources={showSources}
            />
            <RequirementGroup
              title="Nice to have"
              importance="preferred"
              requirements={preferredRequirements}
              showSources={showSources}
            />
            <RequirementGroup
              title="Unclear"
              importance="unknown"
              requirements={unknownRequirements}
              showSources={showSources}
            />
          </section>
        )}

        {hasWorkConditions && (
          <section className="posting-card-details__section">
            <h3>Work conditions</h3>

            <dl className="posting-card-details__work-conditions">
              {weeklyHours !== null && (
                <div>
                  <dt>Weekly hours</dt>
                  <dd>{weeklyHours}</dd>
                </div>
              )}

              {posting.work_conditions.schedule !== null && (
                <div>
                  <dt>Schedule</dt>
                  <dd>{posting.work_conditions.schedule.value}</dd>
                </div>
              )}

              {posting.work_conditions.travel_requirement !== null && (
                <div>
                  <dt>Travel requirement</dt>
                  <dd>{posting.work_conditions.travel_requirement.value}</dd>
                </div>
              )}

              {posting.work_conditions.start_on !== null && (
                <div>
                  <dt>Start date</dt>
                  <dd>{posting.work_conditions.start_on.value}</dd>
                </div>
              )}

              {posting.work_conditions.duration !== null && (
                <div>
                  <dt>Duration</dt>
                  <dd>{posting.work_conditions.duration.value}</dd>
                </div>
              )}
            </dl>
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
                      <strong>{formatWords(entry.compensation_type)}</strong>

                      {compensation !== null && <span>{compensation}</span>}

                      {entry.payment_conditions !== null && (
                        <span>{entry.payment_conditions}</span>
                      )}

                      <SourceEvidence
                        origin={entry.origin}
                        sources={entry.sources}
                        showSources={showSources}
                      />
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
                      <SourceEvidence
                        origin={benefit.origin}
                        sources={benefit.sources}
                        showSources={showSources}
                      />
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
                <SourceEvidence
                  origin={posting.compensation.vacation_days.origin}
                  sources={posting.compensation.vacation_days.sources}
                  showSources={showSources}
                />
              </div>
            )}
          </section>
        )}

        {hasCompanyDetails && (
          <details className="posting-card-details__disclosure">
            <summary>About the company</summary>

            <div className="posting-card-details__disclosure-content">
              {posting.company.company_summary !== null && (
                <div>
                  <p>{posting.company.company_summary.value}</p>
                  <SourceEvidence
                    origin={posting.company.company_summary.origin}
                    sources={posting.company.company_summary.sources}
                    showSources={showSources}
                  />
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
            </div>
          </details>
        )}
      </div>
    </dialog>
  )
}
