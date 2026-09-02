import './PostingCardSourceEvidence.css'
import type { PostingSource } from '../../../postings/types/postingDetails'
import { getSafeHttpUrl } from './PostingCardSanitizers'

type PostingCardSourceEvidenceProps = {
  source: PostingSource
  areSourcesVisible: boolean
}

export function PostingCardSourceEvidence({
  source,
  areSourcesVisible,
}: PostingCardSourceEvidenceProps) {
  if (!areSourcesVisible) {
    return null
  }

  if (source.excerpts.length === 0 && source.source_urls.length === 0) {
    return (
      <p className="posting-card-source-evidence__unavailable">
        No source available
      </p>
    )
  }

  return (
    <details className="posting-card-source-evidence">
      <summary>View source</summary>

      {source.excerpts.length > 0 && (
        <ul className="posting-card-source-evidence__list">
          {source.excerpts.map((excerpt, index) => (
            <li key={`${excerpt}-${index}`}>
              <blockquote>{excerpt}</blockquote>
            </li>
          ))}
        </ul>
      )}

      {source.source_urls.length > 0 && (
        <div className="posting-card-source-evidence__url">
          <strong>Source URLs</strong>

          <ul>
            {source.source_urls.map((sourceUrl, index) => {
              const safeSourceUrl = getSafeHttpUrl(sourceUrl)

              return (
                <li key={`${sourceUrl}-${index}`}>
                  {safeSourceUrl === null ? (
                    <span>{sourceUrl}</span>
                  ) : (
                    <a
                      href={safeSourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {sourceUrl}
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </details>
  )
}
