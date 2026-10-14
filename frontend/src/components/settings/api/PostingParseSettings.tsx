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
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const isMounted = useRef(false)
  const isSubmitting = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const changed = providerKey !== (selection?.provider_key ?? '') || model.trim() !== (selection?.model ?? '')
  const blocked = disabled || isSaving

  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  function cancelDraft() {
    if (isSubmitting.current || disabled) return
    setProviderKey(supportedSelection ? selection?.provider_key ?? '' : '')
    setModel(selection?.model ?? '')
    setError(null)
    setNotice(null)
  }

  async function saveSelection(clear: boolean) {
    if (isSubmitting.current || disabled) return
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
      <h2 id="posting-parse-title" className="api-settings__section-title">Posting parsing</h2>
      <p>Choose the provider and model used when you select Analyze for an imported posting. Saving does not contact the provider or verify the model or key.</p>
      <p>Only OpenAI is supported for parsing. DeepSeek configurations cannot be selected here.</p>
      <form ref={formRef} className="posting-parse-settings__form" noValidate onSubmit={handleSubmit} aria-busy={isSaving}>
        <p className="posting-parse-settings__baseline">{selection === null
          ? 'Saved: environment credentials and the built-in default model.'
          : `Saved: ${providers.find((provider) => provider.provider_key === selection.provider_key)?.display_name ?? 'Unavailable provider'} · ${selection.model}`}</p>
        {selection !== null && !supportedSelection && <p role="alert" className="posting-parse-settings__error">The saved provider is not supported for posting parsing. Choose an OpenAI provider or clear the saved selection; parsing will not silently fall back.</p>}
        {supported.length === 0 && <p>No OpenAI provider is available. Add an OpenAI provider above to configure parsing.</p>}
        <label htmlFor="posting-parse-provider">Parsing provider
          <select id="posting-parse-provider" value={providerKey} disabled={blocked || supported.length === 0}
            onChange={(event) => { setProviderKey(event.target.value); setError(null); setNotice(null) }}>
            <option value="">Choose an OpenAI provider</option>
            {supported.map((provider) => <option key={provider.provider_key} value={provider.provider_key}>{provider.display_name}</option>)}
          </select>
        </label>
        <label htmlFor="posting-parse-model">Parsing model
          <input id="posting-parse-model" value={model} disabled={blocked || supported.length === 0} required
            autoComplete="off" spellCheck={false} onChange={(event) => { setModel(event.target.value); setError(null); setNotice(null) }} />
        </label>
        <p>Enter a model that supports the existing structured posting parser and web search. Model availability is not checked here. Only clearing the saved selection restores the environment/default-model path.</p>
        {error && <div role="alert" className="posting-parse-settings__error">
          <p>{error}</p><p>If the result is uncertain, use Refresh providers above to reload saved settings before retrying. Refresh does not verify API keys.</p>
        </div>}
        {notice && <p role="status">{notice}</p>}
        {isSaving && <p role="status">Saving parsing settings…</p>}
        <div className="posting-parse-settings__actions">
          <button type="button" disabled={blocked || !changed} onClick={cancelDraft}>Cancel parsing changes</button>
          <button type="submit" className="button--primary" disabled={blocked || !changed || supported.length === 0}>Save parsing settings</button>
          <button type="button" disabled={blocked || selection === null} onClick={() => { void saveSelection(true) }}>Use environment defaults</button>
        </div>
        <p>Unsaved changes are discarded when you leave this section or refresh. An already sent request is not cancelled by leaving; return and refresh to check its saved result.</p>
      </form>
    </section>
  )
}
