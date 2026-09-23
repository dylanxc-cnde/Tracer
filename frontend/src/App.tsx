import { useState } from 'react'
import './App.css'
import { CardLibraryPage } from './pages/CardLibraryPage'
import { HomePage } from './pages/HomePage'
import { ImportHistoryPage } from './pages/ImportHistoryPage'
import { PostingImportPage } from './pages/PostingImportPage'
import { SettingsPage } from './pages/SettingsPage'

type AppPage =
  | 'home'
  | 'posting-import'
  | 'card-library'
  | 'import-history'
  | 'settings'

function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>('posting-import')

  return (
    <main className="app-shell">
      <h1 className="app-shell__brand">Tracer</h1>
      <p className="app-shell__tagline">
        Review job postings before saving them.
      </p>

      <nav className="app-shell__navigation" aria-label="Main navigation">
        <button
          className="app-shell__navigation-button"
          type="button"
          onClick={() => setCurrentPage('home')}
          disabled={currentPage === 'home'}
        >
          Home
        </button>

        <button
          className="app-shell__navigation-button"
          type="button"
          onClick={() => setCurrentPage('posting-import')}
          disabled={currentPage === 'posting-import'}
        >
          Import posting
        </button>

        <button
          className="app-shell__navigation-button"
          type="button"
          onClick={() => setCurrentPage('card-library')}
          disabled={currentPage === 'card-library'}
        >
          Card library
        </button>

        <button
          className="app-shell__navigation-button"
          type="button"
          onClick={() => setCurrentPage('import-history')}
          disabled={currentPage === 'import-history'}
        >
          Import history
        </button>

        <button
          className="app-shell__navigation-button"
          type="button"
          onClick={() => setCurrentPage('settings')}
          disabled={currentPage === 'settings'}
        >
          Settings
        </button>
      </nav>

      <p className="app-shell__current-page">Current page: {currentPage}</p>

      {currentPage === 'home' && <HomePage />}
      {currentPage === 'posting-import' && <PostingImportPage />}
      {currentPage === 'card-library' && <CardLibraryPage />}
      {currentPage === 'import-history' && <ImportHistoryPage />}
      {currentPage === 'settings' && <SettingsPage />}
    </main>
  )
}

export default App
