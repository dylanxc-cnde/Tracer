import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'

import {
  clearPostingParseSettings,
  createAIProvider,
  deleteAIProvider,
  replaceAIProviderKey,
  updateAIProvider,
  updatePostingParseSettings,
} from '../src/settings/api/settings.ts'

// Run with Node 24: node --test tests/settings-api.test.mjs
// Fetch is mocked: no live HTTP requests or system credentials are involved.
afterEach(() => mock.restoreAll())

function makeRequest(changes = {}) {
  return {
    provider: 'openai', display_name: 'test_provider', api_key: 'test_secret_api_key',
    ...changes,
  }
}

for (const provider of ['openai', 'deepseek']) {
  test(`createAIProvider sends ${provider} configuration and returns the public response`, async () => {
    const request = makeRequest({ provider, monthly_budget_usd: 12.5 })
    const created = {
      provider_key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      provider, display_name: 'test_provider', monthly_budget_usd: 12.5,
    }
    const fetchMock = mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:8000/settings/ai/providers')
      assert.equal(options.method, 'POST')
      assert.deepEqual(options.headers, { 'Content-Type': 'application/json' })
      assert.deepEqual(JSON.parse(options.body), request)
      assert.ok(!Object.hasOwn(JSON.parse(options.body), 'provider_key'))
      return Response.json(created, { status: 201 })
    })
    assert.deepEqual(await createAIProvider(request), created)
    assert.equal(request.api_key, 'test_secret_api_key')
    assert.equal(fetchMock.mock.callCount(), 1)
  })
}

test('createAIProvider omits an unset optional budget', async () => {
  mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.ok(!Object.hasOwn(JSON.parse(options.body), 'monthly_budget_usd'))
    return Response.json({
      provider_key: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      provider: 'openai', display_name: 'test_provider', monthly_budget_usd: null,
    }, { status: 201 })
  })
  assert.equal((await createAIProvider(makeRequest())).monthly_budget_usd, null)
})

const failures = [
  [422, { detail: { input: 'test_secret_api_key' } },
    'The provider settings are invalid. Please check your entries.'],
  [500, { detail: { code: 'settings.ai_provider_creation_error', message: 'test_secret_api_key' } },
    'Could not save the provider. No new API key was retained.'],
  [500, { detail: { code: 'settings.ai_provider_cleanup_error', message: 'test_secret_api_key' } },
    'Provider creation failed. An API key may remain in system credential storage; cleanup could not be confirmed.'],
  [500, { detail: { code: 'settings.ai_provider_settings_error', message: 'test_secret_api_key' } },
    'Could not read valid saved settings. No provider was created.'],
  [500, { detail: { code: 'test_secret_api_key', message: 'test_secret_api_key' } },
    'Could not confirm provider creation (500). Check your providers before retrying.'],
  [503, null,
    'Could not confirm provider creation (503). Check your providers before retrying.'],
]

for (const [status, body, message] of failures) {
  test(`createAIProvider sanitizes ${status} ${body?.detail?.code ?? 'validation or generic'} errors`, async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json(body, { status }))
    await assert.rejects(createAIProvider(makeRequest()), { message })
    assert.equal(fetchMock.mock.callCount(), 1)
  })
}

test('createAIProvider handles non-JSON server errors without displaying their body', async () => {
  mock.method(globalThis, 'fetch', async () => new Response('test_secret_api_key', { status: 502 }))
  await assert.rejects(createAIProvider(makeRequest()), {
    message: 'Could not confirm provider creation (502). Check your providers before retrying.',
  })
})

test('createAIProvider does not retry a network failure or expose its raw exception', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => {
    throw new Error('test_secret_api_key')
  })
  await assert.rejects(createAIProvider(makeRequest()), {
    message: 'Could not confirm provider creation. Check your providers before retrying.',
  })
  assert.equal(fetchMock.mock.callCount(), 1)
})

test('createAIProvider does not retry an unreadable success response', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('test_invalid', { status: 201 }))
  await assert.rejects(createAIProvider(makeRequest()), {
    message: 'Could not read the creation response. Check your providers before retrying.',
  })
  assert.equal(fetchMock.mock.callCount(), 1)
})

const PROVIDER_KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

test('updateAIProvider PATCHes only public fields and returns the server provider', async () => {
  const updated = {
    provider_key: PROVIDER_KEY, provider: 'openai', display_name: 'test_updated', monthly_budget_usd: 5,
  }
  const fetchMock = mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, `http://127.0.0.1:8000/settings/ai/providers/${PROVIDER_KEY}`)
    assert.equal(options.method, 'PATCH')
    assert.deepEqual(options.headers, { 'Content-Type': 'application/json' })
    assert.deepEqual(JSON.parse(options.body), { display_name: 'test_updated', monthly_budget_usd: 5 })
    return Response.json(updated, { status: 200 })
  })
  assert.deepEqual(await updateAIProvider(PROVIDER_KEY, { display_name: 'test_updated', monthly_budget_usd: 5 }), updated)
  assert.equal(fetchMock.mock.callCount(), 1)
})

