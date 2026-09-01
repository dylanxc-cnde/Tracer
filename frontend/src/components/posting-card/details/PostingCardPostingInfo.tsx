import './PostingCardPostingInfo.css'
import type { PostingIdentity } from '../../../postings/types/postingDetails'

type PostingCardPostingInfoProps = {
  identity: PostingIdentity
  safePostingUrl: string | null
}

export function PostingCardPostingInfo({
  identity,
  safePostingUrl,
}: PostingCardPostingInfoProps) {
  const postingUrl = identity.canonical_posting_url?.value ?? null

  return (
    <div
      id="posting-card-details-posting-info"
      className="posting-card-posting-info"
    >
      <dl className="posting-card-posting-info__list">
        {postingUrl !== null && (
          <div>
            <dt>Posting URL</dt>
            <dd>
              {safePostingUrl === null ? (
                postingUrl
              ) : (
                <a
                  href={safePostingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {postingUrl}
                </a>
              )}
            </dd>
          </div>
        )}

        {identity.source_platform !== null && (
          <div>
            <dt>Source platform</dt>
            <dd>{identity.source_platform.value}</dd>
          </div>
        )}

        {identity.published_on !== null && (
          <div>
            <dt>Published</dt>
            <dd>{identity.published_on.value}</dd>
          </div>
        )}

        {identity.posting_language !== null && (
          <div>
            <dt>Language</dt>
            <dd>{identity.posting_language.value}</dd>
          </div>
        )}
      </dl>
    </div>
  )
}
