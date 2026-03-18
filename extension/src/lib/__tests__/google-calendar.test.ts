import { describe, it, expect } from 'vitest'
import { normalizeEventDateTime } from '../google-calendar'

describe('normalizeEventDateTime', () => {
  it('passes through a full ISO datetime unchanged', () => {
    expect(normalizeEventDateTime('2026-03-15T14:00:00')).toBe('2026-03-15T14:00:00')
  })

  it('passes through a datetime with Z suffix unchanged', () => {
    expect(normalizeEventDateTime('2026-03-15T14:00:00Z')).toBe('2026-03-15T14:00:00Z')
  })

  it('passes through a datetime with offset unchanged', () => {
    expect(normalizeEventDateTime('2026-03-15T14:00:00+05:30')).toBe('2026-03-15T14:00:00+05:30')
  })

  it('appends T00:00:00 to a date-only string', () => {
    expect(normalizeEventDateTime('2026-03-15')).toBe('2026-03-15T00:00:00')
  })

  it('handles single-digit month and day', () => {
    expect(normalizeEventDateTime('2026-01-05')).toBe('2026-01-05T00:00:00')
  })
})
