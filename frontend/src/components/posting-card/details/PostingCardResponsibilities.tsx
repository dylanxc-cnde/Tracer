import { useState } from 'react'
import './PostingCardResponsibilities.css'
import { PostingCardDeleteConfirmation } from './PostingCardDeleteConfirmation'
import type { RoleDescription } from '../../../postings/types/postingDetails'
import type { TextItemDraft } from './PostingCardDraft'

type PostingCardResponsibilitiesProps = {
  responsibilities: RoleDescription['responsibilities']
  draft: TextItemDraft[]
  isEditing: boolean
  isSavingCardChanges: boolean
  onResponsibilityChange: (id: string, value: string) => void
  onResponsibilityDelete: (id: string) => void
}

export function PostingCardResponsibilities({
  responsibilities,
  draft,
  isEditing,
  isSavingCardChanges,
  onResponsibilityChange,
  onResponsibilityDelete,
}: PostingCardResponsibilitiesProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  function handleDeleteResponsibility(id: string) {
    if (isSavingCardChanges) {
      return
    }

    onResponsibilityDelete(id)
    setPendingDeleteId(null)
  }

  if (isEditing) {
    if (draft.length === 0) {
      return <p className="posting-card-details__empty-value">None</p>
    }

    return (
      <ul className="posting-card-responsibilities" role="list">
        {draft.map((responsibility, index) => (
          <li key={responsibility.id}>
            <div className="posting-card-responsibilities__row">
              <button
                className="posting-card-responsibilities__delete-button"
                type="button"
                aria-label={`Delete responsibility ${index + 1}`}
                title="Delete responsibility"
                aria-expanded={pendingDeleteId === responsibility.id}
                disabled={isSavingCardChanges}
                onClick={() => setPendingDeleteId(responsibility.id)}
              >
                <span aria-hidden="true">×</span>
              </button>

              <div className="posting-card-responsibilities__text">
                <span
                  className="posting-card-responsibilities__value posting-card-responsibilities__value--sizing"
                  aria-hidden="true"
                >
                  {responsibility.value}
                </span>
                <textarea
                  className="posting-card-responsibilities__input"
                  aria-label={`Responsibility ${index + 1}`}
                  value={responsibility.value}
                  disabled={isSavingCardChanges}
                  placeholder="Add a responsibility"
                  onChange={(event) =>
                    onResponsibilityChange(responsibility.id, event.target.value)
                  }
                />
              </div>
            </div>

            {pendingDeleteId === responsibility.id && (
              <div className="posting-card-responsibilities__delete-confirmation">
                <PostingCardDeleteConfirmation
                  message="Delete this responsibility?"
                  isDisabled={isSavingCardChanges}
                  onCancel={() => setPendingDeleteId(null)}
                  onConfirm={() => handleDeleteResponsibility(responsibility.id)}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    )
  }

  if (responsibilities.length === 0) {
    return <p className="posting-card-details__empty-value">None</p>
  }

  return (
    <ul className="posting-card-responsibilities" role="list">
      {responsibilities.map(
        (responsibility, index) => (
          <li key={`${responsibility.value}-${index}`}>
            <div className="posting-card-responsibilities__row">
              <span
                className="posting-card-responsibilities__bullet"
                aria-hidden="true"
              >
                •
              </span>
              <div className="posting-card-responsibilities__text">
                <span className="posting-card-responsibilities__value">
                  {responsibility.value}
                </span>
              </div>
            </div>
          </li>
        ),
      )}
    </ul>
  )
}
