import { describe, it, expect } from 'vitest'
import { buildUserMessage } from '../ai'
import type { RawEmailContent } from '../types'

const BASE_EMAIL: RawEmailContent = {
  messageId: 'msg-001',
  subject: 'School pickup reminder',
  sender: 'teacher@school.edu',
  body: 'Just a reminder that pickup is at 3pm on Friday.',
  attachmentDescriptions: [],
}

describe('buildUserMessage', () => {
  it('includes subject, sender, and body', () => {
    const msg = buildUserMessage(BASE_EMAIL)
    expect(msg).toContain('Subject: School pickup reminder')
    expect(msg).toContain('From: teacher@school.edu')
    expect(msg).toContain('Just a reminder that pickup is at 3pm')
  })

  it('includes receivedAt when present', () => {
    const msg = buildUserMessage({ ...BASE_EMAIL, receivedAt: '2026-03-16T10:00:00.000Z' })
    expect(msg).toContain('Email received: 2026-03-16T10:00:00.000Z')
  })

  it('omits receivedAt when absent', () => {
    const msg = buildUserMessage(BASE_EMAIL)
    expect(msg).not.toContain('Email received:')
  })

  it('includes attachment descriptions when present', () => {
    const msg = buildUserMessage({
      ...BASE_EMAIL,
      attachmentDescriptions: ['permission_slip.pdf', 'schedule.docx'],
    })
    expect(msg).toContain('Attachments: permission_slip.pdf, schedule.docx')
  })

  it('omits attachments line when list is empty', () => {
    const msg = buildUserMessage(BASE_EMAIL)
    expect(msg).not.toContain('Attachments:')
  })

  it('includes fetched URL content when present', () => {
    const msg = buildUserMessage({
      ...BASE_EMAIL,
      fetchedUrlContent: 'Event details: Soccer tournament at Central Park, 10am–4pm',
    })
    expect(msg).toContain('Content from linked pages')
    expect(msg).toContain('Soccer tournament at Central Park')
  })

  it('omits fetched URL content when absent', () => {
    const msg = buildUserMessage(BASE_EMAIL)
    expect(msg).not.toContain('Content from linked pages')
  })

  it('filters out null entries — no double blank lines from missing optional fields', () => {
    const msg = buildUserMessage(BASE_EMAIL)
    expect(msg).not.toMatch(/\n{3,}/) // no triple newlines
  })
})
