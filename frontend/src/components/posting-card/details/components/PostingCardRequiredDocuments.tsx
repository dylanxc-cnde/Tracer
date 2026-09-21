import { useState } from 'react'
import './PostingCardRequiredDocuments.css'
import { PostingCardDeleteConfirmation } from './PostingCardDeleteConfirmation'
import type { ApplicationInstructions } from '../../../../postings/types/postingDetails'
import type { TextItemDraft } from '../editor/PostingCardDraft'

type PostingCardRequiredDocumentsProps = {
  requiredDocuments: ApplicationInstructions['required_documents']
  draft: TextItemDraft[]
  isEditing: boolean
  isSavingCardChanges: boolean
  onRequiredDocumentChange: (id: string, value: string) => void
  onRequiredDocumentDelete: (id: string) => void
}

export function PostingCardRequiredDocuments({
  requiredDocuments,
  draft,
  isEditing,
  isSavingCardChanges,
  onRequiredDocumentChange,
  onRequiredDocumentDelete,
}: PostingCardRequiredDocumentsProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  function handleDeleteRequiredDocument(id: string) {
    if (isSavingCardChanges) {
      return
    }

    onRequiredDocumentDelete(id)
    setPendingDeleteId(null)
  }

  if (isEditing) {
    if (draft.length === 0) {
      return <p className="posting-card-details__empty-value">None</p>
    }

    return (
      <ul className="posting-card-required-documents" role="list">
        {draft.map((document, index) => (
          <li key={document.id}>
            <div className="posting-card-required-documents__row">
              <button
                className="posting-card-required-documents__delete-button"
                type="button"
                aria-label={`Delete required document ${index + 1}`}
                title="Delete required document"
                aria-expanded={pendingDeleteId === document.id}
                disabled={isSavingCardChanges}
                onClick={() => setPendingDeleteId(document.id)}
              >
                <span aria-hidden="true">×</span>
              </button>

              <div className="posting-card-required-documents__text">
                <span
                  className="posting-card-required-documents__value posting-card-required-documents__value--sizing"
                  aria-hidden="true"
                >
                  {document.value}
                </span>
                <textarea
                  className="posting-card-required-documents__input"
                  aria-label={`Required document ${index + 1}`}
                  value={document.value}
                  disabled={isSavingCardChanges}
                  placeholder="Add a required document"
                  onChange={(event) =>
                    onRequiredDocumentChange(document.id, event.target.value)
                  }
                />
              </div>
            </div>

            {pendingDeleteId === document.id && (
              <div className="posting-card-required-documents__delete-confirmation">
                <PostingCardDeleteConfirmation
                  message="Delete this required document?"
                  isDisabled={isSavingCardChanges}
                  onCancel={() => setPendingDeleteId(null)}
                  onConfirm={() => handleDeleteRequiredDocument(document.id)}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    )
  }

  if (requiredDocuments.length === 0) {
    return <p className="posting-card-details__empty-value">None</p>
  }

  return (
    <ul className="posting-card-required-documents" role="list">
      {requiredDocuments.map(
        (document, index) => (
          <li key={`${document.value}-${index}`}>
            <div className="posting-card-required-documents__row">
              <span
                className="posting-card-required-documents__bullet"
                aria-hidden="true"
              >
                •
              </span>
              <div className="posting-card-required-documents__text">
                <span className="posting-card-required-documents__value">
                  {document.value}
                </span>
              </div>
            </div>
          </li>
        ),
      )}
    </ul>
  )
}
