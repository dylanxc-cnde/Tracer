import { useState } from 'react'
import './PostingCardCompensation.css'
import type {
  CompensationEntry,
  CompensationPeriod,
  CompensationType,
  PayBasis,
} from '../../../postings/types/postingDetails'
import { createCompensationEntryFields } from './usePostingCardEditor'
import type { CompensationEntryFields } from './PostingCardDraft'
import { formatEnumValue } from './PostingCardFormatters'
import { PostingCardAddFieldMenu } from './PostingCardAddFieldMenu'
import { PostingCardDeleteConfirmation } from './PostingCardDeleteConfirmation'

const COMPENSATION_TYPES: { key: CompensationType; label: string }[] = [
  { key: 'base_salary', label: 'Base salary' },
  { key: 'bonus', label: 'Bonus' },
  { key: 'allowance', label: 'Allowance' },
  { key: 'other', label: 'Other' },
]

const COMPENSATION_PERIODS: { key: CompensationPeriod | ''; label: string }[] = [
  { key: '', label: 'Not specified' },
  { key: 'hour', label: 'Per hour' },
  { key: 'week', label: 'Per week' },
  { key: 'month', label: 'Per month' },
  { key: 'year', label: 'Per year' },
  { key: 'one_time', label: 'One-time' },
]

const PAY_BASES: { key: PayBasis; label: string }[] = [
  { key: 'unknown', label: 'Unknown' },
  { key: 'gross', label: 'Gross' },
  { key: 'net', label: 'Net' },
]

type PostingCardCompensationAddProps = {
  isSavingCardChanges: boolean
  onAdd: (compensationType: CompensationType) => void
}

export function PostingCardCompensationAdd({
  isSavingCardChanges,
  onAdd,
}: PostingCardCompensationAddProps) {
  return (
    <div className="posting-card-compensation__add-control">
      <PostingCardAddFieldMenu
        options={COMPENSATION_TYPES}
        label="Add salary entry"
        emptyLabel="No compensation types available"
        isDisabled={isSavingCardChanges}
        onSelect={onAdd}
      />
    </div>
  )
}

type CompensationTextProps = {
  value: string
  label: string
  isEditing: boolean
  isDisabled: boolean
  onChange: (value: string) => void
  isMultiline?: boolean
  isAmount?: boolean
}

function CompensationText({
  value,
  label,
  isEditing,
  isDisabled,
  onChange,
  isMultiline = false,
  isAmount = false,
}: CompensationTextProps) {
  return (
    <span className={`posting-card-compensation__text${isMultiline ? ' posting-card-compensation__text--multiline' : ''}`}>
      <span
        className={`posting-card-compensation__value${isEditing ? ' posting-card-compensation__value--sizing' : ''}`}
        aria-hidden={isEditing || undefined}
      >
        {value || 'None'}
      </span>
      {isEditing && (isMultiline ? (
        <textarea
          className="posting-card-compensation__input"
          aria-label={label}
          value={value}
          placeholder="None"
          disabled={isDisabled}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className="posting-card-compensation__input"
          type="text"
          inputMode={isAmount ? 'decimal' : undefined}
          aria-label={label}
          value={value}
          placeholder="None"
          disabled={isDisabled}
          onChange={(event) => onChange(event.target.value)}
        />
      ))}
    </span>
  )
}

type CompensationChoiceProps = {
  value: string
  label: string
  options: readonly { key: string; label: string }[]
  isEditing: boolean
  isDisabled: boolean
  onChange: (value: string) => void
}

