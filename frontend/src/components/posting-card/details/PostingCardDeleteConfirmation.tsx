import './PostingCardDeleteConfirmation.css'

type PostingCardDeleteConfirmationProps = {
  message: string
  isDisabled: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function PostingCardDeleteConfirmation({
  message,
  isDisabled,
  onCancel,
  onConfirm,
}: PostingCardDeleteConfirmationProps) {
  return (
    <div
      className="posting-card-delete-confirmation"
      role="group"
      aria-label={message}
    >
      <p className="posting-card-delete-confirmation__message">{message}</p>

      <div className="posting-card-delete-confirmation__actions">
        <button type="button" disabled={isDisabled} onClick={onCancel}>
          Keep
        </button>
        <button
          className="button--danger"
          type="button"
          disabled={isDisabled}
          onClick={onConfirm}
        >
          Delete
        </button>
      </div>
    </div>
  )
}
