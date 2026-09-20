import './PostingCardSaveError.css'

type PostingCardSaveErrorProps = {
  message: string
  onDismiss: () => void
}

export function PostingCardSaveError({
  message,
  onDismiss,
}: PostingCardSaveErrorProps) {
  return (
    <div className="posting-card-save-error">
      <div className="posting-card-save-error__content" role="alert">
        <p className="posting-card-save-error__title">This card could not be saved.</p>
        <p className="posting-card-save-error__message">{message}</p>
        <p className="posting-card-save-error__hint">
          Your edits are still here. You can continue editing and try again.
        </p>
      </div>

      <button
        className="posting-card-save-error__dismiss"
        type="button"
        aria-label="Dismiss save error"
        onClick={onDismiss}
      >
        Dismiss
      </button>
    </div>
  )
}
