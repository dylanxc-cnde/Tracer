import './PostingCardVacation.css'
import type { Compensation } from '../../../postings/types/postingDetails'

type PostingCardVacationProps = {
  vacationDays: Compensation['vacation_days']
}

export function PostingCardVacation({
  vacationDays,
}: PostingCardVacationProps) {
  if (vacationDays === null) {
    return null
  }

  return (
    <div className="posting-card-vacation">
      <strong>Vacation</strong>
      <span>{vacationDays.value} days per year</span>
    </div>
  )
}
