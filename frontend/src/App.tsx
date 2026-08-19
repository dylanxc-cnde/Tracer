import { useState } from 'react'
import './App.css'

function App() {
  const [postingText, setPostingText] = useState('')

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

      <button type="button">Analyze</button>
    </main>
  )
}

export default App