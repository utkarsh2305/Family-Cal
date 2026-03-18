import { describe, it, expect } from 'vitest'
import {
  PROVIDERS,
  getProviderDef,
  validateApiKey,
  buildChromeStoragePayload,
} from '../settingsUtils'

describe('getProviderDef', () => {
  it('returns correct def for platform (no API key, no OAuth)', () => {
    const def = getProviderDef('platform')
    expect(def.hasApiKey).toBe(false)
    expect(def.hasOAuth).toBe(false)
    expect(def.label).toContain('Platform AI')
  })

  it('returns hasApiKey: true for openai', () => {
    const def = getProviderDef('openai')
    expect(def.hasApiKey).toBe(true)
    expect(def.hasOAuth).toBe(false)
  })

  it('returns hasOAuth: true for gemini', () => {
    const def = getProviderDef('gemini')
    expect(def.hasOAuth).toBe(true)
    expect(def.hasApiKey).toBe(false)
  })

  it('returns hasApiKey: true for claude', () => {
    const def = getProviderDef('claude')
    expect(def.hasApiKey).toBe(true)
  })

  it('returns hasApiKey: true for grok', () => {
    const def = getProviderDef('grok')
    expect(def.hasApiKey).toBe(true)
  })

  it('covers all providers in PROVIDERS list', () => {
    for (const p of PROVIDERS) {
      expect(getProviderDef(p.value)).toBeDefined()
    }
  })
})

describe('validateApiKey', () => {
  it('returns null for platform (no key required)', () => {
    expect(validateApiKey('platform', '')).toBeNull()
    expect(validateApiKey('platform', 'anything')).toBeNull()
  })

  it('returns null for gemini (OAuth, no key required)', () => {
    expect(validateApiKey('gemini', '')).toBeNull()
  })

  it('returns error string for openai with empty key', () => {
    expect(validateApiKey('openai', '')).toBe('Please enter your API key.')
    expect(validateApiKey('openai', '   ')).toBe('Please enter your API key.')
  })

  it('returns null for openai with valid key', () => {
    expect(validateApiKey('openai', 'sk-abc123')).toBeNull()
  })

  it('returns error string for claude with empty key', () => {
    expect(validateApiKey('claude', '')).toBe('Please enter your API key.')
  })

  it('returns null for claude with valid key', () => {
    expect(validateApiKey('claude', 'sk-ant-abc123')).toBeNull()
  })

  it('returns error string for grok with empty key', () => {
    expect(validateApiKey('grok', '')).toBe('Please enter your API key.')
  })

  it('returns null for grok with valid key', () => {
    expect(validateApiKey('grok', 'xai-abc123')).toBeNull()
  })
})

describe('buildChromeStoragePayload', () => {
  const base = {
    godMode: 'manual' as const,
    categories: ['school', 'work'],
    learningEnabled: true,
    godModeSubtype: 'open' as const,
    pollIntervalHours: 4,
  }

  it('returns all required keys', () => {
    const payload = buildChromeStoragePayload(base)
    expect(payload).toHaveProperty('godMode')
    expect(payload).toHaveProperty('categories')
    expect(payload).toHaveProperty('learningEnabled')
    expect(payload).toHaveProperty('godModeSubtype')
    expect(payload).toHaveProperty('pollIntervalHours')
  })

  it('preserves pollIntervalHours value', () => {
    const payload = buildChromeStoragePayload({ ...base, pollIntervalHours: 12 })
    expect(payload.pollIntervalHours).toBe(12)
  })

  it('preserves categories array', () => {
    const cats = ['travel', 'appointments']
    const payload = buildChromeStoragePayload({ ...base, categories: cats })
    expect(payload.categories).toEqual(cats)
  })

  it('preserves godMode value', () => {
    const payload = buildChromeStoragePayload({ ...base, godMode: 'automatic' })
    expect(payload.godMode).toBe('automatic')
  })

  it('preserves learningEnabled boolean', () => {
    const payload = buildChromeStoragePayload({ ...base, learningEnabled: false })
    expect(payload.learningEnabled).toBe(false)
  })
})
