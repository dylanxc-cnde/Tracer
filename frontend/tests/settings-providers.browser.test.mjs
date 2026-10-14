import { expect, test } from '@playwright/test'

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
