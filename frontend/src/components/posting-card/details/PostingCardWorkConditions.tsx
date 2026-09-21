import { useState, type ReactNode } from 'react'
import './PostingCardWorkConditions.css'
import type { WorkConditions } from '../../../postings/types/postingDetails'
import { formatWeeklyHours } from './PostingCardFormatters'
import { PostingCardDeleteConfirmation } from './PostingCardDeleteConfirmation'
import { PostingCardAddFieldMenu } from './PostingCardAddFieldMenu'
import type {
  WorkConditionField,
  WorkConditionTextField,
  WorkConditionsDraft,
} from './PostingCardDraft'

const WORK_CONDITION_FIELDS: { key: WorkConditionField; label: string }[] = [
  { key: 'weeklyHours', label: 'Weekly hours' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'travelRequirement', label: 'Travel requirement' },
  { key: 'startOn', label: 'Start date' },
  { key: 'duration', label: 'Duration' },
]

const START_DATE_PARTS = [
  { label: 'Year', placeholder: 'YYYY', length: 4 },
  { label: 'Month', placeholder: 'MM', length: 2 },
  { label: 'Day', placeholder: 'DD', length: 2 },
]

type PostingCardWorkConditionAddProps = {
  draft: WorkConditionsDraft
  isSavingCardChanges: boolean
  onAdd: (field: WorkConditionField) => void
}

export function PostingCardWorkConditionAdd({
  draft,
  isSavingCardChanges,
  onAdd,
}: PostingCardWorkConditionAddProps) {
  const availableFields = WORK_CONDITION_FIELDS.filter((field) => draft[field.key] === null)

  return (
    <div className="posting-card-work-conditions__add-control">
      <PostingCardAddFieldMenu
        options={availableFields}
        label="Add work condition"
        emptyLabel="All work condition fields are shown"
        isDisabled={isSavingCardChanges}
        onSelect={onAdd}
      />
    </div>
  )
}

type PostingCardWorkConditionsProps = {
  workConditions: WorkConditions
  draft: WorkConditionsDraft
  isEditing: boolean
  isSavingCardChanges: boolean
  onTextChange: (field: WorkConditionTextField, value: string) => void
  onWeeklyHoursChange: (bound: 'minimum' | 'maximum', value: string) => void
  onDelete: (field: WorkConditionField) => void
}

type WorkConditionFieldProps = {
  label: string
  value: string | null
  isEditing: boolean
  isSavingCardChanges: boolean
  isDeletePending: boolean
  onDelete: () => void
  children: ReactNode
}

