/**
 * User preference helpers — pure functions, safe to unit test.
 */

export const DEFAULT_CATEGORIES = ['school', 'work', 'sports', 'appointments', 'travel']

const CATEGORY_PATTERNS: Record<string, RegExp> = {
  school:       /school|class|grade|teacher|homework|curriculum|pta|pickup|drop.?off/i,
  work:         /meeting|standup|interview|project|deadline|client|conference|webinar/i,
  sports:       /soccer|football|baseball|softball|basketball|swim|practice|game|tournament|match|tryout/i,
  appointments: /appointment|doctor|dentist|therapy|checkup|consultation|clinic|urgent care/i,
  travel:       /flight|hotel|booking|reservation|trip|vacation|itinerary|airbnb|check.in/i,
  newsletters:  /newsletter|digest|weekly|monthly|unsubscribe|update from/i,
  promotions:   /sale|\d+% off|discount|promo|deal|offer|coupon|flash sale/i,
}

const POLL_KEYWORDS =
  /school|class|grade|teacher|homework|pta|pickup|drop.?off|curriculum|meeting|standup|interview|project|deadline|conference|webinar|screening|soccer|football|baseball|basketball|swim|practice|game|tournament|tryout|appointment|doctor|dentist|therapy|checkup|consultation|clinic|surgery|medical|hospital|pharmacy|prescription|diagnosis|procedure|referral|flight|airline|hotel|booking|reservation|trip|vacation|itinerary|airbnb|train|cruise|visa|passport|tinder|bumble|hinge|okcupid|schedule|reminder|calendar/i

export function shouldAnalyzeEmail(
  subject: string,
  categories: string[],
  mode: 'automatic' | 'manual' | 'disabled' = 'manual',
): boolean {
  if (mode === 'disabled') return false
  if (!categories || categories.length === 0) return true
  const blockingCategories = ['newsletters', 'promotions']
  for (const cat of blockingCategories) {
    if (!categories.includes(cat) && CATEGORY_PATTERNS[cat]?.test(subject)) {
      return false
    }
  }
  return true
}

export function shouldPollEmail(
  subject: string,
  senderEmail: string,
  categories: string[],
  contactEmails: Set<string>,
  trustedSenders: Set<string>,
): boolean {
  if (CATEGORY_PATTERNS.newsletters.test(subject)) return false
  if (CATEGORY_PATTERNS.promotions.test(subject)) return false
  const sender = senderEmail.toLowerCase()
  if (trustedSenders.has(sender)) return true
  if (contactEmails.has(sender)) return true
  return POLL_KEYWORDS.test(subject) && shouldAnalyzeEmail(subject, categories)
}

export function godModeLabel(mode: 'automatic' | 'manual' | 'disabled'): string {
  const labels = {
    automatic: 'Automatic (God Mode)',
    manual: 'Manual',
    disabled: 'Disabled',
  }
  return labels[mode] ?? mode
}
