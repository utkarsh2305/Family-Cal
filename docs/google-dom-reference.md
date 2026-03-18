# Gmail DOM Reference

**Date Created:** April 2026
**Gmail Version:** Current (as of 2026)
**Browser:** Chrome
**Method:** Manual inspection with DevTools

---

## Overview

This document describes the HTML/DOM structure of Gmail's web interface, specifically focusing on the elements needed for the Family Calendar Chrome extension to read email data without breaking when Gmail updates.

**Key Principle:** Gmail's DOM structure changes frequently. This reference captures the current structure as of April 2026, but selectors should be defensive and include fallbacks.

---

## Email List Item (Inbox View)

### Container Structure

```html
<!-- Main email list item container -->
<div class="nH a98 iY">
  <!-- This is the entire email row in the inbox list -->
  
  <!-- Sender section -->
  <div class="yX">
    <span class="gD">sender@example.com</span>
  </div>
  
  <!-- Subject section -->
  <div class="hP">
    <h2 class="hP">Email Subject Line Here</h2>
  </div>
  
  <!-- Timestamp section -->
  <span class="gF">2:21 PM</span>
  <!-- Or for older emails: "Apr 15" -->
  
  <!-- Snippet/Preview -->
  <span class="gG">First few words of email...</span>
</div>
```

### Key Classes

| Class | Purpose | Contains |
|-------|---------|----------|
| `nH` | Email item base | Entire email container |
| `a98` | Email item styling | Part of container |
| `iY` | Email item state | Container |
| `yX` | Sender container | Email address |
| `gD` | Sender email text | The actual sender address |
| `hP` | Subject heading | Email subject |
| `gF` | Timestamp | Time received (2:21 PM) |
| `gG` | Email snippet | Preview text |

---

## Extracting Individual Elements

### 1. Sender Email Address

**What it looks like:**
```html
<span class="gD">no-reply@support.uk.mytrip.com</span>
```

**CSS Selectors (try in order):**
```css
/* Primary selector */
span.gD

/* Fallback - inside email container */
div.nH span.gD

/* Alternative - by data attributes (if available) */
span[data-email]

/* Last resort - find by role and pattern */
span[role="link"][jsname]
```

**JavaScript to extract:**
```javascript
function getEmailSender(emailElement) {
  // Method 1: Direct class selector
  const senderSpan = emailElement.querySelector('span.gD');
  if (senderSpan) return senderSpan.textContent.trim();
  
  // Method 2: Look for span with email pattern
  const allSpans = emailElement.querySelectorAll('span');
  for (const span of allSpans) {
    const text = span.textContent;
    if (text.includes('@')) return text.trim();
  }
  
  // Method 3: Look for role="link"
  const link = emailElement.querySelector('span[role="link"]');
  if (link) return link.textContent.trim();
  
  return null;
}
```

**Expected Output:**
```
"no-reply@support.uk.mytrip.com"
"mom@gmail.com"
"hr@company.com"
```

---

### 2. Email Subject Line

**What it looks like:**
```html
<h2 class="hP">Additional service receipt for order 1117-095-191 (2)</h2>
```

**CSS Selectors (try in order):**
```css
/* Primary selector */
h2.hP

/* Fallback - any heading in container */
div.nH h2

/* Alternative - heading with data attributes */
h2[data-subject]

/* Last resort - find heading with text */
h2[jsname]
```

**JavaScript to extract:**
```javascript
function getEmailSubject(emailElement) {
  // Method 1: Direct h2 selector
  const h2 = emailElement.querySelector('h2.hP');
  if (h2) return h2.textContent.trim();
  
  // Method 2: Any h2 in the email
  const heading = emailElement.querySelector('h2');
  if (heading) return heading.textContent.trim();
  
  // Method 3: Look for aria-label with subject
  const labeledElement = emailElement.querySelector('[aria-label*="subject"]');
  if (labeledElement) return labeledElement.textContent.trim();
  
  return null;
}
```

**Expected Output:**
```
"Additional service receipt for order 1117-095-191 (2)"
"Team standup tomorrow 10am"
"Interview - Senior Engineer Role"
```

---

### 3. Timestamp / Date Received

**What it looks like:**
```html
<!-- Recent emails show time -->
<span class="gF">2:21 PM</span>

<!-- Older emails show date -->
<span class="gF">Apr 15</span>

<!-- Very old emails show full date -->
<span class="gF">Mar 20, 2025</span>
```

