import { useState } from 'react'
import { ArrowCounterclockwise, Clock, GearAlt, House, Search, SquareStack, TrayArrowDown } from 'framework7-icons/react'
import './App.css'
import { ActivityPage } from './pages/ActivityPage'
import { CardLibraryPage } from './pages/CardLibraryPage'
import { HomePage } from './pages/HomePage'
import { ImportHistoryPage } from './pages/ImportHistoryPage'
import { PostingImportPage } from './pages/PostingImportPage'
import { SettingsPage } from './pages/SettingsPage'

type AppPage =
  | 'home'
  | 'posting-import'
  | 'card-library'
  | 'activity'
  | 'import-history'
  | 'settings'

function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>('posting-import')

  return (
    <div className="app-shell">
      <header className="app-shell__topbar">
        <p className="app-shell__brand">Tracer</p>

        {/* Search and its shortcut hint are visual placeholders only. */}
        <div className="app-shell__search-placeholder">
          <Search aria-hidden="true" focusable="false" />
          <span>Search your workspace…</span>
          <kbd
            className="app-shell__search-shortcut"
            title="Shortcut preview only"
            aria-hidden="true"
          >
            Ctrl K
          </kbd>
        </div>

        <div className="app-shell__topbar-meta">
          <span className="app-shell__preview-badge">UI preview</span>
          <span className="app-shell__avatar" role="img" aria-label="Demo profile placeholder">D</span>
        </div>
      </header>

      <nav className="app-shell__navigation" aria-label="Main navigation">
        <button
          className="app-shell__navigation-button"
          type="button"
          onClick={() => setCurrentPage('home')}
          aria-current={currentPage === 'home' ? 'page' : undefined}
        >
          <House aria-hidden="true" focusable="false" />
          <span className="app-shell__navigation-label">Home</span>
        </button>

        <button
          className="app-shell__navigation-button"
          type="button"
          onClick={() => setCurrentPage('card-library')}
          aria-current={currentPage === 'card-library' ? 'page' : undefined}
        >
          <SquareStack aria-hidden="true" focusable="false" />
          <span className="app-shell__navigation-label">Card library</span>
        </button>

        <button
          className="app-shell__navigation-button"
          type="button"
          onClick={() => setCurrentPage('posting-import')}
          aria-current={currentPage === 'posting-import' ? 'page' : undefined}
        >
          <TrayArrowDown aria-hidden="true" focusable="false" />
          <span className="app-shell__navigation-label">Import posting</span>
        </button>

        <button
          className="app-shell__navigation-button"
          type="button"
          onClick={() => setCurrentPage('activity')}
          aria-current={currentPage === 'activity' ? 'page' : undefined}
        >
          <Clock aria-hidden="true" focusable="false" />
          <span className="app-shell__navigation-label">Activity</span>
        </button>

        <button
          className="app-shell__navigation-button"
          type="button"
          onClick={() => setCurrentPage('import-history')}
          aria-current={currentPage === 'import-history' ? 'page' : undefined}
        >
          <ArrowCounterclockwise aria-hidden="true" focusable="false" />
          <span className="app-shell__navigation-label">Import history</span>
        </button>

        <button
          className="app-shell__navigation-button app-shell__navigation-button--settings"
          type="button"
          onClick={() => setCurrentPage('settings')}
          aria-current={currentPage === 'settings' ? 'page' : undefined}
        >
          <GearAlt aria-hidden="true" focusable="false" />
          <span className="app-shell__navigation-label">Settings</span>
        </button>
      </nav>

      {/* Recreate only the page container so its scroll position starts at the top. */}
      <main key={currentPage} className={`app-shell__content app-shell__content--${currentPage}`}>
        {currentPage === 'home' && <HomePage />}
        {currentPage === 'posting-import' && <PostingImportPage />}
        {currentPage === 'card-library' && <CardLibraryPage />}
        {currentPage === 'activity' && <ActivityPage />}
        {currentPage === 'import-history' && <ImportHistoryPage />}
        {currentPage === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}

export default App
