import { useState } from 'react'
import './PostingCardBenefits.css'
import { PostingCardDeleteConfirmation } from './PostingCardDeleteConfirmation'
import type { Compensation } from '../../../../postings/types/postingDetails'
import type { TextItemDraft } from '../editor/PostingCardDraft'

type PostingCardBenefitsProps = {
  benefits: Compensation['benefits']
  draft: TextItemDraft[]
  isEditing: boolean
  isSavingCardChanges: boolean
  onBenefitChange: (id: string, value: string) => void
  onBenefitDelete: (id: string) => void
}

export function PostingCardBenefits({
  benefits,
  draft,
  isEditing,
  isSavingCardChanges,
  onBenefitChange,
  onBenefitDelete,
}: PostingCardBenefitsProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  function handleDeleteBenefit(id: string) {
    if (isSavingCardChanges) {
      return
    }

    onBenefitDelete(id)
    setPendingDeleteId(null)
  }

  if (isEditing) {
    if (draft.length === 0) {
      return <p className="posting-card-details__empty-value">None</p>
    }

    return (
      <ul className="posting-card-benefits" role="list">
        {draft.map((benefit, index) => (
          <li key={benefit.id}>
            <div className="posting-card-benefits__row">
              <button
                className="posting-card-benefits__delete-button"
                type="button"
                aria-label={`Delete benefit ${index + 1}`}
                title="Delete benefit"
                aria-expanded={pendingDeleteId === benefit.id}
                disabled={isSavingCardChanges}
                onClick={() => setPendingDeleteId(benefit.id)}
              >
                <span aria-hidden="true">×</span>
              </button>

              <div className="posting-card-benefits__text">
                <span
                  className="posting-card-benefits__value posting-card-benefits__value--sizing"
                  aria-hidden="true"
                >
                  {benefit.value}
                </span>
                <textarea
                  className="posting-card-benefits__input"
                  aria-label={`Benefit ${index + 1}`}
                  value={benefit.value}
                  disabled={isSavingCardChanges}
                  placeholder="Add a benefit"
                  onChange={(event) =>
                    onBenefitChange(benefit.id, event.target.value)
                  }
                />
              </div>
            </div>

            {pendingDeleteId === benefit.id && (
              <div className="posting-card-benefits__delete-confirmation">
                <PostingCardDeleteConfirmation
                  message="Delete this benefit?"
                  isDisabled={isSavingCardChanges}
                  onCancel={() => setPendingDeleteId(null)}
                  onConfirm={() => handleDeleteBenefit(benefit.id)}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    )
  }

  if (benefits.length === 0) {
    return <p className="posting-card-details__empty-value">None</p>
  }

  return (
    <ul className="posting-card-benefits" role="list">
      {benefits.map(
        (benefit, index) => (
          <li key={`${benefit.value}-${index}`}>
            <div className="posting-card-benefits__row">
              <span
                className="posting-card-benefits__bullet"
                aria-hidden="true"
              >
                •
              </span>
              <div className="posting-card-benefits__text">
                <span className="posting-card-benefits__value">
                  {benefit.value}
                </span>
              </div>
            </div>
          </li>
        ),
      )}
    </ul>
  )
}
