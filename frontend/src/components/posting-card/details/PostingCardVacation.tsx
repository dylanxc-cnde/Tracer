import './PostingCardVacation.css'
import type { Compensation } from '../../../postings/types/postingDetails'

type PostingCardVacationProps = {
  vacationDays: Compensation['vacation_days']
  draft: string
  isEditing: boolean
  isSavingCardChanges: boolean
  onVacationDaysChange: (value: string) => void
}

export function PostingCardVacation({
  vacationDays,
  draft,
  isEditing,
  isSavingCardChanges,
  onVacationDaysChange,
}: PostingCardVacationProps) {
  const displayedValue = isEditing ? draft : vacationDays?.value.toString() ?? ''
  const isEmpty = displayedValue.trim().length === 0

  return (
    <div className="posting-card-vacation">
      <span className="posting-card-vacation__value">
        <span
          className={`posting-card-vacation__text${isEditing ? ' posting-card-vacation__text--sizing' : ''}${isEmpty ? ' posting-card-details__empty-value' : ''}`}
          aria-hidden={isEditing ? true : undefined}
        >
          {isEmpty ? 'None' : displayedValue}
        </span>

        {isEditing && (
          <input
            className="posting-card-vacation__input"
            type="text"
            inputMode="numeric"
            aria-label="Vacation days per year"
            value={draft}
            disabled={isSavingCardChanges}
            onChange={(event) => onVacationDaysChange(event.target.value)}
          />
        )}
      </span>

      {(isEditing || !isEmpty) && <span>days per year</span>}
    </div>
  )
}
