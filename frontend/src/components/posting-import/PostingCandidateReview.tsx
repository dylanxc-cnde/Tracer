import type { Requirement, RequirementImportance } from '../../postings/types/postingDetails'
import type { ParsedPosting } from '../../postings/types/postingParse'
import { formatRequirementItemRuleLabel } from '../posting-card/details/PostingCardFormatters'
import { PostingCardSourceEvidence } from '../posting-card/details/components/PostingCardSourceEvidence'
import './PostingCandidateReview.css'

const importanceLabels: Record<RequirementImportance, string> = {
  required: 'Required',
  preferred: 'Nice to have',
  unknown: 'Importance unknown',
}

function isLocationAmbiguity(fieldPath: string) {
  return /^work_conditions\.(primary_address|address_candidates)(?:\.|\[|$)/.test(fieldPath)
}

function RequirementGroup({ group }: { group: Requirement }) {
  const items = group.items.filter(item => !item.is_example)
  const examples = group.items.filter(item => item.is_example)

  return (
    <li>
      <strong>{importanceLabels[group.importance]}</strong>
      {items.length > 0 && <>
        <p>{formatRequirementItemRuleLabel(group.item_rule)}</p>
        <ul>{items.map((item, index) => <li key={index}>{item.name}</li>)}</ul>
      </>}
      {examples.length > 0 && <>
        <p>Examples</p>
        <ul>{examples.map((item, index) => <li key={index}>{item.name}</li>)}</ul>
      </>}
    </li>
  )
}

export function PostingCandidateReview({ posting, titleId }: { posting: ParsedPosting; titleId: string }) {
  const { details, parse_ambiguities: ambiguities } = posting
  const { role_content: role, requirements, classification } = details
  const hasLocationAmbiguity = ambiguities.some(ambiguity => isLocationAmbiguity(ambiguity.field_path))
  const hasRoleDetails = role.role_summary !== null || role.responsibilities.length > 0
  const notice = hasLocationAmbiguity ? 'Location needs review' : 'Extraction needs review'
  const noticeId = `${titleId}-review-notice`

  return <>
    {ambiguities.length > 0 && <p id={noticeId} className="posting-candidate-review__notice">{notice}</p>}
    <details className="posting-candidate-review">
      <summary aria-describedby={ambiguities.length > 0 ? `${titleId} ${noticeId}` : titleId}>Review proposal</summary>
      <div className="posting-candidate-review__content">
        {ambiguities.length > 0 && (
          <section>
            <h4>Uncertainties</h4>
            <ul className="posting-candidate-review__entries">
              {ambiguities.map((ambiguity, index) => (
                <li key={`${ambiguity.field_path}-${index}`}>
                  <strong>{isLocationAmbiguity(ambiguity.field_path) ? 'Location' : 'Uncertain field'}</strong>
                  <p>{ambiguity.description}</p>
                  {ambiguity.alternatives.length > 0 && <>
                    <p>Alternatives</p>
                    <ul>
                      {ambiguity.alternatives.map((alternative, alternativeIndex) => (
                        <li key={alternativeIndex}>{alternative}</li>
                      ))}
                    </ul>
                  </>}
                  <PostingCardSourceEvidence
                    source={ambiguity.source}
                    areSourcesVisible
                    isModified={false}
                    summaryLabel="View uncertainty source"
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h4>Role and responsibilities</h4>
          {!hasRoleDetails && <p>Role details unknown</p>}
          {role.role_summary && <p>{role.role_summary.value}</p>}
          {role.responsibilities.length > 0 && (
            <ul>
              {role.responsibilities.map((responsibility, index) => <li key={index}>{responsibility.value}</li>)}
            </ul>
          )}
          {hasRoleDetails && (
            <PostingCardSourceEvidence
              source={role.source}
              areSourcesVisible
              isModified={false}
              summaryLabel="View role source"
            />
          )}
        </section>

        <section>
          <h4>Requirements</h4>
          {classification.eligibility && <>
            <p><strong>Eligibility</strong> {classification.eligibility.value}</p>
            <PostingCardSourceEvidence
              source={classification.source}
              areSourcesVisible
              isModified={false}
              summaryLabel="View eligibility source"
            />
          </>}
          {requirements.groups.length > 0 ? <>
            <ul className="posting-candidate-review__entries">
              {requirements.groups.map((group, index) => <RequirementGroup key={index} group={group} />)}
            </ul>
            <PostingCardSourceEvidence
              source={requirements.source}
              areSourcesVisible
              isModified={false}
              summaryLabel="View requirements source"
            />
          </> : <p>Requirement groups unknown</p>}
        </section>
      </div>
    </details>
  </>
}
