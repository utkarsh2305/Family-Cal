// Shared types used across extension popup, background, and content script

export interface ProposedEvent {
  title: string
  description?: string
  startAt: string        // ISO 8601
  endAt: string          // ISO 8601
  location?: string
  isAllDay: boolean
  isRecurring: boolean
  recurrenceRule?: string // RFC 5545 RRULE
  confidence: 'high' | 'medium' | 'low'
  alreadyAdded?: boolean  // true if this event already exists in the family calendar
}

export interface ParsedEmailResult {
  gmailMessageId: string
  subject: string
  sender: string
  proposedEvents: ProposedEvent[]
}

export interface ProcessedEmail {
  id: string
  gmailMessageId: string
  subject: string
  sender: string
  processedAt: string
  proposedEvents: ProposedEvent[]
  status: 'proposed' | 'accepted' | 'rejected' | 'partial' | 'duplicate'
}

export interface AISettings {
  provider: 'platform' | 'openai' | 'gemini' | 'claude' | 'grok'
  apiKey?: string
  geminiUsesOAuth?: boolean
  fetchUrlContent?: boolean
  // God Mode / processing preferences (stored in user_preferences table)
  godMode?: 'automatic' | 'manual' | 'disabled'
  godModeSubtype?: 'open' | 'poll'  // only when godMode='automatic'
  pollIntervalHours?: number         // 1 | 2 | 4 | 6 | 12 | 24
  categories?: string[]
  learningEnabled?: boolean
}

// Result of background poll: one email + its AI-parsed proposed events
export interface PollResult {
  email: RawEmailContent
  proposedEvents: ProposedEvent[]
}

export interface ExtensionUser {
  id: string
  email: string
  familyGroupId?: string
  familyGroupName?: string
  familyGroups?: Array<{ id: string; name: string; role: 'owner' | 'editor' | 'viewer' }>
  role?: 'owner' | 'editor' | 'viewer'
  aiSettings: AISettings
}

export interface FamilyMember {
  id: string
  userId: string
  role: 'owner' | 'editor' | 'viewer'
  joinedAt: string
  email?: string
  nickname?: string
  color?: string
}

export interface CalendarEvent {
  id: string
  title: string
  description?: string
  startAt: string       // ISO 8601
  endAt: string         // ISO 8601
  location?: string
  isAllDay: boolean
  createdBy?: string    // user_id
  creatorName?: string  // resolved from family_members (nickname or email prefix)
  creatorColor?: string // resolved from family_members hex color
}

export interface ConflictPair {
  eventA: CalendarEvent
  eventB: CalendarEvent
}

// Stored in chrome.storage.local when a push notification is tapped
// Popup reads this on open and shows the invitation card
export interface PendingInvitation {
  eventId: string
  invitationId: string
}

// Messages sent between content script ↔ background ↔ popup
export type ExtensionMessage =
  | { type: 'GET_EMAIL_CONTENT'; messageId: string }
  | { type: 'EMAIL_CONTENT'; payload: RawEmailContent }
  | { type: 'PARSE_EMAIL'; payload: RawEmailContent }
  | { type: 'PARSE_RESULT'; payload: ParsedEmailResult }
  | { type: 'GET_AUTH_TOKEN' }
  | { type: 'AUTH_TOKEN'; token: string }
  | { type: 'SIGN_OUT' }
  | { type: 'FETCH_ATTACHMENTS'; messageId: string }
  | { type: 'REFRESH_AUTH_TOKEN' }
  | { type: 'UPDATE_POLL_ALARM' }   // popup → SW: re-read settings and reschedule alarm
  | { type: 'POLL_NOW' }            // popup → SW: run a poll immediately (for testing)
  | { type: 'SUBSCRIBE_PUSH' }      // popup → SW: register Web Push subscription after login

export interface RawEmailContent {
  messageId: string
  subject: string
  sender: string
  body: string
  attachmentDescriptions: string[]
  receivedAt?: string         // ISO 8601 — email receipt timestamp
  urls?: string[]
  fetchedUrlContent?: string
  attachments?: Array<{ filename: string; mimeType: string; data: string }>
}
