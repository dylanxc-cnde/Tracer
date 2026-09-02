import './PostingCardCompensation.css'
import type { CompensationEntry } from '../../../postings/types/postingDetails'
import {
  formatCompensationEntry,
  formatEnumValue,
} from './PostingCardFormatters'

type PostingCardCompensationProps = {
  entries: CompensationEntry[]
}

type CompensationFieldProps = {
  entry: CompensationEntry
}

function CompensationField({ entry }: CompensationFieldProps) {
  const compensation = formatCompensationEntry(entry)

  return (
    <li className="posting-card-compensation__field">
      <strong>{formatEnumValue(entry.compensation_type)}</strong>

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
    return <p className="posting-card-details__empty-value">None</p>
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
