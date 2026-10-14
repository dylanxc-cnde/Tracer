import { useEffect, useRef, useState } from 'react'
import { IconPlus, IconRefresh } from '@tabler/icons-react'
import { getSettings } from '../../../settings/api/settings'
import type { AIProviderSettings, AITaskSettings, AppSettings } from '../../../settings/types/appSettings'
import { CreateAIProviderDialog } from './CreateAIProviderDialog'
import { ManageAIProviderDialog } from './ManageAIProviderDialog'
import type { ProviderOperation } from './ManageAIProviderDialog'
import { PostingParseSettings } from './PostingParseSettings'
import './ApiSettings.css'

export function ApiSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [modal, setModal] = useState<{ kind: 'create' } | { kind: 'manage'; provider: AIProviderSettings; mode: ProviderOperation } | null>(null)
  const [isTaskSaving, setIsTaskSaving] = useState(false)
  const [loadedVersion, setLoadedVersion] = useState(0)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const settingsRequest = useRef<Promise<AppSettings> | null>(null)
  // Coordinate local writers synchronously, including the render before disabled
  // controls appear. The backend remains authoritative across app instances.
  const activity = useRef<'refresh' | 'create' | 'manage' | 'task' | null>('refresh')
  const providers = settings?.ai.providers ?? null
  const isCreateOpen = modal?.kind === 'create'
  const busy = isLoading || modal !== null || isTaskSaving

  useEffect(() => {
    let isActive = true
    const request = settingsRequest.current ??= getSettings()
    async function loadProviders() {
      try {
        const loaded = await request
        if (isActive) {
          setSettings(loaded)
          setLoadedVersion((version) => version + 1)
        }
      } catch {
        if (isActive) setError('Could not load providers. Refresh to try again.')
      } finally {
        if (isActive) {
          activity.current = null
          setIsLoading(false)
        }
      }
    }
    void loadProviders()
    return () => { isActive = false }
  }, [loadAttempt])

  function handleRefresh() {
    if (activity.current !== null) return
    activity.current = 'refresh'
    setIsLoading(true)
    setError(null)
    setNotice(null)
    settingsRequest.current = null
    setLoadAttempt((attempt) => attempt + 1)
  }

  function handleCreated(provider: AIProviderSettings) {
    setSettings((current) => current === null ? current : {
      ...current, ai: { ...current.ai, providers: [...current.ai.providers, provider] },
    })
    closeModal()
    setNotice('Provider added. Its API key has not been tested with the provider.')
  }

  function closeModal() {
    activity.current = null
    setModal(null)
  }

  function openManage(provider: AIProviderSettings, mode: ProviderOperation) {
    if (activity.current !== null || error !== null || settings === null) return
    activity.current = 'manage'
    setNotice(null)
    setModal({ kind: 'manage', provider, mode })
  }

  function handleUpdated(provider: AIProviderSettings) {
    setSettings((current) => current === null ? current : {
      ...current, ai: { ...current.ai, providers: current.ai.providers.map((item) => item.provider_key === provider.provider_key ? provider : item) },
    })
    closeModal()
    setNotice('Provider settings saved.')
  }

  function handleDeleted(providerKey: string) {
    setSettings((current) => current === null ? current : {
      ...current, ai: { ...current.ai, providers: current.ai.providers.filter((item) => item.provider_key !== providerKey) },
    })
    closeModal()
    setNotice('Provider and its stored API key deleted.')
  }

  function beginTaskWrite() {
    if (activity.current !== null || error !== null || settings === null) return false
    activity.current = 'task'
    setIsTaskSaving(true)
    setNotice(null)
    return true
  }

  function handleTaskSaved(selection: AITaskSettings | null) {
    setSettings((current) => {
      if (current === null) return current
      let tasks = selection === null
        ? current.ai.tasks.filter((task) => task.task !== 'posting_parse')
        : current.ai.tasks
      if (selection !== null) {
        tasks = tasks.some((task) => task.task === 'posting_parse')
          ? tasks.map((task) => task.task === 'posting_parse' ? selection : task)
          : [...tasks, selection]
      }
      return { ...current, ai: { ...current.ai, tasks } }
    })
  }

  return (
    <section className="api-settings" aria-labelledby="settings-providers-title">
      <header className="api-settings__header">
        <h2 id="settings-providers-title" className="api-settings__section-title">Providers</h2>
        <div className="api-settings__actions">
          <button id="settings-refresh-providers" type="button" className="api-settings__refresh" aria-label="Refresh providers"
            title="Refresh providers and parsing settings" disabled={busy} onClick={handleRefresh}>
            <IconRefresh size={20} aria-hidden="true" />
          </button>
          {/* Keep the modal's opener focusable for restoration. Native modality
              and the synchronous activity guard still block background writes. */}
          <button type="button" className="button--primary api-settings__add"
            disabled={isLoading || isTaskSaving || (modal !== null && !isCreateOpen) || error !== null || providers === null}
            onClick={() => {
              if (activity.current !== null) return
              activity.current = 'create'
              setNotice(null)
              setModal({ kind: 'create' })
            }}>
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
                <div className="api-settings__provider-actions">
                  {(['edit', 'key', 'delete'] as const).map((mode) => <button key={mode} type="button"
                    disabled={isLoading || isTaskSaving || error !== null || (modal !== null && !(modal.kind === 'manage' && modal.provider.provider_key === provider.provider_key && modal.mode === mode))}
                    onClick={() => openManage(provider, mode)}>
                    {mode === 'edit' ? 'Edit provider' : mode === 'key' ? 'Replace API key' : 'Delete provider'}
                  </button>)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="api-settings__note">Budgets are saved preferences, not spending limits. API keys are not displayed here.</p>
      {isCreateOpen && <CreateAIProviderDialog onCreated={handleCreated} onClose={closeModal} />}
      {modal?.kind === 'manage' && <ManageAIProviderDialog provider={modal.provider} mode={modal.mode}
        references={settings?.ai.tasks.filter((task) => task.provider_key === modal.provider.provider_key) ?? []}
        onUpdated={handleUpdated} onDeleted={handleDeleted} onClose={closeModal}
        onKeyReplaced={() => { closeModal(); setNotice('API key replaced. It has not been tested with the provider.') }} />}
      {settings !== null && <PostingParseSettings key={loadedVersion} providers={settings.ai.providers} tasks={settings.ai.tasks}
        disabled={busy || error !== null} onBegin={beginTaskWrite} onSaved={handleTaskSaved}
        onEnd={() => { activity.current = null; setIsTaskSaving(false) }} />}
    </section>
  )
}
