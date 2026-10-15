import { expect, test } from '@playwright/test'

// Playwright only discovers this file; importing the management scenarios keeps the
// full provider/parsing maintenance journey, and the Profile/Goal/Match review
// scenarios, in the same closed-mock browser suite.
import './settings-management.browser.test.mjs'
import './profile-matching.browser.test.mjs'

test('successful provider creation appends the server result and reopens with an empty masked key', async ({ page, context, baseURL }) => {
  const savedProvider = {
    provider_key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    provider: 'openai',
    display_name: 'Existing test provider',
    monthly_budget_usd: null,
  }
  const createdProvider = {
    provider_key: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    provider: 'deepseek',
    display_name: 'Server returned provider',
    monthly_budget_usd: 12.5,
  }
  const displayName = '  New test provider  '
  const secretMarker = 'FAKE_SUCCESS_BROWSER_KEY_NOT_A_CREDENTIAL'
  const apiKey = `  ${secretMarker}  `
  const posts = []
  const unexpectedRequests = []
  let settingsGets = 0

  // GET never returns the new provider: only the POST response can add it.
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'GET' && request.url() === 'http://127.0.0.1:8000/settings') {
      settingsGets += 1
      await route.fulfill({ json: { user: { display_name: null }, ai: { providers: [savedProvider], tasks: [] } } })
    } else if (request.method() === 'POST' && request.url() === 'http://127.0.0.1:8000/settings/ai/providers') {
      posts.push(request.postDataJSON())
      await route.fulfill({ status: 201, json: createdProvider })
    } else if (url.origin === baseURL && request.method() === 'GET'
      && !['fetch', 'xhr'].includes(request.resourceType()) && !url.pathname.startsWith('/settings')) {
      await route.continue()
    } else {
      unexpectedRequests.push(`${request.method()} ${request.url()}`)
      await route.abort('blockedbyclient')
    }
  })
  await context.routeWebSocket('**/*', (socket) => {
    const url = new URL(socket.url())
    if (url.origin === baseURL.replace('http:', 'ws:') && url.pathname === '/') {
      socket.connectToServer()
    } else {
      unexpectedRequests.push(`WebSocket ${socket.url()}`)
      socket.close()
    }
  })

  await page.goto('/')
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'API', exact: true }).click()
  const providers = page.getByRole('list', { name: 'Saved providers' })
  await expect(providers.getByRole('listitem')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Add provider', exact: true })).toBeEnabled()
  const originalItem = await providers.getByRole('listitem').textContent()
  // Profile and API can each load settings; compare against the settled initial count.
  const initialSettingsGets = settingsGets
  expect(initialSettingsGets).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Add provider', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Add provider', exact: true })).toBeVisible()
  await dialog.getByRole('combobox', { name: 'Platform', exact: true }).selectOption('deepseek')
  await dialog.getByLabel('Display name', { exact: true }).fill(displayName)
  const key = dialog.getByLabel('API key', { exact: true })
  await key.fill(apiKey)
  await dialog.getByLabel('Monthly budget (USD) · Optional', { exact: true }).fill('12.5')
  await expect(key).toHaveAttribute('type', 'password')
  await dialog.getByRole('button', { name: 'Add provider', exact: true }).click()

  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0)
  const items = providers.getByRole('listitem')
  await expect(items).toHaveCount(2)
  await expect(items.filter({ has: page.getByRole('heading', { name: savedProvider.display_name, exact: true }) })).toHaveText(originalItem)
  const newItem = items.filter({ has: page.getByRole('heading', { name: createdProvider.display_name, exact: true }) })
  await expect(newItem).toHaveCount(1)
  await expect(newItem.getByRole('heading')).toHaveText(createdProvider.display_name)
  await expect(newItem).toContainText('DeepSeek')
  await expect(newItem).toContainText('$12.50')
  const notice = page.getByRole('status')
  await expect(notice).toContainText('Provider added. Its API key has not been tested with the provider.')
  await expect(providers).not.toContainText(secretMarker)
  await expect(notice).not.toContainText(secretMarker)
  expect(await page.locator('body').innerText()).not.toContain(secretMarker)
  expect(settingsGets).toBe(initialSettingsGets)

  await page.getByRole('button', { name: 'Add provider', exact: true }).click()
  const reopenedKey = page.getByRole('dialog').getByLabel('API key', { exact: true })
  await expect(reopenedKey).toHaveValue('')
  await expect(reopenedKey).toHaveAttribute('type', 'password')
  expect(await page.locator('body').innerText()).not.toContain(secretMarker)
  expect(settingsGets).toBe(initialSettingsGets)
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0)
  expect(settingsGets).toBe(initialSettingsGets)
  expect(posts).toHaveLength(1)
  expect(posts[0]).toEqual({
    provider: 'deepseek', display_name: displayName.trim(), api_key: apiKey, monthly_budget_usd: 12.5,
  })
  expect(posts[0]).not.toHaveProperty('provider_key')
  expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('failed provider creation preserves the draft and shows only a safe error', async ({ page, context, baseURL }) => {
  const savedProvider = {
    provider_key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    provider: 'openai',
    display_name: 'Existing test provider',
    monthly_budget_usd: null,
  }
  const displayName = '  Draft test provider  '
  const secretMarker = 'FAKE_BROWSER_TEST_KEY_NOT_A_CREDENTIAL'
  const apiKey = `  ${secretMarker}  `
  const posts = []
  const unexpectedRequests = []

  // Fail closed before navigation: no real backend, credential store or supplier.
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'GET' && request.url() === 'http://127.0.0.1:8000/settings') {
      await route.fulfill({ json: { user: { display_name: null }, ai: { providers: [savedProvider], tasks: [] } } })
    } else if (request.method() === 'POST' && request.url() === 'http://127.0.0.1:8000/settings/ai/providers') {
      posts.push(request.postDataJSON())
      await route.fulfill({
        status: 500,
        json: { detail: { code: 'settings.ai_provider_creation_error', message: secretMarker } },
      })
    } else if (url.origin === baseURL && request.method() === 'GET'
      && !['fetch', 'xhr'].includes(request.resourceType()) && !url.pathname.startsWith('/settings')) {
      await route.continue()
    } else {
      unexpectedRequests.push(`${request.method()} ${request.url()}`)
      await route.abort('blockedbyclient')
    }
  })
  // Vite's development socket is the only permitted WebSocket connection.
  await context.routeWebSocket('**/*', (socket) => {
    const url = new URL(socket.url())
    if (url.origin === baseURL.replace('http:', 'ws:') && url.pathname === '/') {
      socket.connectToServer()
    } else {
      unexpectedRequests.push(`WebSocket ${socket.url()}`)
      socket.close()
    }
  })

  await page.goto('/')
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'API', exact: true }).click()
  const providers = page.getByRole('list', { name: 'Saved providers' })
  await expect(providers.getByRole('listitem')).toHaveCount(1)
  const originalList = await providers.textContent()
  await page.getByRole('button', { name: 'Add provider', exact: true }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Add provider', exact: true })).toBeVisible()
  const platform = dialog.getByRole('combobox', { name: 'Platform', exact: true })
  const name = dialog.getByLabel('Display name', { exact: true })
  const key = dialog.getByLabel('API key', { exact: true })
  const budget = dialog.getByLabel('Monthly budget (USD) · Optional', { exact: true })
  await platform.selectOption('deepseek')
  await name.fill(displayName)
  await key.fill(apiKey)
  await budget.fill('12.5')
  await expect(key).toHaveAttribute('type', 'password')
  await dialog.getByRole('button', { name: 'Add provider', exact: true }).click()

  const error = dialog.getByRole('alert')
  await expect(error).toContainText('Could not save the provider. No new API key was retained.')
  await expect(dialog.locator('form')).toHaveAttribute('aria-busy', 'false')
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveJSProperty('open', true)
  await expect(platform).toHaveValue('deepseek')
  await expect(name).toHaveValue(displayName)
  await expect(key).toHaveValue(apiKey)
  await expect(budget).toHaveValue('12.5')
  await expect(key).toHaveAttribute('type', 'password')
  for (const control of [platform, name, key, budget,
    dialog.getByRole('button', { name: 'Add provider', exact: true }),
    dialog.getByRole('button', { name: 'Cancel', exact: true })]) {
    await expect(control).toBeEnabled()
  }
  await expect(error).not.toContainText(secretMarker)
  // The native modal makes background roles inert; include them when checking the list.
  const savedList = page.getByRole('list', { name: 'Saved providers', includeHidden: true })
  await expect(savedList.getByRole('listitem', { includeHidden: true })).toHaveCount(1)
  await expect(savedList).toHaveText(originalList)
  await expect(page.getByRole('status', { includeHidden: true })).toHaveCount(0)
  expect(posts).toHaveLength(1)
  expect(posts[0]).toEqual({
    provider: 'deepseek', display_name: displayName.trim(), api_key: apiKey, monthly_budget_usd: 12.5,
  })
  expect(posts[0]).not.toHaveProperty('provider_key')
  expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('invalid provider drafts show validation errors without posting or losing the draft', async ({ page, context, baseURL }) => {
  const savedProvider = {
    provider_key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    provider: 'openai',
    display_name: 'Existing test provider',
    monthly_budget_usd: null,
  }
  const baseline = {
    platform: 'deepseek',
    name: '  Validation test provider  ',
    key: '  FAKE_VALIDATION_BROWSER_KEY_NOT_A_CREDENTIAL  ',
    budget: '12.5',
  }
  const posts = []
  const unexpectedRequests = []

  // Even an invalid draft that reaches POST fails closed against a fixed fake error.
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'GET' && request.url() === 'http://127.0.0.1:8000/settings') {
      await route.fulfill({ json: { user: { display_name: null }, ai: { providers: [savedProvider], tasks: [] } } })
    } else if (request.method() === 'POST' && request.url() === 'http://127.0.0.1:8000/settings/ai/providers') {
      posts.push(request.postDataJSON())
      await route.fulfill({
        status: 500,
        json: { detail: { code: 'settings.ai_provider_creation_error', message: 'Fixed fake creation failure' } },
      })
    } else if (url.origin === baseURL && request.method() === 'GET'
      && !['fetch', 'xhr'].includes(request.resourceType()) && !url.pathname.startsWith('/settings')) {
      await route.continue()
    } else {
      unexpectedRequests.push(`${request.method()} ${request.url()}`)
      await route.abort('blockedbyclient')
    }
  })
  await context.routeWebSocket('**/*', (socket) => {
    const url = new URL(socket.url())
    if (url.origin === baseURL.replace('http:', 'ws:') && url.pathname === '/') {
      socket.connectToServer()
    } else {
      unexpectedRequests.push(`WebSocket ${socket.url()}`)
      socket.close()
    }
  })

  await page.goto('/')
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'API', exact: true }).click()
  const providers = page.getByRole('list', { name: 'Saved providers' })
  await expect(providers.getByRole('listitem')).toHaveCount(1)
  const originalList = await providers.textContent()
  await page.getByRole('button', { name: 'Add provider', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Add provider', exact: true })).toBeVisible()
  const controls = {
    platform: dialog.getByRole('combobox', { name: 'Platform', exact: true }),
    name: dialog.getByLabel('Display name', { exact: true }),
    key: dialog.getByLabel('API key', { exact: true }),
    budget: dialog.getByLabel('Monthly budget (USD) · Optional', { exact: true }),
  }
  const submit = dialog.getByRole('button', { name: 'Add provider', exact: true })
  const cases = [
    { title: 'empty display name', field: 'name', value: '', message: 'Enter a display name.' },
    { title: 'whitespace display name', field: 'name', value: '   ', message: 'Enter a display name.' },
    { title: 'empty API key', field: 'key', value: '', message: 'Enter an API key.' },
    { title: 'whitespace API key', field: 'key', value: '   ', message: 'Enter an API key.' },
    { title: 'negative monthly budget', field: 'budget', value: '-1', message: 'Enter a finite monthly budget of zero or more, or leave it empty.' },
  ]
  for (const scenario of cases) {
    await test.step(scenario.title, async () => {
      // Reset every field so a different validation branch cannot mask this one.
      await controls.platform.selectOption(baseline.platform)
      for (const field of ['name', 'key', 'budget']) await controls[field].fill(baseline[field])
      await controls[scenario.field].fill(scenario.value)
      const draft = { ...baseline, [scenario.field]: scenario.value }
      for (const [field, value] of Object.entries(draft)) await expect(controls[field]).toHaveValue(value)
      await submit.click()

      // Wait for the submitted draft's validation result, not an arbitrary no-request delay.
      await expect(dialog.getByRole('alert')).toHaveText(scenario.message)
      await expect(controls[scenario.field]).toBeFocused()
      await expect(dialog).toBeVisible()
      await expect(dialog).toHaveJSProperty('open', true)
      await expect(dialog.locator('form')).toHaveAttribute('aria-busy', 'false')
      for (const [field, value] of Object.entries(draft)) await expect(controls[field]).toHaveValue(value)
      await expect(controls.key).toHaveAttribute('type', 'password')
      for (const control of [...Object.values(controls), submit,
        dialog.getByRole('button', { name: 'Cancel', exact: true }),
        dialog.getByRole('button', { name: 'Close add provider', exact: true })]) {
        await expect(control).toBeEnabled()
      }
      // Native modal background roles are inert but their saved content must not change.
      const savedList = page.getByRole('list', { name: 'Saved providers', includeHidden: true })
      await expect(savedList.getByRole('listitem', { includeHidden: true })).toHaveCount(1)
      await expect(savedList).toHaveText(originalList)
      expect(posts).toHaveLength(0)
      expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
    })
  }
})