test('updateAIProvider rejects a success response whose key does not match', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json({
    provider_key: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', provider: 'openai',
    display_name: 'test_updated', monthly_budget_usd: 5,
  }, { status: 200 }))
  await assert.rejects(updateAIProvider(PROVIDER_KEY, { display_name: 'test_updated', monthly_budget_usd: 5 }), {
    message: 'Could not confirm the settings change. Refresh Settings before trying again.',
  })
})

test('replaceAIProviderKey PUTs only the write-only key and expects 204', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, `http://127.0.0.1:8000/settings/ai/providers/${PROVIDER_KEY}/api-key`)
    assert.equal(options.method, 'PUT')
    assert.deepEqual(options.headers, { 'Content-Type': 'application/json' })
    assert.deepEqual(JSON.parse(options.body), { api_key: 'test_new_key' })
    return new Response(null, { status: 204 })
  })
  await replaceAIProviderKey(PROVIDER_KEY, { api_key: 'test_new_key' })
  assert.equal(fetchMock.mock.callCount(), 1)
})

test('deleteAIProvider DELETEs the provider without a body and expects 204', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, `http://127.0.0.1:8000/settings/ai/providers/${PROVIDER_KEY}`)
    assert.equal(options.method, 'DELETE')
    assert.equal(options.body, undefined)
    return new Response(null, { status: 204 })
  })
  await deleteAIProvider(PROVIDER_KEY)
  assert.equal(fetchMock.mock.callCount(), 1)
})

test('updatePostingParseSettings PUTs provider and model selection', async () => {
  const selection = { task: 'posting_parse', provider_key: PROVIDER_KEY, model: 'test_model' }
  const fetchMock = mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:8000/settings/ai/tasks/posting_parse')
    assert.equal(options.method, 'PUT')
    assert.deepEqual(options.headers, { 'Content-Type': 'application/json' })
    assert.deepEqual(JSON.parse(options.body), { provider_key: PROVIDER_KEY, model: 'test_model' })
    return Response.json(selection, { status: 200 })
  })
  assert.deepEqual(await updatePostingParseSettings({ provider_key: PROVIDER_KEY, model: 'test_model' }), selection)
  assert.equal(fetchMock.mock.callCount(), 1)
})

test('updatePostingParseSettings rejects a response for another task or provider', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json(
    { task: 'posting_parse', provider_key: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', model: 'test_model' },
    { status: 200 },
  ))
  await assert.rejects(updatePostingParseSettings({ provider_key: PROVIDER_KEY, model: 'test_model' }), {
    message: 'Could not confirm the settings change. Refresh Settings before trying again.',
  })
})

test('clearPostingParseSettings DELETEs the selection and expects 204', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:8000/settings/ai/tasks/posting_parse')
    assert.equal(options.method, 'DELETE')
    assert.equal(options.body, undefined)
    return new Response(null, { status: 204 })
  })
  await clearPostingParseSettings()
  assert.equal(fetchMock.mock.callCount(), 1)
})

const aiWriteFailures = [
  [404, { detail: { code: 'settings.ai_provider_not_found', message: 'test_secret_api_key' } },
    'This provider no longer exists. Refresh Settings before trying again.'],
  [409, { detail: { code: 'settings.ai_provider_in_use', message: 'test_secret_api_key' } },
    'This provider is used by a task. Clear its selection before deleting it.'],
  [422, { detail: 'Invalid AI settings.' },
    'These AI settings are invalid or unsupported. Please check your entries.'],
  [500, { detail: { code: 'settings.ai_operation_failed', message: 'test_secret_api_key' } },
    'The operation failed. Review your settings before trying again.'],
  [500, { detail: { code: 'settings.ai_credential_state_uncertain', message: 'test_secret_api_key' } },
    'The operation failed and the API key state could not be confirmed. Review system credential storage and refresh Settings before retrying.'],
  [500, { detail: { code: 'settings.ai_settings_state_uncertain', message: 'test_secret_api_key' } },
    'The operation failed. Credentials were restored, but settings could not be verified. Refresh Settings before retrying.'],
  [500, { detail: { code: 'test_unknown_code', message: 'test_secret_api_key' } },
    'Could not confirm the settings change. Refresh Settings before trying again.'],
]

for (const [status, body, message] of aiWriteFailures) {
  test(`AI settings writes sanitize ${status} ${body?.detail?.code ?? 'validation'} errors`, async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json(body, { status }))
    await assert.rejects(deleteAIProvider(PROVIDER_KEY), { message })
    assert.equal(fetchMock.mock.callCount(), 1)
  })
}

test('AI settings writes do not retry a network failure or expose its raw exception', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => {
    throw new Error('test_secret_api_key')
  })
  await assert.rejects(deleteAIProvider(PROVIDER_KEY), {
    message: 'Could not confirm the settings change. Refresh Settings before trying again.',
  })
  assert.equal(fetchMock.mock.callCount(), 1)
})

test('AI settings writes do not display a non-JSON server error body', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('test_secret_api_key', { status: 500 }))
  await assert.rejects(updateAIProvider(PROVIDER_KEY, { display_name: 'test', monthly_budget_usd: null }), {
    message: 'Could not confirm the settings change. Refresh Settings before trying again.',
  })
  assert.equal(fetchMock.mock.callCount(), 1)
})
