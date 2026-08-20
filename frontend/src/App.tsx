import { useState } from 'react'
import './App.css'
import { createPostingImport, parsePostingImport } from './postings/api/postings'
import type { PostingParseResult } from './postings/types/postingParse'


function App() {
  const [postingText, setPostingText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [parseResult, setParseResult] = useState<PostingParseResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleAnalyze() {
    setIsLoading(true)
    setParseResult(null)
    setError(null)

    try {
      const postingImport = await createPostingImport({
        kind: 'text',
        text: postingText,
        source_url: null,
      })

      const result = await parsePostingImport(postingImport.import_key)

      setParseResult(result)
    } catch (caughtError: unknown) {
      if (caughtError instanceof Error) {
        setError(caughtError.message)
      } else {
        setError('Something went wrong.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main>
      <h1>Tracer</h1>
      <p>Review job postings before saving them.</p>

      <textarea
        placeholder="Paste a job posting here"
        value={postingText}
        onChange={(event) => setPostingText(event.target.value)}
      />

      <p>{postingText.length} characters</p>

      <button
        type="button"
        onClick={handleAnalyze}
        disabled={isLoading || postingText.trim().length === 0}
      >
        {isLoading ? 'Analyzing...' : 'Analyze'}
      </button>

      {error && <p role="alert">{error}</p>}

      {parseResult && (
        <pre>{JSON.stringify(parseResult, null, 2)}</pre>
      )}
    </main>
  )
}

export default App
