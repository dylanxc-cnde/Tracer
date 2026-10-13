// Open /tests/settings-providers.html on the Vite dev server.
// Uses real React and native dialogs without adding a test framework or DOM emulator.
import { act, StrictMode } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { ApiSettings } from '../src/components/settings/api/ApiSettings'
import { CreateAIProviderDialog } from '../src/components/settings/api/CreateAIProviderDialog'
import { SettingsPage } from '../src/pages/SettingsPage'
import type { AIProviderSettings } from '../src/settings/types/appSettings'
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import '../src/index.css'
import '../src/App.css'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const host = document.querySelector<HTMLDivElement>('#test-host')!
host.style.cssText = 'padding:24px;min-height:720px;background:var(--color-surface);text-align:left'
document.body.style.cssText = 'display:block;overflow:auto;padding:24px'
const results = document.querySelector<HTMLOListElement>('#results')!
const summary = document.querySelector<HTMLParagraphElement>('#result-summary')!
let root: Root | null = null
let calls: { url: string; method: string; body: string | undefined }[] = []
let respond: (method: string, body?: string) => Promise<Response>

// Never fall through to the real fetch, even for an unexpected request.
window.fetch = async (input, init) => {
  const url = String(input)
  const method = init?.method ?? 'GET'
  const body = typeof init?.body === 'string' ? init.body : undefined
  calls.push({ url, method, body })
  if (url !== 'http://127.0.0.1:8000/settings' && url !== 'http://127.0.0.1:8000/settings/ai/providers') {
    throw new Error('Unexpected test endpoint')
  }
  return respond(method, body)
}

