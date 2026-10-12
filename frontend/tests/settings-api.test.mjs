import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'

import { createAIProvider } from '../src/settings/api/settings.ts'

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
