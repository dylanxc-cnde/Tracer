import './PostingCardResponsibilities.css'
import type { RoleDescription } from '../../../postings/types/postingDetails'

type PostingCardResponsibilitiesProps = {
  responsibilities: RoleDescription['responsibilities']
}

export function PostingCardResponsibilities({
  responsibilities,
}: PostingCardResponsibilitiesProps) {
  if (responsibilities.length === 0) {
    return null
  }

  return (
    <ul className="posting-card-responsibilities">
      {responsibilities.map(
        (responsibility, index) => (
          <li key={`${responsibility.value}-${index}`}>
            <span>{responsibility.value}</span>
          </li>
        ),
      )}
    </ul>
  )
}
