import { useState } from 'react'
import './PostingCardSpecialInstructions.css'
import { PostingCardDeleteConfirmation } from './PostingCardDeleteConfirmation'
import type { ApplicationInstructions } from '../../../postings/types/postingDetails'
import type { TextItemDraft } from './usePostingCardEditor'

type PostingCardSpecialInstructionsProps = {
  specialInstructions: ApplicationInstructions['special_instructions']
  draft: TextItemDraft[]
  isEditing: boolean
  isSavingCardChanges: boolean
  onSpecialInstructionChange: (id: string, value: string) => void
  onSpecialInstructionDelete: (id: string) => void
}

export function PostingCardSpecialInstructions({
  specialInstructions,
  draft,
  isEditing,
  isSavingCardChanges,
  onSpecialInstructionChange,
  onSpecialInstructionDelete,
}: PostingCardSpecialInstructionsProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  function handleDeleteSpecialInstruction(id: string) {
    if (isSavingCardChanges) {
      return
    }

    onSpecialInstructionDelete(id)
    setPendingDeleteId(null)
  }

  if (isEditing) {
    if (draft.length === 0) {
      return <p className="posting-card-details__empty-value">None</p>
    }

    return (
      <ul className="posting-card-special-instructions" role="list">
        {draft.map((instruction, index) => (
          <li key={instruction.id}>
            <div className="posting-card-special-instructions__row">
              <button
                className="posting-card-special-instructions__delete-button"
                type="button"
                aria-label={`Delete special instruction ${index + 1}`}
                title="Delete special instruction"
                aria-expanded={pendingDeleteId === instruction.id}
                disabled={isSavingCardChanges}
                onClick={() => setPendingDeleteId(instruction.id)}
              >
                <span aria-hidden="true">×</span>
              </button>

              <div className="posting-card-special-instructions__text">
                <span
                  className="posting-card-special-instructions__value posting-card-special-instructions__value--sizing"
                  aria-hidden="true"
                >
                  {instruction.value}
                </span>
                <textarea
                  className="posting-card-special-instructions__input"
                  aria-label={`Special instruction ${index + 1}`}
                  value={instruction.value}
                  disabled={isSavingCardChanges}
                  placeholder="Add a special instruction"
                  onChange={(event) =>
                    onSpecialInstructionChange(instruction.id, event.target.value)
                  }
                />
              </div>
            </div>

            {pendingDeleteId === instruction.id && (
              <div className="posting-card-special-instructions__delete-confirmation">
                <PostingCardDeleteConfirmation
                  message="Delete this special instruction?"
                  isDisabled={isSavingCardChanges}
                  onCancel={() => setPendingDeleteId(null)}
                  onConfirm={() => handleDeleteSpecialInstruction(instruction.id)}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    )
  }

  if (specialInstructions.length === 0) {
    return <p className="posting-card-details__empty-value">None</p>
  }

  return (
    <ul className="posting-card-special-instructions" role="list">
      {specialInstructions.map(
        (instruction, index) => (
          <li key={`${instruction.value}-${index}`}>
            <div className="posting-card-special-instructions__row">
              <span
                className="posting-card-special-instructions__bullet"
                aria-hidden="true"
              >
                •
              </span>
              <div className="posting-card-special-instructions__text">
                <span className="posting-card-special-instructions__value">
                  {instruction.value}
                </span>
              </div>
            </div>
          </li>
        ),
      )}
    </ul>
  )
}
