/**
 * Content script — runs on https://mail.google.com/*
 *
 * Watches for Gmail navigation, injects the "Family Cal" button
 * into the email toolbar, and sends extracted email content to the popup
 * via chrome.storage (popup reads from storage, not direct message passing,
 * to avoid timing issues with MV3 service workers).
 */

import {
  injectFamilyCalButton,
  removeFamilyCalButton,
  extractEmailContent,
  watchGmailNavigation,
} from '../lib/gmail'

function getEmailContainer(): Element | null {
  return (
    document.querySelector('[data-legacy-message-id]') ??
    document.querySelector('[data-message-id]') ??
    document.querySelector('.adn.ads') ??
    document.querySelector('.gs')
  )
}

/**
 * Waits for the email container element to appear in the DOM, then calls back.
 * Uses a MutationObserver so it reacts immediately when Gmail finishes rendering,
 * rather than relying on a fixed timeout. Falls back/gives up after 8 seconds.
 */
function waitForEmailContainer(callback: () => void): () => void {
  // Already rendered — call back on next microtask so callers can set up teardown first
  if (getEmailContainer()) {
    const t = setTimeout(callback, 0)
    return () => clearTimeout(t)
  }

  let done = false
  const observer = new MutationObserver(() => {
    if (done) return
    if (getEmailContainer()) {
      done = true
      observer.disconnect()
      clearTimeout(giveUp)
      callback()
    }
  })

  observer.observe(document.body, { subtree: true, childList: true })

  // Safety net — stop watching after 8 s if Gmail never renders the container
  const giveUp = setTimeout(() => {
    if (!done) observer.disconnect()
  }, 8000)

  return () => {
    done = true
    observer.disconnect()
    clearTimeout(giveUp)
  }
}

let cancelWait: (() => void) | null = null

function sendEmailToPopup(messageId: string): void {
  const content = extractEmailContent(messageId)
  if (!content) return
  chrome.storage.local.set({ pendingEmail: content }, () => {
    chrome.runtime.sendMessage({ type: 'GET_EMAIL_CONTENT', messageId: content.messageId })
  })
}

function handleEmailOpen(): void {
  // Cancel any in-progress wait from a previous navigation
  cancelWait?.()

  cancelWait = waitForEmailContainer(() => {
    cancelWait = null

    // Read the cached god mode setting (set by the popup on login/settings save)
    chrome.storage.local.get('godMode', ({ godMode }) => {
      if (godMode === 'disabled') return

      if (godMode === 'automatic') {
        // Auto mode: extract and queue email immediately — no button click required
        const container = getEmailContainer()
        if (!container) return
        const messageId = (
          container.getAttribute('data-legacy-message-id') ??
          container.getAttribute('data-message-id') ??
          Date.now().toString()
        )
        sendEmailToPopup(messageId)
      } else {
        // Manual mode (default): inject the "Family Cal" button
        injectFamilyCalButton((messageId) => sendEmailToPopup(messageId))
      }
    })
  })
}

function isEmailUrl(): boolean {
  // Gmail email URLs: /mail/u/0/#inbox/FMfcgz... or #all/<id> etc.
  // The message ID after the last / is alphanumeric (hex or base64url)
  return (
    /\/mail\/[^#]*#[^/]+\/\w+/.test(location.href) ||
    getEmailContainer() !== null
  )
}

function handleNavigation(): void {
  // chrome.runtime.id becomes undefined when the extension is reloaded while
  // this tab remains open (orphaned content script). Bail out silently.
  if (!chrome.runtime?.id) return

  cancelWait?.()
  cancelWait = null
  removeFamilyCalButton()

  if (isEmailUrl()) {
    handleEmailOpen()
  }
}

// Share the Supabase auth session to window.localStorage so the bookmarklet
// can access it. The bookmarklet runs as a regular web page (no chrome.* APIs),
// so it reads auth from localStorage rather than chrome.storage.
const SUPABASE_LS_KEY = 'sb-owmsrwwmdftnnkxhrvgg-auth-token'
chrome.storage.local.get(SUPABASE_LS_KEY, (result) => {
  const session = result[SUPABASE_LS_KEY]
  if (session) {
    try {
      window.localStorage.setItem(
        SUPABASE_LS_KEY,
        typeof session === 'string' ? session : JSON.stringify(session),
      )
    } catch {}
  }
})

// Initial check on load
handleNavigation()

// Watch for Gmail SPA navigation
watchGmailNavigation(handleNavigation)
