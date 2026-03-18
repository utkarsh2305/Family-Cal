import type { CalendarEvent, FamilyMember } from '../../../lib/types'

export const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function startOfDay(d: Date): Date { const r = new Date(d); r.setHours(0,0,0,0); return r }
export function startOfMonth(d: Date): Date { const r = new Date(d); r.setDate(1); r.setHours(0,0,0,0); return r }
export function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r }
export function addMonths(d: Date, n: number): Date { const r = new Date(d); r.setMonth(r.getMonth() + n); return r }

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate()
}
export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}
export function isToday(d: Date): boolean { return isSameDay(d, new Date()) }

export function buildMonthGrid(monthStart: Date): { days: Date[] } {
  const firstDow = monthStart.getDay()
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate()
  const rows = Math.ceil((firstDow + daysInMonth) / 7)
  const gridStart = addDays(monthStart, -firstDow)
  return { days: Array.from({ length: rows * 7 }, (_, i) => addDays(gridStart, i)) }
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function getMemberDisplayName(m: FamilyMember): string {
  return m.nickname ?? m.email?.split('@')[0] ?? 'Family'
}

export function getCreatorInitials(ev: CalendarEvent, members: FamilyMember[]): string {
  const m = members.find((mb) => mb.userId === ev.createdBy)
  const src = m?.nickname ?? m?.email ?? ''
  return src.charAt(0).toUpperCase() || ev.title.charAt(0).toUpperCase()
}

export function toLocalDateStr(iso: string): string {
  const d = new Date(iso)
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}
export function toLocalTimeStr(iso: string): string {
  const d = new Date(iso)
  return [String(d.getHours()).padStart(2, '0'), String(d.getMinutes()).padStart(2, '0')].join(':')
}