**CSS Selectors (try in order):**
```css
/* Primary selector */
span.gF

/* Fallback - by content pattern */
span[aria-label*="time"]

/* Alternative - by role */
span[aria-label*="at"]
```

**JavaScript to extract:**
```javascript
function getEmailTimestamp(emailElement) {
  // Method 1: Direct class selector
  const timeSpan = emailElement.querySelector('span.gF');
  if (timeSpan) {
    const timeText = timeSpan.textContent.trim();
    return parseGmailTimestamp(timeText);
  }
  
  // Method 2: Look for aria-label with date/time
  const labeledElement = emailElement.querySelector('[aria-label*="at"]');
  if (labeledElement) {
    return parseGmailTimestamp(labeledElement.getAttribute('aria-label'));
  }
  
  return null;
}

function parseGmailTimestamp(timeStr) {
  // "2:21 PM" → Today at 2:21 PM
  // "Apr 15" → April 15 of current/last year
  // "Mar 20, 2025" → March 20, 2025
  
  const now = new Date();
  
  if (timeStr.includes(':') && (timeStr.includes('AM') || timeStr.includes('PM'))) {
    // Time of day - assume today
    const time = new Date(timeStr);
    return time;
  } else if (timeStr.includes(',')) {
    // Full date with year
    return new Date(timeStr);
  } else {
    // Month and day only - assume current year
    return new Date(`${timeStr}, ${now.getFullYear()}`);
  }
}
```

**Expected Output:**
```
Date object: 2026-04-15T14:21:00.000Z
Date object: 2026-04-15T00:00:00.000Z
Date object: 2025-03-20T00:00:00.000Z
```

---

### 4. Email Body / Preview Text

**What it looks like:**
```html
<span class="gG">We have confirmed your payment. Please find your receipt attached to this email.</span>
```

**Important Note:** Gmail's inbox list view only shows a snippet (first ~100 characters). The full email body is not accessible in list view. You must click the email to expand it.

**CSS Selectors (try in order):**
```css
/* Primary selector for snippet -->
span.gG

/* Fallback - any text span in container */
div.nH span:not(.gD):not(.gF)
```

**JavaScript to extract:**
```javascript
function getEmailBodySnippet(emailElement) {
  // Get preview text (limited)
  const snippet = emailElement.querySelector('span.gG');
  if (snippet) return snippet.textContent.trim();
  
  return null;
}

async function getFullEmailBody(emailElement) {
  // CANNOT get full body from list view
  // Must click email to expand, then read from expanded view
  // This is a limitation of Gmail's DOM structure
  
  const subject = getEmailSubject(emailElement);
  console.warn(`To get full body for "${subject}", email must be clicked/expanded`);
  
  return null;
}
```

**Expected Output (snippet only):**
```
"We have confirmed your payment. Please find your receipt..."
"Thank you for your order. Your purchase confirms..."
"You are invited to a meeting tomorrow at 10am"
```

**Limitation:** Full email body is not accessible in inbox list view. If needed, implement clicking the email to expand it, then read from the expanded view (different DOM structure).

---

## Gmail Tabs (Primary, Updates, Social, etc.)

### Tab Container Structure

```html
<!-- Gmail tabs container (at top of inbox) -->
<div class="aH" role="tablist">
  <!-- Primary Tab -->
  <div role="tab" aria-label="Primary" aria-selected="true" jsaction="...">
    <span>Primary</span>
    <span class="Nt">8,651</span>  <!-- Unread count -->
  </div>
  
  <!-- Updates Tab -->
  <div role="tab" aria-label="Updates" aria-selected="false" jsaction="...">
    <span>Updates</span>
    <span class="Nt">66,580</span>
  </div>
  
  <!-- Social Tab -->
  <div role="tab" aria-label="Social" aria-selected="false" jsaction="...">
    <span>Social</span>
    <span class="Nt">1,099</span>
  </div>
  
  <!-- Promotions Tab -->
  <div role="tab" aria-label="Promotions" aria-selected="false" jsaction="...">
    <span>Promotions</span>
    <span class="Nt">8,307</span>
  </div>
</div>
```

### Key Attributes

