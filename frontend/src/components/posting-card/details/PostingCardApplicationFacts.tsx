import './PostingCardApplicationFacts.css'
import type { ApplicationInstructions } from '../../../postings/types/postingDetails'
import { formatEnumValue } from './PostingCardFormatters'
import { getSafeHttpUrl } from './PostingCardSanitizers'

type PostingCardApplicationFactsProps = {
  applicationInstructions: ApplicationInstructions
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
    const applicationUrl = applicationInstructions.application_url.value

    facts.push({
      label: 'Application URL',
      value: applicationUrl,
      url: getSafeHttpUrl(applicationUrl),
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
}: PostingCardApplicationFactsProps) {
  const facts = createApplicationFacts(applicationInstructions)

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
