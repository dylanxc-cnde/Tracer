import { useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import './PostingCardApplicationFacts.css'
import type { ApplicationChannel, ApplicationInstructions } from '../../../../postings/types/postingDetails'
import { formatEnumValue } from '../PostingCardFormatters'
import { getSafeHttpUrl } from '../PostingCardSanitizers'
import type { ApplicationFactsDraft, ApplicationTextField } from '../editor/PostingCardDraft'

const APPLICATION_CHANNELS: { key: ApplicationChannel; label: string }[] = [
  { key: 'portal', label: 'Portal' },
  { key: 'email', label: 'Email' },
  { key: 'postal', label: 'Postal' },
  { key: 'other', label: 'Other' },
]

const DEADLINE_PARTS = [
  { label: 'Year', placeholder: 'YYYY', length: 4 },
  { label: 'Month', placeholder: 'MM', length: 2 },
  { label: 'Day', placeholder: 'DD', length: 2 },
]

type PostingCardApplicationFactsProps = {
  applicationInstructions: ApplicationInstructions
  draft: ApplicationFactsDraft
  isEditing: boolean
  isSavingCardChanges: boolean
  onChannelChange: (channel: ApplicationChannel, isSelected: boolean) => void
  onTextChange: (field: ApplicationTextField, value: string) => void
}

type ApplicationFactValue = {
  key: keyof ApplicationFactsDraft
  label: string
  value: string | null
  url: string | null
}

type ApplicationFactProps = {
  fact: ApplicationFactValue
  isEditing: boolean
  children: ReactNode
}

type ApplicationChannelsChoiceProps = {
  channels: ApplicationChannel[]
  isDisabled: boolean
  onChange: (channel: ApplicationChannel, isSelected: boolean) => void
}

function ApplicationChannelsChoice({ channels, isDisabled, onChange }: ApplicationChannelsChoiceProps) {
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const optionsId = useId()

  return (
    <div
      className="posting-card-application-facts__channels"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false)
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && isOpen) {
          event.preventDefault()
          event.stopPropagation()
          setIsOpen(false)
          buttonRef.current?.focus({ preventScroll: true })
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="posting-card-application-facts__channel-trigger"
        aria-label="Choose application channels"
        aria-expanded={isOpen && !isDisabled}
        aria-controls={optionsId}
        disabled={isDisabled}
        onClick={() => setIsOpen((current) => !current)}
      >
        {channels.length > 0 ? channels.map(formatEnumValue).join(' · ') : 'None'}
      </button>
      {isOpen && !isDisabled && (
        <div
          id={optionsId}
          className="posting-card-application-facts__channel-options"
          role="group"
          aria-label="Application channels (select all that apply)"
        >
          {APPLICATION_CHANNELS.map((option) => (
            <label className="posting-card-application-facts__channel-option" key={option.key}>
              <input
                type="checkbox"
                checked={channels.includes(option.key)}
                disabled={isDisabled}
                onChange={(event) => onChange(option.key, event.target.checked)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function createApplicationFacts(
  applicationInstructions: ApplicationInstructions,
) {
  const channels =
    applicationInstructions.channels !== null &&
    applicationInstructions.channels.value.length > 0
      ? applicationInstructions.channels.value.map(formatEnumValue).join(' · ')
      : null
  const applicationUrl =
    applicationInstructions.application_url?.value ?? null

  return [
    {
      key: 'channels',
      label: 'Channels',
      value: channels,
      url: null,
    },
    {
      key: 'applicationUrl',
      label: 'Application URL',
      value: applicationUrl,
      url: applicationUrl === null ? null : getSafeHttpUrl(applicationUrl),
    },
    {
      key: 'applicationDeadline',
      label: 'Deadline',
      value: applicationInstructions.application_deadline?.value ?? null,
      url: null,
    },
    {
      key: 'requiredEmailSubject',
      label: 'Email subject',
      value: applicationInstructions.required_email_subject?.value ?? null,
      url: null,
    },
  ] satisfies ApplicationFactValue[]
}

function ApplicationFact({ fact, isEditing, children }: ApplicationFactProps) {
  let content: ReactNode = children
  if (!isEditing) {
    if (fact.value === null) {
      content = 'None'
    } else if (fact.url === null) {
      content = <span className="posting-card-application-facts__value">{fact.value}</span>
    } else {
      content = (
        <a
          href={fact.url}
          className="posting-card-application-facts__value"
          target="_blank"
          rel="noopener noreferrer"
        >
          {fact.value}
        </a>
      )
    }
  }

  return (
    <div className={`posting-card-application-facts__field posting-card-application-facts__field--${fact.key}`}>
      <dt>{fact.label}</dt>
      <dd
        className={
          !isEditing && fact.value === null ? 'posting-card-details__empty-value' : undefined
        }
      >
        {content}
      </dd>
    </div>
  )
}

export function PostingCardApplicationFacts({
  applicationInstructions,
  draft,
  isEditing,
  isSavingCardChanges,
  onChannelChange,
  onTextChange,
}: PostingCardApplicationFactsProps) {
  const facts = createApplicationFacts(applicationInstructions)
  const deadlineParts = draft.applicationDeadline.split('-')

  function handleDeadlinePartChange(index: number, value: string) {
    if (isSavingCardChanges || !/^\d*$/.test(value)) {
      return
    }
    const parts = DEADLINE_PARTS.map((_, partIndex) => deadlineParts[partIndex] ?? '')
    parts[index] = value.slice(0, DEADLINE_PARTS[index].length)
    onTextChange('applicationDeadline', parts.every((part) => part === '') ? '' : parts.join('-'))
  }

  return (
    <dl className="posting-card-application-facts">
      {facts.map((fact) => {
        const field = fact.key
        return (
          <ApplicationFact fact={fact} key={field} isEditing={isEditing}>
            {field === 'channels' ? (
              <ApplicationChannelsChoice
                channels={draft.channels}
                isDisabled={isSavingCardChanges}
                onChange={onChannelChange}
              />
            ) : field === 'applicationDeadline' ? (
              <div className="posting-card-application-facts__date" role="group" aria-label="Application deadline (YYYY-MM-DD)">
                {DEADLINE_PARTS.map((part, index) => (
                  <span className="posting-card-application-facts__date-part" key={part.label}>
                    {index > 0 && <span aria-hidden="true">-</span>}
                    <span className="posting-card-application-facts__date-number">
                      <span className="posting-card-application-facts__date-sizing" aria-hidden="true">
                        {deadlineParts[index] || part.placeholder}
                      </span>
                      <input
                        className="posting-card-application-facts__date-input"
                        type="text"
                        inputMode="numeric"
                        maxLength={part.length}
                        aria-label={`Application deadline ${part.label.toLowerCase()}`}
                        placeholder={part.placeholder}
                        value={deadlineParts[index] ?? ''}
                        disabled={isSavingCardChanges}
                        onChange={(event) => handleDeadlinePartChange(index, event.target.value)}
                        onBlur={(event) => {
                          const value = event.target.value
                          if (index > 0 && value.length === 1) {
                            handleDeadlinePartChange(index, value.padStart(2, '0'))
                          }
                        }}
                      />
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <div className="posting-card-application-facts__text">
                <span className="posting-card-application-facts__value posting-card-application-facts__value--sizing" aria-hidden="true">
                  {draft[field]}
                </span>
                <textarea
                  className="posting-card-application-facts__input"
                  aria-label={fact.label}
                  placeholder="None"
                  value={draft[field]}
                  disabled={isSavingCardChanges}
                  onChange={(event) => onTextChange(field, event.target.value)}
                />
              </div>
            )}
          </ApplicationFact>
        )
      })}
    </dl>
  )
}
