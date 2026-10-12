import './ProfileSettings.css'

export function ProfileSettings() {
  return (
    <div className="profile-settings">
      <section aria-labelledby="settings-user-information-title">
        <h2 id="settings-user-information-title" className="profile-settings__section-title">
          User information
        </h2>
        <div className="profile-settings__placeholder">
          <p>User information settings will appear here.</p>
        </div>
      </section>

      <section aria-labelledby="settings-job-preferences-title">
        <h2 id="settings-job-preferences-title" className="profile-settings__section-title">
          Job preferences
        </h2>
        <div className="profile-settings__placeholder">
          <p>Job preference settings will appear here.</p>
        </div>
      </section>
    </div>
  )
}
