import './PostingCardQuickFacts.css'

export type PostingCardQuickFact = {
  label: string
  value: string
}

type PostingCardQuickFactsProps = {
  facts: PostingCardQuickFact[]
}

export function PostingCardQuickFacts({
  facts,
}: PostingCardQuickFactsProps) {
  if (facts.length === 0) {
    return null
  }

  return (
    <dl className="posting-card-quick-facts">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}