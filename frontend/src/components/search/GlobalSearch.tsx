import { useEffect, useId, useRef, useState } from 'react'
import { IconSearch, IconX } from '@tabler/icons-react'
import { getSearchResults } from '../../search/api/search'
import type { SearchResult, SearchResults } from '../../search/types/search'
import { SearchResultViewer } from './SearchResultViewer'
import './GlobalSearch.css'

export function GlobalSearch({ onGoHome }: { onGoHome: () => void }) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [data, setData] = useState<SearchResults | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [attempt, setAttempt] = useState(0)
  const [selection, setSelection] = useState<SearchResult | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const generation = useRef(0)
  const restoringFocus = useRef(false)
  const returnFocus = useRef(false)
  const listId = useId()
  const helpId = useId()

  function open() {
    if (restoringFocus.current || isOpen || selection) return
    setIsOpen(true)
    setIsLoading(Boolean(query.trim()))
    setData(null)
    setError(null)
    setActiveIndex(-1)
  }
  function dismiss(restoreFocus = false) {
    generation.current += 1
    setIsOpen(false)
    if (restoreFocus) {
      restoringFocus.current = true
      input.current?.focus({ preventScroll: true })
      restoringFocus.current = false
    }
  }
  function changeQuery(value: string) {
    generation.current += 1
    setQuery(value)
    setIsOpen(true)
    setIsLoading(Boolean(value.trim()))
    setData(null)
    setError(null)
    setActiveIndex(-1)
  }
  function select(result: SearchResult) {
    dismiss()
    setSelection(result)
  }
  function closeViewer() {
    // Native dialog teardown may restore focus before our effect runs.
    restoringFocus.current = true
    returnFocus.current = true
    setSelection(null)
  }

  useEffect(() => {
    if (selection || !returnFocus.current) return
    returnFocus.current = false
    // Restore focus without reopening the panel or issuing another search.
    restoringFocus.current = true
    input.current?.focus({ preventScroll: true })
    restoringFocus.current = false
  }, [selection])

  useEffect(() => {
    if (!isOpen || !query.trim()) return
    const current = ++generation.current
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void getSearchResults(query.trim(), controller.signal).then(result => {
        if (controller.signal.aborted || current !== generation.current) return
        setData(result)
        setActiveIndex(result.results.length ? 0 : -1)
        setIsLoading(false)
      }).catch(() => {
        if (controller.signal.aborted || current !== generation.current) return
        setError('Local search could not be loaded. Please try again.')
        setIsLoading(false)
      })
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query, isOpen, attempt])

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      // Never steal focus from an existing modal or another browser shortcut.
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) {
        event.preventDefault()
        input.current?.focus()
        input.current?.click()
      }
    }
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        generation.current += 1
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', shortcut)
    document.addEventListener('pointerdown', outside)
    return () => { window.removeEventListener('keydown', shortcut); document.removeEventListener('pointerdown', outside) }
  }, [])

  useEffect(() => {
    if (isOpen && activeIndex >= 0) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, isOpen, listId])

  const results = data?.results ?? []
  return <>
    <div className="global-search" ref={root} onKeyDown={event => {
      if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
        event.preventDefault()
        dismiss(true)
      }
    }} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) dismiss()
    }}>
      <div className="global-search__field">
        <IconSearch aria-hidden="true" />
        <input ref={input} type="text" role="combobox" aria-label="Search your workspace" placeholder="Search your workspace…"
          autoComplete="off" maxLength={200} value={query} aria-expanded={isOpen} aria-controls={isOpen ? listId : undefined}
          aria-autocomplete="list" aria-activedescendant={isOpen && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          aria-describedby={isOpen ? helpId : undefined} onFocus={open} onClick={open}
          onChange={event => changeQuery(event.target.value)} onKeyDown={event => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              if (!isOpen) { open(); return }
              if (results.length) setActiveIndex(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length)
            }
            if (event.key === 'Enter' && isOpen && activeIndex >= 0 && results[activeIndex]) { event.preventDefault(); select(results[activeIndex]) }
          }} />
        {query ? <button type="button" className="global-search__clear" aria-label="Clear search" onClick={() => { changeQuery(''); input.current?.focus() }}><IconX aria-hidden="true" /></button>
          : <kbd className="app-shell__search-shortcut" aria-hidden="true">Ctrl K</kbd>}
      </div>
      {isOpen && <section className="global-search__panel" aria-label="Local workspace search">
        <p id={helpId} className="global-search__help">Local records only · ↑ ↓ to choose · Enter to open · Esc to close</p>
        {!query.trim() && <p>Search saved jobs, companies, notes, tasks, events and applications.</p>}
        {isLoading && <p role="status">Searching local records…</p>}
        {error && <div><p role="alert">{error}</p><button type="button" onClick={() => { setError(null); setIsLoading(true); setAttempt(value => value + 1) }}>Retry search</button></div>}
        {data && !results.length && <p role="status">No local records match “{query.trim()}”.</p>}
        {data && results.length > 0 && <p className="global-search__count" role="status">{results.length} results{data.has_more ? ' · More matches available; narrow your search.' : ''}</p>}
        <ul id={listId} role="listbox" aria-label="Search results" aria-busy={isLoading}>
          {results.map((result, index) => <li key={`${result.type}:${result.target.id}`} role="presentation">
            <button id={`${listId}-${index}`} type="button" role="option" tabIndex={-1} aria-selected={activeIndex === index}
              onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => select(result)}>
              <span className="global-search__meta">{result.type} · {result.source}</span>
              <strong>{result.title}</strong>
              <span>{result.snippet}</span>
              {result.card_missing && <span className="global-search__missing">Linked job deleted · record retained</span>}
            </button>
          </li>)}
        </ul>
      </section>}
    </div>
    {selection && <SearchResultViewer key={`${selection.target.kind}:${selection.target.id}`} target={selection.target} onClose={closeViewer}
      onGoHome={() => { closeViewer(); onGoHome() }} />}
  </>
}
