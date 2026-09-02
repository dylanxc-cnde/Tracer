import './PostingCardVacation.css'
import type { Compensation } from '../../../postings/types/postingDetails'

type PostingCardVacationProps = {
  vacationDays: Compensation['vacation_days']
}

export function PostingCardVacation({
  vacationDays,
}: PostingCardVacationProps) {
  return (
    <div className="posting-card-vacation">
      <span
        className={
          vacationDays === null
            ? 'posting-card-details__empty-value'
            : undefined
        }
      >
        {vacationDays === null ? 'None' : `${vacationDays.value} days per year`}
      </span>
    </div>
  )
}
