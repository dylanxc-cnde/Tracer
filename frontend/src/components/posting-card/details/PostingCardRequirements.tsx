import './PostingCardRequirements.css'
import type {
  Requirement,
  RequirementImportance,
} from '../../../postings/types/postingDetails'
import {
  formatEnumValue,
  formatRequirementItemRuleConnector,
  formatRequirementItemRuleLabel,
} from './PostingCardFormatters'

type PostingCardRequirementsProps = {
  groups: Requirement[]
}

type RequirementGroupProps = {
  title: string
  importance: RequirementImportance
  requirements: Requirement[]
}

function RequirementGroup({
  title,
  importance,
  requirements,
}: RequirementGroupProps) {
  if (requirements.length === 0) {
    return null
  }

  const allOfRequirements = requirements.filter(
    (requirement) => requirement.item_rule === 'all_of',
  )
  const anyOfRequirements = requirements.filter(
    (requirement) => requirement.item_rule === 'any_of',
  )
  const unknownRuleRequirements = requirements.filter(
    (requirement) => requirement.item_rule === 'unknown',
  )

  const orderedRequirements = [...allOfRequirements, ...anyOfRequirements, ...unknownRuleRequirements]

  return (
    <section
      className={`posting-card-requirements__requirement-group posting-card-requirements__requirement-group--${importance}`}
    >
      <h4>{title}</h4>

      <div className="posting-card-requirements__requirement-list">
        {orderedRequirements.map((requirement, requirementIndex) => {
          const itemRuleLabel = formatRequirementItemRuleLabel(
            requirement.item_rule,
          )
          const itemConnector = formatRequirementItemRuleConnector(
            requirement.item_rule,
          )
          const coreItems = requirement.items.filter(
            (item) => !item.is_example,
          )
          const exampleItems = requirement.items.filter(
            (item) => item.is_example,
          )

          return (
            <article
              className={`posting-card-requirements__requirement posting-card-requirements__requirement--${requirement.item_rule.replace('_', '-')}`}
              key={`${requirement.item_rule}-${requirementIndex}`}
            >
              {requirement.items.length > 0 && (
                <div className="posting-card-requirements__requirement-items">
                  {itemRuleLabel !== null && (
                    <span className="posting-card-requirements__item-rule">
                      {itemRuleLabel}
                    </span>
                  )}

                  {coreItems.length > 0 && (
                    <div className="posting-card-requirements__pill-list">
                      {coreItems.map((item, itemIndex) => (
                        <span
                          className="posting-card-requirements__pill-with-connector"
                          key={`${item.name}-${itemIndex}`}
                        >
                          {itemIndex > 0 && itemConnector !== null && (
                            <span className="posting-card-requirements__item-connector">
                              {itemConnector}
                            </span>
                          )}

                          <span
                            className="posting-card-requirements__pill"
                            title={formatEnumValue(item.category)}
                          >
                            {item.name}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}

                  {exampleItems.length > 0 && (
                    <div className="posting-card-requirements__pill-list posting-card-requirements__example-list">
                      {exampleItems.map((item, itemIndex) => (
                        <span
                          className="posting-card-requirements__pill posting-card-requirements__pill--example"
                          title={formatEnumValue(item.category)}
                          key={`${item.name}-${itemIndex}`}
                        >
                          <span className="posting-card-requirements__example-prefix">
                            e.g.
                          </span>
                          {item.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

export function PostingCardRequirements({
  groups,
}: PostingCardRequirementsProps) {
  const requiredRequirements = groups.filter(
    (requirement) => requirement.importance === 'required',
  )
  const preferredRequirements = groups.filter(
    (requirement) => requirement.importance === 'preferred',
  )
  const unknownRequirements = groups.filter(
    (requirement) => requirement.importance === 'unknown',
  )

  return (
    <>
      <RequirementGroup
        title="Required"
        importance="required"
        requirements={requiredRequirements}
      />
      <RequirementGroup
        title="Nice to have"
        importance="preferred"
        requirements={preferredRequirements}
      />
      <RequirementGroup
        title="Unclear"
        importance="unknown"
        requirements={unknownRequirements}
      />
    </>
  )
}
