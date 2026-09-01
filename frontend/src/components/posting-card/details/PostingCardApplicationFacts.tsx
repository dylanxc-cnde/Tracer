import './PostingCardApplicationFacts.css'
import type { ApplicationInstructions } from '../../../postings/types/postingDetails'
import { formatEnumValue } from './postingCardFormatters'

type PostingCardApplicationFactsProps = {
  applicationInstructions: ApplicationInstructions
  safeApplicationUrl: string | null
}

type ApplicationFactValue = {
  label: string
  value: string
  url: string | null
}

type ApplicationFactProps = {
  fact: ApplicationFactValue
}

function createApplicationFacts(
  applicationInstructions: ApplicationInstructions,
  safeApplicationUrl: string | null,
) {
  const facts: ApplicationFactValue[] = []

  if (
    applicationInstructions.channels !== null &&
    applicationInstructions.channels.value.length > 0
  ) {
    facts.push({
      label: 'Channels',
      value: applicationInstructions.channels.value
        .map(formatEnumValue)
        .join(' · '),
      url: null,
    })
  }

  if (applicationInstructions.application_url !== null) {
    facts.push({
      label: 'Application URL',
      value: applicationInstructions.application_url.value,
      url: safeApplicationUrl,
    })
  }

  if (applicationInstructions.application_deadline !== null) {
    facts.push({
      label: 'Deadline',
      value: applicationInstructions.application_deadline.value,
      url: null,
    })
  }

  if (applicationInstructions.required_email_subject !== null) {
    facts.push({
      label: 'Email subject',
      value: applicationInstructions.required_email_subject.value,
      url: null,
    })
  }

  return facts
}

function ApplicationFact({ fact }: ApplicationFactProps) {
  return (
    <div className="posting-card-application-facts__field">
      <dt>{fact.label}</dt>
      <dd>
        {fact.url === null ? (
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
  safeApplicationUrl,
}: PostingCardApplicationFactsProps) {
  const facts = createApplicationFacts(
    applicationInstructions,
    safeApplicationUrl,
  )

  if (facts.length === 0) {
    return null
  }

  return (
    <dl className="posting-card-application-facts">
      {facts.map((fact) => (
        <ApplicationFact fact={fact} key={fact.label} />
      ))}
    </dl>
  )
}
