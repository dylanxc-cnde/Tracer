import { expect, test } from '@playwright/test'

// Full provider/parsing maintenance journey, run through the discovered providers
// entry file. Every request fails closed before navigation: no real backend,
// credential store or supplier can be reached.

const OPENAI_KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DEEPSEEK_KEY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

async function installMocks({ context, baseURL, settings, handlers, unexpectedRequests }) {
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const key = `${request.method()} ${request.url()}`
    if (request.method() === 'GET' && request.url() === 'http://127.0.0.1:8000/settings') {
      await route.fulfill({ json: settings })
    } else if (handlers[key]) {
      await handlers[key](route, request)
    } else if (url.origin === baseURL && request.method() === 'GET'
      && !['fetch', 'xhr'].includes(request.resourceType()) && !url.pathname.startsWith('/settings')) {
      await route.continue()
    } else {
      unexpectedRequests.push(key)
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
}

async function openApiSettings(page) {
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'API', exact: true }).click()
}

test('editing a provider adopts the server result and preserves other rows', async ({ page, context, baseURL }) => {
  const settings = {
    user: { display_name: null },
    ai: {
      providers: [
        { provider_key: OPENAI_KEY, provider: 'openai', display_name: 'OpenAI main', monthly_budget_usd: 10 },
        { provider_key: DEEPSEEK_KEY, provider: 'deepseek', display_name: 'DeepSeek alt', monthly_budget_usd: null },
      ],
      tasks: [],
    },
  }
  const serverUpdated = {
    provider_key: OPENAI_KEY, provider: 'openai', display_name: 'Server canonical name', monthly_budget_usd: 7.5,
  }
  const patches = []
  const unexpectedRequests = []

  await installMocks({
    context, baseURL, settings, unexpectedRequests,
    handlers: {
      [`PATCH http://127.0.0.1:8000/settings/ai/providers/${OPENAI_KEY}`]: async (route, request) => {
        patches.push(request.postDataJSON())
        await route.fulfill({ json: serverUpdated })
      },
    },
  })

  await openApiSettings(page)
  const providers = page.getByRole('list', { name: 'Saved providers' })
  await expect(providers.getByRole('listitem')).toHaveCount(2)
  const deepseekText = await providers.getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'DeepSeek alt', exact: true }) }).textContent()

  await providers.getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'OpenAI main', exact: true }) })
    .getByRole('button', { name: 'Edit provider', exact: true }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Edit provider', exact: true })).toBeVisible()
  await dialog.getByLabel('Display name', { exact: true }).fill('  Renamed draft  ')
  await dialog.getByLabel('Monthly budget (USD) · Optional', { exact: true }).fill('7.5')
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()

  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0)
  const updatedRow = providers.getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Server canonical name', exact: true }) })
  await expect(updatedRow).toHaveCount(1)
  await expect(updatedRow).toContainText('$7.50')
  await expect(providers.getByRole('listitem')).toHaveCount(2)
  await expect(providers.getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'DeepSeek alt', exact: true }) })).toHaveText(deepseekText)
  await expect(page.getByText('Provider settings saved.')).toBeVisible()

  expect(patches).toHaveLength(1)
  expect(patches[0]).toEqual({ display_name: 'Renamed draft', monthly_budget_usd: 7.5 })
  expect(patches[0]).not.toHaveProperty('provider_key')
  expect(patches[0]).not.toHaveProperty('api_key')
  expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('replacing an API key is write-only, masked, and reopens empty', async ({ page, context, baseURL }) => {
  const settings = {
    user: { display_name: null },
    ai: {
      providers: [{ provider_key: OPENAI_KEY, provider: 'openai', display_name: 'OpenAI main', monthly_budget_usd: null }],
      tasks: [],
    },
  }
  const secretMarker = 'FAKE_MANAGE_BROWSER_KEY_NOT_A_CREDENTIAL'
  const apiKey = `  ${secretMarker}  `
  const puts = []
  const unexpectedRequests = []

  await installMocks({
    context, baseURL, settings, unexpectedRequests,
    handlers: {
      [`PUT http://127.0.0.1:8000/settings/ai/providers/${OPENAI_KEY}/api-key`]: async (route, request) => {
        puts.push(request.postDataJSON())
        await route.fulfill({ status: 204 })
      },
    },
  })

  await openApiSettings(page)
  const providers = page.getByRole('list', { name: 'Saved providers' })
  await expect(providers.getByRole('listitem')).toHaveCount(1)
  await providers.getByRole('listitem').getByRole('button', { name: 'Replace API key', exact: true }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Replace API key', exact: true })).toBeVisible()
  const key = dialog.getByLabel('New API key', { exact: true })
  await expect(key).toHaveValue('')
  await expect(key).toHaveAttribute('type', 'password')
  await key.fill(apiKey)
  await dialog.getByRole('button', { name: 'Replace API key', exact: true }).click()

  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0)
  await expect(page.getByText('API key replaced. It has not been tested with the provider.')).toBeVisible()
  expect(await page.locator('body').innerText()).not.toContain(secretMarker)

  // Reopen: the key draft is empty and masked; the secret is never displayed.
  await providers.getByRole('listitem').getByRole('button', { name: 'Replace API key', exact: true }).click()
  const reopened = page.getByRole('dialog').getByLabel('New API key', { exact: true })
  await expect(reopened).toHaveValue('')
  await expect(reopened).toHaveAttribute('type', 'password')
  expect(await page.locator('body').innerText()).not.toContain(secretMarker)
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0)

  expect(puts).toHaveLength(1)
  expect(puts[0]).toEqual({ api_key: apiKey })
  expect(puts[0]).not.toHaveProperty('provider_key')
  expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('deleting an unreferenced provider requires confirmation and removes it', async ({ page, context, baseURL }) => {
  const settings = {
    user: { display_name: null },
    ai: {
      providers: [
        { provider_key: OPENAI_KEY, provider: 'openai', display_name: 'OpenAI main', monthly_budget_usd: null },
        { provider_key: DEEPSEEK_KEY, provider: 'deepseek', display_name: 'DeepSeek alt', monthly_budget_usd: null },
      ],
      tasks: [],
    },
  }
  const deletes = []
  const unexpectedRequests = []

  await installMocks({
    context, baseURL, settings, unexpectedRequests,
    handlers: {
      [`DELETE http://127.0.0.1:8000/settings/ai/providers/${DEEPSEEK_KEY}`]: async (route, request) => {
        deletes.push(request.url())
        await route.fulfill({ status: 204 })
      },
    },
  })

  await openApiSettings(page)
  const providers = page.getByRole('list', { name: 'Saved providers' })
  await expect(providers.getByRole('listitem')).toHaveCount(2)
  await providers.getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'DeepSeek alt', exact: true }) })
    .getByRole('button', { name: 'Delete provider', exact: true }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Delete provider', exact: true })).toBeVisible()
  const submit = dialog.getByRole('button', { name: 'Delete provider', exact: true })
  await expect(submit).toBeDisabled()
  await dialog.getByRole('checkbox', { name: /I confirm deletion/ }).check()
  await expect(submit).toBeEnabled()
  await submit.click()

  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0)
  await expect(providers.getByRole('listitem')).toHaveCount(1)
  await expect(providers).not.toContainText('DeepSeek alt')
  await expect(page.getByText('Provider and its stored API key deleted.')).toBeVisible()
  expect(deletes).toEqual([`http://127.0.0.1:8000/settings/ai/providers/${DEEPSEEK_KEY}`])
  expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('deleting a referenced provider is blocked without any request', async ({ page, context, baseURL }) => {
  const settings = {
    user: { display_name: null },
    ai: {
      providers: [{ provider_key: OPENAI_KEY, provider: 'openai', display_name: 'OpenAI main', monthly_budget_usd: null }],
      tasks: [{ task: 'posting_parse', provider_key: OPENAI_KEY, model: 'test_model' }],
    },
  }
  const deletes = []
  const unexpectedRequests = []

  // No DELETE handler: any accidental DELETE is recorded as unexpected and aborted.
  await installMocks({ context, baseURL, settings, unexpectedRequests, handlers: {} })

  await openApiSettings(page)
  const providers = page.getByRole('list', { name: 'Saved providers' })
  await expect(providers.getByRole('listitem')).toHaveCount(1)
  await providers.getByRole('listitem').getByRole('button', { name: 'Delete provider', exact: true }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Delete provider', exact: true })).toBeVisible()
  await expect(dialog.getByRole('alert')).toContainText('Clear the selection before deleting')
  await expect(dialog.getByRole('checkbox')).toHaveCount(0)
  const submit = dialog.getByRole('button', { name: 'Delete provider', exact: true })
  await expect(submit).toBeDisabled()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()

  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0)
  await expect(providers.getByRole('listitem')).toHaveCount(1)
  expect(deletes).toHaveLength(0)
  expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('posting parsing lists only supported providers, saves, and clears to defaults', async ({ page, context, baseURL }) => {
  const settings = {
    user: { display_name: null },
    ai: {
      providers: [
        { provider_key: OPENAI_KEY, provider: 'openai', display_name: 'OpenAI main', monthly_budget_usd: null },
        { provider_key: DEEPSEEK_KEY, provider: 'deepseek', display_name: 'DeepSeek alt', monthly_budget_usd: null },
      ],
      tasks: [],
    },
  }
  const puts = []
  const deletes = []
  const unexpectedRequests = []

  await installMocks({
    context, baseURL, settings, unexpectedRequests,
    handlers: {
      'PUT http://127.0.0.1:8000/settings/ai/tasks/posting_parse': async (route, request) => {
        puts.push(request.postDataJSON())
        await route.fulfill({ json: { task: 'posting_parse', provider_key: OPENAI_KEY, model: 'test_parse_model' } })
      },
      'DELETE http://127.0.0.1:8000/settings/ai/tasks/posting_parse': async (route) => {
        deletes.push(route.request().url())
        await route.fulfill({ status: 204 })
      },
    },
  })

  await openApiSettings(page)
  await expect(page.getByRole('heading', { name: 'Posting parsing', exact: true })).toBeVisible()
  const providerSelect = page.getByLabel('Parsing provider', { exact: true })
  const modelInput = page.getByLabel('Parsing model', { exact: true })

  // Only OpenAI providers are selectable; DeepSeek is not an option.
  expect(await providerSelect.locator('option').allTextContents())
    .toEqual(['Choose an OpenAI provider', 'OpenAI main'])
  await expect(page.getByText('Saved: environment credentials and the built-in default model.')).toBeVisible()

  await providerSelect.selectOption(OPENAI_KEY)
  await modelInput.fill('  test_parse_model  ')
  await page.getByRole('button', { name: 'Save parsing settings', exact: true }).click()

  await expect(page.getByText('Posting parsing settings saved. They apply to the next Analyze request.')).toBeVisible()
  await expect(page.getByText('Saved: OpenAI main · test_parse_model')).toBeVisible()
  expect(puts).toHaveLength(1)
  expect(puts[0]).toEqual({ provider_key: OPENAI_KEY, model: 'test_parse_model' })

  await page.getByRole('button', { name: 'Use environment defaults', exact: true }).click()
  await expect(page.getByText('Saved selection cleared. Future Analyze requests use environment defaults.')).toBeVisible()
  await expect(page.getByText('Saved: environment credentials and the built-in default model.')).toBeVisible()
  expect(deletes).toEqual(['http://127.0.0.1:8000/settings/ai/tasks/posting_parse'])
  expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
})