function CompensationChoice({
  value,
  label,
  options,
  isEditing,
  isDisabled,
  onChange,
}: CompensationChoiceProps) {
  const selectedOption = options.find((option) => option.key === value)
  return (
    <span className="posting-card-compensation__choice">
      <span
        className={isEditing ? 'posting-card-compensation__value--sizing' : undefined}
        aria-hidden={isEditing || undefined}
      >
        {selectedOption?.label ?? 'Not specified'}
      </span>
      {isEditing && (
        <select
          className="posting-card-compensation__select"
          aria-label={label}
          value={value}
          disabled={isDisabled}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option value={option.key} key={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </span>
  )
}

type CompensationFieldProps = {
  entry: CompensationEntryFields
  index: number
  isEditing: boolean
  isSavingCardChanges: boolean
  isDeletePending: boolean
  onEntryChange: (entry: CompensationEntryFields) => void
  onDelete: () => void
}

function CompensationField({
  entry,
  index,
  isEditing,
  isSavingCardChanges,
  isDeletePending,
  onEntryChange,
  onDelete,
}: CompensationFieldProps) {
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null)
  const pendingGroup = entry.applicableGroups.find((group) => group.id === pendingGroupId)
  const label = `Salary entry ${index + 1}`

  function handleAddGroup() {
    if (isSavingCardChanges) {
      return
    }
    onEntryChange({
      ...entry,
      applicableGroups: [...entry.applicableGroups, { id: crypto.randomUUID(), value: '' }],
    })
  }

  function handleChangeGroup(id: string, value: string) {
    onEntryChange({
      ...entry,
      applicableGroups: entry.applicableGroups.map((group) =>
        group.id === id ? { ...group, value } : group,
      ),
    })
  }

  function handleDeleteGroup() {
    if (isSavingCardChanges || pendingGroupId === null) {
      return
    }
    onEntryChange({
      ...entry,
      applicableGroups: entry.applicableGroups.filter((group) => group.id !== pendingGroupId),
    })
    setPendingGroupId(null)
  }

  return (
    <li className="posting-card-compensation__field" aria-label={label}>
      <div className="posting-card-compensation__entry-heading">
        <strong>
          <CompensationChoice
            value={entry.compensationType}
            label={`${label} type`}
            options={COMPENSATION_TYPES}
            isEditing={isEditing}
            isDisabled={isSavingCardChanges}
            onChange={(value) =>
              onEntryChange({ ...entry, compensationType: value as CompensationType })
            }
          />
        </strong>
        {isEditing && (
          <button
            className="posting-card-compensation__delete"
            type="button"
            aria-label={`Delete ${label.toLowerCase()}`}
            aria-expanded={isDeletePending}
            disabled={isSavingCardChanges}
            onClick={onDelete}
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
      </div>

      <dl className="posting-card-compensation__values">
        <div>
          <dt>Minimum</dt>
          <dd>
            <CompensationText
              value={entry.minimumAmount}
              label={`${label} minimum amount`}
              isEditing={isEditing}
              isDisabled={isSavingCardChanges}
              isAmount
              onChange={(minimumAmount) => onEntryChange({ ...entry, minimumAmount })}
            />
          </dd>
        </div>
        <div>
          <dt>Maximum</dt>
          <dd>
            <CompensationText
              value={entry.maximumAmount}
              label={`${label} maximum amount`}
              isEditing={isEditing}
              isDisabled={isSavingCardChanges}
              isAmount
              onChange={(maximumAmount) => onEntryChange({ ...entry, maximumAmount })}
            />
          </dd>
        </div>
        <div>
          <dt>Currency</dt>
          <dd>
            <CompensationText
              value={entry.currency}
              label={`${label} currency`}
              isEditing={isEditing}
              isDisabled={isSavingCardChanges}
              onChange={(currency) => onEntryChange({ ...entry, currency })}
            />
          </dd>
        </div>
        <div>
          <dt>Period</dt>
          <dd>
            <CompensationChoice
              value={entry.period ?? ''}
              label={`${label} period`}
              options={COMPENSATION_PERIODS}
              isEditing={isEditing}
              isDisabled={isSavingCardChanges}
              onChange={(value) =>
                onEntryChange({ ...entry, period: value === '' ? null : value as CompensationPeriod })
              }
            />
          </dd>
        </div>
        <div>
          <dt>Pay basis</dt>
          <dd>
            <CompensationChoice
              value={entry.payBasis}
              label={`${label} pay basis`}
              options={PAY_BASES}
              isEditing={isEditing}
              isDisabled={isSavingCardChanges}
              onChange={(value) => onEntryChange({ ...entry, payBasis: value as PayBasis })}
            />
          </dd>
        </div>
      </dl>

      <div className="posting-card-compensation__groups-heading">
        <span>Applicable groups</span>
        {isEditing && (
          <button
            className="posting-card-compensation__add-group button--primary"
            type="button"
            aria-label={`${label} add applicable group`}
            disabled={isSavingCardChanges}
            onClick={handleAddGroup}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M10 3V17M3 10H17" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      <div className="posting-card-compensation__groups">
        {entry.applicableGroups.length === 0 && (
          <span className="posting-card-details__empty-value">None</span>
        )}
        {entry.applicableGroups.map((group, groupIndex) => (
          <span className="posting-card-compensation__pill" key={group.id}>
            <CompensationText
              value={group.value}
              label={`${label} applicable group ${groupIndex + 1}`}
              isEditing={isEditing}
              isDisabled={isSavingCardChanges}
              onChange={(value) => handleChangeGroup(group.id, value)}
            />
            {isEditing && (
              <button
                className="posting-card-compensation__delete-group"
                type="button"
                aria-label={`${label} delete applicable group ${groupIndex + 1}`}
                aria-expanded={pendingGroupId === group.id}
                disabled={isSavingCardChanges}
                onClick={() => setPendingGroupId(group.id)}
              >
                <span aria-hidden="true">×</span>
              </button>
            )}
          </span>
        ))}
      </div>
      {isEditing && pendingGroup !== undefined && (
        <PostingCardDeleteConfirmation
          message={`Delete “${pendingGroup.value || 'New group'}”?`}
          isDisabled={isSavingCardChanges}
          onCancel={() => setPendingGroupId(null)}
          onConfirm={handleDeleteGroup}
        />
      )}

      <div className="posting-card-compensation__conditions">
        <span className="posting-card-compensation__label">Payment conditions</span>
        <CompensationText
          value={entry.paymentConditions}
          label={`${label} payment conditions`}
          isEditing={isEditing}
          isDisabled={isSavingCardChanges}
          isMultiline
          onChange={(paymentConditions) => onEntryChange({ ...entry, paymentConditions })}
        />
      </div>
    </li>
  )
}

type PostingCardCompensationProps = {
  entries: CompensationEntry[]
  draft: CompensationEntryFields[]
  isEditing: boolean
  isSavingCardChanges: boolean
  onEntryChange: (entry: CompensationEntryFields) => void
  onEntryDelete: (id: string) => void
}

export function PostingCardCompensation({
  entries,
  draft,
  isEditing,
  isSavingCardChanges,
  onEntryChange,
  onEntryDelete,
}: PostingCardCompensationProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  // Read saved values outside editing; this projection creates no local draft state.
  const displayedEntries = isEditing ? draft : entries.map((entry, index) =>
    createCompensationEntryFields(entry, `saved-${index}`),
  )
  const pendingEntry = draft.find((entry) => entry.id === pendingDeleteId)

  function handleDeleteEntry() {
    if (isSavingCardChanges || pendingDeleteId === null) {
      return
    }
    onEntryDelete(pendingDeleteId)
    setPendingDeleteId(null)
  }

  return (
    <>
      {displayedEntries.length === 0 ? (
        <p className="posting-card-details__empty-value">None</p>
      ) : (
        <ul className="posting-card-compensation">
          {displayedEntries.map((entry, index) => (
            <CompensationField
              key={entry.id}
              entry={entry}
              index={index}
              isEditing={isEditing}
              isSavingCardChanges={isSavingCardChanges}
              isDeletePending={pendingDeleteId === entry.id}
              onEntryChange={onEntryChange}
              onDelete={() => setPendingDeleteId(entry.id)}
            />
          ))}
        </ul>
      )}
      {isEditing && pendingEntry !== undefined && (
        <div className="posting-card-compensation__confirmation">
          <PostingCardDeleteConfirmation
            message={`Delete ${formatEnumValue(pendingEntry.compensationType)} entry ${draft.indexOf(pendingEntry) + 1}?`}
            isDisabled={isSavingCardChanges}
            onCancel={() => setPendingDeleteId(null)}
            onConfirm={handleDeleteEntry}
          />
        </div>
      )}
    </>
  )
}