const provider: AIProviderSettings = {
  provider_key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  provider: 'openai', display_name: 'test_provider', monthly_budget_usd: null,
}
const otherProvider: AIProviderSettings = {
  provider_key: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  provider: 'deepseek', display_name: 'test_second_provider', monthly_budget_usd: 0,
}
function settings(providers: AIProviderSettings[] = []) {
  return Response.json({ user: { display_name: null }, ai: { providers, tasks: [] } })
}
function deferred() {
  let resolve!: (response: Response) => void
  let reject!: (error: Error) => void
  const promise = new Promise<Response>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
function element<T extends Element = HTMLElement>(selector: string): T {
  const found = host.querySelector<T>(selector)
  assert(found, `Missing element: ${selector}`)
  return found
}
async function waitFor(check: () => boolean) {
  const deadline = performance.now() + 2000
  while (!check()) {
    assert(performance.now() < deadline, 'Timed out waiting for UI to settle')
    // Native Response.json() may finish in a later browser task, outside act's microtasks.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
  }
}
async function mount(content: ReactNode = <ApiSettings />, waitForLoad = true) {
  root = createRoot(host)
  await act(async () => { root!.render(<StrictMode>{content}</StrictMode>) })
  if (waitForLoad) await waitFor(() => !host.querySelector('.api-settings__group[aria-busy="true"]'))
}
async function unmount() {
  await act(async () => { root?.unmount(); root = null })
}
async function click(selector: string) {
  await act(async () => {
    const button = element<HTMLButtonElement>(selector)
    button.focus()
    button.click()
  })
  if (selector === refresh) await waitFor(() => !host.querySelector('.api-settings__group[aria-busy="true"]'))
}
async function input(selector: string, value: string) {
  await act(async () => {
    const field = element<HTMLInputElement | HTMLSelectElement>(selector)
    const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value)
    field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}
async function submit(times = 1, waitForResult = true) {
  await act(async () => {
    for (let i = 0; i < times; i++) element('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  if (waitForResult) await waitFor(() => !host.querySelector('form[aria-busy="true"]'))
}
async function fill(budget = '', platform = 'openai') {
  await input('#provider-platform', platform)
  await input('#provider-display-name', '  test_provider  ')
  await input('#provider-api-key', ' test_fake_secret ')
  await input('#provider-budget', budget)
}
async function cancel() {
  await act(async () => { element('dialog').dispatchEvent(new Event('cancel', { cancelable: true })) })
}
const add = '.api-settings__add'
const refresh = '[aria-label="Refresh providers"]'
let passed = 0
let failed = 0
async function test(name: string, run: () => Promise<void>) {
  calls = []
  respond = async () => settings()
  const result = document.createElement('li')
  results.append(result)
  try {
    await run()
    passed++
    result.textContent = `PASS: ${name}`
  } catch (error) {
    failed++
    result.textContent = `FAIL: ${name}: ${error instanceof Error ? error.message : 'Unknown test error'}`
  } finally {
    await unmount()
  }
}

async function runTests() {
  await test('Initial loading disables creation; StrictMode reuses one GET', async () => {
    const pending = deferred()
    respond = () => pending.promise
    await mount(<ApiSettings />, false)
    assert(element<HTMLButtonElement>(add).disabled, 'Creation enabled before GET')
    assert(!host.textContent?.includes('No providers added'), 'Loading shown as empty')
    assert(calls.length === 1, 'StrictMode sent duplicate GET')
    await act(async () => { pending.resolve(settings()) })
    await waitFor(() => !element<HTMLButtonElement>(add).disabled)
    assert(!element<HTMLButtonElement>(add).disabled, 'Creation stayed disabled')
    assert(host.textContent?.includes('No providers added yet'), 'Missing empty state')
  })
  await test('Initial read failure is not empty; refresh recovers', async () => {
    respond = async () => new Response(null, { status: 500 })
    await mount()
    assert(element<HTMLButtonElement>(add).disabled, 'Creation allowed after read failure')
    assert(element('[role="alert"]'), 'Missing read error')
    assert(!host.textContent?.includes('No providers added'), 'Read error shown as empty')
    respond = async () => settings([provider, otherProvider])
    await click(refresh)
    assert(host.querySelectorAll('.api-settings__row').length === 2, 'Refresh did not load rows')
    assert(host.textContent?.includes('Budget not set') && host.textContent.includes('$0.00'), 'Null and zero budgets conflated')
    assert(host.textContent.includes('OpenAI') && host.textContent.includes('DeepSeek'), 'Missing platform labels')
    assert(!host.textContent.includes('aaaaaaaa'), 'Internal UUID displayed')
  })
  await test('Failed refresh preserves the last loaded list and marks it stale', async () => {
    respond = async () => settings([provider])
    await mount()
    respond = async () => { throw new Error('test_network_error') }
    await click(refresh)
    assert(host.querySelectorAll('.api-settings__row').length === 1, 'Refresh failure erased rows')
    assert(element('[role="alert"]').textContent?.includes('last loaded list'), 'Missing stale-list explanation')
  })
  await test('Cancel/Escape discard the draft, keep the list, and return focus', async () => {
    await mount()
    await click(add)
    assert(element<HTMLDialogElement>('dialog').matches(':modal'), 'Dialog is not modal')
    assert(document.activeElement?.id === 'provider-platform', 'Missing initial field focus')
    await fill()
    await click('.create-provider-dialog__footer button[type="button"]')
    assert(!host.querySelector('dialog'), 'Cancel did not close')
    assert(document.activeElement === element(add), 'Focus not restored to Add provider')
    await click(add)
    assert(element<HTMLInputElement>('#provider-api-key').value === '', 'Secret retained after reopening')
    await cancel()
    assert(!host.querySelector('dialog'), 'Escape did not close idle dialog')
    assert(calls.length === 1, 'Closing sent a request')
  })
  await test('Blank name/key and negative budget do not submit', async () => {
    await mount()
    await click(add)
    await input('#provider-display-name', '   ')
    await submit()
    assert(element('[role="alert"]').textContent?.includes('display name'), 'Missing name validation')
    await input('#provider-display-name', 'test_provider')
    await input('#provider-api-key', '   ')
    await submit()
    assert(element('[role="alert"]').textContent?.includes('Enter an API key'), 'Missing key validation')
    await fill('-1')
    await submit()
    assert(element('[role="alert"]').textContent?.includes('zero or more'), 'Missing budget validation')
    assert(calls.every((call) => call.method === 'GET'), 'Invalid draft submitted')
  })
  for (const [platform, budget, expectedBudget] of [['openai', '', null], ['deepseek', '0', 0], ['openai', '12.5', 12.5]] as const) {
    await test(`${platform} creation sends correct fields/budget ${budget || 'unset'} and appends the returned provider`, async () => {
      respond = async (method) => method === 'GET' ? settings([otherProvider]) : Response.json({
        ...provider, provider: platform, display_name: 'test_server_name', monthly_budget_usd: expectedBudget,
      }, { status: 201 })
      await mount()
      await click(add)
      await fill(budget, platform)
      assert(element<HTMLInputElement>('#provider-api-key').type === 'password', 'Secret is not masked')
      await submit()
      assert(calls.length === 2, 'Unexpected retry or extra GET')
      const request = JSON.parse(calls[1].body!)
      assert(request.provider === platform && request.display_name === 'test_provider', 'Platform/name mismatch')
      assert(request.api_key === ' test_fake_secret ', 'Secret was modified')
      assert(request.monthly_budget_usd === expectedBudget, 'Budget value mismatch')
      assert(!Object.hasOwn(request, 'provider_key'), 'Frontend generated a UUID')
      assert(!host.querySelector('dialog'), 'Success did not close dialog')
      assert(host.querySelectorAll('.api-settings__row').length === 2, 'Existing row lost')
      assert(host.textContent?.includes('test_server_name'), 'Did not use server response')
      assert(!host.textContent.includes('test_fake_secret'), 'Secret displayed in list')
    })
  }
  await test('Saving blocks close/Escape/duplicate submit and disables fields', async () => {
    const pending = deferred()
    respond = async (method) => method === 'GET' ? settings() : pending.promise
    await mount()
    await click(add)
    await fill()
    await submit(2, false)
    await cancel()
    await click('[aria-label="Close add provider"]')
    assert(element<HTMLDialogElement>('dialog').open, 'Saving dialog closed')
    assert([...host.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('dialog input, dialog select, dialog button')].every((field) => field.disabled), 'Saving controls remain enabled')
    assert(calls.filter((call) => call.method === 'POST').length === 1, 'Duplicate submission')
    await act(async () => { pending.resolve(Response.json(provider, { status: 201 })) })
    await waitFor(() => !host.querySelector('dialog'))
    assert(!host.querySelector('dialog'), 'Successful save left dialog open')
  })
  for (const [code, phrase] of [
    ['settings.ai_provider_creation_error', 'No new API key was retained'],
    ['settings.ai_provider_cleanup_error', 'cleanup could not be confirmed'],
    ['settings.ai_provider_settings_error', 'No provider was created'],
  ]) {
    await test(`${code} preserves the draft and exposes only a safe error`, async () => {
      respond = async (method) => method === 'GET' ? settings() : Response.json({ detail: { code, message: 'test_fake_secret' } }, { status: 500 })
      await mount()
      await click(add)
      await fill()
      await submit()
      assert(element('[role="alert"]').textContent?.includes(phrase), 'Missing safe failure message')
      assert(element<HTMLInputElement>('#provider-api-key').value === ' test_fake_secret ', 'Failed save discarded draft')
      assert(!element<HTMLInputElement>('#provider-api-key').disabled, 'Failure did not release controls')
      assert(!element('[role="alert"]').textContent?.includes('test_fake_secret'), 'Raw error leaked a secret')
      assert(!host.querySelector('.api-settings__row'), 'Failed provider added to list')
    })
  }
  await test('Unknown POST outcome does not retry; close and refresh can reconcile a saved provider', async () => {
    respond = async (method) => {
      if (method === 'POST') throw new Error('test_fake_secret')
      return settings()
    }
    await mount()
    await click(add)
    await fill()
    await submit()
    assert(element('[role="alert"]').textContent?.includes('before retrying'), 'Missing uncertain-outcome warning')
    assert(calls.length === 2, 'Unknown result retried automatically')
    await cancel()
    respond = async () => settings([provider])
    await click(refresh)
    assert(host.querySelectorAll('.api-settings__row').length === 1, 'Refresh did not reconcile server state')
  })
  for (const outcome of ['success', 'failure'] as const) {
    await test(`Unmount ignores a late creation ${outcome} without invoking callbacks`, async () => {
      const pending = deferred()
      respond = () => pending.promise
      let callbackCount = 0
      await mount(<CreateAIProviderDialog onCreated={() => callbackCount++} onClose={() => callbackCount++} />)
      await fill()
      await submit(1, false)
      await unmount()
      let bodyRead = false
      const lateResponse = Response.json(provider, { status: 201 })
      const readJson = lateResponse.json.bind(lateResponse)
      lateResponse.json = async () => {
        const body = await readJson()
        bodyRead = true
        return body
      }
      await act(async () => {
        if (outcome === 'success') pending.resolve(lateResponse)
        else pending.reject(new Error('test_network_error'))
      })
      if (outcome === 'success') await waitFor(() => bodyRead)
      assert(callbackCount === 0 && host.textContent === '', 'Late result updated the unmounted page')
      assert(calls.length === 1, 'Unmount retried/cancelled through another request')
    })
  }
  await test('Leaving during GET then returning does not overwrite the new list', async () => {
    const pending = deferred()
    respond = () => pending.promise
    await mount(<ApiSettings />, false)
    await unmount()
    respond = async () => settings([otherProvider])
    await mount()
    let bodyRead = false
    const lateResponse = settings([provider])
    const readJson = lateResponse.json.bind(lateResponse)
    lateResponse.json = async () => {
      const body = await readJson()
      bodyRead = true
      return body
    }
    await act(async () => { pending.resolve(lateResponse) })
    await waitFor(() => bodyRead)
    assert(host.textContent?.includes('test_second_provider') && !host.textContent.includes('test_provider'), 'Old GET replaced new list')
  })
  summary.textContent = `${passed} passed, ${failed} failed`
  summary.dataset.status = failed === 0 ? 'passed' : 'failed'
}

if (new URLSearchParams(location.search).has('preview')) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false })
  const previewProviders = [provider, { ...otherProvider, monthly_budget_usd: 20 }]
  respond = async (method, body) => {
    if (method === 'GET') return settings(previewProviders)
    const request = JSON.parse(body!)
    const created = { provider_key: crypto.randomUUID(), provider: request.provider, display_name: request.display_name, monthly_budget_usd: request.monthly_budget_usd }
    previewProviders.push(created)
    return Response.json(created, { status: 201 })
  }
  summary.textContent = 'Isolated preview: changes exist only in this page’s memory.'
  host.style.height = '800px'
  createRoot(host).render(<StrictMode><SettingsPage /></StrictMode>)
} else {
  void runTests()
}
