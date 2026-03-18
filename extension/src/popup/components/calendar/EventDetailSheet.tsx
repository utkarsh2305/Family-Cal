import { useState } from 'react'
import { X, Pencil, Trash2, MapPin, AlertTriangle } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Checkbox } from '../../../components/ui/checkbox'
import type { CalendarEvent, ConflictPair, FamilyMember } from '../../../lib/types'
import { formatTime, getCreatorInitials, toLocalDateStr, toLocalTimeStr } from './calendarUtils'

export interface EventUpdateData {
  title: string
  date: string
  startTime: string
  endTime: string
  location: string
  isAllDay: boolean
}

interface Props {
  event: CalendarEvent
  members: FamilyMember[]
  canEdit: boolean
  conflict: ConflictPair | null
  onClose: () => void
  onSave: (data: EventUpdateData) => Promise<{ error: string | null }>
  onDelete: () => Promise<void>
  onResolveConflict: () => void
}

export default function EventDetailSheet({ event, members, canEdit, conflict, onClose, onSave, onDelete, onResolveConflict }: Props) {
  const [editing, setEditing]               = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [editTitle, setEditTitle]           = useState(event.title)
  const [editDate, setEditDate]             = useState(toLocalDateStr(event.startAt))
  const [editStartTime, setEditStartTime]   = useState(toLocalTimeStr(event.startAt))
  const [editEndTime, setEditEndTime]       = useState(toLocalTimeStr(event.endAt))
  const [editLocation, setEditLocation]     = useState(event.location ?? '')
  const [editAllDay, setEditAllDay]         = useState(event.isAllDay)
  const [editSaving, setEditSaving]         = useState(false)
  const [editError, setEditError]           = useState<string | null>(null)
  const [deleting, setDeleting]             = useState(false)

  const color = event.creatorColor ?? '#4F46E5'
  const creator = members.find((m) => m.userId === event.createdBy)
  const creatorName = creator?.nickname ?? creator?.email?.split('@')[0] ?? 'Unknown'

  async function handleSave() {
    if (!editTitle.trim()) { setEditError('Title is required.'); return }
    setEditSaving(true)
    setEditError(null)
    const result = await onSave({ title: editTitle, date: editDate, startTime: editStartTime, endTime: editEndTime, location: editLocation, isAllDay: editAllDay })
    setEditSaving(false)
    if (result.error) { setEditError(result.error); return }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <div className="bg-background rounded-t-2xl shadow-xl max-h-[85%] flex flex-col overflow-hidden">
        {/* Handle bar */}
        <div className="flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-1 h-5 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-sm font-semibold text-foreground truncate">
              {editing ? 'Edit Event' : event.title}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {editing ? (
            /* ── Edit form ── */
            <div className="px-4 py-4 space-y-3">
              {editError && <p className="text-xs text-destructive">{editError}</p>}

              <div className="space-y-1">
                <Label className="text-sm font-medium">Title</Label>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="h-8 text-sm" />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox id="edit-allday" checked={editAllDay} onCheckedChange={(v) => setEditAllDay(!!v)} />
                <Label htmlFor="edit-allday" className="text-sm font-medium cursor-pointer">All day</Label>
              </div>

              <div className="space-y-1">
                <Label className="text-sm font-medium">Date</Label>
                <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="h-8 text-sm" />
              </div>

              {!editAllDay && (
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-sm font-medium">Start</Label>
                    <Input type="time" value={editStartTime} onChange={(e) => setEditStartTime(e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-sm font-medium">End</Label>
                    <Input type="time" value={editEndTime} onChange={(e) => setEditEndTime(e.target.value)} className="h-8 text-sm" />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-sm font-medium">Location</Label>
                <Input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} placeholder="Optional" className="h-8 text-sm" />
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => { setEditing(false); setEditError(null) }} disabled={editSaving}>
                  Cancel
                </Button>
                <Button size="sm" className="flex-1" onClick={handleSave} disabled={editSaving}>
                  {editSaving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          ) : confirmingDelete ? (
            /* ── Inline delete confirmation ── */
            <div className="px-4 py-6 text-center">
              <p className="text-[13px] font-semibold text-foreground mb-1">Delete this event?</p>
              <p className="text-xs text-muted-foreground mb-5">This cannot be undone.</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmingDelete(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={deleting}
                  onClick={async () => { setDeleting(true); await onDelete() }}
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </Button>
              </div>
            </div>
          ) : (
            /* ── Detail view ── */
            <div className="px-4 py-4">
              {/* Creator + time */}
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="size-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: color + '25', color }}
                >
                  {getCreatorInitials(event, members)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{creatorName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {event.isAllDay ? 'All day' : `${formatTime(event.startAt)} – ${formatTime(event.endAt)}`}
                  </p>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-2 mb-4">
                {event.location && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="size-3 shrink-0" />
                    <span>{event.location}</span>
                  </div>
                )}
                {event.description && <p className="text-xs text-muted-foreground leading-relaxed">{event.description}</p>}
                {conflict && (
                  <div className="flex items-center gap-1.5 text-xs text-destructive font-medium">
                    <AlertTriangle className="size-3 shrink-0" />
                    <span>Scheduling conflict detected</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              {canEdit && (
                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => setEditing(true)}>
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setConfirmingDelete(true)}
                  >
                    <Trash2 className="size-3.5" /> Delete
                  </Button>
                </div>
              )}
              {conflict && (
                <Button variant="outline" size="sm" className="w-full mt-2" onClick={onResolveConflict}>
                  Resolve Conflict
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
