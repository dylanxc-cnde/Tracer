import { useRef, useState } from 'react'
import './PostingCardRequirements.css'
import type {
  Requirement,
  RequirementImportance,
} from '../../../../postings/types/postingDetails'
import {
  formatEnumValue,
  formatRequirementItemRuleConnector,
  formatRequirementItemRuleLabel,
} from '../PostingCardFormatters'
import type { RequirementSectionDraft } from '../editor/PostingCardDraft'
import { PostingCardAddFieldMenu } from './PostingCardAddFieldMenu'
import { PostingCardDeleteConfirmation } from './PostingCardDeleteConfirmation'

const REQUIREMENT_IMPORTANCES: { key: RequirementImportance; label: string }[] = [
  { key: 'required', label: 'Required' },
  { key: 'preferred', label: 'Nice to have' },
  { key: 'unknown', label: 'Unknown' },
]

const REQUIREMENT_ITEM_RULES: { key: 'all_of' | 'any_of'; label: string }[] = [
  { key: 'all_of', label: 'All required together' },
  { key: 'any_of', label: 'Choose any one' },
]

type PostingCardRequirementAddProps = {
  draft: RequirementSectionDraft[]
  isSavingCardChanges: boolean
  onAdd: (importance: RequirementImportance) => void
}

export function PostingCardRequirementAdd({
  draft,
  isSavingCardChanges,
  onAdd,
}: PostingCardRequirementAddProps) {
  const availableImportances = REQUIREMENT_IMPORTANCES.filter((option) =>
    !draft.some((section) => section.importance === option.key),
  )

  return (
    <div className="posting-card-requirements__add-control">
      <PostingCardAddFieldMenu
        options={availableImportances}
        label="Add requirement section"
        emptyLabel="All requirement sections are shown"
        isDisabled={isSavingCardChanges}
        onSelect={onAdd}
      />
    </div>
  )
}

type PostingCardRequirementsProps = {
  groups: Requirement[]
  draft: RequirementSectionDraft[]
  isEditing: boolean
  isSavingCardChanges: boolean
  onGroupAdd: (importance: RequirementImportance, itemRule: 'all_of' | 'any_of') => void
  onSectionDelete: (importance: RequirementImportance) => void
}

type RequirementSectionProps = {
  title: string
  importance: RequirementImportance
  requirements: Requirement[]
  draft: RequirementSectionDraft | undefined
  isEditing: boolean
  isSavingCardChanges: boolean
  onGroupAdd: (importance: RequirementImportance, itemRule: 'all_of' | 'any_of') => void
  onDelete: (importance: RequirementImportance) => void
}

