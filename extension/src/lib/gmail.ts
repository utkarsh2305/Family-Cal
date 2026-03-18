/**
 * Gmail DOM helpers — content script side.
 *
 * Gmail uses dynamically generated class names that change frequently.
 * We target stable data attributes and ARIA roles wherever possible.
 */

import type { RawEmailContent } from './types'

// Injects the "Send to Family Cal" button into the open email toolbar
export function injectFamilyCalButton(onClick: (messageId: string) => void): void {
  // Try multiple selectors — Gmail's generated class names change but these are stable
  const emailContainer = (
    document.querySelector<HTMLElement>('[data-legacy-message-id]') ??
    document.querySelector<HTMLElement>('[data-message-id]') ??
    document.querySelector<HTMLElement>('.adn.ads') ??
    document.querySelector<HTMLElement>('.gs')
  )
  if (!emailContainer) return

  const messageId = (
    emailContainer.getAttribute('data-legacy-message-id') ??
    emailContainer.getAttribute('data-message-id') ??
    Date.now().toString()
  )

  // Avoid injecting twice
  if (document.getElementById('family-cal-btn')) return

  // Find the first *visible* inject point — Gmail has multiple .G-atb elements and
  // the first one is often hidden (display:none) in full-screen email view.
  function isVisible(el: HTMLElement): boolean {
    const s = window.getComputedStyle(el)
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0'
  }

  const toolbar = (
    // Prefer a visible .G-atb (may be multiple; pick first visible one)
    Array.from(document.querySelectorAll<HTMLElement>('.G-atb')).find(isVisible) ??
    // Gmail full-screen message toolbar attribute
    document.querySelector<HTMLElement>('[gh="mtb"]') ??
    document.querySelector<HTMLElement>('.ade') ??
    emailContainer.querySelector<HTMLElement>('[role="toolbar"]') ??
    document.querySelector<HTMLElement>('[role="toolbar"]')
  )
  if (!toolbar) return

  const btn = document.createElement('button')
  btn.id = 'family-cal-btn'
  btn.title = 'Send to Family Calendar'
  btn.setAttribute('aria-label', 'Send to Family Calendar')
  btn.style.cssText = `
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px; margin-left: 8px;
    border: 1px solid #dadce0; border-radius: 4px;
    background: #fff; color: #1a73e8;
    font-size: 13px; font-family: 'Google Sans', sans-serif;
    cursor: pointer; white-space: nowrap;
    pointer-events: auto; position: relative; z-index: 1000;
  `
  btn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" stroke-width="2">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
    Family Cal
  `

  btn.addEventListener('mouseenter', () => { btn.style.background = '#f8f9fa' })
  btn.addEventListener('mouseleave', () => { btn.style.background = '#fff' })
  btn.addEventListener('click', () => onClick(messageId))

  // Ensure the toolbar itself doesn't block pointer events
  toolbar.style.pointerEvents = 'auto'
  toolbar.appendChild(btn)
}

// Removes the injected button (called when navigating away from an email)
export function removeFamilyCalButton(): void {
  document.getElementById('family-cal-btn')?.remove()
}

// Extracts the visible email content from the open Gmail message DOM
export function extractEmailContent(messageId: string): RawEmailContent | null {
  const emailContainer = (
    document.querySelector<HTMLElement>(`[data-legacy-message-id="${messageId}"]`) ??
    document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`) ??
    document.querySelector<HTMLElement>('.adn.ads') ??
    document.querySelector<HTMLElement>('.gs')
  )
  if (!emailContainer) return null

  // Subject: stable class in Gmail
  const subjectEl = (
    document.querySelector<HTMLElement>('h2.hP') ??
    document.querySelector<HTMLElement>('h2[data-thread-perm-id]') ??
    document.querySelector<HTMLElement>('[data-legacy-thread-id] h2')
  )
  const subject = subjectEl?.innerText?.trim() ?? '(no subject)'

  // Sender: .gD has a stable [email] attribute
  const senderEl = (
    emailContainer.querySelector<HTMLElement>('.gD[email]') ??
    emailContainer.querySelector<HTMLElement>('[email]')
  )
  const sender = senderEl?.getAttribute('email') ?? senderEl?.innerText?.trim() ?? '(unknown sender)'

  // Body: .ii.gt is Gmail's stable message body wrapper
  const bodyEl = (
    emailContainer.querySelector<HTMLElement>('.ii.gt > div') ??
    emailContainer.querySelector<HTMLElement>('.ii.gt') ??
    emailContainer.querySelector<HTMLElement>('[dir="ltr"]')
  )
  const body = bodyEl?.innerText?.trim() ?? ''

  // Received date: .g3 title attribute has the full datetime string (e.g. "Mon, Mar 16, 2026, 4:06 PM")
  const dateEl = (
    emailContainer.querySelector<HTMLElement>('.g3[title]') ??
    document.querySelector<HTMLElement>('.g3[title]')
  )
  const receivedAt = dateEl?.getAttribute('title')
    ? (() => { try { return new Date(dateEl.getAttribute('title')!).toISOString() } catch { return undefined } })()
    : undefined

  // Attachments
  const attachmentEls = emailContainer.querySelectorAll<HTMLElement>('[download-url], [data-tooltip*="attachment"]')
  const attachmentDescriptions = Array.from(attachmentEls)
    .map((el) => el.getAttribute('aria-label') ?? el.innerText.trim())
    .filter(Boolean)

  // URLs: extract http/https links from body, skip tracking/unsubscribe patterns
  const SKIP_URL_RE = /unsubscr|track[^s]|click\.|pixel\.|open\.|beacon|mailto:|tel:|#/i
  const rawUrls = body.match(/https?:\/\/[^\s<>"'{}|\\^`[\]]+/g) ?? []
  const urls = [...new Set(
    rawUrls
      .map(u => u.replace(/[.,;:!?)]+$/, ''))
      .filter(u => !SKIP_URL_RE.test(u))
  )].slice(0, 5)

  return { messageId, subject, sender, body, attachmentDescriptions, receivedAt, urls }
}

// Watches for Gmail's navigation (single-page app) and fires callback on route changes
export function watchGmailNavigation(onNavigate: () => void): () => void {
  let lastUrl = location.href

  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href
      onNavigate()
    }
  })

  observer.observe(document.body, { subtree: true, childList: true })

  return () => observer.disconnect()
}