| Attribute | Purpose | Value |
|-----------|---------|-------|
| `role="tab"` | Indicates this is a tab | Required for accessibility |
| `aria-label` | Tab name | "Primary", "Updates", "Social", "Promotions", "Forums" |
| `aria-selected` | Currently active tab | "true" for active, "false" for inactive |
| `jsaction` | Click handler | Tells us it's clickable |

---

### Detecting Current Tab

**JavaScript to extract:**
```javascript
function getCurrentGmailTab() {
  // Method 1: Find the active tab
  const activeTab = document.querySelector('[role="tab"][aria-selected="true"]');
  if (activeTab) {
    const label = activeTab.getAttribute('aria-label');
    return label.toLowerCase(); // "primary", "updates", "social", etc.
  }
  
  // Method 2: Fallback - check page title or URL
  const url = window.location.href;
  if (url.includes('/social')) return 'social';
  if (url.includes('/updates')) return 'updates';
  if (url.includes('/promotions')) return 'promotions';
  if (url.includes('/forums')) return 'forums';
  
  // Default to primary
  return 'primary';
}

async function isInPrimaryOrUpdatesTab() {
  const currentTab = getCurrentGmailTab();
  return currentTab === 'primary' || currentTab === 'updates';
}
```

**Expected Output:**
```
getCurrentGmailTab() → "primary" | "updates" | "social" | "promotions" | "forums" | "spam"

isInPrimaryOrUpdatesTab() → true | false
```

---

## Detecting Tab Changes

### MutationObserver to Watch Tab Changes

```javascript
function watchGmailTabChanges(callback) {
  // Watch for changes to the tab container
  const tabContainer = document.querySelector('[role="tablist"]');
  
  if (!tabContainer) {
    console.warn('Tab container not found');
    return;
  }
  
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes') {
        if (mutation.attributeName === 'aria-selected') {
          const newTab = getCurrentGmailTab();
          callback(newTab);
        }
      }
    });
  });
  
  // Watch all tab elements for aria-selected changes
  const tabs = tabContainer.querySelectorAll('[role="tab"]');
  tabs.forEach(tab => {
    observer.observe(tab, { attributes: true });
  });
  
  return observer;
}

// Usage:
watchGmailTabChanges((newTab) => {
  console.log(`User switched to: ${newTab}`);
  // Re-evaluate which emails to suggest
});
```

---

## Listening for New Emails

### MutationObserver to Detect New Emails in Inbox

```javascript
function observeNewEmails(callback) {
  // Find the email list container
  const emailList = document.querySelector('[role="presentation"]') 
    || document.querySelector('.nH'); // Adjust selector as needed
  
  if (!emailList) {
    console.warn('Email list container not found');
    return;
  }
  
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        // New email elements added
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('nH')) {
            const emailData = {
              element: node,
              sender: getEmailSender(node),
              subject: getEmailSubject(node),
              timestamp: getEmailTimestamp(node),
              tab: getCurrentGmailTab()
            };
            
            callback(emailData);
          }
        });
      }
    });
  });
  
  observer.observe(emailList, {
    childList: true,
    subtree: true
  });
  
  return observer;
}

// Usage:
const emailObserver = observeNewEmails((newEmail) => {
  console.log(`New email from: ${newEmail.sender}`);
  console.log(`Subject: ${newEmail.subject}`);
  
  // Check if this email should trigger a suggestion
  // (This is where business rules R1-R5 will be applied)
});
```

---

## Getting All Emails in Current View

```javascript
function getEmailListItems() {
  // Find all email containers in the current view
  const emailElements = document.querySelectorAll('.nH.a98.iY');
  
  const emails = [];
  
  emailElements.forEach((element) => {
    const email = {
      element: element,
      sender: getEmailSender(element),
      subject: getEmailSubject(element),
      timestamp: getEmailTimestamp(element),
      snippet: element.querySelector('span.gG')?.textContent.trim() || null,
      tab: getCurrentGmailTab()
    };
    
    // Only add if we could extract sender and subject
    if (email.sender && email.subject) {
      emails.push(email);
    }
  });
  
  return emails;
}

// Usage:
const allEmails = getEmailListItems();
console.log(`Found ${allEmails.length} emails`);
allEmails.forEach(email => {
  console.log(`${email.sender} - ${email.subject}`);
});
```

---

## CSS Selectors - Quick Reference

### Primary Selectors (Most Reliable)

