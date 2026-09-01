import './PostingCardRoleSummary.css'
import type { RoleDescription } from '../../../postings/types/postingDetails'

type PostingCardRoleSummaryProps = {
  summary: RoleDescription['role_summary']
}

export function PostingCardRoleSummary({
  summary,
}: PostingCardRoleSummaryProps) {
  if (summary === null) {
    return null
  }

  return (
    <div className="posting-card-role-summary">
      <p>{summary.value}</p>
    </div>
  )
}
