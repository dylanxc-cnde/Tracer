type PostingCardDetailsTopbarProps = {
  displayedTitle: string
  originalTitle: string | null
  showOriginalTitle: boolean
  isEditing: boolean
  isSaving: boolean
  hasChanges: boolean
  onCancel: () => void
  onClose: () => void
  onEdit: () => void
  onSave: () => void
}

export function PostingCardDetailsTopbar({
  displayedTitle,
  originalTitle,
  showOriginalTitle,
  isEditing,
  isSaving,
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

        {showOriginalTitle && (
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
          disabled={isSaving}
          onClick={isEditing ? onCancel : onEdit}
        >
          <span aria-hidden="true">{isEditing ? '×' : '✎'}</span>
        </button>

        {isEditing ? (
          <button
            className="button--primary posting-card-details__primary-action"
            type="button"
            disabled={isSaving || !hasChanges}
            onClick={onSave}
          >
            {isSaving ? 'Saving...' : 'Save'}
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