function RequirementSection({
  title,
  importance,
  requirements,
  draft,
  isEditing,
  isSavingCardChanges,
  onGroupAdd,
  onDelete,
}: RequirementSectionProps) {
  const [isDeletePending, setIsDeletePending] = useState(false)
  const deleteButtonRef = useRef<HTMLButtonElement>(null)

  if (isEditing ? draft === undefined : requirements.length === 0) {
    return null
  }

  const displayedGroups = isEditing ? draft?.groups ?? [] : requirements.map((group, index) => ({
    id: `${importance}-${index}`,
    itemRule: group.item_rule,
    items: group.items,
  }))
  const allOfRequirements = displayedGroups.filter(
    (requirement) => requirement.itemRule === 'all_of',
  )
  const anyOfRequirements = displayedGroups.filter(
    (requirement) => requirement.itemRule === 'any_of',
  )
  const unknownRuleRequirements = displayedGroups.filter(
    (requirement) => requirement.itemRule === 'unknown',
  )

  const orderedRequirements = [...allOfRequirements, ...anyOfRequirements, ...unknownRuleRequirements]
  const availableRules = REQUIREMENT_ITEM_RULES.filter((option) =>
    option.key !== 'all_of' || allOfRequirements.length === 0,
  )

  function handleCancelDelete() {
    setIsDeletePending(false)
    deleteButtonRef.current?.focus({ preventScroll: true })
  }

  return (
    <section
      className={`posting-card-requirements__requirement-group posting-card-requirements__requirement-group--${importance}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && isDeletePending) {
          event.preventDefault()
          event.stopPropagation()
          handleCancelDelete()
        }
      }}
    >
      <div className="posting-card-requirements__section-heading">
        <h4>{title}</h4>
        {isEditing && (
          <div className="posting-card-requirements__section-actions">
            <PostingCardAddFieldMenu
              options={availableRules}
              label={`Add ${title} group`}
              emptyLabel="No group types available"
              isDisabled={isSavingCardChanges}
              onSelect={(itemRule) => onGroupAdd(importance, itemRule)}
            />
            <button
              ref={deleteButtonRef}
              type="button"
              className="posting-card-requirements__delete"
              aria-label={`Delete ${title} section`}
              aria-expanded={isDeletePending}
              disabled={isSavingCardChanges}
              onClick={() => setIsDeletePending(true)}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M5 5L15 15M15 5L5 15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="posting-card-requirements__requirement-list">
        {isEditing && isDeletePending && (
          <PostingCardDeleteConfirmation
            message={`Delete ${title} and all its groups and items?`}
            isDisabled={isSavingCardChanges}
            onCancel={handleCancelDelete}
            onConfirm={() => {
              setIsDeletePending(false)
              onDelete(importance)
            }}
          />
        )}
        {orderedRequirements.length === 0 && <p className="posting-card-details__empty">None</p>}
        {orderedRequirements.map((requirement) => {
          const itemRuleLabel = formatRequirementItemRuleLabel(
            requirement.itemRule,
          )
          const itemConnector = formatRequirementItemRuleConnector(
            requirement.itemRule,
          )
          const coreItems = requirement.items.filter(
            (item) => !item.is_example,
          )
          const exampleItems = requirement.items.filter(
            (item) => item.is_example,
          )

          return (
            <article
              className={`posting-card-requirements__requirement posting-card-requirements__requirement--${requirement.itemRule.replace('_', '-')}`}
              key={requirement.id}
            >
              <div className="posting-card-requirements__requirement-items">
                {itemRuleLabel !== null && (
                  <span className="posting-card-requirements__item-rule">
                    {itemRuleLabel}
                  </span>
                )}

                {requirement.items.length === 0 && <p className="posting-card-details__empty">None</p>}

                {coreItems.length > 0 && (
                  <div className="posting-card-requirements__pill-list">
                    {coreItems.map((item, itemIndex) => (
                      <span
                        className="posting-card-requirements__pill-with-connector"
                        key={`${item.name}-${itemIndex}`}
                      >
                        {itemIndex > 0 && itemConnector !== null && (
                          <span className="posting-card-requirements__item-connector">
                            {itemConnector}
                          </span>
                        )}

                        <span
                          className="posting-card-requirements__pill"
                          title={formatEnumValue(item.category)}
                        >
                          {item.name}
                        </span>
                      </span>
                    ))}
                  </div>
                )}

                {exampleItems.length > 0 && (
                  <div className="posting-card-requirements__pill-list posting-card-requirements__example-list">
                    {exampleItems.map((item, itemIndex) => (
                      <span
                        className="posting-card-requirements__pill posting-card-requirements__pill--example"
                        title={formatEnumValue(item.category)}
                        key={`${item.name}-${itemIndex}`}
                      >
                        <span className="posting-card-requirements__example-prefix">
                          e.g.
                        </span>
                        {item.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export function PostingCardRequirements({
  groups,
  draft,
  isEditing,
  isSavingCardChanges,
  onGroupAdd,
  onSectionDelete,
}: PostingCardRequirementsProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  function handleDeleteSection(importance: RequirementImportance) {
    onSectionDelete(importance)
    containerRef.current?.focus({ preventScroll: true })
  }

  return (
    <div ref={containerRef} tabIndex={-1} aria-label="Requirement sections">
      {isEditing && draft.length === 0 && <p className="posting-card-details__empty">None</p>}
      {REQUIREMENT_IMPORTANCES.map((option) => (
        <RequirementSection
          key={option.key}
          title={option.label}
          importance={option.key}
          requirements={groups.filter((group) => group.importance === option.key)}
          draft={draft.find((section) => section.importance === option.key)}
          isEditing={isEditing}
          isSavingCardChanges={isSavingCardChanges}
          onGroupAdd={onGroupAdd}
          onDelete={handleDeleteSection}
        />
      ))}
    </div>
  )
}
