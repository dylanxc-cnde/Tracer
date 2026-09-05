import { useEffect, useState, type SubmitEvent } from 'react'
import './PostingCardUserArea.css'
import type { PostingCardUserDraft } from './usePostingCardEditor'

type PostingCardUserAreaProps = {
  draft: PostingCardUserDraft
  isEditing: boolean
  isSavingCardChanges: boolean
  onAliasChange: (postingAlias: string) => void
  onTagsChange: (tags: string[]) => void
  onNotesChange: (userNotes: string) => void
}

export function PostingCardUserArea({
  draft,
  isEditing,
  isSavingCardChanges,
  onAliasChange,
  onTagsChange,
  onNotesChange,
}: PostingCardUserAreaProps) {
  const [pendingTag, setPendingTag] = useState('')

  useEffect(() => {
    if (!isEditing) {
      setPendingTag('')
    }
  }, [isEditing])

  function handleAddTag(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const tag = pendingTag.trim()

    if (
      tag.length === 0 ||
      draft.tags.some(
        (existingTag) => existingTag.toLowerCase() === tag.toLowerCase(),
      )
    ) {
      return
    }

    onTagsChange([...draft.tags, tag])
    setPendingTag('')
  }

  function handleRemoveTag(tagIndex: number) {
    onTagsChange(draft.tags.filter((_, index) => index !== tagIndex))
  }

  return (
    <section className="posting-card-user-area">
      <h3>My card</h3>

      <div className="posting-card-user-area__field">
        <label htmlFor="posting-card-alias">Alias</label>
        {isEditing ? (
          <input
            id="posting-card-alias"
            type="text"
            value={draft.postingAlias}
            disabled={isSavingCardChanges}
            placeholder="Add your own name for this posting"
            onChange={(event) => onAliasChange(event.target.value)}
          />
        ) : (
          <p className={!draft.postingAlias ? 'is-empty' : undefined}>
            {draft.postingAlias || 'No alias yet'}
          </p>
        )}
      </div>

      <div className="posting-card-user-area__field">
        <span className="posting-card-user-area__label">Tags</span>

        {draft.tags.length > 0 ? (
          <div className="posting-card-user-area__tags">
            {draft.tags.map((tag, index) =>
              isEditing ? (
                <button
                  className="posting-card-user-area__tag posting-card-user-area__tag--removable"
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  disabled={isSavingCardChanges}
                  onClick={() => handleRemoveTag(index)}
                  key={`${tag}-${index}`}
                >
                  <span>{tag}</span>
                  <span aria-hidden="true">×</span>
                </button>
              ) : (
                <span
                  className="posting-card-user-area__tag"
                  key={`${tag}-${index}`}
                >
                  {tag}
                </span>
              ),
            )}
          </div>
        ) : (
          <p className="is-empty">No tags yet</p>
        )}

        {isEditing && (
          <form
            className="posting-card-user-area__tag-form"
            onSubmit={handleAddTag}
          >
            <input
              type="text"
              value={pendingTag}
              disabled={isSavingCardChanges}
              aria-label="New tag"
              placeholder="Add a tag"
              onChange={(event) => setPendingTag(event.target.value)}
            />
            <button
              type="submit"
              disabled={isSavingCardChanges || pendingTag.trim().length === 0}
            >
              Add
            </button>
          </form>
        )}
      </div>

      <div className="posting-card-user-area__field">
        <label htmlFor="posting-card-notes">Notes</label>
        {isEditing ? (
          <textarea
            id="posting-card-notes"
            value={draft.userNotes}
            disabled={isSavingCardChanges}
            rows={5}
            placeholder="Add notes for this posting"
            onChange={(event) => onNotesChange(event.target.value)}
          />
        ) : (
          <p className={!draft.userNotes ? 'is-empty' : undefined}>
            {draft.userNotes || 'No notes yet'}
          </p>
        )}
      </div>
    </section>
  )
}
