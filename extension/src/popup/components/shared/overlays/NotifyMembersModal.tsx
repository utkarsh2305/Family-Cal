/**
 * NotifyMembersModal
 *
 * Shown after a user accepts an event. Lets them select which family members
 * to notify via Web Push / FCM by calling the notify-family Cloud Function.
 */

import React, { useEffect, useState } from 'react'
import { Check, Share2 } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { cn } from '../../../../lib/utils'
import { Button } from '../../../../components/ui/button'
import { Checkbox } from '../../../../components/ui/checkbox'
import type { FamilyMember, ProposedEvent } from '../../../../lib/types'

const NOTIFY_URL = import.meta.env.VITE_NOTIFY_FAMILY_URL as string

interface Props {
  eventId: string
  event:   ProposedEvent
  groupId: string
  userId:  string            // current user (sender)
  onDone:  () => void        // called after notify or skip
}

export default function NotifyMembersModal({ eventId, event, groupId, userId, onDone }: Props) {
  const [members,  setMembers]  = useState<FamilyMember[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sending,  setSending]  = useState(false)
  const [done,     setDone]     = useState(false)

  useEffect(() => {
    supabase
      .from('family_members')
      .select('id, user_id, role, joined_at, nickname, color, user_profiles(email)')
      .eq('group_id', groupId)
      .neq('user_id', userId)          // exclude self
      .then(({ data }) => {
        const list: FamilyMember[] = (data ?? []).map((row: any) => ({
          id:       row.id,
          userId:   row.user_id,
          role:     row.role,
          joinedAt: row.joined_at,
          email:    row.user_profiles?.email,
          nickname: row.nickname ?? undefined,
          color:    row.color ?? undefined,
        }))
        setMembers(list)
        // Pre-select all members
        setSelected(new Set(list.map((m) => m.userId)))
      })
  }, [groupId, userId])

  async function handleNotify() {
    if (selected.size === 0 || !NOTIFY_URL) { onDone(); return }
    setSending(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch(NOTIFY_URL, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          eventId,
          fromUserId:    userId,
          targetUserIds: Array.from(selected),
        }),
      })
    } catch (e) {
      console.error('[NotifyMembers] Failed to call notify-family:', e)
    } finally {
      setDone(true)
      setTimeout(onDone, 1200)
    }
  }

  function toggleMember(memberId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(memberId)) next.delete(memberId); else next.add(memberId)
      return next
    })
  }

  const displayName = (m: FamilyMember) =>
    m.nickname ?? m.email?.split('@')[0] ?? 'Member'

  if (done) {
    return (
      <div className="fixed inset-0 bg-black/45 flex items-end z-50">
        <div className="w-full bg-background rounded-t-2xl p-4 pb-6 shadow-xl border-t border-border">
          <div className="text-center py-3">
            <div className="flex items-center justify-center mb-2">
              <div className="size-9 rounded-full bg-success/15 flex items-center justify-center">
                <Check className="size-5 text-success" />
              </div>
            </div>
            <div className="text-sm font-semibold text-foreground">Family notified!</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/45 flex items-end z-50">
      <div className="w-full bg-background rounded-t-2xl p-4 pb-6 shadow-xl border-t border-border">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-4">
          <div className="size-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Share2 className="size-5 text-muted-foreground" />
          </div>
          <div>
            <div className="text-sm font-bold text-foreground leading-tight">Notify family members</div>
            <div className="text-xs text-muted-foreground mt-0.5">"{event.title}" was added</div>
          </div>
        </div>

        {/* Member list */}
        {members.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-3">
            No other family members found.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 mb-4">
            {members.map((m) => (
              <label
                key={m.userId}
                className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer hover:bg-accent transition-colors"
              >
                <Checkbox
                  checked={selected.has(m.userId)}
                  onCheckedChange={() => toggleMember(m.userId)}
                />
                {/* Color dot */}
                <div
                  className="size-2.5 rounded-full shrink-0"
                  style={{ background: m.color ?? 'oklch(0.556 0 0)' }}
                />
                <span className="text-sm font-medium text-foreground flex-1">
                  {displayName(m)}
                </span>
              </label>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2.5 mt-2">
          <Button variant="outline" className="flex-1" onClick={onDone}>
            Skip
          </Button>
          <Button
            className="flex-2"
            onClick={handleNotify}
            disabled={sending || selected.size === 0}
          >
            {sending ? 'Sending…' : `Notify ${selected.size > 0 ? selected.size : ''} member${selected.size !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
