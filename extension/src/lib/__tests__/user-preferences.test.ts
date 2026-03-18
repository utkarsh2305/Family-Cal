import { describe, it, expect } from 'vitest'
import { shouldAnalyzeEmail, DEFAULT_CATEGORIES } from '../preferences'

describe('shouldAnalyzeEmail', () => {
  // Mode: disabled
  it('returns false when mode is disabled', () => {
    expect(shouldAnalyzeEmail('School soccer practice', DEFAULT_CATEGORIES, 'disabled')).toBe(false)
  })

  it('returns false when mode is disabled even with empty subject', () => {
    expect(shouldAnalyzeEmail('', DEFAULT_CATEGORIES, 'disabled')).toBe(false)
  })

  // Mode: manual / automatic — newsletters/promotions blocking
  it('returns false for newsletter subjects when newsletters not in categories', () => {
    const noNewsletters = DEFAULT_CATEGORIES.filter((c) => c !== 'newsletters')
    expect(shouldAnalyzeEmail('Monthly newsletter digest — unsubscribe here', noNewsletters, 'manual')).toBe(false)
  })

  it('returns false for promotional subjects when promotions not in categories', () => {
    const noPromos = DEFAULT_CATEGORIES.filter((c) => c !== 'promotions')
    expect(shouldAnalyzeEmail('50% off sale — flash deal', noPromos, 'manual')).toBe(false)
  })

  it('returns true for newsletter if newsletters IS in categories', () => {
    const withNewsletters = [...DEFAULT_CATEGORIES, 'newsletters']
    expect(shouldAnalyzeEmail('Monthly newsletter digest', withNewsletters, 'manual')).toBe(true)
  })

  it('returns true for a school email with default categories in manual mode', () => {
    expect(shouldAnalyzeEmail('School pickup reminder', DEFAULT_CATEGORIES, 'manual')).toBe(true)
  })

  it('returns true for a sports email with default categories in automatic mode', () => {
    expect(shouldAnalyzeEmail('Soccer practice Saturday 10am', DEFAULT_CATEGORIES, 'automatic')).toBe(true)
  })

  it('returns true for any email when categories list is empty', () => {
    expect(shouldAnalyzeEmail('50% off sale — flash deal', [], 'manual')).toBe(true)
  })

  it('returns true for work email in automatic mode', () => {
    expect(shouldAnalyzeEmail('Team standup meeting tomorrow 9am', DEFAULT_CATEGORIES, 'automatic')).toBe(true)
  })

  it('returns true for unrecognized subject (no matching category — not a blocker)', () => {
    expect(shouldAnalyzeEmail('Birthday party at Jakes house', DEFAULT_CATEGORIES, 'manual')).toBe(true)
  })
})
