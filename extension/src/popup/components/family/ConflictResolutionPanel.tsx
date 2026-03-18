import { useEffect, useState } from 'react'
import { getConflictSuggestions, type ConflictSuggestion } from '../../../lib/ai'
import { supabase } from '../../../lib/supabase'
import type { AISettings, CalendarEvent, ConflictPair } from '../../../lib/types'
import { cn } from '../../../lib/utils'
import { Button } from '../../../components/ui/button'
import { AlertTriangle } from 'lucide-react'

interface Props {
  conflict: ConflictPair
  aiSettings: AISettings
  geminiOAuthToken?: string
  onApplied: () => void
  onClose: () => void
}

function formatTimeRange(startAt: string, endAt: string): string {
  const s = new Date(startAt), e = new Date(endAt)
  return `${s.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} – ${e.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

function areLikelyDuplicates(a: CalendarEvent, b: CalendarEvent): boolean {
  const ta = a.title.toLowerCase().trim()
  const tb = b.title.toLowerCase().trim()
  if (ta === tb) return true
  if (ta.includes(tb) || tb.includes(ta)) return true
  const wordsA = new Set(ta.split(/\W+/).filter(w => w.length >= 3))
  const wordsB = new Set(tb.split(/\W+/).filter(w => w.length >= 3))
  if (wordsA.size === 0 || wordsB.size === 0) return false
  const shared = [...wordsA].filter(w => wordsB.has(w)).length
  return shared / Math.max(wordsA.size, wordsB.size) >= 0.6
}

function buildMergedEvent(a: CalendarEvent, b: CalendarEvent) {
  return {
    title:       a.title.length >= b.title.length ? a.title : b.title,
    startAt:     a.startAt < b.startAt ? a.startAt : b.startAt,
    endAt:       a.endAt   > b.endAt   ? a.endAt   : b.endAt,
    location:    a.location ?? b.location,
    description: [a.description, b.description]
      .filter((d): d is string => Boolean(d))
      .filter((d, i, arr) => arr.indexOf(d) === i)
      .join('\n\n') || undefined,
  }
}

export default function ConflictResolutionPanel({
  conflict, aiSettings, geminiOAuthToken, onApplied, onClose,
}: Props) {
  const { eventA, eventB } = conflict
  const [suggestions, setSuggestions] = useState<ConflictSuggestion[]>([])
  const [selected, setSelected]       = useState(0)
  const [loading, setLoading]         = useState(true)
  const [applying, setApplying]       = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [merging, setMerging]         = useState(false)
  const [mergePreview, setMergePreview] = useState(false)

  const isDuplicate = areLikelyDuplicates(eventA, eventB)
  const merged      = buildMergedEvent(eventA, eventB)

  useEffect(() => {
    if (isDuplicate) { setLoading(false); return }
    getConflictSuggestions(eventA, eventB, aiSettings, geminiOAuthToken)
      .then((s) => { setSuggestions(s); setLoading(false) })
      .catch(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleApply() {
    const s = suggestions[selected]
    if (!s || s.eventId === null || s.shiftMinutes === null) { onClose(); return }

    const target = s.eventId === 'A' ? eventA : eventB
    const shiftMs = s.shiftMinutes * 60 * 1000
    const newStart = new Date(new Date(target.startAt).getTime() + shiftMs).toISOString()
    const newEnd   = new Date(new Date(target.endAt).getTime() + shiftMs).toISOString()

    setApplying(true)
    const { error: updateError } = await supabase
      .from('calendar_events')
      .update({ start_at: newStart, end_at: newEnd, updated_by: (await supabase.auth.getUser()).data.user?.id })
      .eq('id', target.id)

    if (updateError) {
      setError('Failed to update event. Please try again.')
      setApplying(false)
      return
    }
    onApplied()
  }

  async function handleMerge() {
    setMerging(true)
    setError(null)

    const userId = (await supabase.auth.getUser()).data.user?.id
    const survivorId = eventA.id
    const deletedId  = eventB.id

    const { error: updateErr } = await supabase
      .from('calendar_events')
      .update({
        title:       merged.title,
        start_at:    merged.startAt,
        end_at:      merged.endAt,
        location:    merged.location ?? null,
        description: merged.description ?? null,
        updated_by:  userId,
      })
      .eq('id', survivorId)

    if (updateErr) {
      setError('Merge failed. Please try again.')
      setMerging(false)
      return
    }

    const { data: deletedLinks } = await supabase
      .from('calendar_event_links')
      .select('id, user_id, provider')
      .eq('event_id', deletedId)

    if (deletedLinks?.length) {
      const { data: survivorLinks } = await supabase
        .from('calendar_event_links')
        .select('user_id, provider')
        .eq('event_id', survivorId)

      const survivorSet = new Set((survivorLinks ?? []).map(l => `${l.user_id}|${l.provider}`))
      const toMigrate   = deletedLinks.filter(l => !survivorSet.has(`${l.user_id}|${l.provider}`))
      const toRemove    = deletedLinks.filter(l =>  survivorSet.has(`${l.user_id}|${l.provider}`))

      if (toMigrate.length) {
        await supabase.from('calendar_event_links').update({ event_id: survivorId }).in('id', toMigrate.map(l => l.id))
      }
      if (toRemove.length) {
        await supabase.from('calendar_event_links').delete().in('id', toRemove.map(l => l.id))
      }
    }

    const { data: deletedInvs } = await supabase
      .from('event_invitations')
      .select('id, to_user_id')
      .eq('event_id', deletedId)

    if (deletedInvs?.length) {
      const { data: survivorInvs } = await supabase
        .from('event_invitations')
        .select('to_user_id')
        .eq('event_id', survivorId)

      const survivorInvSet  = new Set((survivorInvs ?? []).map(i => i.to_user_id))
      const toMigrateInvs   = deletedInvs.filter(i => !survivorInvSet.has(i.to_user_id))
      const toRemoveInvs    = deletedInvs.filter(i =>  survivorInvSet.has(i.to_user_id))

      if (toMigrateInvs.length) {
        await supabase.from('event_invitations').update({ event_id: survivorId }).in('id', toMigrateInvs.map(i => i.id))
      }
      if (toRemoveInvs.length) {
        await supabase.from('event_invitations').delete().in('id', toRemoveInvs.map(i => i.id))
      }
    }

    await supabase.from('calendar_events').delete().eq('id', deletedId)
    onApplied()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-200 p-4">
      <div className="bg-background rounded-xl border border-border p-5 w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center gap-2 text-destructive font-bold text-sm mb-3">
          <AlertTriangle className="size-4 shrink-0" />
          Schedule Conflict
        </div>

        {/* Conflicting events */}
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 mb-3.5 space-y-2">
          {([{ label: 'A', event: eventA }, { label: 'B', event: eventB }]).map(({ label, event }) => (
            <div key={event.id} className="flex gap-2 items-start">
              <div
                className="size-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                style={{ background: event.creatorColor ?? '#1a73e8' }}
              >
                {label}
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">{event.title}</div>
                <div className="text-xs text-muted-foreground">
                  {formatTimeRange(event.startAt, event.endAt)}
                  {event.creatorName && ` · ${event.creatorName}`}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Duplicate banner + merge UI */}
        {isDuplicate && (
          <div className="mb-3.5 space-y-2">
            <div className="bg-muted border border-border rounded-lg p-3 flex items-start gap-2">
              <span className="text-base shrink-0">🔁</span>
              <div>
                <div className="text-xs font-semibold text-foreground mb-0.5">Looks like the same event</div>
                <div className="text-xs text-muted-foreground leading-snug">
                  These were likely parsed from two different emails. You can merge them into one entry.
                </div>
              </div>
            </div>

            <button
              onClick={() => setMergePreview(v => !v)}
              className="text-xs text-primary bg-transparent border-0 cursor-pointer underline p-0"
            >
              {mergePreview ? 'Hide preview' : 'Preview merged event'}
            </button>

            {mergePreview && (
              <div className="bg-muted border border-border rounded-lg p-3 text-xs space-y-1">
                <div className="font-bold text-foreground">{merged.title}</div>
                <div className="text-muted-foreground">{formatTimeRange(merged.startAt, merged.endAt)}</div>
                {merged.location && <div className="text-muted-foreground">📍 {merged.location}</div>}
                {merged.description && (
                  <div className="text-muted-foreground/70 italic leading-snug">
                    {merged.description.substring(0, 120)}{merged.description.length > 120 ? '…' : ''}
                  </div>
                )}
                <div className="text-muted-foreground/60 pt-1">Entry B will be deleted · links &amp; invitations carried over</div>
              </div>
            )}
          </div>
        )}

        {/* AI suggestions (non-duplicate only) */}
        {!isDuplicate && (
          <div className="mb-3.5">
            <div className="text-xs font-semibold text-foreground mb-2">
              {loading ? 'Getting suggestions…' : 'Suggested resolutions:'}
            </div>
            {loading ? (
              <div className="text-xs text-muted-foreground">Thinking…</div>
            ) : (
              <div className="space-y-1.5">
                {suggestions.map((s, i) => (
                  <label
                    key={i}
                    className={cn(
                      'flex items-start gap-2 cursor-pointer p-2 rounded-lg border transition-colors',
                      selected === i
                        ? 'bg-accent border-border'
                        : 'bg-background border-border/50 hover:bg-muted'
                    )}
                  >
                    <input
                      type="radio"
                      checked={selected === i}
                      onChange={() => setSelected(i)}
                      className="mt-0.5 shrink-0"
                    />
                    <span className="text-xs text-foreground">{s.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="text-xs text-destructive mb-3">{error}</div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose} disabled={applying || merging}>
            Mark as OK
          </Button>
          {isDuplicate ? (
            <Button size="sm" onClick={handleMerge} disabled={merging}>
              {merging ? 'Merging…' : 'Merge into one'}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleApply}
              disabled={loading || applying || suggestions.length === 0}
            >
              {applying ? 'Applying…' : 'Apply'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
