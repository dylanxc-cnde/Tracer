import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { clearPostingParseSettings, updatePostingParseSettings } from '../../../settings/api/settings'
import type { AIProviderSettings, AITaskSettings } from '../../../settings/types/appSettings'
import './PostingParseSettings.css'

type Props = {
  providers: AIProviderSettings[]
  tasks: AITaskSettings[]
  disabled: boolean
  onBegin: () => boolean
  onEnd: () => void
  onSaved: (selection: AITaskSettings | null) => void
}

export function PostingParseSettings({ providers, tasks, disabled, onBegin, onEnd, onSaved }: Props) {
  const selection = tasks.find((task) => task.task === 'posting_parse') ?? null
  const supported = providers.filter((provider) => provider.provider === 'openai')
  const supportedSelection = supported.some((provider) => provider.provider_key === selection?.provider_key)
  const [providerKey, setProviderKey] = useState(supportedSelection ? selection?.provider_key ?? '' : '')
  const [model, setModel] = useState(selection?.model ?? '')
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const isMounted = useRef(false)
  const isSubmitting = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)
  const changed = providerKey !== (selection?.provider_key ?? '') || model.trim() !== (selection?.model ?? '')
  const blocked = disabled || isSaving

  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  useEffect(() => {
    if (isEditing) {
      const target = formRef.current?.querySelector<HTMLElement>('#posting-parse-provider:not(:disabled)') ?? formRef.current
      target?.focus()
    } else if (wasEditing.current) editRef.current?.focus()
    wasEditing.current = isEditing
  }, [isEditing])

  function startDraft() {
    if (isSubmitting.current || disabled) return
    setProviderKey(supportedSelection ? selection?.provider_key ?? '' : '')
    setModel(selection?.model ?? '')
    setError(null)
    setNotice(null)
    setIsEditing(true)
  }

  function cancelDraft() {
    if (isSubmitting.current || disabled) return
    setProviderKey(supportedSelection ? selection?.provider_key ?? '' : '')
    setModel(selection?.model ?? '')
    setError(null)
    setNotice(null)
    setIsEditing(false)
  }

  async function saveSelection(clear: boolean) {
    if (isSubmitting.current || disabled || !isEditing) return
    setError(null)
    setNotice(null)
    if (!clear && !supported.some((provider) => provider.provider_key === providerKey)) {
      setError('Choose an OpenAI provider for posting parsing.')
      formRef.current?.querySelector<HTMLElement>('#posting-parse-provider')?.focus()
      return
    }
    if (!clear && !model.trim()) {
      setError('Enter a model for posting parsing.')
      formRef.current?.querySelector<HTMLElement>('#posting-parse-model')?.focus()
      return
    }
    if (clear && selection === null) return
    if (!onBegin()) return
    isSubmitting.current = true
    setIsSaving(true)
    try {
      let saved: AITaskSettings | null
      if (clear) {
        await clearPostingParseSettings()
        saved = null
      } else {
        saved = await updatePostingParseSettings({ provider_key: providerKey, model: model.trim() })
      }
      if (isMounted.current) {
        onSaved(saved)
        setProviderKey(saved?.provider_key ?? '')
        setModel(saved?.model ?? '')
        setNotice(saved === null ? 'Saved selection cleared. Future Analyze requests use environment defaults.' : 'Posting parsing settings saved. They apply to the next Analyze request.')
        setIsEditing(false)
      }
    } catch (caught) {
      if (isMounted.current) setError(caught instanceof Error ? caught.message : 'Could not confirm the settings change. Refresh Settings before trying again.')
    } finally {
      isSubmitting.current = false
      if (isMounted.current) {
        setIsSaving(false)
        onEnd()
      }
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void saveSelection(false)
  }

  return (
    <section className="posting-parse-settings" aria-labelledby="posting-parse-title">
      <div className="posting-parse-settings__header">
        <h2 id="posting-parse-title" className="api-settings__section-title">Posting parsing</h2>
        <button ref={editRef} type="button" disabled={blocked || isEditing} onClick={startDraft}
          aria-expanded={isEditing} aria-controls={isEditing ? 'posting-parse-draft' : undefined}>Edit parsing settings</button>
      </div>
      <div className="posting-parse-settings__summary">
        <p className="posting-parse-settings__label">Current saved selection · next Analyze request</p>
        <p className="posting-parse-settings__baseline">{selection === null
          ? 'Environment credentials and the built-in default model'
          : providers.find((provider) => provider.provider_key === selection.provider_key)?.display_name ?? 'Unavailable provider'}</p>
        {selection !== null && <p className="posting-parse-settings__model">{selection.model}</p>}
        <p>{selection === null ? 'Environment credentials and model availability have not been checked.' : 'The saved key, model and account capabilities have not been verified.'} Saving does not contact the provider.</p>
        <p>Analyze sends the imported posting to OpenAI and may incur provider charges. Settings budgets do not limit these charges.</p>
        {selection !== null && !supportedSelection && <p role="alert" className="posting-parse-settings__error">The saved provider is not supported for posting parsing. Choose an OpenAI provider or clear the saved selection; parsing will not silently fall back.</p>}
        {supported.length === 0 && <p>No OpenAI provider is available. Add an OpenAI provider above to configure parsing.</p>}
        {notice && <p role="status">{notice}</p>}
      </div>
      {isEditing && <form id="posting-parse-draft" ref={formRef} className="posting-parse-settings__form" noValidate
        tabIndex={-1} aria-labelledby="posting-parse-draft-title" onSubmit={handleSubmit} aria-busy={isSaving}>
        <h3 id="posting-parse-draft-title" className="posting-parse-settings__draft-title">Edit draft</h3>
        <p>Changes below are not active until saved. Only OpenAI is supported for parsing; DeepSeek configurations cannot be selected here.</p>
        <div className="posting-parse-settings__fields">
          <label htmlFor="posting-parse-provider">Parsing provider
            <select id="posting-parse-provider" value={providerKey} disabled={blocked || supported.length === 0}
              onChange={(event) => { setProviderKey(event.target.value); setError(null); setNotice(null) }}>
              <option value="">Choose an OpenAI provider</option>
              {supported.map((provider) => <option key={provider.provider_key} value={provider.provider_key}>{provider.display_name}</option>)}
            </select>
          </label>
          <label htmlFor="posting-parse-model">Parsing model
            <input id="posting-parse-model" value={model} disabled={blocked || supported.length === 0} required
              autoComplete="off" spellCheck={false} aria-describedby="posting-parse-model-help"
              placeholder="e.g. gpt-5.6-luna (unverified)" onChange={(event) => { setModel(event.target.value); setError(null); setNotice(null) }} />
          </label>
        </div>
        {providerKey && <p className="posting-parse-settings__draft-provider">Draft provider: {supported.find((provider) => provider.provider_key === providerKey)?.display_name}</p>}
        <p id="posting-parse-model-help">Enter an OpenAI model ID supporting Responses structured outputs and web search for URL parsing. Model and account availability are not checked here.</p>
        <details className="posting-parse-settings__technical">
          <summary>Model example and environment defaults</summary>
          <p>Technical example: gpt-5.6-luna is the current built-in code default, not a verified recommendation or model catalog. Confirm Responses structured output and web search support for your model and account before Analyze.</p>
          <p>Use environment defaults explicitly removes the saved posting_parse selection. Future Analyze requests then use environment credentials and the built-in model. An invalid saved selection never silently falls back.</p>
        </details>
        {error && <div role="alert" className="posting-parse-settings__error">
          <p>{error}</p><p>If the result is uncertain, use Refresh providers above to reload saved settings before retrying. Refresh does not verify API keys.</p>
        </div>}
        {isSaving && <p role="status">Saving parsing settings…</p>}
        <div className="posting-parse-settings__actions">
          <button type="submit" className="button--primary" disabled={blocked || !changed || supported.length === 0}>Save parsing settings</button>
          <button type="button" disabled={blocked} onClick={cancelDraft}>Cancel parsing changes</button>
          <button type="button" disabled={blocked || selection === null} onClick={() => { void saveSelection(true) }}>Use environment defaults</button>
        </div>
        <p>Unsaved changes are discarded when you leave this section or refresh. An already sent request is not cancelled by leaving; return and refresh to check its saved result.</p>
      </form>}
    </section>
  )
}
