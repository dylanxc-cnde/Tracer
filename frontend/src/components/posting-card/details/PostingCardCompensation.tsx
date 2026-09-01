import './PostingCardCompensation.css'
import type { CompensationEntry } from '../../../postings/types/postingDetails'
import { formatCompensationEntry } from './formatCompensationEntry'

type PostingCardCompensationProps = {
  entries: CompensationEntry[]
}

type CompensationFieldProps = {
  entry: CompensationEntry
}

function formatCompensationType(compensationType: string) {
  return compensationType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function CompensationField({ entry }: CompensationFieldProps) {
  const compensation = formatCompensationEntry(entry)

  return (
    <li className="posting-card-compensation__field">
      <strong>{formatCompensationType(entry.compensation_type)}</strong>

      {compensation !== null && <span>{compensation}</span>}

      {entry.payment_conditions !== null && (
        <span>{entry.payment_conditions}</span>
      )}
    </li>
  )
}

export function PostingCardCompensation({
  entries,
}: PostingCardCompensationProps) {
  if (entries.length === 0) {
    return null
  }

  return (
    <ul className="posting-card-compensation">
      {entries.map((entry, index) => (
        <CompensationField
          entry={entry}
          key={`${entry.compensation_type}-${index}`}
        />
      ))}
    </ul>
  )
}
