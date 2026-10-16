import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { IconX } from '@tabler/icons-react'
import { deleteAIProvider, replaceAIProviderKey, updateAIProvider } from '../../../settings/api/settings'
import type { AIProviderSettings, AITaskSettings } from '../../../settings/types/appSettings'
import './ManageAIProviderDialog.css'

export type ProviderOperation = 'edit' | 'key' | 'delete'

type Props = {
  provider: AIProviderSettings
  mode: ProviderOperation
  returnFocusId: string
  references: AITaskSettings[]
  onUpdated: (provider: AIProviderSettings) => void
  onDeleted: (providerKey: string) => void
  onKeyReplaced: () => void
  onClose: () => void
}

export function ManageAIProviderDialog({ provider, mode, returnFocusId, references, onUpdated, onDeleted, onKeyReplaced, onClose }: Props) {
  const [displayName, setDisplayName] = useState(provider.display_name)
  const [budget, setBudget] = useState(provider.monthly_budget_usd === null ? '' : String(provider.monthly_budget_usd))
  const [apiKey, setApiKey] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<{ message: string; fromRequest: boolean } | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const budgetRef = useRef<HTMLInputElement>(null)
  const isMounted = useRef(false)
  const isSubmitting = useRef(false)
  const title = mode === 'edit' ? 'Edit provider' : mode === 'key' ? 'Replace API key' : 'Delete provider'
  const referenced = references.length > 0

  useEffect(() => {
    isMounted.current = true
    const dialog = dialogRef.current
    dialog?.showModal()
    dialog?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus()
    return () => {
      isMounted.current = false
      dialog?.close()
      // The menu item opener is unmounted. Restore the persistent row trigger,
      // or the refresh action when a successful delete removed that row.
      const target = document.getElementById(returnFocusId) ?? document.getElementById('settings-refresh-providers')
      target?.focus()
    }
  }, [returnFocusId])

  function handleClose() {
    if (!isSubmitting.current) onClose()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting.current) return
    setError(null)
    const monthlyBudget = budget.trim() === '' ? null : Number(budget)
    let invalidField: string | null = null
    let message: string | null = null
    if (mode === 'edit' && !displayName.trim()) {
      invalidField = 'manage-provider-name'
      message = 'Enter a display name.'
    } else if (mode === 'edit' && (budgetRef.current?.validity.badInput
      || (monthlyBudget !== null && (!Number.isFinite(monthlyBudget) || monthlyBudget < 0)))) {
      invalidField = 'manage-provider-budget'
      message = 'Enter a finite monthly budget of zero or more, or leave it empty.'
    } else if (mode === 'key' && !apiKey.trim()) {
      invalidField = 'manage-provider-key'
      message = 'Enter an API key.'
    } else if (mode === 'delete' && (referenced || !confirmed)) {
      invalidField = 'manage-provider-confirm-delete'
      message = referenced ? 'Clear the task selections using this provider before deleting it.' : 'Confirm provider deletion.'
    }
    if (message) {
      setError({ message, fromRequest: false })
      dialogRef.current?.querySelector<HTMLElement>(`#${invalidField}`)?.focus()
      return
    }

    // This synchronous guard covers repeated events before disabled controls render.
    isSubmitting.current = true
    setIsSaving(true)
    try {
      if (mode === 'edit') {
        const updated = await updateAIProvider(provider.provider_key, {
          display_name: displayName.trim(), monthly_budget_usd: monthlyBudget,
        })
        if (updated.provider !== provider.provider) {
          throw new Error('Could not confirm the settings change. Refresh Settings before trying again.')
        }
        if (isMounted.current) onUpdated(updated)
      } else if (mode === 'key') {
        await replaceAIProviderKey(provider.provider_key, { api_key: apiKey })
        if (isMounted.current) onKeyReplaced()
      } else {
        await deleteAIProvider(provider.provider_key)
        if (isMounted.current) onDeleted(provider.provider_key)
      }
    } catch (caught) {
      if (isMounted.current) setError({
        message: caught instanceof Error ? caught.message : 'Could not confirm the settings change. Refresh Settings before trying again.',
        fromRequest: true,
      })
    } finally {
      isSubmitting.current = false
      if (isMounted.current) setIsSaving(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="manage-provider-dialog" aria-labelledby="manage-provider-title"
      aria-describedby="manage-provider-description" onCancel={(event) => { event.preventDefault(); handleClose() }}>
      <header className="manage-provider-dialog__header">
        <h2 id="manage-provider-title">{title}</h2>
        <button type="button" className="manage-provider-dialog__close" aria-label={`Close ${title.toLowerCase()}`}
          disabled={isSaving} onClick={handleClose}><IconX size={20} aria-hidden="true" /></button>
      </header>
      <form noValidate aria-busy={isSaving} onSubmit={handleSubmit}>
        <div className="manage-provider-dialog__fields">
          <p id="manage-provider-description">{provider.display_name} · {provider.provider === 'openai' ? 'OpenAI' : 'DeepSeek'}</p>
          <p>The provider platform cannot be changed. Its existing configuration and credential identity are preserved.</p>
          {mode === 'edit' && <>
            <label htmlFor="manage-provider-name">Display name
              <input id="manage-provider-name" value={displayName} disabled={isSaving} required
                autoComplete="off" onChange={(event) => setDisplayName(event.target.value)} />
            </label>
            <label htmlFor="manage-provider-budget">Monthly budget (USD) · Optional
              <input ref={budgetRef} id="manage-provider-budget" type="number" min="0" step="any" inputMode="decimal"
                value={budget} disabled={isSaving} onChange={(event) => setBudget(event.target.value)} />
            </label>
            <p>Leave empty for no budget setting; zero is saved as zero. Budgets are not spending limits. This edit does not change the API key.</p>
          </>}
          {mode === 'key' && <>
            <label htmlFor="manage-provider-key">New API key
              <input id="manage-provider-key" type="password" value={apiKey} disabled={isSaving} required
                autoComplete="new-password" spellCheck={false} autoCapitalize="none"
                onChange={(event) => setApiKey(event.target.value)} />
            </label>
            <p>The existing key is never displayed. The replacement is stored in system credential storage, not in your settings snapshot. Saving does not test it.</p>
          </>}
          {mode === 'delete' && <>
            <p>Delete this provider configuration and its stored API key. This cannot be undone. No task will be automatically disconnected.</p>
            {referenced ? <div role="alert">
              <p>This provider is used by these tasks:</p>
              <ul>{references.map((selection) => <li key={selection.task}>
                {selection.task === 'posting_parse' ? 'Posting parsing' : selection.task}
              </li>)}</ul>
              <p>Clear the selection before deleting. Other task selections without an editor cannot be cleared here.</p>
            </div> : <label className="manage-provider-dialog__confirmation" htmlFor="manage-provider-confirm-delete">
              <input id="manage-provider-confirm-delete" type="checkbox" checked={confirmed} disabled={isSaving}
                onChange={(event) => setConfirmed(event.target.checked)} />
              I confirm deletion of this provider and its API key.
            </label>}
          </>}
          {error && <div className="manage-provider-dialog__error" role="alert">
            <p>{error.message}</p>
            {error.fromRequest && <p>If the result is uncertain, close this dialog and refresh Settings before retrying. Refresh does not verify the stored API key.</p>}
          </div>}
          {isSaving && <p role="status">Saving changes… Please keep this dialog open.</p>}
        </div>
        <footer className="manage-provider-dialog__footer">
          <button type="button" disabled={isSaving} onClick={handleClose}>Cancel</button>
          <button type="submit" className={mode === 'delete' ? 'manage-provider-dialog__delete' : 'button--primary'}
            disabled={isSaving || (mode === 'delete' && (referenced || !confirmed))}>
            {isSaving ? 'Saving…' : mode === 'edit' ? 'Save changes' : title}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
