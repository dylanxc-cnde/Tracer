import './PostingCardSpecialInstructions.css'
import type { ApplicationInstructions } from '../../../postings/types/postingDetails'

type PostingCardSpecialInstructionsProps = {
  specialInstructions: ApplicationInstructions['special_instructions']
}

export function PostingCardSpecialInstructions({
  specialInstructions,
}: PostingCardSpecialInstructionsProps) {
  if (specialInstructions.length === 0) {
    return null
  }

  return (
    <ul className="posting-card-special-instructions">
      {specialInstructions.map((instruction, index) => (
        <li key={`${instruction.value}-${index}`}>
          <span>{instruction.value}</span>
        </li>
      ))}
    </ul>
  )
}
