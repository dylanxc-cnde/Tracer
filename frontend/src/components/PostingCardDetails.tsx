import { useEffect, useRef, useState } from 'react'
import './PostingCardDetails.css'
import type { PostingCard } from '../postings/types/postingCard'
import type {
  CompensationEntry,
  PostingLocation,
  PostingSource,
  Requirement,
  RequirementImportance,
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
}

type DisplayRequirement = Pick<Requirement, 'item_rule' | 'items'>

type SourceContextProps = {
  source: PostingSource
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

function SourceContext({ source, showSources }: SourceContextProps) {
  if (!showSources) {
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
                            title={formatWords(item.category)}
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
                          title={formatWords(item.category)}
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

        <SourceContext
          source={posting.identity.source}
          showSources={showSources}
        />

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
              </div>
            )}

            {posting.role_content.responsibilities.length > 0 && (
              <ul className="posting-card-details__content-list">
                {posting.role_content.responsibilities.map(
                  (responsibility, index) => (
                    <li key={`${responsibility.value}-${index}`}>
                      <span>{responsibility.value}</span>
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

            <SourceContext
              source={posting.role_content.source}
              showSources={showSources}
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

            <SourceContext
              source={posting.requirements.source}
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

            <SourceContext
              source={posting.work_conditions.source}
              showSources={showSources}
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
                      <strong>{formatWords(entry.compensation_type)}</strong>

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

            <SourceContext
              source={posting.compensation.source}
              showSources={showSources}
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
                        .map(formatWords)
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

            <SourceContext
              source={posting.application_instructions.source}
              showSources={showSources}
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

              <SourceContext
                source={contact.source}
                showSources={showSources}
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

              <SourceContext
                source={posting.company.source}
                showSources={showSources}
              />
            </div>
          </details>
        )}

        <p className="posting-card-details__created-at">
          Created at <time dateTime={card.created_at}>{card.created_at}</time>
        </p>
      </div>
    </dialog>
  )
}
