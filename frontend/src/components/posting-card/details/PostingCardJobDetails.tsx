import './PostingCardJobDetails.css'
import type { PostingDetails } from '../../../postings/types/postingDetails'
import { formatEnumValue } from './PostingCardFormatters'

type PostingCardJobDetailsProps = {
  posting: PostingDetails
}

type JobDetailFieldProps = {
  label: string
  value: string | null
  isFullWidth?: boolean
}

function JobDetailField({ label, value, isFullWidth = false }: JobDetailFieldProps) {
  return (
    <div className={`posting-card-job-details__field${isFullWidth ? ' posting-card-job-details__field--full-width' : ''}`}>
      <dt>{label}</dt>
      <dd className={!value ? 'posting-card-job-details__empty' : undefined}>
        {value || 'None'}
      </dd>
    </div>
  )
}

export function PostingCardJobDetails({ posting }: PostingCardJobDetailsProps) {
  const classification = posting.classification
  const workConditions = posting.work_conditions
  const workloadType = classification.workload_type?.value ?? null
  const internshipRequirement = classification.internship_requirement?.value ?? null

  let workload: string | null = null
  if (workloadType !== null) {
    workload = workloadType === 'either'
      ? 'Full time / Part time'
      : formatEnumValue(workloadType)
  }

  let internship: string | null = null
  if (internshipRequirement !== null) {
    internship = internshipRequirement === 'either'
      ? 'Mandatory / Voluntary'
      : formatEnumValue(internshipRequirement)
  }

  return (
    <dl className="posting-card-job-details">
      <JobDetailField
        label="Workload"
        value={workload}
      />
      <JobDetailField
        label="Job type"
        value={classification.role_families?.value.map(formatEnumValue).join(' · ') ?? null}
      />
      <JobDetailField
        label="Contract type"
        value={classification.contract_type === null
          ? null
          : formatEnumValue(classification.contract_type.value)}
      />
      <JobDetailField
        label="Seniority"
        value={classification.seniority === null
          ? null
          : formatEnumValue(classification.seniority.value)}
      />
      <JobDetailField
        label="Work mode"
        value={workConditions.work_modes?.value.map(formatEnumValue).join(' · ') ?? null}
      />

      <JobDetailField
        label="Primary address"
        value={workConditions.primary_address?.value ?? null}
        isFullWidth
      />
      <JobDetailField
        label="Other address candidates"
        value={workConditions.address_candidates.join('\n')}
        isFullWidth
      />

      <JobDetailField
        label="Internship requirement"
        value={internship}
      />
      <JobDetailField
        label="Eligibility"
        value={classification.eligibility?.value ?? null}
        isFullWidth
      />
    </dl>
  )
}
