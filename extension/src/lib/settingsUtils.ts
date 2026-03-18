import type { AISettings } from './types'

export type Provider       = AISettings['provider']
export type GodMode        = 'automatic' | 'manual' | 'disabled'
export type GodModeSubtype = 'open' | 'poll'

export const PROVIDERS: { value: Provider; label: string; hasApiKey: boolean; hasOAuth: boolean }[] = [
  { value: 'platform', label: 'Platform AI (OpenAI GPT-4o)',  hasApiKey: false, hasOAuth: false },
  { value: 'gemini',   label: 'Google Gemini (your account)', hasApiKey: false, hasOAuth: true  },
  { value: 'openai',   label: 'OpenAI (your API key)',         hasApiKey: true,  hasOAuth: false },
  { value: 'claude',   label: 'Anthropic Claude (your key)',   hasApiKey: true,  hasOAuth: false },
  { value: 'grok',     label: 'xAI Grok (your API key)',       hasApiKey: true,  hasOAuth: false },
]

export function getProviderDef(provider: Provider) {
  return PROVIDERS.find((p) => p.value === provider)!
}

export function validateApiKey(provider: Provider, apiKey: string): string | null {
  const def = getProviderDef(provider)
  if (def.hasApiKey && !apiKey.trim()) return 'Please enter your API key.'
  return null
}

export function buildChromeStoragePayload(settings: {
  godMode: GodMode
  categories: string[]
  learningEnabled: boolean
  godModeSubtype: GodModeSubtype
  pollIntervalHours: number
}): Record<string, unknown> {
  return { ...settings }
}
