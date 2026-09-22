import './PostingCardPostingInfo.css'
import type { PostingIdentity } from '../../../../postings/types/postingDetails'
import { getSafeHttpUrl } from '../PostingCardSanitizers'
import type { PostingInfoDraft } from '../editor/PostingCardDraft'

const PUBLISHED_DATE_PARTS = [
  { label: 'Year', placeholder: 'YYYY', length: 4 },
  { label: 'Month', placeholder: 'MM', length: 2 },
  { label: 'Day', placeholder: 'DD', length: 2 },
]

type PostingCardPostingInfoProps = {
  identity: PostingIdentity
  draft: PostingInfoDraft
  isEditing: boolean
  isSavingCardChanges: boolean
  onTextChange: (field: keyof PostingInfoDraft, value: string) => void
}

export function PostingCardPostingInfo({
  identity,
  draft,
  isEditing,
  isSavingCardChanges,
  onTextChange,
}: PostingCardPostingInfoProps) {
  const postingUrl = identity.canonical_posting_url?.value ?? null
  const safePostingUrl = getSafeHttpUrl(postingUrl)
  const publishedParts = draft.publishedOn.split('-')
  const fields: { key: keyof PostingInfoDraft; label: string; value: string | null }[] = [
    { key: 'canonicalPostingUrl', label: 'Posting URL', value: postingUrl },
    { key: 'sourcePlatform', label: 'Source platform', value: identity.source_platform?.value ?? null },
    { key: 'publishedOn', label: 'Published', value: identity.published_on?.value ?? null },
    { key: 'postingLanguage', label: 'Language', value: identity.posting_language?.value ?? null },
  ]

  function handlePublishedPartChange(index: number, value: string) {
    if (isSavingCardChanges || !/^\d*$/.test(value)) {
      return
    }
    // The separators stay visible; the draft still stores one ISO date string.
    const parts = PUBLISHED_DATE_PARTS.map((_, partIndex) => publishedParts[partIndex] ?? '')
    parts[index] = value.slice(0, PUBLISHED_DATE_PARTS[index].length)
    onTextChange('publishedOn', parts.every((part) => part === '') ? '' : parts.join('-'))
  }

  return (
    <div
      id="posting-card-details-posting-info"
      className="posting-card-posting-info"
    >
      <dl className="posting-card-posting-info__list">
        {fields.map((field) => (
          <div key={field.key} className={`posting-card-posting-info__field--${field.key}`}>
            <dt>{field.label}</dt>
            <dd className={!isEditing && field.value === null ? 'posting-card-details__empty-value' : undefined}>
              {isEditing ? (
                field.key === 'publishedOn' ? (
                  <div className="posting-card-posting-info__date" role="group" aria-label="Published date (YYYY-MM-DD)">
                    {PUBLISHED_DATE_PARTS.map((part, index) => (
                      <span className="posting-card-posting-info__date-part" key={part.label}>
                        {index > 0 && <span aria-hidden="true">-</span>}
                        <span className="posting-card-posting-info__date-number">
                          <span className="posting-card-posting-info__date-sizing" aria-hidden="true">
                            {publishedParts[index] || part.placeholder}
                          </span>
                          <input
                            className="posting-card-posting-info__date-input"
                            type="text"
                            inputMode="numeric"
                            maxLength={part.length}
                            aria-label={`Published date ${part.label.toLowerCase()}`}
                            placeholder={part.placeholder}
                            value={publishedParts[index] ?? ''}
                            disabled={isSavingCardChanges}
                            onChange={(event) => handlePublishedPartChange(index, event.target.value)}
                            onBlur={(event) => {
                              const value = event.target.value
                              if (index > 0 && value.length === 1) {
                                handlePublishedPartChange(index, value.padStart(2, '0'))
                              }
                            }}
                          />
                        </span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="posting-card-posting-info__text">
                    <span className="posting-card-posting-info__value posting-card-posting-info__value--sizing" aria-hidden="true">
                      {draft[field.key]}
                    </span>
                    <textarea
                      className="posting-card-posting-info__input"
                      aria-label={field.label}
                      placeholder="None"
                      value={draft[field.key]}
                      disabled={isSavingCardChanges}
                      onChange={(event) => onTextChange(field.key, event.target.value)}
                    />
                  </div>
                )
              ) : field.key === 'canonicalPostingUrl' && safePostingUrl !== null ? (
                <a
                  className="posting-card-posting-info__value"
                  href={safePostingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {field.value}
                </a>
              ) : (
                <span className="posting-card-posting-info__value">{field.value ?? 'None'}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
