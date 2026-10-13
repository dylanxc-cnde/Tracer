import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { IconX } from '@tabler/icons-react'
import { createAIProvider } from '../../../settings/api/settings'
import type { AIProvider, AIProviderSettings } from '../../../settings/types/appSettings'
import './CreateAIProviderDialog.css'

type CreateAIProviderDialogProps = {
  onCreated: (provider: AIProviderSettings) => void
  onClose: () => void
}

export function CreateAIProviderDialog({ onCreated, onClose }: CreateAIProviderDialogProps) {
  const [provider, setProvider] = useState<AIProvider>('openai')
  const [displayName, setDisplayName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [budget, setBudget] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<{ message: string; fromRequest: boolean } | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const budgetRef = useRef<HTMLInputElement>(null)
  const isMounted = useRef(false)
  const isSubmitting = useRef(false)

  useEffect(() => {
    isMounted.current = true
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    dialog?.showModal()
    dialog?.querySelector('select')?.focus()
    return () => {
      isMounted.current = false
      dialog?.close()
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [])

  function handleClose() {
    if (!isSubmitting.current) onClose()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting.current) return
    setError(null)
    const monthlyBudget = budget.trim() === '' ? null : Number(budget)
    let invalidField: string | null = null
    let validationError: string | null = null
    if (!displayName.trim()) {
      invalidField = 'provider-display-name'
      validationError = 'Enter a display name.'
    } else if (!apiKey.trim()) {
      invalidField = 'provider-api-key'
      validationError = 'Enter an API key.'
    } else if (budgetRef.current?.validity.badInput || (monthlyBudget !== null && (!Number.isFinite(monthlyBudget) || monthlyBudget < 0))) {
      invalidField = 'provider-budget'
      validationError = 'Enter a finite monthly budget of zero or more, or leave it empty.'
    }
    if (validationError) {
      setError({ message: validationError, fromRequest: false })
      dialogRef.current?.querySelector<HTMLElement>(`#${invalidField}`)?.focus()
      return
    }

    // Block a second submit/close immediately, before React renders disabled controls.
    isSubmitting.current = true
    setIsSaving(true)
    try {
      const created = await createAIProvider({
        provider,
        display_name: displayName.trim(),
        api_key: apiKey,
        monthly_budget_usd: monthlyBudget,
      })
      if (isMounted.current) onCreated(created)
    } catch (caught) {
      // The API helper supplies safe messages, never the raw response or secret.
      if (isMounted.current) setError({
        message: caught instanceof Error ? caught.message : 'Could not confirm provider creation. Check your providers before retrying.',
        fromRequest: true,
      })
    } finally {
      isSubmitting.current = false
      if (isMounted.current) setIsSaving(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="create-provider-dialog"
      aria-labelledby="create-provider-title" aria-describedby="create-provider-description"
      onCancel={(event) => { event.preventDefault(); handleClose() }}>
      <header className="create-provider-dialog__header">
        <h2 id="create-provider-title">Add provider</h2>
        <button type="button" className="create-provider-dialog__close" aria-label="Close add provider"
          disabled={isSaving} onClick={handleClose}><IconX size={20} aria-hidden="true" /></button>
      </header>
      <form className="create-provider-dialog__form" noValidate aria-busy={isSaving} onSubmit={handleSubmit}>
        <div className="create-provider-dialog__fields">
          <p id="create-provider-description">Save a provider and its API key. Model and task selection will be added separately.</p>
          <label htmlFor="provider-platform">Platform
            <select id="provider-platform" value={provider} disabled={isSaving} onChange={(event) => {
              const value = event.target.value
              if (value === 'openai' || value === 'deepseek') setProvider(value)
            }}>
              <option value="openai">OpenAI</option>
              <option value="deepseek">DeepSeek</option>
            </select>
          </label>
          <label htmlFor="provider-display-name">Display name
            <input id="provider-display-name" value={displayName} required disabled={isSaving}
              autoComplete="off" onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <label htmlFor="provider-api-key">API key
            <input id="provider-api-key" type="password" value={apiKey} required disabled={isSaving}
              autoComplete="new-password" spellCheck={false} autoCapitalize="none"
              aria-describedby="provider-key-help" onChange={(event) => setApiKey(event.target.value)} />
          </label>
          <p id="provider-key-help" className="create-provider-dialog__help">Stored in system credential storage, separately from your settings. Saving does not test the key.</p>
          <label htmlFor="provider-budget">Monthly budget (USD) · Optional
            <input ref={budgetRef} id="provider-budget" type="number" min="0" step="any" inputMode="decimal"
              value={budget} disabled={isSaving} aria-describedby="provider-budget-help"
              onChange={(event) => setBudget(event.target.value)} />
          </label>
          <p id="provider-budget-help" className="create-provider-dialog__help">Leave empty for no budget setting. This does not enforce a spending limit.</p>
          {error && <div className="create-provider-dialog__error" role="alert">
            <p>{error.message}</p>
            {error.fromRequest && <p>If the result cannot be confirmed, close this dialog and refresh the list before trying again.</p>}
          </div>}
          {isSaving && <p role="status">Saving provider… Please keep this dialog open.</p>}
        </div>
        <footer className="create-provider-dialog__footer">
          <button type="button" disabled={isSaving} onClick={handleClose}>Cancel</button>
          <button type="submit" className="button--primary" disabled={isSaving}>{isSaving ? 'Saving…' : 'Add provider'}</button>
        </footer>
      </form>
    </dialog>
  )
}
