import { useEffect, useRef, useState } from 'react'
import { IconPlus, IconRefresh } from '@tabler/icons-react'
import { getSettings } from '../../../settings/api/settings'
import type { AIProviderSettings, AppSettings } from '../../../settings/types/appSettings'
import { CreateAIProviderDialog } from './CreateAIProviderDialog'
import './ApiSettings.css'

export function ApiSettings() {
  const [providers, setProviders] = useState<AIProviderSettings[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const settingsRequest = useRef<Promise<AppSettings> | null>(null)

  useEffect(() => {
    let isActive = true
    const request = settingsRequest.current ??= getSettings()
    async function loadProviders() {
      try {
        const settings = await request
        if (isActive) setProviders(settings.ai.providers)
      } catch {
        if (isActive) setError('Could not load providers. Refresh to try again.')
      } finally {
        if (isActive) setIsLoading(false)
      }
    }
    void loadProviders()
    return () => { isActive = false }
  }, [loadAttempt])

  function handleRefresh() {
    if (isLoading || isCreateOpen) return
    setIsLoading(true)
    setError(null)
    setNotice(null)
    settingsRequest.current = null
    setLoadAttempt((attempt) => attempt + 1)
  }

  function handleCreated(provider: AIProviderSettings) {
    setProviders((current) => [...(current ?? []), provider])
    setIsCreateOpen(false)
    setNotice('Provider added. Its API key has not been tested with the provider.')
  }

  return (
    <section className="api-settings" aria-labelledby="settings-providers-title">
      <header className="api-settings__header">
        <h2 id="settings-providers-title" className="api-settings__section-title">Providers</h2>
        <div className="api-settings__actions">
          <button type="button" className="api-settings__refresh" aria-label="Refresh providers"
            title="Refresh providers" disabled={isLoading || isCreateOpen} onClick={handleRefresh}>
            <IconRefresh size={20} aria-hidden="true" />
          </button>
          <button type="button" className="button--primary api-settings__add"
            disabled={isLoading || error !== null || providers === null}
            onClick={() => { setNotice(null); setIsCreateOpen(true) }}>
            <IconPlus size={18} aria-hidden="true" /> Add provider
          </button>
        </div>
      </header>
      {error && <p className="api-settings__error" role="alert">{error}{providers !== null && ' Showing the last loaded list.'}</p>}
      {notice && <p className="api-settings__notice" role="status">{notice}</p>}
      {isLoading && <p className="api-settings__notice" role="status">Loading providers…</p>}
      <div className="api-settings__group" aria-busy={isLoading}>
        {providers?.length === 0 && !isLoading && (
          <p className="api-settings__empty">No providers added yet. Add a provider to save its configuration and API key.</p>
        )}
        {providers !== null && providers.length > 0 && (
          <ul className="api-settings__list" aria-label="Saved providers">
            {providers.map((provider) => (
              <li key={provider.provider_key} className="api-settings__row">
                <div className="api-settings__identity">
                  <h3>{provider.display_name}</h3>
                  <p>{provider.provider === 'openai' ? 'OpenAI' : 'DeepSeek'}</p>
                </div>
                <div className="api-settings__budget">
                  <span>Monthly budget · USD</span>
                  <p>{provider.monthly_budget_usd === null ? 'Budget not set' : new Intl.NumberFormat('en-US', {
                    style: 'currency', currency: 'USD', maximumFractionDigits: 20,
                  }).format(provider.monthly_budget_usd)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="api-settings__note">Budgets are saved preferences, not spending limits. API keys are not displayed here.</p>
      {isCreateOpen && <CreateAIProviderDialog onCreated={handleCreated} onClose={() => setIsCreateOpen(false)} />}
    </section>
  )
}