test('pending provider creation blocks native Escape and restores the retained draft after failure', async ({ page, context, baseURL }) => {
  const savedProvider = {
    provider_key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    provider: 'openai',
    display_name: 'Existing test provider',
    monthly_budget_usd: null,
  }
  const draft = {
    platform: 'deepseek',
    name: '  Pending test provider  ',
    key: '  FAKE_PENDING_BROWSER_KEY_NOT_A_CREDENTIAL  ',
    budget: '12.5',
  }
  const posts = []
  const unexpectedRequests = []
  let postArrived = false
  const responseGate = Promise.withResolvers()

  // Install the closed mock before navigation; only the test can release the POST.
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'GET' && request.url() === 'http://127.0.0.1:8000/settings') {
      await route.fulfill({ json: { user: { display_name: null }, ai: { providers: [savedProvider], tasks: [] } } })
    } else if (request.method() === 'POST' && request.url() === 'http://127.0.0.1:8000/settings/ai/providers') {
      posts.push(request.postDataJSON())
      postArrived = true
      await responseGate.promise
      await route.fulfill({
        status: 500,
        json: { detail: { code: 'settings.ai_provider_creation_error', message: 'Fixed fake creation failure' } },
      })
    } else if (url.origin === baseURL && request.method() === 'GET'
      && !['fetch', 'xhr'].includes(request.resourceType()) && !url.pathname.startsWith('/settings')) {
      await route.continue()
    } else {
      unexpectedRequests.push(`${request.method()} ${request.url()}`)
      await route.abort('blockedbyclient')
    }
  })
  await context.routeWebSocket('**/*', (socket) => {
    const url = new URL(socket.url())
    if (url.origin === baseURL.replace('http:', 'ws:') && url.pathname === '/') {
      socket.connectToServer()
    } else {
      unexpectedRequests.push(`WebSocket ${socket.url()}`)
      socket.close()
    }
  })

  try {
    await page.goto('/')
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'API', exact: true }).click()
    const providers = page.getByRole('list', { name: 'Saved providers' })
    await expect(providers.getByRole('listitem')).toHaveCount(1)
    const originalList = await providers.textContent()
    await page.getByRole('button', { name: 'Add provider', exact: true }).click()
    const dialog = page.getByRole('dialog', { includeHidden: true })
    await expect(dialog.getByRole('heading', { name: 'Add provider', exact: true })).toBeVisible()
    const controls = {
      platform: dialog.getByRole('combobox', { name: 'Platform', exact: true }),
      name: dialog.getByLabel('Display name', { exact: true }),
      key: dialog.getByLabel('API key', { exact: true }),
      budget: dialog.getByLabel('Monthly budget (USD) · Optional', { exact: true }),
    }
    const submit = dialog.locator('button[type="submit"]')
    const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true })
    const close = dialog.getByRole('button', { name: 'Close add provider', exact: true })
    const form = dialog.locator('form')
    const saving = dialog.getByRole('status')
    await controls.platform.selectOption(draft.platform)
    for (const field of ['name', 'key', 'budget']) await controls[field].fill(draft[field])
    await submit.click()
    await expect.poll(() => postArrived, { message: 'The mock intercepted the POST before any response' }).toBe(true)
    await expect(form).toHaveAttribute('aria-busy', 'true')
    await expect(saving).toHaveText('Saving provider… Please keep this dialog open.')
    await expect(submit).toHaveAccessibleName('Saving…', { exact: true })
    for (const control of [...Object.values(controls), submit, cancel, close]) await expect(control).toBeDisabled()

    // Observe the native cancel without preventing it or calling any product handler.
    // Capture on document so the observation survives a regressed dialog unmount.
    await page.evaluate(() => {
      window.__providerCancelObservation = null
      document.addEventListener('cancel', (event) => {
        // Retain the event and read it after dispatch, not at the capture phase.
        window.__providerCancelObservation = event
      }, { capture: true, once: true })
    })
    await page.keyboard.press('Escape')
    await expect.poll(() => page.evaluate(() => window.__providerCancelObservation !== null)).toBe(true)
    // These assertions must run while the response is still gated, before draft checks.
    await expect(dialog, 'Native Escape must not remove the saving dialog').toHaveCount(1)
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveJSProperty('open', true)
    expect(await page.evaluate(() => ({
      trusted: window.__providerCancelObservation.isTrusted,
      prevented: window.__providerCancelObservation.defaultPrevented,
    }))).toEqual({ trusted: true, prevented: true })
    for (const [field, value] of Object.entries(draft)) await expect(controls[field]).toHaveValue(value)
    await expect(controls.key).toHaveAttribute('type', 'password')
    const savedList = page.getByRole('list', { name: 'Saved providers', includeHidden: true })
    await expect(savedList.getByRole('listitem', { includeHidden: true })).toHaveCount(1)
    await expect(savedList).toHaveText(originalList)
    expect(posts).toHaveLength(1)
    expect(posts[0]).toEqual({
      provider: draft.platform, display_name: draft.name.trim(), api_key: draft.key, monthly_budget_usd: 12.5,
    })

    responseGate.resolve()
    const error = dialog.getByRole('alert')
    await expect(error).toContainText('Could not save the provider. No new API key was retained.')
    await expect(form).toHaveAttribute('aria-busy', 'false')
    await expect(saving).toHaveCount(0)
    await expect(submit).toHaveAccessibleName('Add provider', { exact: true })
    for (const control of [...Object.values(controls), submit, cancel, close]) await expect(control).toBeEnabled()
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveJSProperty('open', true)
    for (const [field, value] of Object.entries(draft)) await expect(controls[field]).toHaveValue(value)
    await expect(controls.key).toHaveAttribute('type', 'password')
    await expect(savedList.getByRole('listitem', { includeHidden: true })).toHaveCount(1)
    await expect(savedList).toHaveText(originalList)
    expect(posts).toHaveLength(1)
    expect(posts[0]).toEqual({
      provider: draft.platform, display_name: draft.name.trim(), api_key: draft.key, monthly_budget_usd: 12.5,
    })
    await controls.name.fill('Edited after failure')
    await expect(controls.name).toHaveValue('Edited after failure')
    await cancel.click()
    await expect(dialog).toHaveCount(0)
    await expect(providers).toHaveText(originalList)
    expect(posts).toHaveLength(1)
    expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
  } finally {
    // Release even if a busy-state assertion fails, so no route remains suspended.
    responseGate.resolve()
  }
})

