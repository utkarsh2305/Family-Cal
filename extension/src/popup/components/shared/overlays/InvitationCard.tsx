/**
 * InvitationCard
 *
 * Full-screen overlay shown when the user taps a push notification inviting
 * them to an event. Lets them add the event to their own Google Calendar
 * and acknowledges the invitation in Supabase.
 */

import { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { getGoogleCalendarToken, refreshGoogleCalendarToken, createGoogleCalendarEvent } from '../../../../lib/google-calendar'
import type { PendingInvitation, ProposedEvent } from '../../../../lib/types'
import { Button } from '../../../../components/ui/button'
import { Calendar, MapPin, Clock, X, CheckCircle, AlertCircle } from 'lucide-react'

interface Props {
  invitation: PendingInvitation
  userId:     string
  groupId:    string
  onDone:     () => void
}

interface EventRow {
  id:          string
  title:       string
  description: string | null
  start_at:    string
  end_at:      string
  location:    string | null
  is_all_day:  boolean
  from_name:   string
}

export default function InvitationCard({ invitation, userId, groupId, onDone }: Props) {
  const [eventRow,  setEventRow]  = useState<EventRow | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [adding,    setAdding]    = useState(false)
  const [addedMsg,  setAddedMsg]  = useState<string | null>(null)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      await supabase
        .from('event_invitations')
        .update({ seen_at: new Date().toISOString() })
        .eq('id', invitation.invitationId)
        .eq('to_user_id', userId)

      const { data: inv } = await supabase
        .from('event_invitations')
        .select(`
          from_user_id,
          calendar_events (
            id, title, description, start_at, end_at, location, is_all_day
          )
        `)
        .eq('id', invitation.invitationId)
        .single()

      if (!inv) { setLoading(false); return }

      const ev = (inv as any).calendar_events
      if (!ev) { setLoading(false); return }

      const { data: senderMember } = await supabase
        .from('family_members')
        .select('nickname, user_profiles(email)')
        .eq('group_id', groupId)
        .eq('user_id', (inv as any).from_user_id)
        .single()

      const fromName: string =
        (senderMember as any)?.nickname ??
        ((senderMember as any)?.user_profiles?.email as string | undefined)?.split('@')[0] ??
        'A family member'

      setEventRow({ ...ev, from_name: fromName })
      setLoading(false)
    })()
  }, [invitation.invitationId, userId, groupId])

  async function handleAddToCalendar() {
    if (!eventRow) return
    setAdding(true)
    setError(null)

    const proposed: ProposedEvent = {
      title:       eventRow.title,
      description: eventRow.description ?? undefined,
      startAt:     eventRow.start_at,
      endAt:       eventRow.end_at,
      location:    eventRow.location ?? undefined,
      isAllDay:    eventRow.is_all_day,
      isRecurring: false,
      confidence:  'high',
    }

    try {
      const token = await getGoogleCalendarToken()
      let gcalEventId: string | null = null

      if (token) {
        try {
          gcalEventId = await createGoogleCalendarEvent(token, proposed)
        } catch (e: any) {
          if (String(e).includes('401') || String(e).includes('403')) {
            const fresh = await refreshGoogleCalendarToken()
            if (fresh) gcalEventId = await createGoogleCalendarEvent(fresh, proposed)
            else throw e
          } else {
            throw e
          }
        }
      }

      if (gcalEventId) {
        await supabase.from('calendar_event_links').upsert({
          event_id:            eventRow.id,
          user_id:             userId,
          provider:            'google',
          external_event_id:   gcalEventId,
          external_calendar_id: 'primary',
          last_synced_at:      new Date().toISOString(),
        }, { onConflict: 'user_id,event_id,provider' })
      }

      await supabase
        .from('event_invitations')
        .update({ added_at: new Date().toISOString() })
        .eq('id', invitation.invitationId)
        .eq('to_user_id', userId)

      setAddedMsg(gcalEventId
        ? 'Added to your Google Calendar!'
        : 'Saved — connect Google Calendar in settings to auto-add future events.')
    } catch (e) {
      console.error('[InvitationCard] Add to calendar failed:', e)
      setError('Failed to add to Google Calendar. Try again or connect from Settings.')
    } finally {
      setAdding(false)
    }
  }

  function formatDateRange(start: string, end: string, isAllDay: boolean): string {
    const s = new Date(start)
    const e = new Date(end)
    const dateOpts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }
    const timeOpts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }

    if (isAllDay) {
      return s.toLocaleDateString('en-US', dateOpts)
    }
    const sameDay = s.toDateString() === e.toDateString()
    if (sameDay) {
      return `${s.toLocaleDateString('en-US', dateOpts)} · ${s.toLocaleTimeString('en-US', timeOpts)} – ${e.toLocaleTimeString('en-US', timeOpts)}`
    }
    return `${s.toLocaleDateString('en-US', dateOpts)} ${s.toLocaleTimeString('en-US', timeOpts)} – ${e.toLocaleDateString('en-US', dateOpts)} ${e.toLocaleTimeString('en-US', timeOpts)}`
  }

  return (
    <div className="fixed inset-0 bg-black/45 flex items-end z-300">
      <div className="w-full bg-background rounded-t-2xl p-4 pb-6 shadow-xl border-t border-border">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Calendar className="size-5 text-muted-foreground" />
            </div>
            <div>
              <div className="text-sm font-bold text-foreground">Event Invitation</div>
              {eventRow && (
                <div className="text-xs text-muted-foreground">from {eventRow.from_name}</div>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onDone} className="text-muted-foreground">
            <X className="size-5" />
          </Button>
        </div>

        {loading && (
          <div className="flex justify-center py-6">
            <div className="size-6 animate-spin rounded-full border-2 border-border border-t-foreground" />
          </div>
        )}

        {!loading && !eventRow && (
          <div className="text-center text-muted-foreground text-sm py-4">
            Invitation details not found.
          </div>
        )}

        {!loading && eventRow && (
          <>
            {/* Event details card */}
            <div className="bg-muted rounded-xl p-3.5 mb-4 border border-border">
              <div className="text-base font-bold text-foreground mb-2">{eventRow.title}</div>
              <div className="flex items-start gap-2 mb-1.5">
                <Clock className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <span className="text-xs text-muted-foreground leading-snug">
                  {formatDateRange(eventRow.start_at, eventRow.end_at, eventRow.is_all_day)}
                </span>
              </div>
              {eventRow.location && (
                <div className="flex items-start gap-2">
                  <MapPin className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="text-xs text-muted-foreground leading-snug">{eventRow.location}</span>
                </div>
              )}
              {eventRow.description && (
                <div className="text-xs text-muted-foreground mt-2.5 pt-2.5 border-t border-border leading-relaxed">
                  {eventRow.description}
                </div>
              )}
            </div>

            {addedMsg && (
              <div className="bg-success/10 border border-success/20 rounded-lg px-3 py-2 mb-3 text-xs text-success flex items-center gap-2">
                <CheckCircle className="size-4 shrink-0" />
                {addedMsg}
              </div>
            )}
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 mb-3 text-xs text-destructive flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                {error}
              </div>
            )}

            {addedMsg ? (
              <Button onClick={onDone} className="w-full">Done</Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={onDone}>Dismiss</Button>
                <Button className="flex-2" onClick={handleAddToCalendar} disabled={adding}>
                  {adding ? 'Adding…' : 'Add to my calendar'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
