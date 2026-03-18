import { useCallback, useEffect, useRef, useState } from 'react'
import { detectConflicts, mapRowToCalendarEvent } from '../../../lib/conflicts'
import { supabase } from '../../../lib/supabase'
import type { AISettings, CalendarEvent, ConflictPair, FamilyMember } from '../../../lib/types'
import ConflictResolutionPanel from './ConflictResolutionPanel'
import CalendarHeader from '../calendar/CalendarHeader'
import CalendarGrid from '../calendar/CalendarGrid'
import MemberFilterChips from '../calendar/MemberFilterChips'
import AgendaPanel from '../calendar/AgendaPanel'
import EventDetailSheet, { type EventUpdateData } from '../calendar/EventDetailSheet'
import {
  startOfDay, startOfMonth, addDays, addMonths,
  isSameDay, isSameMonth, buildMonthGrid,
} from '../calendar/calendarUtils'

interface Props {
  groupId: string
  userId: string
  aiSettings: AISettings
  geminiOAuthToken?: string
  onBack: () => void
}

// ── localStorage helpers ───────────────────────────────────────────────────
const FILTER_KEY = (gid: string) => `family_calendar_filters_${gid}`

function loadFilterFromStorage(gid: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(FILTER_KEY(gid))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed.visible_member_ids)) return null
    return new Set<string>(parsed.visible_member_ids)
  } catch { return null }
}

function saveFilterToStorage(gid: string, ids: Set<string> | null): void {
  try {
    localStorage.setItem(FILTER_KEY(gid), JSON.stringify({
      visible_member_ids: ids === null ? null : Array.from(ids),
      last_updated: new Date().toISOString(),
    }))
  } catch { /* ignore */ }
}

