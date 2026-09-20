import './PostingCardRoleSummary.css'
import type { RoleDescription } from '../../../postings/types/postingDetails'

type PostingCardRoleSummaryProps = {
  summary: RoleDescription['role_summary']
  draft: string
  isEditing: boolean
  isSavingCardChanges: boolean
  onSummaryChange: (value:string) => void
}

export function PostingCardRoleSummary({
  summary,
  draft,
  isEditing,
  isSavingCardChanges,
  onSummaryChange,
}: PostingCardRoleSummaryProps) {
  return (
    <div className="posting-card-role-summary">
      {isEditing ? (
        <textarea
          className="posting-card-role-summary__input"
          aria-label="Role summary"
          value={draft}
          disabled={isSavingCardChanges}
          placeholder="Add a role summary"
          onChange={(event)=> onSummaryChange(event.target.value)}
        />
      ) : (
        <p
          className={
            summary === null ? 'posting-card-details__empty-value' : undefined
          }
        >
          {summary?.value ?? 'None'}
        </p>
      )}
    </div>
  )
}
