import { writeFile } from 'node:fs/promises'
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
      // `settings` may be a mutable fixture (serialized per request) or a responder.
      if (typeof settings === 'function') await settings(route)
      else await route.fulfill({ json: settings })
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

// Gives any wrongly issued follow-up request time to reach the closed mock before
// a "no extra request" assertion; it does not replace the explicit state waits.
async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 250)))
}

async function openApiSettings(page) {
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'API', exact: true }).click()
}

function providerRow(page, providerName) {
  return page.getByRole('list', { name: 'Saved providers' }).getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: providerName, exact: true }) })
}

// Maintenance actions live behind a persistent, named per-row menu trigger. This
// helper uses only the user-visible roles: open the row's menu, then pick an item.
async function openProviderAction(page, providerName, action) {
  const row = providerRow(page, providerName)
  const trigger = row.getByRole('button', { name: `Provider actions for ${providerName}`, exact: true })
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await row.getByRole('menuitem', { name: action, exact: true }).click()
}

// Provider UUIDs are stable identities for requests, never ordinary page content.
// Checks rendered text plus the accessible-name attributes a user or reader sees.
async function expectNoProviderUuid(page) {
  const rendered = await page.evaluate(() => {
    const attributes = [...document.querySelectorAll('[aria-label],[title],[placeholder]')]
      .map((element) => ['aria-label', 'title', 'placeholder'].map((name) => element.getAttribute(name) ?? '').join(' '))
    return `${document.body.innerText}\n${attributes.join('\n')}`
  })
  for (const key of [OPENAI_KEY, DEEPSEEK_KEY]) expect(rendered, 'A full provider UUID is visible').not.toContain(key)
}

// Posting parsing shows the saved selection first; the editable draft is a separate,
// explicitly opened form. These locators keep that distinction readable.
function parsingArea(page) {
  const region = page.getByRole('region', { name: 'Posting parsing', exact: true })
  return {
    region,
    baseline: region.locator('.posting-parse-settings__baseline'),
    model: region.locator('.posting-parse-settings__model'),
    edit: region.getByRole('button', { name: 'Edit parsing settings', exact: true }),
    provider: page.getByRole('combobox', { name: 'Parsing provider', exact: true }),
    modelInput: page.getByLabel('Parsing model', { exact: true }),
    save: page.getByRole('button', { name: 'Save parsing settings', exact: true }),
    cancel: page.getByRole('button', { name: 'Cancel parsing changes', exact: true }),
    defaults: page.getByRole('button', { name: 'Use environment defaults', exact: true }),
    form: page.locator('form.posting-parse-settings__form'),
  }
}

const ENVIRONMENT_DEFAULT = 'Environment credentials and the built-in default model'

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

  // Before any menu opens, no maintenance action is a standing row button.
  await expect(providers.getByRole('button', { name: 'Edit provider', exact: true })).toHaveCount(0)
  await expect(providers.getByRole('button', { name: 'Replace API key', exact: true })).toHaveCount(0)
  await expect(providers.getByRole('button', { name: 'Delete provider', exact: true })).toHaveCount(0)
  await openProviderAction(page, 'OpenAI main', 'Edit provider')

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Edit provider', exact: true })).toBeVisible()
  await expectNoProviderUuid(page)
  await dialog.getByLabel('Display name', { exact: true }).fill('  Renamed draft  ')
  await dialog.getByLabel('Monthly budget (USD) · Optional', { exact: true }).fill('7.5')
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()

  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0)
  const updatedRow = providers.getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Server canonical name', exact: true }) })
  await expect(updatedRow).toHaveCount(1)
  await expect(updatedRow).toContainText('$7.50')
  // The dialog opener (a menu item) is gone; focus returns to the persistent row trigger.
  await expect(updatedRow.getByRole('button', { name: 'Provider actions for Server canonical name', exact: true })).toBeFocused()
  await expectNoProviderUuid(page)
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
  await openProviderAction(page, 'OpenAI main', 'Replace API key')

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Replace API key', exact: true })).toBeVisible()
  await expectNoProviderUuid(page)
  const key = dialog.getByLabel('New API key', { exact: true })
  await expect(key).toHaveValue('')
  await expect(key).toHaveAttribute('type', 'password')
  await key.fill(apiKey)
  await dialog.getByRole('button', { name: 'Replace API key', exact: true }).click()

  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0)
  await expect(page.getByText('API key replaced. It has not been tested with the provider.')).toBeVisible()
  expect(await page.locator('body').innerText()).not.toContain(secretMarker)

  // Reopen: the key draft is empty and masked; the secret is never displayed.
  await expect(providerRow(page, 'OpenAI main').getByRole('button', { name: 'Provider actions for OpenAI main', exact: true })).toBeFocused()
  await openProviderAction(page, 'OpenAI main', 'Replace API key')
  const reopened = page.getByRole('dialog').getByLabel('New API key', { exact: true })
  await expect(reopened).toHaveValue('')
  await expect(reopened).toHaveAttribute('type', 'password')
  expect(await page.locator('body').innerText()).not.toContain(secretMarker)
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0)
  await expect(providerRow(page, 'OpenAI main').getByRole('button', { name: 'Provider actions for OpenAI main', exact: true })).toBeFocused()

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
  await openProviderAction(page, 'DeepSeek alt', 'Delete provider')

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Delete provider', exact: true })).toBeVisible()
  await expectNoProviderUuid(page)
  const submit = dialog.getByRole('button', { name: 'Delete provider', exact: true })
  await expect(submit).toBeDisabled()
  await dialog.getByRole('checkbox', { name: /I confirm deletion/ }).check()
  await expect(submit).toBeEnabled()
  await submit.click()

  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0)
  await expect(providers.getByRole('listitem')).toHaveCount(1)
  // The deleted row's trigger no longer exists; focus lands on a still-present page action.
  await expect(page.getByRole('button', { name: 'Refresh providers', exact: true })).toBeFocused()
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
  await openProviderAction(page, 'OpenAI main', 'Delete provider')

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
  const parsing = parsingArea(page)
  await expect(page.getByRole('heading', { name: 'Posting parsing', exact: true })).toBeVisible()

  // The effective-configuration summary comes first; the editable form is not standing.
  await expect(parsing.baseline).toHaveText(ENVIRONMENT_DEFAULT)
  await expect(parsing.model).toHaveCount(0)
  await expect(parsing.region).toContainText('Saving does not contact the provider.')
  await expect(parsing.provider).toHaveCount(0)
  await expect(parsing.modelInput).toHaveCount(0)
  await expect(parsing.form).toHaveCount(0)
  await expect(parsing.edit).toBeEnabled()
  await expect(parsing.edit).toHaveAttribute('aria-expanded', 'false')

  await parsing.edit.click()
  await expect(parsing.form).toBeVisible()
  await expect(parsing.edit).toHaveAttribute('aria-expanded', 'true')
  // Only OpenAI providers are selectable; DeepSeek is not an option.
  expect(await parsing.provider.locator('option').allTextContents())
    .toEqual(['Choose an OpenAI provider', 'OpenAI main'])
  // Nothing typed so far is effective: the summary still shows the environment default.
  await expect(parsing.baseline).toHaveText(ENVIRONMENT_DEFAULT)

  await parsing.provider.selectOption(OPENAI_KEY)
  await parsing.modelInput.fill('  test_parse_model  ')
  await expect(parsing.baseline).toHaveText(ENVIRONMENT_DEFAULT)
  await parsing.save.click()

  await expect(page.getByText('Posting parsing settings saved. They apply to the next Analyze request.')).toBeVisible()
  await expect(parsing.baseline).toHaveText('OpenAI main')
  await expect(parsing.model).toHaveText('test_parse_model')
  // Saving ends the draft: the form closes and focus returns to the Edit action.
  await expect(parsing.form).toHaveCount(0)
  await expect(parsing.edit).toBeFocused()
  expect(puts).toHaveLength(1)
  expect(puts[0]).toEqual({ provider_key: OPENAI_KEY, model: 'test_parse_model' })

  // Restoring defaults is an explicit action available from the draft.
  await parsing.edit.click()
  await parsing.defaults.click()
  await expect(page.getByText('Saved selection cleared. Future Analyze requests use environment defaults.')).toBeVisible()
  await expect(parsing.baseline).toHaveText(ENVIRONMENT_DEFAULT)
  await expect(parsing.model).toHaveCount(0)
  await expect(parsing.form).toHaveCount(0)
  expect(deletes).toEqual(['http://127.0.0.1:8000/settings/ai/tasks/posting_parse'])
  expect(puts).toHaveLength(1)
  expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('cancelling a parsing draft discards it without any write and keeps the saved summary', async ({ page, context, baseURL }) => {
  const settings = {
    user: { display_name: null },
    ai: {
      providers: [{ provider_key: OPENAI_KEY, provider: 'openai', display_name: 'OpenAI main', monthly_budget_usd: null }],
      tasks: [{ task: 'posting_parse', provider_key: OPENAI_KEY, model: 'saved_model' }],
    },
  }
  const unexpectedRequests = []

  // No PUT or DELETE handler: any write is recorded as unexpected and aborted.
  await installMocks({ context, baseURL, settings, unexpectedRequests, handlers: {} })

  await openApiSettings(page)
  const parsing = parsingArea(page)
  await expect(parsing.baseline).toHaveText('OpenAI main')
  await expect(parsing.model).toHaveText('saved_model')
  await expect(parsing.form).toHaveCount(0)

  await parsing.edit.click()
  await expect(parsing.modelInput).toHaveValue('saved_model')
  await expect(parsing.save, 'An unchanged draft has nothing to save').toBeDisabled()
  await parsing.modelInput.fill('draft_only_model')
  await expect(parsing.save).toBeEnabled()
  // The draft is not the effective configuration.
  await expect(parsing.model).toHaveText('saved_model')

  await parsing.cancel.click()
  await expect(parsing.form).toHaveCount(0)
  await expect(parsing.model).toHaveText('saved_model')
  await expect(parsing.edit).toBeFocused()
  await expect(parsing.edit).toHaveAttribute('aria-expanded', 'false')

  // Reopening starts from the saved selection, not the discarded draft.
  await parsing.edit.click()
  await expect(parsing.modelInput).toHaveValue('saved_model')
  await expect(parsing.provider).toHaveValue(OPENAI_KEY)
  await settle(page)
  expect(unexpectedRequests, 'Cancelling must not issue any write; all requests must be mocked').toEqual([])
})