test('component suite reports every settings provider scenario passing with zero failures', async ({ page, context, baseURL }) => {
  // The component page replaces window.fetch with its own closed mock before any
  // component runs, so this test must not add a product HTTP mock that would shadow
  // that behavior. Only same-origin Vite assets are allowed through; every fetch/XHR
  // or cross-origin request is recorded and aborted so nothing reaches a real backend.
  const unexpectedRequests = []
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === baseURL && !['fetch', 'xhr'].includes(request.resourceType())) {
      await route.continue()
    } else {
      unexpectedRequests.push(`${request.method()} ${request.url()}`)
      await route.abort('blockedbyclient')
    }
  })
  // Only the Vite HMR socket may connect; the component fetch mock never uses the network.
  await context.routeWebSocket('**/*', (socket) => {
    const url = new URL(socket.url())
    if (url.origin === baseURL.replace('http:', 'ws:') && url.pathname === '/') {
      socket.connectToServer()
    } else {
      unexpectedRequests.push(`WebSocket ${socket.url()}`)
      socket.close()
    }
  })

  // Without ?preview the page auto-runs runTests() and writes each case into #results.
  await page.goto('/tests/settings-providers.html')
  const summary = page.locator('#result-summary')
  await expect.poll(async () => summary.getAttribute('data-status'), {
    timeout: 20_000,
    message: 'The component suite never reported a final pass/fail status',
  }).not.toBeNull()

  const status = await summary.getAttribute('data-status')
  const summaryText = (await summary.textContent())?.trim() ?? ''
  const results = await page.locator('#results li').allTextContents()
  const failures = results.filter((line) => line.startsWith('FAIL:'))
  const report = results.join('\n')
  // A vacuous "passed" summary is not enough: assert the per-case pass/fail list, the
  // exact scenario count, the final summary, and that every case is individually PASS.
  // Every failing case line is embedded in the assertion error so a targeted mutation
  // (e.g. the synchronous duplicate-submit guard) surfaces its exact failure.
  expect(status, `Component suite status was ${JSON.stringify(status)} (${summaryText}):\n${report}`).toBe('passed')
  expect(failures, `Component suite failures (${summaryText}):\n${report}`).toEqual([])
  expect(results.length, `Expected 16 component scenarios but saw ${results.length} (${summaryText}):\n${report}`).toBe(16)
  expect(summaryText, `Unexpected component suite summary (${summaryText}):\n${report}`).toBe('16 passed, 0 failed')
  expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('native idle dialog discards the draft on Cancel, X and Escape and restores focus', async ({ page, context, baseURL }) => {
  const savedProvider = {
    provider_key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    provider: 'openai',
    display_name: 'Existing test provider',
    monthly_budget_usd: null,
  }
  const draft = {
    platform: 'deepseek',
    name: '  Idle lifecycle test provider  ',
    key: '  FAKE_IDLE_BROWSER_KEY_NOT_A_CREDENTIAL  ',
    budget: '7.5',
  }
  const posts = []
  const unexpectedRequests = []

  // Fail closed before navigation; the idle lifecycle must never POST. Any accidental
  // POST receives a fixed fake error instead of reaching a real backend.
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'GET' && request.url() === 'http://127.0.0.1:8000/settings') {
      await route.fulfill({ json: { user: { display_name: null }, ai: { providers: [savedProvider], tasks: [] } } })
    } else if (request.method() === 'POST' && request.url() === 'http://127.0.0.1:8000/settings/ai/providers') {
      posts.push(request.postDataJSON())
      await route.fulfill({ status: 500, json: { detail: { code: 'settings.ai_provider_creation_error', message: 'Fixed fake creation failure' } } })
    } else if (url.origin === baseURL && request.method() === 'GET'
      && !['fetch', 'xhr'].includes(request.resourceType()) && !url.pathname.startsWith('/settings')) {
      await route.continue()
    } else {
      unexpectedRequests.push(`${request.method()} ${request.url()}`)
      await route.abort('blockedbyclient')
    }
  })
  await context.routeWebSocket('**/*', (socket) => {
    const url = new URL(socket.url())
    if (url.origin === baseURL.replace('http:', 'ws:') && url.pathname === '/') {
      socket.connectToServer()
    } else {
      unexpectedRequests.push(`WebSocket ${socket.url()}`)
      socket.close()
    }
  })

  await page.goto('/')
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'API', exact: true }).click()
  const providers = page.getByRole('list', { name: 'Saved providers' })
  await expect(providers.getByRole('listitem')).toHaveCount(1)
  const originalList = await providers.textContent()
  const addButton = page.getByRole('button', { name: 'Add provider', exact: true })
  await expect(addButton).toBeEnabled()

  await addButton.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Add provider', exact: true })).toBeVisible()
  const controls = {
    platform: dialog.getByRole('combobox', { name: 'Platform', exact: true }),
    name: dialog.getByLabel('Display name', { exact: true }),
    key: dialog.getByLabel('API key', { exact: true }),
    budget: dialog.getByLabel('Monthly budget (USD) · Optional', { exact: true }),
  }
  // Capture the component's real defaults before any input so the reopened-state check
  // does not freeze a platform default that the contract never specified.
  const initial = {}
  for (const field of Object.keys(controls)) initial[field] = await controls[field].inputValue()
  // The contract requires an empty, masked key on first open. Assert it directly so a
  // regression that pre-fills or retains a key cannot pass through the captured value.
  // The platform default is captured, not frozen into a new contract constant.
  expect(initial.key, 'The API key must be empty on first open').toBe('')
  await expect(controls.key).toHaveValue('')
  await expect(controls.key).toHaveAttribute('type', 'password')

  async function fillDraft() {
    await controls.platform.selectOption(draft.platform)
    for (const field of ['name', 'key', 'budget']) await controls[field].fill(draft[field])
  }
  async function expectDraftPreserved() {
    for (const [field, value] of Object.entries(draft)) await expect(controls[field]).toHaveValue(value)
    await expect(controls.key).toHaveAttribute('type', 'password')
  }
  async function expectInitialState() {
    for (const [field, value] of Object.entries(initial)) await expect(controls[field]).toHaveValue(value)
    await expect(controls.key).toHaveAttribute('type', 'password')
  }
  async function expectClosedAndRestored() {
    await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0)
    await expect(addButton).toBeFocused()
    await expect(providers).toHaveText(originalList)
  }

  // A real backdrop click must not close the modal or change the draft and saved list.
  // Pick a point that is strictly inside the viewport and strictly outside the dialog
  // box; fail explicitly instead of silently clamping into the dialog.
  await fillDraft()
  await expectDraftPreserved()
  const viewport = page.viewportSize()
  expect(viewport, 'The viewport size must be known to pick a backdrop point').not.toBeNull()
  const box = await dialog.boundingBox()
  expect(box, 'Dialog must be visible with a bounding box').not.toBeNull()
  const margin = 10
  const candidates = [
    { x: box.x - margin, y: box.y + box.height / 2 },
    { x: box.x + box.width + margin, y: box.y + box.height / 2 },
    { x: box.x + box.width / 2, y: box.y - margin },
    { x: box.x + box.width / 2, y: box.y + box.height + margin },
  ]
  const outside = candidates.find((point) =>
    point.x > 0 && point.x < viewport.width
    && point.y > 0 && point.y < viewport.height
    && (point.x < box.x || point.x > box.x + box.width || point.y < box.y || point.y > box.y + box.height)
  )
  expect(outside, 'No backdrop point lies strictly outside the dialog and inside the viewport').not.toBeUndefined()
  await page.mouse.click(Math.round(outside.x), Math.round(outside.y))
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveJSProperty('open', true)
  await expectDraftPreserved()
  await expect(providers).toHaveText(originalList)

  // Cancel discards the draft, removes the dialog and restores focus.
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expectClosedAndRestored()

  // Reopen restores the initial fields; the X button closes the same way.
  await addButton.click()
  await expect(dialog.getByRole('heading', { name: 'Add provider', exact: true })).toBeVisible()
  await expectInitialState()
  await fillDraft()
  await dialog.getByRole('button', { name: 'Close add provider', exact: true }).click()
  await expectClosedAndRestored()

  // Reopen and close with real keyboard Escape.
  await addButton.click()
  await expect(dialog.getByRole('heading', { name: 'Add provider', exact: true })).toBeVisible()
  await expectInitialState()
  await fillDraft()
  await page.keyboard.press('Escape')
  await expectClosedAndRestored()

  // Reopen once more to prove Escape discarded the draft and restored the empty key.
  await addButton.click()
  await expect(dialog.getByRole('heading', { name: 'Add provider', exact: true })).toBeVisible()
  await expectInitialState()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expectClosedAndRestored()

  expect(posts).toHaveLength(0)
  expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
})