export default function FamilyCalendarView({
  groupId, userId, aiSettings, geminiOAuthToken, onBack: _onBack,
}: Props) {
  const [events, setEvents]                     = useState<CalendarEvent[]>([])
  const [members, setMembers]                   = useState<FamilyMember[]>([])
  const [allConflicts, setAllConflicts]         = useState<ConflictPair[]>([])
  const [loading, setLoading]                   = useState(true)
  const [fetchError, setFetchError]             = useState<string | null>(null)
  const [activeConflict, setActiveConflict]     = useState<ConflictPair | null>(null)
  const [activeEvent, setActiveEvent]           = useState<CalendarEvent | null>(null)
  const [viewMonth, setViewMonth]               = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate]         = useState(() => startOfDay(new Date()))
  const [visibleMemberIds, setVisibleMemberIds] = useState<Set<string> | null>(null)
  const filterInitialized                        = useRef(false)

  useEffect(() => { filterInitialized.current = false }, [groupId])

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    const gridStart = addDays(startOfMonth(viewMonth), -7)
    const gridEnd   = addDays(startOfMonth(addMonths(viewMonth, 1)), 7)

    try {
      const [eventsRes, membersRes] = await Promise.all([
        supabase
          .from('calendar_events')
          .select('id, title, description, start_at, end_at, location, is_all_day, created_by')
          .eq('group_id', groupId)
          .gte('start_at', gridStart.toISOString())
          .lt('start_at', gridEnd.toISOString())
          .order('start_at', { ascending: true }),
        supabase
          .from('family_members')
          .select('id, user_id, role, joined_at, nickname, color, user_profiles(email)')
          .eq('group_id', groupId),
      ])

      const memberMap = new Map<string, { name: string; color: string }>()
      const familyMembers: FamilyMember[] = []
      for (const row of (membersRes.data ?? []) as any[]) {
        const email: string | undefined = row.user_profiles?.email
        const name = row.nickname ?? (email ? email.split('@')[0] : undefined) ?? 'Family'
        memberMap.set(row.user_id, { name, color: row.color ?? '#1a73e8' })
        familyMembers.push({
          id: row.id, userId: row.user_id, role: row.role, joinedAt: row.joined_at,
          email, nickname: row.nickname ?? undefined, color: row.color ?? undefined,
        })
      }
      setMembers(familyMembers)

      if (!filterInitialized.current) {
        filterInitialized.current = true
        setVisibleMemberIds(loadFilterFromStorage(groupId))
      }

      const calEvents: CalendarEvent[] = (eventsRes.data ?? []).map((row: any) => ({
        ...mapRowToCalendarEvent(row),
        creatorName:  row.created_by ? memberMap.get(row.created_by)?.name  : undefined,
        creatorColor: row.created_by ? memberMap.get(row.created_by)?.color : undefined,
      }))

      setEvents(calEvents)
      setAllConflicts(detectConflicts(calEvents))
      setFetchError(null)
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Failed to load calendar.')
    } finally {
      setLoading(false)
    }
  }, [groupId, viewMonth])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  useEffect(() => {
    const ch = supabase.channel('fcal_events_' + groupId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events', filter: `group_id=eq.${groupId}` }, () => fetchEvents())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [groupId, fetchEvents])

  useEffect(() => {
    const ch = supabase.channel('fcal_members_' + groupId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'family_members', filter: `group_id=eq.${groupId}` }, () => fetchEvents())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [groupId, fetchEvents])

  function isMemberVisible(uid: string): boolean {
    return visibleMemberIds === null || visibleMemberIds.has(uid)
  }
  function handleToggleMember(uid: string) {
    const base = visibleMemberIds ?? new Set(members.map(m => m.userId))
    const next = new Set(base)
    if (next.has(uid)) next.delete(uid); else next.add(uid)
    setVisibleMemberIds(next); saveFilterToStorage(groupId, next)
  }

  function eventsForDay(day: Date): CalendarEvent[] {
    return events.filter(e => {
      if (!isSameDay(new Date(e.startAt), day)) return false
      if (visibleMemberIds === null) return true
      if (!e.createdBy) return true
      return visibleMemberIds.has(e.createdBy)
    })
  }

  function dotsForDay(day: Date): string[] {
    const seen = new Set<string>(); const colors: string[] = []
    for (const ev of eventsForDay(day)) {
      const c = ev.creatorColor ?? '#1a73e8'
      if (!seen.has(c)) { seen.add(c); colors.push(c) }
    }
    return colors
  }

  function conflictForEvent(ev: CalendarEvent): ConflictPair | null {
    return allConflicts.find(c => c.eventA.id === ev.id || c.eventB.id === ev.id) ?? null
  }

  function canEditEvent(ev: CalendarEvent): boolean {
    const me = members.find(m => m.userId === userId)
    return ev.createdBy === userId || me?.role === 'owner'
  }

  async function handleSaveEdit(ev: CalendarEvent, data: EventUpdateData): Promise<{ error: string | null }> {
    if (!data.title.trim()) return { error: 'Title is required.' }
    try {
      let start_at: string, end_at: string
      if (data.isAllDay) {
        start_at = new Date(data.date + 'T00:00:00').toISOString()
        end_at   = new Date(data.date + 'T23:59:59').toISOString()
      } else {
        start_at = new Date(`${data.date}T${data.startTime}`).toISOString()
        end_at   = new Date(`${data.date}T${data.endTime}`).toISOString()
      }
      const { error } = await supabase
        .from('calendar_events')
        .update({ title: data.title.trim(), start_at, end_at, location: data.location.trim() || null, is_all_day: data.isAllDay })
        .eq('id', ev.id)
      if (error) return { error: error.message }
      fetchEvents()
      return { error: null }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Save failed.' }
    }
  }

  async function handleDeleteEvent(ev: CalendarEvent): Promise<void> {
    await supabase.from('calendar_events').delete().eq('id', ev.id)
    fetchEvents()
  }

  const { days: monthGrid } = buildMonthGrid(viewMonth)

  const agendaEvents = eventsForDay(selectedDate).sort((a, b) => {
    if (a.isAllDay && !b.isAllDay) return -1
    if (!a.isAllDay && b.isAllDay) return 1
    return a.startAt.localeCompare(b.startAt)
  })

  const monthLabel = viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  // suppress unused warning — isMemberVisible kept for potential future chip highlight logic
  void isMemberVisible

  return (
    <div className="flex flex-col">
      {/* Sticky calendar header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border">
        <CalendarHeader
          monthLabel={monthLabel}
          showToday={!isSameMonth(viewMonth, new Date())}
          onPrev={() => setViewMonth((m) => startOfMonth(addMonths(m, -1)))}
          onNext={() => setViewMonth((m) => startOfMonth(addMonths(m, 1)))}
          onToday={() => { setViewMonth(startOfMonth(new Date())); setSelectedDate(startOfDay(new Date())) }}
        />
        <CalendarGrid
          days={monthGrid}
          viewMonth={viewMonth}
          selectedDate={selectedDate}
          dotsForDay={dotsForDay}
          onSelectDay={(day) => {
            setSelectedDate(startOfDay(day))
            if (!isSameMonth(day, viewMonth)) setViewMonth(startOfMonth(day))
          }}
        />
        {members.length > 1 && (
          <MemberFilterChips
            members={members}
            visibleMemberIds={visibleMemberIds}
            onToggle={handleToggleMember}
          />
        )}
      </div>

      {fetchError && (
        <div className="px-4 py-2 flex items-center justify-between gap-2 bg-destructive/10 border-b border-destructive/20">
          <p className="text-xs text-destructive flex-1">{fetchError}</p>
          <button onClick={fetchEvents} className="text-xs font-semibold text-destructive hover:opacity-70 shrink-0">
            Retry
          </button>
        </div>
      )}

      {/* Scrollable agenda */}
      <AgendaPanel
        selectedDate={selectedDate}
        events={agendaEvents}
        members={members}
        loading={loading}
        allConflicts={allConflicts}
        onEventClick={(ev) => setActiveEvent(ev)}
      />

      {activeConflict && (
        <ConflictResolutionPanel
          conflict={activeConflict}
          aiSettings={aiSettings}
          geminiOAuthToken={geminiOAuthToken}
          onApplied={() => { setActiveConflict(null); fetchEvents() }}
          onClose={() => setActiveConflict(null)}
        />
      )}

      {activeEvent && (
        <EventDetailSheet
          event={activeEvent}
          members={members}
          canEdit={canEditEvent(activeEvent)}
          conflict={conflictForEvent(activeEvent)}
          onClose={() => setActiveEvent(null)}
          onSave={(data) => handleSaveEdit(activeEvent, data)}
          onDelete={async () => { await handleDeleteEvent(activeEvent); setActiveEvent(null) }}
          onResolveConflict={() => {
            const c = conflictForEvent(activeEvent)
            setActiveEvent(null)
            setActiveConflict(c)
          }}
        />
      )}
    </div>
  )
}
