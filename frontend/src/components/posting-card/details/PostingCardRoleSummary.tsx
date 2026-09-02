import './PostingCardRoleSummary.css'
import type { RoleDescription } from '../../../postings/types/postingDetails'

type PostingCardRoleSummaryProps = {
  summary: RoleDescription['role_summary']
}

export function PostingCardRoleSummary({
  summary,
}: PostingCardRoleSummaryProps) {
  return (
    <div className="posting-card-role-summary">
      <p
        className={
          summary === null ? 'posting-card-details__empty-value' : undefined
        }
      >
        {summary?.value ?? 'None'}
      </p>
    </div>
  )
}
