type PostingCardDetailsTopbarProps = {
  displayedTitle: string
  originalTitle: string | null
  isOriginalTitleVisible: boolean
  isEditing: boolean
  isSavingCardChanges: boolean
  hasChanges: boolean
  onCancel: () => void
  onClose: () => void
  onEdit: () => void
  onSave: () => void
}

export function PostingCardDetailsTopbar({
  displayedTitle,
  originalTitle,
  isOriginalTitleVisible,
  isEditing,
  isSavingCardChanges,
  hasChanges,
  onCancel,
  onClose,
  onEdit,
  onSave,
}: PostingCardDetailsTopbarProps) {
  return (
    <div className="posting-card-details__topbar">
      <div className="posting-card-details__title-group">
        <h2 className="posting-card-details__title">{displayedTitle}</h2>

        {isOriginalTitleVisible && (
          <details className="posting-card-details__original-title">
            <summary>Original title</summary>
            <p>{originalTitle}</p>
          </details>
        )}
      </div>

      <div className="posting-card-details__topbar-actions">
        <button
          className="posting-card-details__edit-toggle"
          type="button"
          aria-label={isEditing ? 'Cancel editing' : 'Edit card'}
          title={isEditing ? 'Cancel editing' : 'Edit card'}
          disabled={isSavingCardChanges}
          onClick={isEditing ? onCancel : onEdit}
        >
          <span aria-hidden="true">{isEditing ? '×' : '✎'}</span>
        </button>

        {isEditing ? (
          <button
            className="button--primary posting-card-details__primary-action"
            type="button"
            disabled={isSavingCardChanges || !hasChanges}
            onClick={onSave}
          >
            {isSavingCardChanges ? 'Saving...' : 'Save'}
          </button>
        ) : (
          <button
            className="button--primary posting-card-details__primary-action"
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        )}
      </div>
    </div>
  )
}
