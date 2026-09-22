type PostingCardDetailsTopbarProps = {
  displayedTitle: string
  positionTitle: string | null
  isPositionTitleVisible: boolean
  isEditing: boolean
  isSavingCardChanges: boolean
  hasChanges: boolean
  onCancel: () => void
  onClose: () => void
  onEdit: () => void
  onSave: () => void
  isReadOnly: boolean
}

export function PostingCardDetailsTopbar({
  displayedTitle,
  positionTitle,
  isPositionTitleVisible,
  isEditing,
  isSavingCardChanges,
  hasChanges,
  onCancel,
  onClose,
  onEdit,
  onSave,
  isReadOnly,
}: PostingCardDetailsTopbarProps) {
  return (
    <div className="posting-card-details__topbar">
      <div className="posting-card-details__title-group">
        <h2 className="posting-card-details__title">{displayedTitle}</h2>

        {isPositionTitleVisible && (
          <details className="posting-card-details__position-title">
            <summary>Position title</summary>
            <p>{positionTitle}</p>
          </details>
        )}
      </div>

      <div className="posting-card-details__topbar-actions">
        {!isReadOnly && (<button
          className="posting-card-details__edit-toggle"
          type="button"
          aria-label={isEditing ? 'Cancel editing' : 'Edit card'}
          title={isEditing ? 'Cancel editing' : 'Edit card'}
          disabled={isSavingCardChanges}
          onClick={isEditing ? onCancel : onEdit}
        >
          <span aria-hidden="true">{isEditing ? '×' : '✎'}</span>
        </button>
        )}

        {!isReadOnly && isEditing ? (
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
