import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildLearningContext } from '../ai'

// Mock the supabase module
vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { supabase } from '../supabase'

const mockFrom = supabase.from as ReturnType<typeof vi.fn>

function makeChain(data: unknown[] | null, error: unknown = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data, error }),
  }
  mockFrom.mockReturnValue(chain)
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('buildLearningContext', () => {
  it('returns empty string when no feedback history', async () => {
    makeChain([])
    const result = await buildLearningContext('user-123')
    expect(result).toBe('')
  })

  it('returns empty string when data is null', async () => {
    makeChain(null)
    const result = await buildLearningContext('user-123')
    expect(result).toBe('')
  })

  it('includes Previously accepted line when accepts exist', async () => {
    makeChain([
      { user_action: 'accept', ai_suggestion: { title: 'Soccer Practice' }, correction: null },
      { user_action: 'accept', ai_suggestion: { title: 'School Trip' }, correction: null },
    ])
    const result = await buildLearningContext('user-123')
    expect(result).toContain('Previously accepted')
    expect(result).toContain('Soccer Practice')
    expect(result).toContain('School Trip')
  })

  it('includes Previously rejected line when rejects exist', async () => {
    makeChain([
      { user_action: 'reject', ai_suggestion: { title: 'Spam Newsletter' }, correction: null },
    ])
    const result = await buildLearningContext('user-123')
    expect(result).toContain('Previously rejected')
    expect(result).toContain('Spam Newsletter')
  })

  it('includes Previously corrected line with before→after format', async () => {
    makeChain([
      {
        user_action: 'correct',
        ai_suggestion: { title: 'Doctor Visit' },
        correction: { title: 'Dentist Appointment' },
      },
    ])
    const result = await buildLearningContext('user-123')
    expect(result).toContain('Previously corrected')
    expect(result).toContain('"Doctor Visit" → "Dentist Appointment"')
  })

  it('limits to 5 items per category', async () => {
    const manyAccepts = Array.from({ length: 10 }, (_, i) => ({
      user_action: 'accept',
      ai_suggestion: { title: `Event ${i + 1}` },
      correction: null,
    }))
    makeChain(manyAccepts)
    const result = await buildLearningContext('user-123')
    // Only 5 accepted titles should appear
    const matches = result.match(/Event \d+/g) ?? []
    expect(matches.length).toBeLessThanOrEqual(5)
  })

  it('returns empty string when feedback has no recognized titles', async () => {
    makeChain([
      { user_action: 'accept', ai_suggestion: { title: null }, correction: null },
      { user_action: 'reject', ai_suggestion: null, correction: null },
    ])
    const result = await buildLearningContext('user-123')
    expect(result).toBe('')
  })

  it('returns empty string when supabase throws', async () => {
    mockFrom.mockImplementation(() => { throw new Error('network error') })
    const result = await buildLearningContext('user-123')
    expect(result).toBe('')
  })

  it('wraps context in separator markers', async () => {
    makeChain([
      { user_action: 'accept', ai_suggestion: { title: 'Morning Run' }, correction: null },
    ])
    const result = await buildLearningContext('user-123')
    expect(result).toContain('---')
    expect(result).toContain("User's past feedback")
  })
})