function WorkConditionField({
  label,
  value,
  isEditing,
  isSavingCardChanges,
  isDeletePending,
  onDelete,
  children,
}: WorkConditionFieldProps) {
  return (
    <div className="posting-card-work-conditions__field">
      <dt>
        {label}
        {isEditing && (
          <button
            className="posting-card-work-conditions__delete"
            type="button"
            aria-label={`Delete ${label.toLowerCase()}`}
            aria-expanded={isDeletePending}
            disabled={isSavingCardChanges}
            onClick={onDelete}
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
      </dt>
      <dd>
        {isEditing ? children : (
          <span className="posting-card-work-conditions__value">{value}</span>
        )}
      </dd>
    </div>
  )
}

export function PostingCardWorkConditions({
  workConditions,
  draft,
  isEditing,
  isSavingCardChanges,
  onTextChange,
  onWeeklyHoursChange,
  onDelete,
}: PostingCardWorkConditionsProps) {
  const [pendingDeleteField, setPendingDeleteField] = useState<WorkConditionField | null>(null)
  const startDateParts = (draft.startOn ?? '').split('-')
  const values: Record<WorkConditionField, string | null> = {
    weeklyHours: workConditions.weekly_hours === null ? null : formatWeeklyHours(workConditions.weekly_hours),
    schedule: workConditions.schedule?.value ?? null,
    travelRequirement: workConditions.travel_requirement?.value ?? null,
    startOn: workConditions.start_on?.value ?? null,
    duration: workConditions.duration?.value ?? null,
  }
  const visibleFields = WORK_CONDITION_FIELDS.filter((field) =>
    isEditing ? draft[field.key] !== null : values[field.key] !== null,
  )
  const pendingDelete = visibleFields.find((field) => field.key === pendingDeleteField)

  function handleStartDatePartChange(index: number, value: string) {
    if (isSavingCardChanges || !/^\d*$/.test(value)) {
      return
    }

    const parts = START_DATE_PARTS.map((_, partIndex) => startDateParts[partIndex] ?? '')
    parts[index] = value.slice(0, START_DATE_PARTS[index].length)
    onTextChange('startOn', parts.every((part) => part === '') ? '' : parts.join('-'))
  }

  function handleDeleteField() {
    if (pendingDeleteField === null || isSavingCardChanges) {
      return
    }
    onDelete(pendingDeleteField)
    setPendingDeleteField(null)
  }

  return (
    <>
      {visibleFields.length === 0 ? (
        <p className="posting-card-details__empty-value">None</p>
      ) : (
        <dl className="posting-card-work-conditions">
          {visibleFields.map(({ key, label }) => (
            <WorkConditionField
              key={key}
              label={label}
              value={values[key]}
              isEditing={isEditing}
              isSavingCardChanges={isSavingCardChanges}
              isDeletePending={pendingDeleteField === key}
              onDelete={() => setPendingDeleteField(key)}
            >
              {key === 'weeklyHours' ? (
                <div className="posting-card-work-conditions__hours">
                  <span className="posting-card-work-conditions__number">
                    <span className="posting-card-work-conditions__number-sizing" aria-hidden="true">
                      {draft.weeklyHours?.minimum || 'Min'}
                    </span>
                    <input
                      className="posting-card-work-conditions__number-input"
                      type="number"
                      min="0"
                      step="any"
                      aria-label="Minimum weekly hours"
                      placeholder="Min"
                      value={draft.weeklyHours?.minimum ?? ''}
                      disabled={isSavingCardChanges}
                      onChange={(event) => onWeeklyHoursChange('minimum', event.target.value)}
                    />
                  </span>
                  <span aria-hidden="true">–</span>
                  <span className="posting-card-work-conditions__number">
                    <span className="posting-card-work-conditions__number-sizing" aria-hidden="true">
                      {draft.weeklyHours?.maximum || 'Max'}
                    </span>
                    <input
                      className="posting-card-work-conditions__number-input"
                      type="number"
                      min="0"
                      step="any"
                      aria-label="Maximum weekly hours"
                      placeholder="Max"
                      value={draft.weeklyHours?.maximum ?? ''}
                      disabled={isSavingCardChanges}
                      onChange={(event) => onWeeklyHoursChange('maximum', event.target.value)}
                    />
                  </span>
                  <span className="posting-card-work-conditions__hours-unit">{' hours/week'}</span>
                </div>
              ) : key === 'startOn' ? (
                <div className="posting-card-work-conditions__date" role="group" aria-label="Start date (YYYY-MM-DD)">
                  {START_DATE_PARTS.map((part, index) => (
                    <span className="posting-card-work-conditions__date-part" key={part.label}>
                      {index > 0 && <span aria-hidden="true">-</span>}
                      <span className="posting-card-work-conditions__date-number">
                        <span className="posting-card-work-conditions__number-sizing" aria-hidden="true">
                          {startDateParts[index] || part.placeholder}
                        </span>
                        <input
                          className="posting-card-work-conditions__date-input"
                          type="text"
                          inputMode="numeric"
                          maxLength={part.length}
                          aria-label={`Start date ${part.label.toLowerCase()}`}
                          placeholder={part.placeholder}
                          value={startDateParts[index] ?? ''}
                          disabled={isSavingCardChanges}
                          onChange={(event) => handleStartDatePartChange(index, event.target.value)}
                          onBlur={(event) => {
                            const value = event.target.value
                            if (index > 0 && value.length === 1) {
                              handleStartDatePartChange(index, value.padStart(2, '0'))
                            }
                          }}
                        />
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="posting-card-work-conditions__text">
                  <span
                    className="posting-card-work-conditions__value posting-card-work-conditions__value--sizing"
                    aria-hidden="true"
                  >
                    {draft[key] ?? ''}
                  </span>
                  <textarea
                    className="posting-card-work-conditions__input"
                    aria-label={label}
                    value={draft[key] ?? ''}
                    disabled={isSavingCardChanges}
                    placeholder="None"
                    onChange={(event) => onTextChange(key, event.target.value)}
                  />
                </div>
              )}
            </WorkConditionField>
          ))}
        </dl>
      )}

      {isEditing && pendingDelete !== undefined && (
        <div className="posting-card-work-conditions__confirmation">
          <PostingCardDeleteConfirmation
            message={`Delete ${pendingDelete.label.toLowerCase()}?`}
            isDisabled={isSavingCardChanges}
            onCancel={() => setPendingDeleteField(null)}
            onConfirm={handleDeleteField}
          />
        </div>
      )}
    </>
  )
}
