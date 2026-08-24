import { useState } from 'react'
import './App.css'
import { CardLibraryPage } from './pages/CardLibraryPage'
import { ImportHistoryPage } from './pages/ImportHistoryPage'
import { PostingImportPage } from './pages/PostingImportPage'

type AppPage =
  | 'posting-import'
  | 'card-library'
  | 'import-history'

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
      </nav>

      <p className="app-shell__current-page">Current page: {currentPage}</p>

      {currentPage === 'posting-import' && <PostingImportPage />}
      {currentPage === 'card-library' && <CardLibraryPage />}
      {currentPage === 'import-history' && <ImportHistoryPage />}
    </main>
  )
}

export default App