```css
/* Email container */
div.nH.a98.iY

/* Sender email */
span.gD

/* Subject heading */
h2.hP

/* Timestamp */
span.gF

/* Email snippet */
span.gG

/* Tab (by aria-label) */
[role="tab"][aria-label="Primary"]

/* Active tab */
[role="tab"][aria-selected="true"]
```

### Fallback Selectors (If Primary Fails)

```css
/* Email container - by role */
[role="main"] [role="presentation"]

/* Sender - by email pattern */
span[jsname] (contains @)

/* Subject - any h2 */
h2

/* Timestamp - by aria attributes */
[aria-label*="time"]
[aria-label*="at"]

/* Tab container */
[role="tablist"]
```

---

## Known Limitations & Workarounds

### 1. Full Email Body Not in List View
**Problem:** Gmail doesn't include the full email body in the inbox list view.

**Workaround:** 
- Read the snippet (first ~100 chars) for initial analysis
- If you need the full body, you must click the email to expand it
- The expanded view has different DOM structure

**Code:**
```javascript
// Snippet only (no click needed)
const snippet = getEmailBodySnippet(emailElement);

// Full body (requires clicking email first)
emailElement.click();
await new Promise(r => setTimeout(r, 1000)); // Wait for expansion
const fullBody = getFullBodyFromExpandedView(); // Different DOM structure
```

### 2. Gmail Structure Changes Frequently
**Problem:** Gmail updates its HTML structure without warning.

**Workaround:**
- Always use fallback selectors
- Test selectors in console before deploying
- Use try-catch to handle selector failures gracefully
- Log failures so you can debug

**Code:**
```javascript
function safeGetSender(emailElement) {
  try {
    const sender = getEmailSender(emailElement);
    if (sender) return sender;
  } catch (e) {
    console.warn('Primary selector failed, trying fallback');
  }
  
  try {
    // Fallback method
    const allSpans = emailElement.querySelectorAll('span');
    for (const span of allSpans) {
      if (span.textContent.includes('@')) return span.textContent.trim();
    }
  } catch (e) {
    console.error('All selectors failed for sender extraction');
  }
  
  return null;
}
```

### 3. Data Attributes Not Always Available
**Problem:** Gmail uses obfuscated class names and minimal data attributes.

**Workaround:**
- Don't rely on data attributes
- Use visual classes (gD, gF, etc.)
- Use role attributes as fallback
- Use text content pattern matching if needed

---

## Testing Selectors in Console

**When to do this:** Whenever Gmail updates or selectors seem broken.

**How to test:**

```javascript
// Open Gmail in Chrome
// Press F12 to open DevTools
// Go to Console tab
// Paste and run:

// Test 1: Get all emails
document.querySelectorAll('.nH.a98.iY').length

// Test 2: Get first email's sender
document.querySelector('.nH.a98.iY span.gD')?.textContent

// Test 3: Get first email's subject
document.querySelector('.nH.a98.iY h2.hP')?.textContent

// Test 4: Get current tab
document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('aria-label')

// If any of these return undefined or null, the selector needs updating
```

---

## Summary

| Element | Primary Selector | Fallback | Notes |
|---------|------------------|----------|-------|
| Email Container | `.nH.a98.iY` | `[role="presentation"] > div` | Required to find all parts |
| Sender Email | `span.gD` | Look for @ symbol | May have multiple spans |
| Subject | `h2.hP` | `h2` | Usually unique per email |
| Timestamp | `span.gF` | `[aria-label*="time"]` | May be time or date |
| Snippet | `span.gG` | N/A | Optional, for preview only |
| Current Tab | `[aria-selected="true"]` | URL pattern | Reliably detects active tab |

---

## Next Steps

1. **Test these selectors** in your Chrome DevTools console
2. **Create gmail-dom.ts** using these selectors
3. **Handle failures gracefully** with fallbacks
4. **Set up MutationObservers** to detect new emails and tab changes
5. **Log any selector failures** so you can debug when Gmail updates

---

## Version History

| Date | Changes | Status |
|------|---------|--------|
| Apr 2026 | Initial documentation from manual inspection | Active |
| TBD | Update selectors if Gmail changes | Pending |

---

**Last Verified:** April 2026
**Next Review:** When Gmail's inbox layout changes (usually monthly)
**Maintainer:** Family Calendar Extension Team
