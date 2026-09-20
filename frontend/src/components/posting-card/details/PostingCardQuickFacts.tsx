import './PostingCardQuickFacts.css'
import type { PostingDetails } from '../../../postings/types/postingDetails'
import {
  formatCompensationEntry,
  formatEnumValue,
  formatAddressPreview,
  formatWeeklyHours,
} from './PostingCardFormatters'

type PostingCardQuickFact = {
  label: string
  value: string
}

type PostingCardQuickFactsProps = {
  posting: PostingDetails
}

function createQuickFacts(posting: PostingDetails) {
  const facts: PostingCardQuickFact[] = []
  const address = formatAddressPreview(
    posting.work_conditions.primary_address?.value ?? null,
  )

  if (address !== null) {
    facts.push({ label: 'Location', value: address })
  }

  if (posting.work_conditions.work_modes !== null) {
    facts.push({
      label: 'Work mode',
      value: posting.work_conditions.work_modes.value
        .map(formatEnumValue)
        .join(' · '),
    })
  }

  if (posting.classification.workload_type !== null) {
    const workloadType = posting.classification.workload_type.value

    facts.push({
      label: 'Workload',
      value: workloadType === 'either'
        ? 'Full time / Part time'
        : formatEnumValue(workloadType),
    })
  }

  if (posting.classification.role_families !== null) {
    facts.push({
      label: 'Job type',
      value: posting.classification.role_families.value
        .map(formatEnumValue)
        .join(' · '),
    })
  }

  if (posting.classification.contract_type !== null) {
    facts.push({
      label: 'Contract type',
      value: formatEnumValue(posting.classification.contract_type.value),
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
        <div className="posting-card-quick-facts__fact" key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}
