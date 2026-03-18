import { useCallback, useEffect, useState } from 'react'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonFab, IonFabButton, IonIcon, IonList, IonItem,
  IonLabel, IonBadge, IonSpinner, IonText, IonChip,
  IonButtons, IonButton,
} from '@ionic/react'
import { add } from 'ionicons/icons'
import { useHistory } from 'react-router-dom'
import { supabase, type CalendarEvent } from '../lib/supabase'
import { useCalendarEvents } from '../hooks/useCalendarEvents'
import { useRealtimeEvents } from '../hooks/useRealtime'

interface MemberInfo { name: string; color: string }
interface GroupMembership { group_id: string; role: 'owner' | 'editor' | 'viewer'; group_name: string }

function startOfDay(d: Date): Date { const r = new Date(d); r.setHours(0, 0, 0, 0); return r }
function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1) }
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function addMonths(d: Date, n: number): Date { const r = new Date(d); r.setMonth(r.getMonth() + n); return r }
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}
function isToday(d: Date) { return isSameDay(d, new Date()) }

function buildMonthGrid(monthStart: Date): Date[] {
  const firstDow = monthStart.getDay()
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate()
  const rows = Math.ceil((firstDow + daysInMonth) / 7)
  const gridStart = addDays(monthStart, -firstDow)
  return Array.from({ length: rows * 7 }, (_, i) => addDays(gridStart, i))
}

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export default function CalendarPage() {
  const history = useHistory()
  const [memberships, setMemberships]             = useState<GroupMembership[]>([])
  const [selectedGroupId, setSelectedGroupId]     = useState<'all' | string>('all')
  const [groupMap, setGroupMap]                   = useState<Map<string, string>>(new Map())
  const [memberMap, setMemberMap]                 = useState<Map<string, MemberInfo>>(new Map())
  const [viewMonth, setViewMonth]                 = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate]           = useState(() => startOfDay(new Date()))

  const allGroupIds = memberships.map((m) => m.group_id)
  const { events, loading, error } = useCalendarEvents(allGroupIds)
  const [liveEvents, setLiveEvents] = useState<CalendarEvent[]>([])

  useEffect(() => { setLiveEvents(events) }, [events])

  const handleChange = useCallback(
    (type: 'INSERT' | 'UPDATE' | 'DELETE', changed: CalendarEvent) => {
      setLiveEvents((prev) => {
        if (type === 'DELETE') return prev.filter((e) => e.id !== changed.id)
        if (type === 'UPDATE') return prev.map((e) => e.id === changed.id ? changed : e)
        return [...prev, changed].sort((a, b) => a.start_at.localeCompare(b.start_at))
      })
    },
    [],
  )
  useRealtimeEvents(allGroupIds, handleChange)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: rows } = await supabase
        .from('family_members')
        .select('group_id, role, family_groups(name)')
        .eq('user_id', user.id)

      if (!rows || rows.length === 0) { history.replace('/onboarding'); return }

      const parsed: GroupMembership[] = rows.map((r: any) => ({
        group_id:   r.group_id,
        role:       r.role as GroupMembership['role'],
        group_name: r.family_groups?.name ?? 'Family',
      }))
      setMemberships(parsed)

      const gMap = new Map<string, string>()
      parsed.forEach((p) => gMap.set(p.group_id, p.group_name))
      setGroupMap(gMap)

      const { data: members } = await supabase
        .from('family_members')
        .select('user_id, nickname, color, user_profiles(email)')
        .in('group_id', parsed.map((p) => p.group_id))

      const map = new Map<string, MemberInfo>()
      for (const m of members ?? []) {
        if (!map.has(m.user_id)) {
          const name = (m as any).nickname ?? (m as any).user_profiles?.email?.split('@')[0] ?? 'Family'
          map.set(m.user_id, { name, color: m.color ?? '#8792a2' })
        }
      }
      setMemberMap(map)
    })
  }, [history])

  const ROLE_RANK: Record<GroupMembership['role'], number> = { owner: 3, editor: 2, viewer: 1 }
  const activeRole = memberships
    .filter((m) => selectedGroupId === 'all' || m.group_id === selectedGroupId)
    .reduce<GroupMembership['role']>((best, m) =>
      ROLE_RANK[m.role] > ROLE_RANK[best] ? m.role : best, 'viewer')

  const groupFilteredEvents = selectedGroupId === 'all'
    ? liveEvents
    : liveEvents.filter((e) => e.group_id === selectedGroupId)

  function eventsForDay(day: Date): CalendarEvent[] {
    return groupFilteredEvents.filter((e) => isSameDay(new Date(e.start_at), day))
  }

  function dotsForDay(day: Date): string[] {
    const seen = new Set<string>(); const colors: string[] = []
    for (const ev of eventsForDay(day)) {
      const c = ev.created_by ? (memberMap.get(ev.created_by)?.color ?? '#8792a2') : '#8792a2'
      if (!seen.has(c)) { seen.add(c); colors.push(c) }
    }
    return colors
  }

  const monthGrid    = buildMonthGrid(viewMonth)
  const agendaEvents = eventsForDay(selectedDate).sort((a, b) => {
    if (a.is_all_day && !b.is_all_day) return -1
    if (!a.is_all_day && b.is_all_day) return 1
    return a.start_at.localeCompare(b.start_at)
  })

  const showGroupChips     = memberships.length > 1
  const monthLabel         = viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const selectedDateLabel  = selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <IonPage>
      <IonHeader>
        {/* Month navigation */}
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={() => setViewMonth((m) => startOfMonth(addMonths(m, -1)))}>‹</IonButton>
          </IonButtons>
          <IonTitle style={{ fontSize: 16 }}>{monthLabel}</IonTitle>
          <IonButtons slot="end">
            {!isSameMonth(viewMonth, new Date()) && (
              <IonButton onClick={() => { setViewMonth(startOfMonth(new Date())); setSelectedDate(startOfDay(new Date())) }}>
                Today
              </IonButton>
            )}
            <IonButton onClick={() => setViewMonth((m) => startOfMonth(addMonths(m, 1)))}>›</IonButton>
          </IonButtons>
        </IonToolbar>

        {/* Day-of-week initials */}
        <IonToolbar style={{ '--min-height': '22px' } as any}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 10px' }}>
            {DAY_INITIALS.map((d, i) => (
              <div key={i} style={{
                textAlign: 'center', fontSize: 10, fontWeight: 600,
                color: i === 0 || i === 6 ? '#ea4335' : '#8792a2',
              }}>{d}</div>
            ))}
          </div>
        </IonToolbar>

        {/* Month grid */}
        <IonToolbar style={{ '--min-height': 'auto' } as any}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '2px 10px 4px' }}>
            {monthGrid.map((day, i) => {
              const inMonth   = isSameMonth(day, viewMonth)
              const today     = isToday(day)
              const selected  = isSameDay(day, selectedDate)
              const dots      = dotsForDay(day)
              const isWeekend = day.getDay() === 0 || day.getDay() === 6
              return (
                <div
                  key={i}
                  onClick={() => { setSelectedDate(startOfDay(day)); if (!inMonth) setViewMonth(startOfMonth(day)) }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', padding: '2px 0' }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: today ? '#1a73e8' : selected ? '#e8f0fe' : 'transparent',
                    fontSize: 12, fontWeight: today || selected ? 700 : 400,
                    color: today ? '#fff' : !inMonth ? '#c5cdd8' : isWeekend ? '#ea4335' : '#1a1f36',
                  }}>
                    {day.getDate()}
                  </div>
                  <div style={{ display: 'flex', gap: 2, height: 6, alignItems: 'center', marginTop: 1 }}>
                    {dots.slice(0, 3).map((color, j) => (
                      <div key={j} style={{ width: 4, height: 4, borderRadius: '50%', background: color, opacity: inMonth ? 1 : 0.3 }} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </IonToolbar>

        {/* Group filter chips */}
        {showGroupChips && (
          <IonToolbar>
            <div style={{ display: 'flex', overflowX: 'auto', padding: '4px 8px', gap: 4 }}>
              <IonChip color={selectedGroupId === 'all' ? 'primary' : undefined} outline={selectedGroupId !== 'all'} onClick={() => setSelectedGroupId('all')}>All</IonChip>
              {memberships.map((m) => (
                <IonChip key={m.group_id} color={selectedGroupId === m.group_id ? 'primary' : undefined} outline={selectedGroupId !== m.group_id} onClick={() => setSelectedGroupId(m.group_id)}>
                  {m.group_name}
                </IonChip>
              ))}
            </div>
          </IonToolbar>
        )}
      </IonHeader>

      <IonContent>
        {/* Selected day header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px 6px', borderBottom: '1px solid #edf0f4' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1f36' }}>{selectedDateLabel}</span>
          {isToday(selectedDate) && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#1a73e8', background: '#e8f0fe', padding: '2px 7px', borderRadius: 10 }}>Today</span>
          )}
        </div>

        {loading && (
          <div style={{ padding: '16px', display: 'flex', gap: 8, alignItems: 'center', color: '#8792a2', fontSize: 13 }}>
            <IonSpinner name="dots" style={{ width: 16, height: 16 }} /> Loading…
          </div>
        )}
        {error && <IonText color="danger" className="ion-padding"><p>{error}</p></IonText>}

        {!loading && agendaEvents.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: '#5f6368', fontSize: 13 }}>
            No events scheduled
          </div>
        )}

        <IonList>
          {agendaEvents.map((event) => {
            const creator   = event.created_by ? memberMap.get(event.created_by) : undefined
            const groupName = showGroupChips && selectedGroupId === 'all' ? (groupMap.get(event.group_id) ?? null) : null
            return (
              <IonItem key={event.id} button detail onClick={() => history.push(`/calendar/${event.id}`)}>
                {creator && (
                  <div slot="start" style={{ width: 10, height: 10, borderRadius: '50%', background: creator.color, flexShrink: 0, marginTop: 2 }} />
                )}
                <IonLabel>
                  <h2>{event.title}</h2>
                  <p>
                    {event.is_all_day
                      ? 'All day'
                      : `${new Date(event.start_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} – ${new Date(event.end_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
                    }
                    {event.location ? ` · ${event.location}` : ''}
                    {creator ? ` · ${creator.name}` : ''}
                  </p>
                </IonLabel>
                {groupName && <IonBadge slot="end" color="medium">{groupName}</IonBadge>}
                {event.is_recurring && <IonBadge slot="end" color="primary">↻</IonBadge>}
              </IonItem>
            )
          })}
        </IonList>

        {activeRole !== 'viewer' && (
          <IonFab vertical="bottom" horizontal="end" slot="fixed">
            <IonFabButton onClick={() => history.push('/calendar/new')}>
              <IonIcon icon={add} />
            </IonFabButton>
          </IonFab>
        )}
      </IonContent>
    </IonPage>
  )
}
