import { useId, useRef, useState } from 'react'
import './PostingCardAddFieldMenu.css'

type PostingCardAddFieldMenuProps<FieldKey extends string> = {
  options: readonly { key: FieldKey; label: string }[]
  label: string
  emptyLabel: string
  isDisabled: boolean
  onSelect: (key: FieldKey) => void
}

export function PostingCardAddFieldMenu<FieldKey extends string>({
  options,
  label,
  emptyLabel,
  isDisabled,
  onSelect,
}: PostingCardAddFieldMenuProps<FieldKey>) {
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const optionsId = useId()
  const buttonId = `${optionsId}-button`
  const isUnavailable = isDisabled || options.length === 0

  function handleSelect(key: FieldKey) {
    if (isUnavailable || !options.some((option) => option.key === key)) {
      return
    }

    onSelect(key)
    setIsOpen(false)
    buttonRef.current?.focus({ preventScroll: true })
  }

  return (
    <div
      className="posting-card-add-field-menu"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false)
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && isOpen) {
          event.preventDefault()
          event.stopPropagation()
          setIsOpen(false)
          buttonRef.current?.focus({ preventScroll: true })
        }
      }}
    >
      <button
        ref={buttonRef}
        id={buttonId}
        className="posting-card-add-field-menu__button button--primary"
        type="button"
        aria-label={label}
        aria-expanded={isOpen && !isUnavailable}
        aria-controls={optionsId}
        title={options.length === 0 ? emptyLabel : label}
        disabled={isUnavailable}
        onClick={() => setIsOpen((current) => !current)}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M10 3V17M3 10H17" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </button>

      {isOpen && !isUnavailable && (
        <div
          id={optionsId}
          className="posting-card-add-field-menu__options"
          role="group"
          aria-labelledby={buttonId}
        >
          {options.map((option) => (
            <button
              key={option.key}
              className="posting-card-add-field-menu__option"
              type="button"
              onClick={() => handleSelect(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
