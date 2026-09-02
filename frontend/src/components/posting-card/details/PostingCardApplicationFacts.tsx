import './PostingCardApplicationFacts.css'
import type { ApplicationInstructions } from '../../../postings/types/postingDetails'
import { formatEnumValue } from './PostingCardFormatters'
import { getSafeHttpUrl } from './PostingCardSanitizers'

type PostingCardApplicationFactsProps = {
  applicationInstructions: ApplicationInstructions
}

type ApplicationFactValue = {
  label: string
  value: string | null
  url: string | null
}

type ApplicationFactProps = {
  fact: ApplicationFactValue
}

function createApplicationFacts(
  applicationInstructions: ApplicationInstructions,
) {
  const channels =
    applicationInstructions.channels !== null &&
    applicationInstructions.channels.value.length > 0
      ? applicationInstructions.channels.value.map(formatEnumValue).join(' · ')
      : null
  const applicationUrl =
    applicationInstructions.application_url?.value ?? null

  return [
    {
      label: 'Channels',
      value: channels,
      url: null,
    },
    {
      label: 'Application URL',
      value: applicationUrl,
      url: applicationUrl === null ? null : getSafeHttpUrl(applicationUrl),
    },
    {
      label: 'Deadline',
      value: applicationInstructions.application_deadline?.value ?? null,
      url: null,
    },
    {
      label: 'Email subject',
      value: applicationInstructions.required_email_subject?.value ?? null,
      url: null,
    },
  ] satisfies ApplicationFactValue[]
}

function ApplicationFact({ fact }: ApplicationFactProps) {
  return (
    <div className="posting-card-application-facts__field">
      <dt>{fact.label}</dt>
      <dd
        className={
          fact.value === null ? 'posting-card-details__empty-value' : undefined
        }
      >
        {fact.value === null ? (
          'None'
        ) : fact.url === null ? (
          fact.value
        ) : (
          <a
            href={fact.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {fact.value}
          </a>
        )}
      </dd>
    </div>
  )
}

export function PostingCardApplicationFacts({
  applicationInstructions,
}: PostingCardApplicationFactsProps) {
  const facts = createApplicationFacts(applicationInstructions)

  return (
    <dl className="posting-card-application-facts">
      {facts.map((fact) => (
        <ApplicationFact fact={fact} key={fact.label} />
      ))}
    </dl>
  )
}
