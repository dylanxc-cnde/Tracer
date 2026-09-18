import { useState } from 'react'
import './PostingCardRoleDomains.css'
import type { RoleDescription } from '../../../postings/types/postingDetails'
import type { TextItemDraft } from './usePostingCardEditor'

type PostingCardRoleDomainsProps = {
  domains: RoleDescription['domains']
  draft: TextItemDraft[]
  isEditing: boolean
  isSavingCardChanges: boolean
  onDomainChange: (id: string, value: string) => void
  onDomainDelete: (id: string) => void
}

export function PostingCardRoleDomains({
  domains,
  draft,
  isEditing,
  isSavingCardChanges,
  onDomainChange,
  onDomainDelete,
}: PostingCardRoleDomainsProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const pendingDeleteDomain = draft.find((domain) => domain.id === pendingDeleteId)

  function handleDeleteDomain(id: string) {
    if (isSavingCardChanges) {
      return
    }

    onDomainDelete(id)
    setPendingDeleteId(null)
  }

  if (isEditing) {
    if (draft.length === 0) {
      return <p className="posting-card-details__empty-value">None</p>
    }

    return (
      <div className="posting-card-role-domains">
        <div className="posting-card-role-domains__list">
          {draft.map((domain, index) => (
            <span className="posting-card-role-domains__pill" key={domain.id}>
              <span className="posting-card-role-domains__text">
                <span
                  className="posting-card-role-domains__value posting-card-role-domains__value--sizing"
                  aria-hidden="true"
                >
                  {domain.value || 'New domain'}
                </span>
                <input
                  className="posting-card-role-domains__input"
                  type="text"
                  aria-label={`Role domain ${index + 1}`}
                  value={domain.value}
                  disabled={isSavingCardChanges}
                  placeholder="New domain"
                  autoFocus={domain.value.length === 0}
                  onChange={(event) => onDomainChange(domain.id, event.target.value)}
                />
              </span>

              <button
                className="posting-card-role-domains__delete-button"
                type="button"
                aria-label={`Delete role domain ${index + 1}`}
                title="Delete role domain"
                aria-expanded={pendingDeleteId === domain.id}
                disabled={isSavingCardChanges}
                onClick={() => setPendingDeleteId(domain.id)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </span>
          ))}
        </div>

        {pendingDeleteDomain !== undefined && (
          <div
            className="posting-card-role-domains__delete-confirmation"
            role="group"
            aria-label="Delete role domain?"
          >
            <span>Delete “{pendingDeleteDomain.value || 'New domain'}”?</span>
            <button
              type="button"
              disabled={isSavingCardChanges}
              onClick={() => setPendingDeleteId(null)}
            >
              Keep
            </button>
            <button
              className="button--danger"
              type="button"
              disabled={isSavingCardChanges}
              onClick={() => handleDeleteDomain(pendingDeleteDomain.id)}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    )
  }

  if (domains.length === 0) {
    return <p className="posting-card-details__empty-value">None</p>
  }

  return (
    <div className="posting-card-role-domains">
      <div className="posting-card-role-domains__list">
        {domains.map((domain, index) => (
          <span
            className="posting-card-role-domains__pill"
            key={`${domain.value}-${index}`}
          >
            <span className="posting-card-role-domains__text">
              <span className="posting-card-role-domains__value">
                {domain.value}
              </span>
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
