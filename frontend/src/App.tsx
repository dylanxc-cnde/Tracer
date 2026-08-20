import { useState } from 'react'
import './App.css'
import { createPostingImport } from './postings/api/postings'


function App() {
  const [postingText, setPostingText] = useState('')

  async function handleAnalyze() {
  const postingImport = await createPostingImport({
    kind: 'text',
    text: postingText,
    source_url: null,
  })

  console.log(postingImport)
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

      <button type="button" onClick={handleAnalyze}>Analyze</button>
    </main>
  )
}

export default App
