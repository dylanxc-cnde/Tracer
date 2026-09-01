import './PostingCardQuickFacts.css'
import type { PostingDetails } from '../../../postings/types/postingDetails'
import {
  formatCompensationEntry,
  formatEnumValue,
  formatLocation,
  formatWeeklyHours,
} from './postingCardFormatters'

type PostingCardQuickFact = {
  label: string
  value: string
}

type PostingCardQuickFactsProps = {
  posting: PostingDetails
}

function createQuickFacts(posting: PostingDetails) {
  const facts: PostingCardQuickFact[] = []
  const locations = posting.work_conditions.locations
    .map(formatLocation)
    .filter((location) => location.length > 0)

  if (locations.length > 0) {
    facts.push({ label: 'Location', value: locations.join(' · ') })
  }

  if (posting.work_conditions.work_modes !== null) {
    facts.push({
      label: 'Work mode',
      value: posting.work_conditions.work_modes.value
        .map(formatEnumValue)
        .join(' · '),
    })
  }

  if (posting.classification.original_employment_type !== null) {
    facts.push({
      label: 'Job type',
      value: posting.classification.original_employment_type.value,
    })
  } else if (posting.classification.role_families !== null) {
    facts.push({
      label: 'Job type',
      value: posting.classification.role_families.value
        .map(formatEnumValue)
        .join(' · '),
    })
  }

  if (posting.work_conditions.weekly_hours !== null) {
    const weeklyHours = formatWeeklyHours(
      posting.work_conditions.weekly_hours,
    )

    if (weeklyHours !== null) {
      facts.push({
        label: 'Weekly hours',
        value: weeklyHours,
      })
    }
  }

  if (posting.application_instructions.application_deadline !== null) {
    facts.push({
      label: 'Deadline',
      value: posting.application_instructions.application_deadline.value,
    })
  }

  const salaries = posting.compensation.entries
    .filter((entry) => entry.compensation_type === 'base_salary')
    .map(formatCompensationEntry)
    .filter((salary): salary is string => salary !== null)

  if (salaries.length > 0) {
    facts.push({
      label: 'Salary',
      value: salaries.join(' · '),
    })
  }

  return facts
}

export function PostingCardQuickFacts({
  posting,
}: PostingCardQuickFactsProps) {
  const facts = createQuickFacts(posting)

  if (facts.length === 0) {
    return null
  }

  return (
    <dl className="posting-card-quick-facts">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}
