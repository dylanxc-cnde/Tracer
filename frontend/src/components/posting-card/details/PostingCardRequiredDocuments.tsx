import './PostingCardRequiredDocuments.css'
import type { ApplicationInstructions } from '../../../postings/types/postingDetails'

type PostingCardRequiredDocumentsProps = {
  requiredDocuments: ApplicationInstructions['required_documents']
}

export function PostingCardRequiredDocuments({
  requiredDocuments,
}: PostingCardRequiredDocumentsProps) {
  if (requiredDocuments.length === 0) {
    return null
  }

  return (
    <ul className="posting-card-required-documents">
      {requiredDocuments.map((document, index) => (
        <li key={`${document.value}-${index}`}>
          <span>{document.value}</span>
        </li>
      ))}
    </ul>
  )
}
