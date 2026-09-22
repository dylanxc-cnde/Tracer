import './PostingCardRequirementGroup.css'
import type {
  RequirementItem,
  RequirementItemRule,
} from '../../../../postings/types/postingDetails'
import {
  formatEnumValue,
  formatRequirementItemRuleConnector,
  formatRequirementItemRuleLabel,
} from '../PostingCardFormatters'

type PostingCardRequirementGroupProps = {
  itemRule: RequirementItemRule
  items: RequirementItem[]
}

export function PostingCardRequirementGroup({
  itemRule,
  items,
}: PostingCardRequirementGroupProps) {
  const itemRuleLabel = formatRequirementItemRuleLabel(itemRule)
  const itemConnector = formatRequirementItemRuleConnector(itemRule)
  const coreItems = items.filter((item) => !item.is_example)
  const exampleItems = items.filter((item) => item.is_example)

  return (
    <article
      className={`posting-card-requirements__requirement posting-card-requirements__requirement--${itemRule.replace('_', '-')}`}
    >
      <div className="posting-card-requirements__requirement-items">
        {itemRuleLabel !== null && (
          <span className="posting-card-requirements__item-rule">
            {itemRuleLabel}
          </span>
        )}

        {items.length === 0 && <p className="posting-card-details__empty">None</p>}

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
    </article>
  )
}
