import './PostingCardWorkConditions.css'
import type { WorkConditions } from '../../../postings/types/postingDetails'
import { formatWeeklyHours } from './postingCardFormatters'

type PostingCardWorkConditionsProps = {
  workConditions: WorkConditions
}

type WorkConditionFieldProps = {
  label: string
  value: string | null
}

function WorkConditionField({
  label,
  value,
}: WorkConditionFieldProps) {
  if (value === null) {
    return null
  }

  return (
    <div className="posting-card-work-conditions__field">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

export function PostingCardWorkConditions({
  workConditions,
}: PostingCardWorkConditionsProps) {
  const weeklyHours =
    workConditions.weekly_hours === null
      ? null
      : formatWeeklyHours(workConditions.weekly_hours)

  return (
    <dl className="posting-card-work-conditions">
      <WorkConditionField
        label="Weekly hours"
        value={weeklyHours}
      />

      <WorkConditionField
        label="Schedule"
        value={workConditions.schedule?.value ?? null}
      />

      <WorkConditionField
        label="Travel requirement"
        value={workConditions.travel_requirement?.value ?? null}
      />

      <WorkConditionField
        label="Start date"
        value={workConditions.start_on?.value ?? null}
      />

      <WorkConditionField
        label="Duration"
        value={workConditions.duration?.value ?? null}
      />
    </dl>
  )
}
