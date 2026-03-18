import type { CalendarEvent, FamilyMember } from '../lib/types'

/** Display-ready event model with precomputed presentation fields. */
export interface CalendarEventUI extends CalendarEvent {
  /** "All day" or "9:00 AM – 10:00 AM" */
  timeLabel: string
  /** Initials derived from creatorName or email */
  creatorInitials: string
  /** Resolved hex color — event.creatorColor ?? '#4F46E5' */
  colorHex: string
  hasConflict: boolean
}

/** Display-ready member model with precomputed presentation fields. */
export interface FamilyMemberUI extends FamilyMember {
  /** nickname ?? email ?? 'Unknown' */
  displayName: string
  /** First character of displayName, uppercased */
  initial: string
  /** Resolved hex color — color ?? '#1a73e8' */
  colorHex: string
}

/** Event lifecycle status as detected/confirmed/added by the AI parser. */
export type EventStatus = 'detected' | 'confirmed' | 'added'

/** Variants for StatusChip component. */
export type StatusVariant = 'default' | 'success' | 'warning' | 'danger' | 'info'
