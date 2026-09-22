import { useRef, useState } from 'react'
import './PostingCardRequirementGroup.css'
import type {
  RequirementItem,
  RequirementItemRule,
} from '../../../../postings/types/postingDetails'
import {
  formatEnumValue,
  formatRequirementItemRuleConnector,
  formatRequirementItemRuleLabel,
} from '../PostingCardFormatters'
import type { RequirementItemDraft } from '../editor/PostingCardDraft'
import { PostingCardDeleteConfirmation } from './PostingCardDeleteConfirmation'

type RequirementPillProps = {
  item: RequirementItem
  isEditing: boolean
  isSavingCardChanges: boolean
  isDeletePending: boolean
  onChange: (name: string) => void
  onDelete: (button: HTMLButtonElement) => void
}

// Core and example pills share the same input/delete controls.
function RequirementPill({
  item,
  isEditing,
  isSavingCardChanges,
  isDeletePending,
  onChange,
  onDelete,
}: RequirementPillProps) {
  return (
    <span
      className={`posting-card-requirements__pill${item.is_example ? ' posting-card-requirements__pill--example' : ''}`}
      title={formatEnumValue(item.category)}
    >
      {item.is_example && <span className="posting-card-requirements__example-prefix">e.g.</span>}
      <span className="posting-card-requirements__pill-text">
        {/* Invisible text sizes the input so switching modes doesn't move the label. */}
        <span
          className={`posting-card-requirements__pill-value${isEditing ? ' posting-card-requirements__pill-value--sizing' : ''}`}
          aria-hidden={isEditing || undefined}
        >
          {item.name || 'New skill'}
        </span>
        {isEditing && (
          <input
            className="posting-card-requirements__pill-input"
            type="text"
            aria-label={item.is_example ? 'Example requirement' : 'Requirement name'}
            value={item.name}
            placeholder="New skill"
            disabled={isSavingCardChanges}
            autoFocus={item.name.length === 0}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </span>
      {isEditing && (
        <button
          className="posting-card-requirements__pill-delete"
          type="button"
          aria-label={`Delete ${item.name || 'new skill'}`}
          title="Delete requirement"
          aria-expanded={isDeletePending}
          disabled={isSavingCardChanges}
          onClick={(event) => onDelete(event.currentTarget)}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5 5L15 15M15 5L5 15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </span>
  )
}

type PostingCardRequirementGroupProps = {
  itemRule: RequirementItemRule
  items: RequirementItem[]
  draft: RequirementItemDraft[]
  isEditing: boolean
  isSavingCardChanges: boolean
  onItemAdd: () => void
  onItemChange: (itemId: string, name: string) => void
  onItemDelete: (itemId: string) => void
}

export function PostingCardRequirementGroup({
  itemRule,
  items,
  draft,
  isEditing,
  isSavingCardChanges,
  onItemAdd,
  onItemChange,
  onItemDelete,
}: PostingCardRequirementGroupProps) {
  // Only the confirmation lives here; actual item changes go back to the editor hook.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null)
  const pendingDeleteItem = draft.find((item) => item.id === pendingDeleteId)
  const itemRuleLabel = formatRequirementItemRuleLabel(itemRule)
  // AND/OR comes from the group's rule; it isn't a saved item.
  const itemConnector = formatRequirementItemRuleConnector(itemRule)
  const displayedItems = isEditing ? draft : items.map((item, index) => ({ ...item, id: `item-${index}` }))
  const coreItems = displayedItems.filter((item) => !item.is_example)
  const exampleItems = displayedItems.filter((item) => item.is_example)

  function handleCancelDelete() {
    setPendingDeleteId(null)
    deleteButtonRef.current?.focus({ preventScroll: true })
  }

  function handleDeleteItem() {
    if (isSavingCardChanges || pendingDeleteItem === undefined) {
      return
    }
    onItemDelete(pendingDeleteItem.id)
    setPendingDeleteId(null)
    // The deleted button is gone, so move focus to this box's Add button.
    addButtonRef.current?.focus({ preventScroll: true })
  }

  return (
    <article
      className={`posting-card-requirements__requirement posting-card-requirements__requirement--${itemRule.replace('_', '-')}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && pendingDeleteItem !== undefined) {
          event.preventDefault()
          event.stopPropagation()
          handleCancelDelete()
        }
      }}
    >
      <div className="posting-card-requirements__requirement-items">
        <div className="posting-card-requirements__group-heading">
          {itemRuleLabel !== null && (
            <span className="posting-card-requirements__item-rule">{itemRuleLabel}</span>
          )}
          {isEditing && (
            <button
              ref={addButtonRef}
              className="posting-card-requirements__add-item button--primary"
              type="button"
              aria-label={`Add requirement to ${itemRuleLabel}`}
              title="Add requirement"
              disabled={isSavingCardChanges}
              onClick={onItemAdd}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M10 4V16M4 10H16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {displayedItems.length === 0 && <p className="posting-card-details__empty">None</p>}

        {coreItems.length > 0 && (
          <div className="posting-card-requirements__pill-list">
            {coreItems.map((item, itemIndex) => (
              <span
                className="posting-card-requirements__pill-with-connector"
                key={item.id}
              >
                {itemIndex > 0 && itemConnector !== null && (
                  <span className="posting-card-requirements__item-connector">
                    {itemConnector}
                  </span>
                )}

                <RequirementPill
                  item={item}
                  isEditing={isEditing}
                  isSavingCardChanges={isSavingCardChanges}
                  isDeletePending={pendingDeleteId === item.id}
                  onChange={(name) => onItemChange(item.id, name)}
                  onDelete={(button) => {
                    deleteButtonRef.current = button
                    setPendingDeleteId(item.id)
                  }}
                />
              </span>
            ))}
          </div>
        )}

        {exampleItems.length > 0 && (
          <div className="posting-card-requirements__pill-list posting-card-requirements__example-list">
            {exampleItems.map((item) => (
              <RequirementPill
                key={item.id}
                item={item}
                isEditing={isEditing}
                isSavingCardChanges={isSavingCardChanges}
                isDeletePending={pendingDeleteId === item.id}
                onChange={(name) => onItemChange(item.id, name)}
                onDelete={(button) => {
                  deleteButtonRef.current = button
                  setPendingDeleteId(item.id)
                }}
              />
            ))}
          </div>
        )}
        {isEditing && pendingDeleteItem !== undefined && (
          <PostingCardDeleteConfirmation
            message={`Delete “${pendingDeleteItem.name || 'New skill'}”?`}
            isDisabled={isSavingCardChanges}
            onCancel={handleCancelDelete}
            onConfirm={handleDeleteItem}
          />
        )}
      </div>
    </article>
  )
}
