import { useState } from 'react'
import './PostingCardUserArea.css'
import { PostingCardDeleteConfirmation } from './PostingCardDeleteConfirmation'
import type { PostingCardUserDraft } from './usePostingCardEditor'

type PostingCardUserAreaProps = {
  draft: PostingCardUserDraft
  isEditing: boolean
  isSavingCardChanges: boolean
  onAliasChange: (postingAlias: string) => void
  onTagAdd: () => void
  onTagChange: (id: string, value: string) => void
  onTagDelete: (id: string) => void
  onNotesChange: (userNotes: string) => void
}

export function PostingCardUserArea({
  draft,
  isEditing,
  isSavingCardChanges,
  onAliasChange,
  onTagAdd,
  onTagChange,
  onTagDelete,
  onNotesChange,
}: PostingCardUserAreaProps) {
  const [pendingDeleteTagId, setPendingDeleteTagId] = useState<string | null>(null)
  const pendingDeleteTag = draft.tags.find((tag) => tag.id === pendingDeleteTagId)

  function handleDeleteTag(id: string) {
    if (isSavingCardChanges) {
      return
    }

    onTagDelete(id)
    setPendingDeleteTagId(null)
  }

  return (
    <section className="posting-card-user-area">
      <h3>My card</h3>

      <div className="posting-card-user-area__field">
        <label htmlFor="posting-card-alias">Alias</label>
        <div className="posting-card-user-area__text">
          {isEditing ? (
            <>
              <span
                className={`posting-card-user-area__value posting-card-user-area__value--sizing${!draft.postingAlias ? ' is-empty' : ''}`}
                aria-hidden="true"
              >
                {draft.postingAlias || 'No alias yet'}
              </span>
              <textarea
                id="posting-card-alias"
                className="posting-card-user-area__input"
                value={draft.postingAlias}
                disabled={isSavingCardChanges}
                placeholder="Add an alias"
                onChange={(event) => onAliasChange(event.target.value)}
              />
            </>
          ) : (
            <p className={`posting-card-user-area__value${!draft.postingAlias ? ' is-empty' : ''}`}>
              {draft.postingAlias || 'No alias yet'}
            </p>
          )}
        </div>
      </div>

      <div className="posting-card-user-area__field posting-card-user-area__field--tags">
        <div className="posting-card-user-area__tag-heading">
          <span className="posting-card-user-area__label">Tags</span>

          {isEditing && (
            <button
              className="posting-card-user-area__add-tag button--primary"
              type="button"
              aria-label="Add tag"
              title="Add tag"
              disabled={isSavingCardChanges}
              onClick={onTagAdd}
            >
              +
            </button>
          )}
        </div>

        {draft.tags.length > 0 ? (
          <div className="posting-card-user-area__tags">
            {draft.tags.map((tag, index) => (
              <span className="posting-card-user-area__tag" key={tag.id}>
                <span className="posting-card-user-area__tag-text">
                  {isEditing ? (
                    <>
                      <span
                        className="posting-card-user-area__tag-value posting-card-user-area__tag-value--sizing"
                        aria-hidden="true"
                      >
                        {tag.value || 'New tag'}
                      </span>
                      <input
                        className="posting-card-user-area__tag-input"
                        type="text"
                        aria-label={`Tag ${index + 1}`}
                        value={tag.value}
                        disabled={isSavingCardChanges}
                        placeholder="New tag"
                        autoFocus={tag.value.length === 0}
                        onChange={(event) => onTagChange(tag.id, event.target.value)}
                      />
                    </>
                  ) : (
                    <span className="posting-card-user-area__tag-value">{tag.value}</span>
                  )}
                </span>

                {isEditing && (
                  <button
                    className="posting-card-user-area__delete-tag-button"
                    type="button"
                    aria-label={`Delete tag ${index + 1}`}
                    title="Delete tag"
                    aria-expanded={pendingDeleteTagId === tag.id}
                    disabled={isSavingCardChanges}
                    onClick={() => setPendingDeleteTagId(tag.id)}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                )}
              </span>
            ))}
          </div>
        ) : (
          <p className="is-empty">No tags yet</p>
        )}

        {isEditing && pendingDeleteTag !== undefined && (
          <div className="posting-card-user-area__delete-confirmation">
            <PostingCardDeleteConfirmation
              message={`Delete “${pendingDeleteTag.value || 'New tag'}”?`}
              isDisabled={isSavingCardChanges}
              onCancel={() => setPendingDeleteTagId(null)}
              onConfirm={() => handleDeleteTag(pendingDeleteTag.id)}
            />
          </div>
        )}
      </div>

      <div className="posting-card-user-area__field">
        <label htmlFor="posting-card-notes">Notes</label>
        <div className="posting-card-user-area__text">
          {isEditing ? (
            <>
              <span
                className={`posting-card-user-area__value posting-card-user-area__value--sizing${!draft.userNotes ? ' is-empty' : ''}`}
                aria-hidden="true"
              >
                {draft.userNotes || 'No notes yet'}
              </span>
              <textarea
                id="posting-card-notes"
                className="posting-card-user-area__input"
                value={draft.userNotes}
                disabled={isSavingCardChanges}
                placeholder="Add notes"
                onChange={(event) => onNotesChange(event.target.value)}
              />
            </>
          ) : (
            <p className={`posting-card-user-area__value${!draft.userNotes ? ' is-empty' : ''}`}>
              {draft.userNotes || 'No notes yet'}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
