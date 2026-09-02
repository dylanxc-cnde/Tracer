import './PostingCardBenefits.css'
import type { Compensation } from '../../../postings/types/postingDetails'

type PostingCardBenefitsProps = {
  benefits: Compensation['benefits']
}

export function PostingCardBenefits({
  benefits,
}: PostingCardBenefitsProps) {
  if (benefits.length === 0) {
    return <p className="posting-card-details__empty-value">None</p>
  }

  return (
    <ul className="posting-card-benefits">
      {benefits.map((benefit, index) => (
        <li key={`${benefit.value}-${index}`}>
          <span>{benefit.value}</span>
        </li>
      ))}
    </ul>
  )
}
