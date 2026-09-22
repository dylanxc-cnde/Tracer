import { useRef, useState } from 'react'
import './PostingCardRequirementSections.css'
import type {
  Requirement,
  RequirementImportance,
} from '../../../../postings/types/postingDetails'
import type { RequirementSectionDraft } from '../editor/PostingCardDraft'
import { PostingCardAddFieldMenu } from './PostingCardAddFieldMenu'
import { PostingCardDeleteConfirmation } from './PostingCardDeleteConfirmation'
import { PostingCardRequirementGroup } from './PostingCardRequirementGroup'

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

type PostingCardRequirementSectionsProps = {
  groups: Requirement[]
  draft: RequirementSectionDraft[]
  isEditing: boolean
  isSavingCardChanges: boolean
  onGroupAdd: (importance: RequirementImportance, itemRule: 'all_of' | 'any_of') => void
  onSectionDelete: (importance: RequirementImportance) => void
  onItemAdd: (groupId: string) => void
  onItemChange: (groupId: string, itemId: string, name: string) => void
  onItemDelete: (groupId: string, itemId: string) => void
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
  onItemAdd: (groupId: string) => void
  onItemChange: (groupId: string, itemId: string, name: string) => void
  onItemDelete: (groupId: string, itemId: string) => void
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
  onItemAdd,
  onItemChange,
  onItemDelete,
}: RequirementSectionProps) {
  const [isDeletePending, setIsDeletePending] = useState(false)
  const deleteButtonRef = useRef<HTMLButtonElement>(null)

  if (isEditing ? draft === undefined : requirements.length === 0) {
    return null
  }

  // Read saved items in view mode and the hook's item drafts in edit mode.
  const displayedGroups = isEditing
    ? (draft?.groups ?? []).map((group) => ({
        id: group.id,
        itemRule: group.itemRule,
        items: [],
        draft: group.items,
      }))
    : requirements.map((group, index) => ({
        id: `${importance}-${index}`,
        itemRule: group.item_rule,
        items: group.items,
        draft: [],
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
        {/* Bind the box ID here; Group only needs to report which pill changed. */}
        {orderedRequirements.map((requirement) => (
          <PostingCardRequirementGroup
            key={requirement.id}
            itemRule={requirement.itemRule}
            items={requirement.items}
            draft={requirement.draft}
            isEditing={isEditing}
            isSavingCardChanges={isSavingCardChanges}
            onItemAdd={() => onItemAdd(requirement.id)}
            onItemChange={(itemId, name) => onItemChange(requirement.id, itemId, name)}
            onItemDelete={(itemId) => onItemDelete(requirement.id, itemId)}
          />
        ))}
      </div>
    </section>
  )
}

export function PostingCardRequirementSections({
  groups,
  draft,
  isEditing,
  isSavingCardChanges,
  onGroupAdd,
  onSectionDelete,
  onItemAdd,
  onItemChange,
  onItemDelete,
}: PostingCardRequirementSectionsProps) {
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
          onItemAdd={onItemAdd}
          onItemChange={onItemChange}
          onItemDelete={onItemDelete}
        />
      ))}
    </div>
  )
}
