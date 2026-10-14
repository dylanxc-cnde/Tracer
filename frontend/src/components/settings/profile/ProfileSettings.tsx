import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getSettings, updateUserSettings } from '../../../settings/api/settings'
import type { AppSettings, UserSettings } from '../../../settings/types/appSettings'
import './ProfileSettings.css'
import { CandidateWorkspace } from '../../profile/CandidateWorkspace'

export function ProfileSettings() {
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const workspaceTrigger = useRef<HTMLButtonElement>(null)
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSaved, setHasSaved] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const settingsRequest = useRef<Promise<AppSettings> | null>(null)

  const normalizedDisplayName = displayName.trim() || null
  const hasChanges = userSettings !== null
    && normalizedDisplayName !== userSettings.display_name

  useEffect(() => {
    let isActive = true
    // Reuse the request when Strict Mode replays this effect in development.
    const request = settingsRequest.current ??= getSettings()

    async function loadSettings() {
      try {
        const settings = await request
        if (isActive) {
          setUserSettings(settings.user)
          setDisplayName(settings.user.display_name ?? '')
        }
      } catch (caughtError: unknown) {
        if (isActive) {
          setError(caughtError instanceof Error
            ? caughtError.message
            : 'Something went wrong while loading your settings.')
        }
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    void loadSettings()
    return () => {
      isActive = false
    }
  }, [loadAttempt])

  function handleRetry() {
    setIsLoading(true)
    setError(null)
    settingsRequest.current = null
    setLoadAttempt((attempt) => attempt + 1)
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!hasChanges || isSaving) {
      return
    }

    setIsSaving(true)
    setError(null)
    setHasSaved(false)
    try {
      const settings = await updateUserSettings({ display_name: normalizedDisplayName })
      // Use the saved response as the next baseline, including server normalization.
      setUserSettings(settings.user)
      setDisplayName(settings.user.display_name ?? '')
      setHasSaved(true)
    } catch (caughtError: unknown) {
      setError(caughtError instanceof Error
        ? caughtError.message
        : 'Something went wrong while saving your name. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  function handleCancel() {
    setDisplayName(userSettings?.display_name ?? '')
    setError(null)
    setHasSaved(false)
  }

  return (
    <div className="profile-settings">
      <section aria-labelledby="settings-user-information-title">
        <h2 id="settings-user-information-title" className="profile-settings__section-title">
          User information
        </h2>
        <div className="profile-settings__group" aria-busy={isLoading || isSaving}>
          {isLoading ? (
            <p className="profile-settings__message" role="status">Loading your settings…</p>
          ) : userSettings === null ? (
            <div className="profile-settings__load-error">
              <p className="profile-settings__error" role="alert">{error}</p>
              <button type="button" onClick={handleRetry}>Try again</button>
            </div>
          ) : (
            <form onSubmit={handleSave}>
              <div className="profile-settings__field">
                <div>
                  <label htmlFor="settings-display-name">Display name</label>
                  <p id="settings-display-name-help">
                    Your name in personal settings. Leave blank to clear it.
                  </p>
                </div>
                <input
                  id="settings-display-name"
                  name="display_name"
                  type="text"
                  autoComplete="nickname"
                  aria-describedby="settings-display-name-help"
                  value={displayName}
                  disabled={isSaving}
                  onChange={(event) => {
                    setDisplayName(event.target.value)
                    setError(null)
                    setHasSaved(false)
                  }}
                />
              </div>
              {error && <p className="profile-settings__error" role="alert">{error}</p>}
              <div className="profile-settings__footer">
                <p className="profile-settings__status" role="status">
                  {isSaving ? 'Saving…' : hasSaved ? 'Changes saved.'
                    : hasChanges ? 'Unsaved changes' : 'Changes are saved only when you select Save changes.'}
                </p>
                <div className="profile-settings__actions">
                  <button type="button" onClick={handleCancel} disabled={isSaving || !hasChanges}>
                    Cancel
                  </button>
                  <button type="submit" className="button--primary" disabled={isSaving || !hasChanges}>
                    Save changes
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </section>

      <section aria-labelledby="settings-job-preferences-title">
        <h2 id="settings-job-preferences-title" className="profile-settings__section-title">
          Profile and job-search goal
        </h2>
        <div className="profile-settings__placeholder">
          <p>Confirm local evidence and job-search constraints for a Card match review. Unknown information can be skipped. Your display name stays separate.</p>
          <button type="button" ref={workspaceTrigger} aria-expanded={workspaceOpen} onClick={() => setWorkspaceOpen(true)}>Open Profile and Goal</button>
        </div>
        {workspaceOpen && <CandidateWorkspace onClose={() => { setWorkspaceOpen(false); workspaceTrigger.current?.focus() }} />}
      </section>
    </div>
  )
}