test('provider edit and key validation reject invalid entries without requests', async ({ page, context, baseURL }) => {
  const settings = {
    user: { display_name: null },
    ai: {
      providers: [{ provider_key: OPENAI_KEY, provider: 'openai', display_name: 'OpenAI main', monthly_budget_usd: null }],
      tasks: [],
    },
  }
  const patches = []
  const puts = []
  const unexpectedRequests = []

  await installMocks({
    context, baseURL, settings, unexpectedRequests,
    handlers: {
      [`PATCH http://127.0.0.1:8000/settings/ai/providers/${OPENAI_KEY}`]: async (route, request) => {
        patches.push(request.postDataJSON())
        await route.fulfill({ json: { provider_key: OPENAI_KEY, provider: 'openai', display_name: 'OpenAI main', monthly_budget_usd: null } })
      },
      [`PUT http://127.0.0.1:8000/settings/ai/providers/${OPENAI_KEY}/api-key`]: async (route, request) => {
        puts.push(request.postDataJSON())
        await route.fulfill({ status: 204 })
      },
    },
  })

  await openApiSettings(page)
  const providers = page.getByRole('list', { name: 'Saved providers' })
  await expect(providers.getByRole('listitem')).toHaveCount(1)

  // Blank display name is rejected and no PATCH is sent.
  await openProviderAction(page, 'OpenAI main', 'Edit provider')
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Display name', { exact: true }).fill('   ')
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Enter a display name.')
  await expect(dialog.getByLabel('Display name', { exact: true })).toBeFocused()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0)

  // Negative budget is rejected and no PATCH is sent.
  await openProviderAction(page, 'OpenAI main', 'Edit provider')
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Monthly budget (USD) · Optional', { exact: true }).fill('-1')
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Enter a finite monthly budget of zero or more, or leave it empty.')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0)

  // Blank key is rejected and no PUT is sent.
  await openProviderAction(page, 'OpenAI main', 'Replace API key')
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('New API key', { exact: true }).fill('')
  await dialog.getByRole('button', { name: 'Replace API key', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Enter an API key.')

  expect(patches).toHaveLength(0)
  expect(puts).toHaveLength(0)
  expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('editing distinguishes null and zero budget in the PATCH body', async ({ page, context, baseURL }) => {
  const settings = {
    user: { display_name: null },
    ai: {
      providers: [{ provider_key: OPENAI_KEY, provider: 'openai', display_name: 'OpenAI main', monthly_budget_usd: null }],
      tasks: [],
    },
  }
  const patches = []
  const unexpectedRequests = []

  await installMocks({
    context, baseURL, settings, unexpectedRequests,
    handlers: {
      [`PATCH http://127.0.0.1:8000/settings/ai/providers/${OPENAI_KEY}`]: async (route, request) => {
        const body = request.postDataJSON()
        patches.push(body)
        await route.fulfill({ json: { provider_key: OPENAI_KEY, provider: 'openai', display_name: 'OpenAI main', monthly_budget_usd: body.monthly_budget_usd } })
      },
    },
  })

  await openApiSettings(page)
  const providers = page.getByRole('list', { name: 'Saved providers' })
  await expect(providers.getByRole('listitem')).toHaveCount(1)

  // Empty budget saves as null.
  await openProviderAction(page, 'OpenAI main', 'Edit provider')
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Monthly budget (USD) · Optional', { exact: true }).fill('')
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0)

  // Zero budget saves as 0.
  await openProviderAction(page, 'OpenAI main', 'Edit provider')
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Monthly budget (USD) · Optional', { exact: true }).fill('0')
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0)

  expect(patches).toEqual([
    { display_name: 'OpenAI main', monthly_budget_usd: null },
    { display_name: 'OpenAI main', monthly_budget_usd: 0 },
  ])
  expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('pending provider edit blocks duplicate submits and Escape and retains the draft on failure', async ({ page, context, baseURL }) => {
  const settings = {
    user: { display_name: null },
    ai: {
      providers: [{ provider_key: OPENAI_KEY, provider: 'openai', display_name: 'OpenAI main', monthly_budget_usd: null }],
      tasks: [],
    },
  }
  const secretMarker = 'FAKE_EDIT_FAILURE_NOT_A_CREDENTIAL'
  const patches = []
  const unexpectedRequests = []
  let patchArrived = false
  const responseGate = Promise.withResolvers()

  await installMocks({
    context, baseURL, settings, unexpectedRequests,
    handlers: {
      [`PATCH http://127.0.0.1:8000/settings/ai/providers/${OPENAI_KEY}`]: async (route, request) => {
        patches.push(request.postDataJSON())
        patchArrived = true
        await responseGate.promise
        await route.fulfill({ status: 500, json: { detail: { code: 'settings.ai_operation_failed', message: secretMarker } } })
      },
    },
  })

  try {
    await openApiSettings(page)
    const providers = page.getByRole('list', { name: 'Saved providers' })
    await expect(providers.getByRole('listitem')).toHaveCount(1)
    await openProviderAction(page, 'OpenAI main', 'Edit provider')

    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Display name', { exact: true }).fill('  Renamed draft  ')
    const submit = dialog.locator('button[type="submit"]')
    await submit.click()
    await expect.poll(() => patchArrived, { message: 'The mock intercepted the PATCH before any response' }).toBe(true)

    // Saving state disables controls and blocks Escape before the response lands.
    await expect(dialog.locator('form')).toHaveAttribute('aria-busy', 'true')
    await expect(dialog.getByLabel('Display name', { exact: true })).toBeDisabled()
    await expect(submit).toHaveAccessibleName('Saving…', { exact: true })
    await expect(submit).toBeDisabled()
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()

    // Repeated submit events reach the real React onSubmit handler (it calls
    // preventDefault, so dispatchEvent reports false) but must not issue another PATCH.
    // A disabled button cannot submit, so the events are dispatched on the form itself.
    const dispatched = await dialog.locator('form').evaluate((form) => [0, 1].map(
      () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    ))
    expect(dispatched, 'Both submit events must have been handled by the form handler').toEqual([false, false])
    await settle(page)
    expect(patches).toHaveLength(1)

    responseGate.resolve()
    const alert = dialog.getByRole('alert')
    await expect(alert).toContainText('The operation failed. Review your settings before trying again.')
    await expect(alert).not.toContainText(secretMarker)
    await expect(dialog.locator('form')).toHaveAttribute('aria-busy', 'false')
    await expect(dialog.getByLabel('Display name', { exact: true })).toHaveValue('  Renamed draft  ')
    expect(await page.locator('body').innerText()).not.toContain(secretMarker)
    expect(patches).toHaveLength(1)
    expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
  } finally {
    responseGate.resolve()
  }
})

test('failed API key replacement shows only a safe error and reopens empty', async ({ page, context, baseURL }) => {
  const secretMarker = 'FAKE_KEY_FAILURE_MARKER_NOT_A_CREDENTIAL'
  const settings = {
    user: { display_name: null },
    ai: {
      providers: [{ provider_key: OPENAI_KEY, provider: 'openai', display_name: 'OpenAI main', monthly_budget_usd: null }],
      tasks: [],
    },
  }
  const puts = []
  const unexpectedRequests = []

  await installMocks({
    context, baseURL, settings, unexpectedRequests,
    handlers: {
      [`PUT http://127.0.0.1:8000/settings/ai/providers/${OPENAI_KEY}/api-key`]: async (route, request) => {
        puts.push(request.postDataJSON())
        await route.fulfill({ status: 500, json: { detail: { code: 'settings.ai_credential_state_uncertain', message: secretMarker } } })
      },
    },
  })

  await openApiSettings(page)
  const providers = page.getByRole('list', { name: 'Saved providers' })
  await expect(providers.getByRole('listitem')).toHaveCount(1)
  await openProviderAction(page, 'OpenAI main', 'Replace API key')

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('New API key', { exact: true }).fill(`  ${secretMarker}  `)
  await dialog.getByRole('button', { name: 'Replace API key', exact: true }).click()

  const alert = dialog.getByRole('alert')
  await expect(alert).toContainText('The operation failed and the API key state could not be confirmed.')
  await expect(alert).not.toContainText(secretMarker)
  expect(await page.locator('body').innerText()).not.toContain(secretMarker)

  // Reopen: the key draft is empty and masked; the secret is never displayed.
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0)
  await openProviderAction(page, 'OpenAI main', 'Replace API key')
  await expect(page.getByRole('dialog').getByLabel('New API key', { exact: true })).toHaveValue('')
  await expect(page.getByRole('dialog').getByLabel('New API key', { exact: true })).toHaveAttribute('type', 'password')

  expect(puts).toHaveLength(1)
  expect(puts[0]).toEqual({ api_key: `  ${secretMarker}  ` })
  expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('deleting a provider the server reports as in-use shows a safe error', async ({ page, context, baseURL }) => {
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
      [`DELETE http://127.0.0.1:8000/settings/ai/providers/${DEEPSEEK_KEY}`]: async (route) => {
        deletes.push(route.request().url())
        await route.fulfill({ status: 409, json: { detail: { code: 'settings.ai_provider_in_use', message: 'test_secret_api_key' } } })
      },
    },
  })

  await openApiSettings(page)
  const providers = page.getByRole('list', { name: 'Saved providers' })
  await expect(providers.getByRole('listitem')).toHaveCount(2)
  await openProviderAction(page, 'DeepSeek alt', 'Delete provider')

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('checkbox', { name: /I confirm deletion/ }).check()
  await dialog.getByRole('button', { name: 'Delete provider', exact: true }).click()

  const alert = dialog.getByRole('alert')
  await expect(alert).toContainText('This provider is used by a task. Clear its selection before deleting it.')
  await expect(alert).not.toContainText('test_secret_api_key')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('form')).toHaveAttribute('aria-busy', 'false')

  expect(deletes).toHaveLength(1)
  expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('posting parsing failure retains the draft and cancel restores the saved selection', async ({ page, context, baseURL }) => {
  const settings = {
    user: { display_name: null },
    ai: {
      providers: [{ provider_key: OPENAI_KEY, provider: 'openai', display_name: 'OpenAI main', monthly_budget_usd: null }],
      tasks: [],
    },
  }
  const puts = []
  const unexpectedRequests = []

  await installMocks({
    context, baseURL, settings, unexpectedRequests,
    handlers: {
      'PUT http://127.0.0.1:8000/settings/ai/tasks/posting_parse': async (route, request) => {
        puts.push(request.postDataJSON())
        await route.fulfill({ status: 500, json: { detail: { code: 'settings.ai_operation_failed', message: 'test_secret_api_key' } } })
      },
    },
  })

  await openApiSettings(page)
  const parsing = parsingArea(page)
  await expect(page.getByRole('heading', { name: 'Posting parsing', exact: true })).toBeVisible()
  await parsing.edit.click()
  await parsing.provider.selectOption(OPENAI_KEY)
  await parsing.modelInput.fill('  test_parse_model  ')
  await parsing.save.click()

  // Failure retains the draft and shows a fixed safe error; the form stays open and
  // the summary keeps showing the still-effective saved selection.
  await expect(page.getByRole('alert')).toContainText('The operation failed. Review your settings before trying again.')
  await expect(parsing.form).toBeVisible()
  await expect(parsing.modelInput).toHaveValue('  test_parse_model  ')
  await expect(parsing.provider).toHaveValue(OPENAI_KEY)
  await expect(parsing.baseline).toHaveText(ENVIRONMENT_DEFAULT)
  expect(await page.locator('body').innerText()).not.toContain('test_secret_api_key')

  // Cancel parsing changes closes the draft and restores the empty saved selection.
  await parsing.cancel.click()
  await expect(parsing.form).toHaveCount(0)
  await expect(parsing.baseline).toHaveText(ENVIRONMENT_DEFAULT)
  await parsing.edit.click()
  await expect(parsing.modelInput).toHaveValue('')
  await expect(parsing.provider).toHaveValue('')

  expect(puts).toHaveLength(1)
  expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('posting parsing with only DeepSeek providers shows an actionable prompt without writes', async ({ page, context, baseURL }) => {
  const settings = {
    user: { display_name: null },
    ai: {
      providers: [{ provider_key: DEEPSEEK_KEY, provider: 'deepseek', display_name: 'DeepSeek alt', monthly_budget_usd: null }],
      tasks: [],
    },
  }
  const unexpectedRequests = []

  await installMocks({ context, baseURL, settings, unexpectedRequests, handlers: {} })

  await openApiSettings(page)
  const parsing = parsingArea(page)
  await expect(page.getByRole('heading', { name: 'Posting parsing', exact: true })).toBeVisible()
  await expect(page.getByText('No OpenAI provider is available. Add an OpenAI provider above to configure parsing.')).toBeVisible()
  await parsing.edit.click()
  await expect(parsing.provider).toBeDisabled()
  await expect(parsing.modelInput).toBeDisabled()
  await expect(parsing.save).toBeDisabled()
  await expect(parsing.baseline).toHaveText(ENVIRONMENT_DEFAULT)

  expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('display name saves trimmed, clears to null, and cancels a draft', async ({ page, context, baseURL }) => {
  let savedUser = { display_name: null }
  const patches = []
  const unexpectedRequests = []

  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'GET' && request.url() === 'http://127.0.0.1:8000/settings') {
      await route.fulfill({ json: { user: savedUser, ai: { providers: [], tasks: [] } } })
    } else if (request.method() === 'PATCH' && request.url() === 'http://127.0.0.1:8000/settings/user') {
      const body = request.postDataJSON()
      patches.push(body)
      savedUser = { display_name: body.display_name }
      await route.fulfill({ json: { user: savedUser, ai: { providers: [], tasks: [] } } })
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
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Profile', exact: true }).click()

  const nameInput = page.getByLabel('Display name', { exact: true })
  await expect(nameInput).toBeVisible()
  await expect(nameInput).toHaveValue('')

  // Save a trimmed name.
  await nameInput.fill('  Ada Lovelace  ')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Changes saved.')
  await expect(nameInput).toHaveValue('Ada Lovelace')
  expect(patches).toEqual([{ display_name: 'Ada Lovelace' }])

  // Clear the name to null.
  await nameInput.fill('   ')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(nameInput).toHaveValue('')
  expect(patches[1]).toEqual({ display_name: null })

  // Cancel discards a draft.
  await nameInput.fill('Draft name')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(nameInput).toHaveValue('')
  expect(patches).toHaveLength(2)

  expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('a failed display name save retains the draft and shows a fixed error', async ({ page, context, baseURL }) => {
  const secretMarker = 'FAKE_DISPLAY_NAME_FAILURE_NOT_A_CREDENTIAL'
  const unexpectedRequests = []

  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'GET' && request.url() === 'http://127.0.0.1:8000/settings') {
      await route.fulfill({ json: { user: { display_name: null }, ai: { providers: [], tasks: [] } } })
    } else if (request.method() === 'PATCH' && request.url() === 'http://127.0.0.1:8000/settings/user') {
      await route.fulfill({ status: 500, json: { detail: { message: secretMarker } } })
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
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Profile', exact: true }).click()

  const nameInput = page.getByLabel('Display name', { exact: true })
  await nameInput.fill('  Ada Lovelace  ')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()

  await expect(page.getByRole('alert')).toContainText('Failed to save user settings (500). Please try again.')
  await expect(nameInput).toHaveValue('  Ada Lovelace  ')
  expect(await page.locator('body').innerText()).not.toContain(secretMarker)

  expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('the saved display name reaches Home and re-entering Settings restores it', async ({ page, context, baseURL }) => {
  let savedUser = { display_name: 'Ada Lovelace' }
  const unexpectedRequests = []

  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'GET' && request.url() === 'http://127.0.0.1:8000/settings') {
      await route.fulfill({ json: { user: savedUser, ai: { providers: [], tasks: [] } } })
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
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ada Lovelace')

  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Profile', exact: true }).click()
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Ada Lovelace')

  expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('a failed initial profile load offers retry, then a real save reaches Home and survives re-entry', async ({ page, context, baseURL }) => {
  const secretMarker = 'FAKE_PROFILE_LOAD_FAILURE_NOT_A_CREDENTIAL'
  const savedUser = { display_name: null }
  const patches = []
  const unexpectedRequests = []
  let failingLoads = 1

  await installMocks({
    context, baseURL, unexpectedRequests,
    settings: async (route) => {
      if (failingLoads > 0) {
        failingLoads -= 1
        await route.fulfill({ status: 500, json: { detail: secretMarker } })
      } else {
        await route.fulfill({ json: { user: savedUser, ai: { providers: [], tasks: [] } } })
      }
    },
    handlers: {
      'PATCH http://127.0.0.1:8000/settings/user': async (route, request) => {
        const body = request.postDataJSON()
        patches.push(body)
        savedUser.display_name = body.display_name
        await route.fulfill({ json: { user: savedUser, ai: { providers: [], tasks: [] } } })
      },
    },
  })

  const mainNavigation = page.getByRole('navigation', { name: 'Main navigation' })
  const settingsSections = page.getByRole('navigation', { name: 'Settings sections' })
  await page.goto('/')
  await mainNavigation.getByRole('button', { name: 'Settings', exact: true }).click()
  await settingsSections.getByRole('button', { name: 'Profile', exact: true }).click()

  // A failed read never shows an editable, empty-looking form.
  await expect(page.getByRole('alert')).toContainText('Could not load valid settings. Please try again.')
  await expect(page.getByLabel('Display name', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toHaveCount(0)
  expect(await page.locator('body').innerText()).not.toContain(secretMarker)
  expect(patches).toHaveLength(0)

  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  const nameInput = page.getByLabel('Display name', { exact: true })
  await expect(nameInput).toBeVisible()
  await expect(nameInput).toHaveValue('')
  await expect(page.getByRole('alert')).toHaveCount(0)

  await nameInput.fill('  Grace Hopper  ')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Changes saved.')
  await expect(nameInput).toHaveValue('Grace Hopper')
  expect(patches).toEqual([{ display_name: 'Grace Hopper' }])

  // The saved name is read back from the (mutable) server fixture on both pages.
  await mainNavigation.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Grace Hopper')
  await mainNavigation.getByRole('button', { name: 'Settings', exact: true }).click()
  await settingsSections.getByRole('button', { name: 'Profile', exact: true }).click()
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Grace Hopper')

  expect(patches).toHaveLength(1)
  expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('posting parsing validates, blocks controls while saving, retains a failed draft, and restores on re-entry', async ({ page, context, baseURL }) => {
  const settings = {
    user: { display_name: null },
    ai: {
      providers: [
        { provider_key: OPENAI_KEY, provider: 'openai', display_name: 'OpenAI main', monthly_budget_usd: null },
        { provider_key: DEEPSEEK_KEY, provider: 'deepseek', display_name: 'DeepSeek alt', monthly_budget_usd: null },
      ],
      tasks: [{ task: 'posting_parse', provider_key: OPENAI_KEY, model: 'saved_model' }],
    },
  }
  const secretMarker = 'FAKE_PARSE_FAILURE_NOT_A_CREDENTIAL'
  const puts = []
  const unexpectedRequests = []
  const responseGate = Promise.withResolvers()

  await installMocks({
    context, baseURL, settings, unexpectedRequests,
    handlers: {
      'PUT http://127.0.0.1:8000/settings/ai/tasks/posting_parse': async (route, request) => {
        const body = request.postDataJSON()
        puts.push(body)
        if (puts.length === 1) {
          await responseGate.promise
          await route.fulfill({ status: 500, json: { detail: { code: 'settings.ai_operation_failed', message: secretMarker } } })
        } else {
          settings.ai.tasks = [{ task: 'posting_parse', provider_key: body.provider_key, model: body.model }]
          await route.fulfill({ json: settings.ai.tasks[0] })
        }
      },
    },
  })

  try {
    await openApiSettings(page)
    const providerSelect = page.getByRole('combobox', { name: 'Parsing provider', exact: true })
    const modelInput = page.getByLabel('Parsing model', { exact: true })
    const saveButton = page.getByRole('button', { name: 'Save parsing settings', exact: true })
    const cancelButton = page.getByRole('button', { name: 'Cancel parsing changes', exact: true })
    const defaultsButton = page.getByRole('button', { name: 'Use environment defaults', exact: true })
    const refreshButton = page.getByRole('button', { name: 'Refresh providers', exact: true })
    const parseForm = page.locator('form.posting-parse-settings__form')
    const parsing = parsingArea(page)

    // The saved selection is summarized first; the draft opens only on request.
    await expect(parsing.baseline).toHaveText('OpenAI main')
    await expect(parsing.model).toHaveText('saved_model')
    await expect(parseForm).toHaveCount(0)
    await parsing.edit.click()
    await expect(providerSelect).toHaveValue(OPENAI_KEY)
    await expect(modelInput).toHaveValue('saved_model')
    await expect(saveButton).toBeDisabled()
    await expect(defaultsButton).toBeEnabled()

    // Validation: no provider, then a blank model; neither sends a request.
    await providerSelect.selectOption('')
    await saveButton.click()
    await expect(page.getByRole('alert')).toContainText('Choose an OpenAI provider for posting parsing.')
    await providerSelect.selectOption(OPENAI_KEY)
    await modelInput.fill('   ')
    await saveButton.click()
    await expect(page.getByRole('alert')).toContainText('Enter a model for posting parsing.')
    await settle(page)
    expect(puts).toHaveLength(0)

    // A valid submit hangs on the response gate.
    await modelInput.fill('  gated_model  ')
    await saveButton.click()
    await expect.poll(() => puts.length, { message: 'The mock intercepted the PUT before any response' }).toBe(1)
    expect(puts[0]).toEqual({ provider_key: OPENAI_KEY, model: 'gated_model' })

    await expect(parseForm).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByText('Saving parsing settings…')).toBeVisible()
    await expect(providerSelect).toBeDisabled()
    await expect(modelInput).toBeDisabled()
    await expect(saveButton).toBeDisabled()
    await expect(cancelButton).toBeDisabled()
    await expect(defaultsButton).toBeDisabled()
    await expect(refreshButton).toBeDisabled()
    // The in-flight draft is not yet the effective configuration.
    await expect(parsing.model).toHaveText('saved_model')

    // Repeated submit events reach the real form handler but send nothing more.
    const dispatched = await parseForm.evaluate((form) => [0, 1].map(
      () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    ))
    expect(dispatched, 'Both submit events must have been handled by the form handler').toEqual([false, false])
    await settle(page)
    expect(puts).toHaveLength(1)

    // Failure: safe fixed message, draft retained, controls restored.
    responseGate.resolve()
    await expect(page.getByRole('alert')).toContainText('The operation failed. Review your settings before trying again.')
    expect(await page.locator('body').innerText()).not.toContain(secretMarker)
    await expect(parseForm).toHaveAttribute('aria-busy', 'false')
    await expect(modelInput).toHaveValue('  gated_model  ')
    await expect(providerSelect).toHaveValue(OPENAI_KEY)
    await expect(saveButton).toBeEnabled()
    await expect(cancelButton).toBeEnabled()
    await expect(parsing.model).toHaveText('saved_model')
    await settle(page)
    expect(puts).toHaveLength(1)

    // A deliberate second attempt succeeds and is the only follow-up write.
    await saveButton.click()
    await expect(page.getByText('Posting parsing settings saved. They apply to the next Analyze request.')).toBeVisible()
    await expect(parsing.baseline).toHaveText('OpenAI main')
    await expect(parsing.model).toHaveText('gated_model')
    await expect(parseForm).toHaveCount(0)
    expect(puts).toHaveLength(2)
    expect(puts[1]).toEqual({ provider_key: OPENAI_KEY, model: 'gated_model' })

    // Leave and re-enter: the saved selection is re-read from the server fixture and
    // shown as a summary; a reopened draft starts from it.
    await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Profile', exact: true }).click()
    await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'API', exact: true }).click()
    await expect(parsing.model).toHaveText('gated_model')
    await expect(parseForm).toHaveCount(0)
    await parsing.edit.click()
    await expect(providerSelect).toHaveValue(OPENAI_KEY)
    await expect(modelInput).toHaveValue('gated_model')
    expect(puts).toHaveLength(2)
    expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
  } finally {
    responseGate.resolve()
  }
})

test('a lost provider edit response is reported as uncertain, not retried, and reconciled by refresh', async ({ page, context, baseURL }) => {
  const settings = {
    user: { display_name: null },
    ai: {
      providers: [
        { provider_key: OPENAI_KEY, provider: 'openai', display_name: 'OpenAI main', monthly_budget_usd: null },
        { provider_key: DEEPSEEK_KEY, provider: 'deepseek', display_name: 'DeepSeek alt', monthly_budget_usd: 4 },
      ],
      tasks: [],
    },
  }
  const patches = []
  const unexpectedRequests = []

  await installMocks({
    context, baseURL, settings, unexpectedRequests,
    handlers: {
      [`PATCH http://127.0.0.1:8000/settings/ai/providers/${OPENAI_KEY}`]: async (route, request) => {
        patches.push(request.postDataJSON())
        // The server persisted the change, but the client never receives the response.
        settings.ai.providers[0] = {
          provider_key: OPENAI_KEY, provider: 'openai', display_name: 'Server saved name', monthly_budget_usd: 3,
        }
        await route.abort('failed')
      },
    },
  })

  await openApiSettings(page)
  const providers = page.getByRole('list', { name: 'Saved providers' })
  await expect(providers.getByRole('listitem')).toHaveCount(2)
  const deepseekRow = providers.getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'DeepSeek alt', exact: true }) })
  const deepseekText = await deepseekRow.textContent()

  await openProviderAction(page, 'OpenAI main', 'Edit provider')
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Display name', { exact: true }).fill('Local draft name')
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()

  const alert = dialog.getByRole('alert')
  await expect(alert).toContainText('Could not confirm the settings change. Refresh Settings before trying again.')
  await expect(alert).toContainText('If the result is uncertain, close this dialog and refresh Settings before retrying.')
  await expect(dialog.locator('form')).toHaveAttribute('aria-busy', 'false')
  await settle(page)
  expect(patches).toHaveLength(1)
  expect(patches[0]).toEqual({ display_name: 'Local draft name', monthly_budget_usd: null })

  // The list is not updated optimistically, and nothing is retried on close.
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0)
  await expect(providers.getByRole('heading', { name: 'OpenAI main', exact: true })).toHaveCount(1)
  await expect(providers.getByRole('heading', { name: 'Local draft name', exact: true })).toHaveCount(0)
  await settle(page)
  expect(patches).toHaveLength(1)

  // Explicit refresh adopts the server state and keeps the other row unchanged.
  await page.getByRole('button', { name: 'Refresh providers', exact: true }).click()
  const reconciled = providers.getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Server saved name', exact: true }) })
  await expect(reconciled).toHaveCount(1)
  await expect(reconciled).toContainText('$3.00')
  await expect(providers.getByRole('listitem')).toHaveCount(2)
  await expect(deepseekRow).toHaveText(deepseekText)
  expect(patches).toHaveLength(1)
  expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('a lost posting parsing response keeps the draft, is not retried, and refresh adopts the server selection', async ({ page, context, baseURL }) => {
  const settings = {
    user: { display_name: null },
    ai: {
      providers: [{ provider_key: OPENAI_KEY, provider: 'openai', display_name: 'OpenAI main', monthly_budget_usd: null }],
      tasks: [],
    },
  }
  const puts = []
  const unexpectedRequests = []

  await installMocks({
    context, baseURL, settings, unexpectedRequests,
    handlers: {
      'PUT http://127.0.0.1:8000/settings/ai/tasks/posting_parse': async (route, request) => {
        puts.push(request.postDataJSON())
        // Persisted under a different model string than the draft; the response is lost.
        settings.ai.tasks = [{ task: 'posting_parse', provider_key: OPENAI_KEY, model: 'server_model' }]
        await route.abort('failed')
      },
    },
  })

  await openApiSettings(page)
  const parsing = parsingArea(page)
  await expect(parsing.baseline).toHaveText(ENVIRONMENT_DEFAULT)

  await parsing.edit.click()
  await parsing.provider.selectOption(OPENAI_KEY)
  await parsing.modelInput.fill('  draft_model  ')
  await parsing.save.click()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Could not confirm the settings change. Refresh Settings before trying again.')
  await expect(alert).toContainText('use Refresh providers above to reload saved settings before retrying')
  await expect(parsing.modelInput).toHaveValue('  draft_model  ')
  // The uncertain write is not adopted optimistically: the summary is unchanged.
  await expect(parsing.baseline).toHaveText(ENVIRONMENT_DEFAULT)
  await settle(page)
  expect(puts).toHaveLength(1)
  expect(puts[0]).toEqual({ provider_key: OPENAI_KEY, model: 'draft_model' })

  // Explicit refresh adopts the server selection; the stale local draft is dropped
  // rather than retried, and a reopened draft starts from the server values.
  await page.getByRole('button', { name: 'Refresh providers', exact: true }).click()
  await expect(parsing.baseline).toHaveText('OpenAI main')
  await expect(parsing.model).toHaveText('server_model')
  await expect(parsing.form).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await parsing.edit.click()
  await expect(parsing.modelInput).toHaveValue('server_model')
  await expect(parsing.provider).toHaveValue(OPENAI_KEY)
  await settle(page)
  expect(puts).toHaveLength(1)
  expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
})

test('provider actions menu is keyboard operable and returns focus to a row trigger that still exists', async ({ page, context, baseURL }) => {
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

  // Only the final delete may write; any edit/key request would be unexpected and aborted.
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
  await expect(page.getByRole('list', { name: 'Saved providers' }).getByRole('listitem')).toHaveCount(2)
  const row = providerRow(page, 'OpenAI main')
  const trigger = row.getByRole('button', { name: 'Provider actions for OpenAI main', exact: true })
  const menuItems = row.getByRole('menuitem')
  const editItem = row.getByRole('menuitem', { name: 'Edit provider', exact: true })
  const keyItem = row.getByRole('menuitem', { name: 'Replace API key', exact: true })
  const deleteItem = row.getByRole('menuitem', { name: 'Delete provider', exact: true })
  const noDialog = page.getByRole('dialog', { includeHidden: true })

  // The trigger is permanently discoverable and announces a collapsed menu.
  await expect(trigger).toBeVisible()
  await expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(row.getByRole('menu')).toHaveCount(0)

  // Native Enter on the focused trigger opens the menu and moves focus into it.
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(row.getByRole('menu')).toBeVisible()
  // Delete is last and visually distinct from the ordinary maintenance items.
  await expect(menuItems).toHaveText(['Edit provider', 'Replace API key', 'Delete provider'])
  const colors = await menuItems.evaluateAll((items) => items.map((item) => getComputedStyle(item).color))
  expect(colors[2], 'Delete must have its own danger emphasis').not.toBe(colors[0])
  expect(colors[1]).toBe(colors[0])
  await expect(editItem).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(keyItem).toBeFocused()
  await page.keyboard.press('End')
  await expect(deleteItem).toBeFocused()
  await page.keyboard.press('Home')
  await expect(editItem).toBeFocused()

  // Escape closes only the menu and returns focus to the trigger; nothing opened or sent.
  await page.keyboard.press('Escape')
  await expect(row.getByRole('menu')).toHaveCount(0)
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(trigger).toBeFocused()
  await expect(noDialog).toHaveCount(0)

  // ArrowDown also opens it; Enter on the focused item opens that maintenance dialog.
  await page.keyboard.press('ArrowDown')
  await expect(editItem).toBeFocused()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Edit provider', exact: true })).toBeVisible()
  await expect(row.getByRole('menu')).toHaveCount(0)
  await expectNoProviderUuid(page)
  // The menu item that opened the dialog is unmounted; Escape restores the row trigger.
  await page.keyboard.press('Escape')
  await expect(noDialog).toHaveCount(0)
  await expect(trigger).toBeFocused()

  // Same keyboard path for the key dialog, closed with its Cancel button.
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(keyItem).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog.getByRole('heading', { name: 'Replace API key', exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(noDialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await settle(page)
  expect(deletes).toHaveLength(0)

  // Deleting a row removes its trigger, so focus moves to a page action that remains.
  const otherTrigger = providerRow(page, 'DeepSeek alt').getByRole('button', { name: 'Provider actions for DeepSeek alt', exact: true })
  await otherTrigger.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('End')
  await expect(providerRow(page, 'DeepSeek alt').getByRole('menuitem', { name: 'Delete provider', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog.getByRole('heading', { name: 'Delete provider', exact: true })).toBeVisible()
  await dialog.getByRole('checkbox', { name: /I confirm deletion/ }).check()
  await dialog.getByRole('button', { name: 'Delete provider', exact: true }).click()
  await expect(noDialog).toHaveCount(0)
  await expect(page.getByRole('list', { name: 'Saved providers' }).getByRole('listitem')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Refresh providers', exact: true })).toBeFocused()
  expect(deletes).toEqual([`http://127.0.0.1:8000/settings/ai/providers/${DEEPSEEK_KEY}`])
  expect(unexpectedRequests, 'No edit or key request may be sent; all requests must be mocked').toEqual([])
})

// Synthetic, public DEMO content only: closed mocks, no backend, keyring or supplier.
const DEMO_LONG_NAME = 'Forschungsdatenmanagement-Plattform der Hochschule für Angewandte Wissenschaften München, Abteilung Bewerbungsunterlagen (DEMO)'
const DEMO_LONG_MODEL = 'gpt-demo-structured-output-with-web-search-long-model-identifier-2026-10-14-preview'

async function expectReachable(locator, viewport, what) {
  const box = await locator.boundingBox()
  expect(box, `${what} must have a layout box`).not.toBeNull()
  expect(box.x, `${what} starts inside the viewport`).toBeGreaterThanOrEqual(0)
  expect(box.y, `${what} starts inside the viewport`).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width, `${what} is not clipped on the right`).toBeLessThanOrEqual(viewport.width)
  expect(box.y + box.height, `${what} is not clipped at the bottom`).toBeLessThanOrEqual(viewport.height)
  const reachable = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    return top !== null && element.contains(top)
  })
  expect(reachable, `${what} is covered by another element`).toBe(true)
  return { x: box.x, y: box.y, width: box.width, height: box.height }
}

// Viewport evidence for the approved Settings layout. The screenshots and the geometry
// record are run artifacts written to the test output directory, not committed baselines; they let a
// reviewer look at real pages, and do not by themselves establish visual approval.
async function captureSettingsLayoutEvidence({ page, context, baseURL }, testInfo, viewport) {
  testInfo.setTimeout(60_000)
  const label = `${viewport.width}x${viewport.height}`
  const unexpectedRequests = []
  let loadMode = 'ok'
  const fixture = {
    user: { display_name: 'Demo Student' },
    ai: {
      providers: [
        { provider_key: OPENAI_KEY, provider: 'openai', display_name: 'OpenAI main (DEMO)', monthly_budget_usd: 25 },
        { provider_key: DEEPSEEK_KEY, provider: 'deepseek', display_name: 'DeepSeek research (DEMO)', monthly_budget_usd: null },
        { provider_key: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', provider: 'openai', display_name: DEMO_LONG_NAME, monthly_budget_usd: 0 },
      ],
      tasks: [{ task: 'posting_parse', provider_key: OPENAI_KEY, model: DEMO_LONG_MODEL }],
    },
  }
  await installMocks({
    context, baseURL, unexpectedRequests, handlers: {},
    settings: async (route) => {
      if (loadMode === 'fail') await route.fulfill({ status: 500, json: { detail: 'DEMO load failure' } })
      else await route.fulfill({ json: fixture })
    },
  })
  const geometry = {
    source: 'Synthetic public DEMO fixtures under closed mocks; no real backend, keyring or supplier',
    viewport,
    states: {},
  }
  async function capture(state) {
    // Written under the test output directory (preserved after a passing run) so the
    // PNG stays readable on disk instead of living only inside an in-memory attachment.
    const file = testInfo.outputPath(`settings-${label}-${state}.png`)
    await page.screenshot({ path: file, animations: 'disabled', caret: 'hide' })
    await testInfo.attach(`settings-${label}-${state}`, { path: file, contentType: 'image/png' })
  }

  await page.setViewportSize(viewport)
  const mainNavigation = page.getByRole('navigation', { name: 'Main navigation' })
  await page.goto('/')
  // Home is the unchanged visual reference at the same viewport.
  await mainNavigation.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Demo Student')
  await capture('home-reference')

  await mainNavigation.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'API', exact: true }).click()
  const providers = page.getByRole('list', { name: 'Saved providers' })
  await expect(providers.getByRole('listitem')).toHaveCount(3)
  const parsing = parsingArea(page)
  await expect(parsing.model).toHaveText(DEMO_LONG_MODEL)

  // Normal long-content state: three providers, null vs zero budget, wrapped long names.
  const shortRow = providerRow(page, 'OpenAI main (DEMO)')
  const budgetlessRow = providerRow(page, 'DeepSeek research (DEMO)')
  const longRow = providerRow(page, DEMO_LONG_NAME)
  await expect(shortRow).toContainText('$25.00')
  await expect(budgetlessRow).toContainText('Budget not set')
  await expect(longRow).toContainText('$0.00')
  await expect(providers).not.toContainText(/connected|verified|valid/i)
  await expectNoProviderUuid(page)
  const normal = await providers.getByRole('listitem').evaluateAll((rows) => rows.map((row) => {
    const heading = row.querySelector('h3')
    const trigger = row.querySelector('button[aria-haspopup="menu"]')
    const box = (element) => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } }
    return {
      row: box(row), heading: box(heading), trigger: box(trigger),
      headingClientWidth: heading.clientWidth, headingScrollWidth: heading.scrollWidth,
      headingTextOverflow: getComputedStyle(heading).textOverflow,
    }
  }))
  const documentOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  geometry.states.normal = { documentOverflow, rows: normal }
  expect(documentOverflow, 'The page must not scroll horizontally').toBeLessThanOrEqual(1)
  for (const item of normal) {
    expect(item.heading.left).toBeGreaterThanOrEqual(item.row.left - 1)
    expect(item.heading.right, 'A name must stay inside its row').toBeLessThanOrEqual(item.row.right + 1)
    expect(item.trigger.right, 'The action trigger must stay inside its row').toBeLessThanOrEqual(item.row.right + 1)
    expect(item.trigger.right).toBeLessThanOrEqual(viewport.width)
    expect(item.headingScrollWidth, 'Names wrap instead of being cut off').toBeLessThanOrEqual(item.headingClientWidth + 1)
    expect(item.headingTextOverflow).not.toBe('ellipsis')
  }
  const heights = normal.map((item) => item.heading.bottom - item.heading.top)
  expect(heights[2], 'The long German name wraps onto more lines than a short name').toBeGreaterThan(heights[0])
  const modelOverflow = await parsing.model.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }))
  expect(modelOverflow.scroll, 'The long model text wraps').toBeLessThanOrEqual(modelOverflow.client + 1)
  await capture('normal')

  // Row menu on the long-named row is not clipped by its container or covered.
  const trigger = longRow.getByRole('button', { name: `Provider actions for ${DEMO_LONG_NAME}`, exact: true })
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  const items = longRow.getByRole('menuitem')
  await expect(items).toHaveCount(3)
  const menuBoxes = []
  for (const name of ['Edit provider', 'Replace API key', 'Delete provider']) {
    menuBoxes.push(await expectReachable(longRow.getByRole('menuitem', { name, exact: true }), viewport, `${name} menu item`))
  }
  geometry.states.menu = {
    items: menuBoxes,
    focusedAfterOpen: await page.evaluate(() => document.activeElement?.textContent ?? null),
  }
  expect(geometry.states.menu.focusedAfterOpen).toBe('Edit provider')
  await capture('menu-open')
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()

  // Parsing draft: the summary stays, the form opens below and stays inside the viewport.
  await parsing.edit.click()
  await expect(parsing.form).toBeVisible()
  // The page scrolls vertically; bring the draft into view before measuring it.
  await parsing.save.scrollIntoViewIfNeeded()
  geometry.states.parsingDraft = await expectReachable(parsing.save, viewport, 'Save parsing settings')
  const formBox = await parsing.form.boundingBox()
  expect(formBox.x + formBox.width).toBeLessThanOrEqual(viewport.width)
  await capture('parsing-draft')
  await parsing.cancel.click()
  await expect(parsing.form).toHaveCount(0)

  // Maintenance dialogs with the long name: edit and a task-reference-blocked delete.
  await trigger.click()
  await longRow.getByRole('menuitem', { name: 'Edit provider', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Edit provider', exact: true })).toBeVisible()
  await expect(dialog.getByLabel('Display name', { exact: true })).toHaveValue(DEMO_LONG_NAME)
  await expectNoProviderUuid(page)
  geometry.states.editDialog = await expectReachable(dialog, viewport, 'Edit dialog')
  await capture('edit-dialog')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0)

  await openProviderAction(page, 'OpenAI main (DEMO)', 'Delete provider')
  await expect(dialog.getByRole('alert')).toContainText('Clear the selection before deleting')
  geometry.states.deleteBlockedDialog = await expectReachable(dialog, viewport, 'Blocked delete dialog')
  await capture('delete-blocked-dialog')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveCount(0)

  // Load failure keeps the last loaded list visible beside a clear error.
  loadMode = 'fail'
  await page.getByRole('button', { name: 'Refresh providers', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Could not load providers. Refresh to try again. Showing the last loaded list.')
  await expect(providers.getByRole('listitem')).toHaveCount(3)
  await capture('load-error')

  // Empty list: a clear next step instead of blank space.
  loadMode = 'ok'
  fixture.ai.providers = []
  fixture.ai.tasks = []
  await page.getByRole('button', { name: 'Refresh providers', exact: true }).click()
  await expect(page.getByText('No providers added yet. Add a provider to save its configuration and API key.')).toBeVisible()
  await expect(page.getByText('No OpenAI provider is available. Add an OpenAI provider above to configure parsing.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add provider', exact: true })).toBeEnabled()
  await capture('empty')

  const geometryFile = testInfo.outputPath(`settings-${label}-geometry.json`)
  await writeFile(geometryFile, JSON.stringify(geometry, null, 2), 'utf8')
  await testInfo.attach(`settings-${label}-geometry.json`, { path: geometryFile, contentType: 'application/json' })
  expect(unexpectedRequests, 'All non-Vite requests must be explicitly mocked').toEqual([])
}

test('settings layout evidence at 1440x1000 shows long German content, menu, draft, dialogs, error and empty states', async ({ page, context, baseURL }, testInfo) => {
  await captureSettingsLayoutEvidence({ page, context, baseURL }, testInfo, { width: 1440, height: 1000 })
})

test('settings layout evidence at 900x1000 shows long German content, menu, draft, dialogs, error and empty states', async ({ page, context, baseURL }, testInfo) => {
  await captureSettingsLayoutEvidence({ page, context, baseURL }, testInfo, { width: 900, height: 1000 })
})
