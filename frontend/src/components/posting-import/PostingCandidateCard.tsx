import type { ParsedPosting } from '../../postings/types/postingParse'
import { formatAddressPreview } from '../posting-card/details/PostingCardFormatters'

type PostingCandidateCardProps = {
  posting: ParsedPosting
  isSelected: boolean
  onSelect: () => void
}

export function PostingCandidateCard({
  posting,
  isSelected,
  onSelect,
}: PostingCandidateCardProps) {
  const title =
    posting.details.identity.position_title?.value ?? 'Unknown position'

  const company =
    posting.details.identity.company_name?.value ?? 'Unknown company'

  const location = formatAddressPreview(
    posting.details.work_conditions.primary_address?.value ?? null,
  ) ?? 'Unknown location'

  const workModes =
    posting.details.work_conditions.work_modes?.value.join(', ') ??
    'Unknown work mode'

  return (
    <article
      className={
        isSelected
          ? 'posting-candidate posting-candidate--selected'
          : 'posting-candidate'
      }
    >
      <h4 className="posting-candidate__title">{title}</h4>

      <p className="posting-candidate__metadata">{company}</p>
      <p className="posting-candidate__metadata">{location}</p>
      <p className="posting-candidate__metadata">{workModes}</p>

      <button
        className="button--primary posting-candidate__select-button"
        type="button"
        onClick={onSelect}
      >
        {isSelected ? 'Selected' : 'Select'}
      </button>
    </article>
  )
}
