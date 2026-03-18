import React, { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { FamilyMember } from '../lib/types'
import InviteCodeSection from '../popup/components/members/InviteCodeSection'
import RenameMemberDialog from '../popup/components/members/RenameMemberDialog'
import { Button } from '../components/ui/button'
import { Avatar, AvatarFallback } from '../components/ui/avatar'
import { Badge } from '../components/ui/badge'

const DEFAULT_COLOR = '#1a73e8'

function getInitial(member: FamilyMember): string {
  const src = member.nickname ?? member.email ?? ''
  return src.charAt(0).toUpperCase() || '?'
}

function getDisplayName(member: FamilyMember): string {
  return member.nickname ?? member.email?.split('@')[0] ?? member.userId.slice(0, 8)
}

interface AuthState {
  userId: string
  email: string
  groupId: string
  groupName: string
  role: 'owner' | 'editor' | 'viewer'
}

export default function MembersPage() {
  const [auth, setAuth]       = useState<AuthState | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [editingMember, setEditingMember]   = useState<FamilyMember | null>(null)

  // Auth + group check on mount
  useEffect(() => {
    async function init() {
      // chrome.storage.local is async — the session may not be available on the
      // first read if the popup's Supabase client wrote it just before this page
      // opened. Poll up to 3s before giving up.
      let session = null
      for (let i = 0; i < 6; i++) {
        const { data } = await supabase.auth.getSession()
        if (data.session) { session = data.session; break }
        await new Promise((r) => setTimeout(r, 500))
      }
      if (!session) { setAuthLoading(false); return }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('email')
        .eq('id', session.user.id)
        .maybeSingle()

      const { data: membership } = await supabase
        .from('family_members')
        .select('role, group_id, family_groups(name)')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (!membership) { setAuthLoading(false); return }

      setAuth({
        userId:    session.user.id,
        email:     profile?.email ?? session.user.email ?? '',
        groupId:   membership.group_id,
        groupName: (membership as any).family_groups?.name ?? 'My Family',
        role:      membership.role as 'owner' | 'editor' | 'viewer',
      })
      setAuthLoading(false)
    }
    init()
  }, [])

  const fetchMembers = useCallback(() => {
    if (!auth) return
    setMembersLoading(true)
    supabase
      .from('family_members')
      .select('id, user_id, role, joined_at, nickname, color, user_profiles(email)')
      .eq('group_id', auth.groupId)
      .order('joined_at', { ascending: true })
      .then(({ data }) => {
        setMembers(
          (data ?? []).map((row: any) => ({
            id:       row.id,
            userId:   row.user_id,
            role:     row.role,
            joinedAt: row.joined_at,
            email:    row.user_profiles?.email,
            nickname: row.nickname ?? undefined,
            color:    row.color ?? undefined,
          }))
        )
        setMembersLoading(false)
      })
  }, [auth])

  useEffect(() => {
    if (auth) fetchMembers()
  }, [auth, fetchMembers])

  // Real-time subscription
  useEffect(() => {
    if (!auth) return
    const channel = supabase
      .channel('members_page_' + auth.groupId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'family_members', filter: `group_id=eq.${auth.groupId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setMembers((prev) => prev.filter((m) => m.id !== (payload.old as any).id))
          } else if (payload.eventType === 'UPDATE') {
            setMembers((prev) =>
              prev.map((m) =>
                m.id === (payload.new as any).id
                  ? { ...m, nickname: (payload.new as any).nickname ?? undefined, color: (payload.new as any).color ?? undefined }
                  : m
              )
            )
          } else if (payload.eventType === 'INSERT') {
            fetchMembers()
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [auth, fetchMembers])

  async function handleRemove(member: FamilyMember) {
    const name = getDisplayName(member)
    if (!window.confirm(`Remove ${name} from your family?`)) return
    await supabase.from('family_members').delete().eq('id', member.id)
    setMembers((prev) => prev.filter((m) => m.id !== member.id))
  }

  function handleRenameSave(nickname: string, color: string) {
    if (!editingMember) return
    setMembers((prev) =>
      prev.map((m) => m.id === editingMember.id ? { ...m, nickname, color } : m)
    )
    setEditingMember(null)
  }

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (!auth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="text-4xl mb-3">🔒</div>
        <h2 className="text-lg font-semibold text-foreground mb-2">Not signed in</h2>
        <p className="text-sm text-muted-foreground">Please sign in via the extension popup first.</p>
      </div>
    )
  }

  if (!auth.groupId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="text-4xl mb-3">👨‍👩‍👧</div>
        <h2 className="text-lg font-semibold text-foreground mb-2">No family set up</h2>
        <p className="text-sm text-muted-foreground">Please set up your family first via the extension popup.</p>
      </div>
    )
  }

  const isOwner = auth.role === 'owner'

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="mb-7">
        <h1 className="text-xl font-bold text-foreground">{auth.groupName}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Family Members</p>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6 items-start flex-wrap">

        {/* Left: member list */}
        <div className="flex-1 basis-96 bg-card rounded-lg border border-border p-5">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Active Members ({members.length})
          </div>

          {membersLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            members.map((member) => {
              const color       = member.color ?? DEFAULT_COLOR
              const displayName = getDisplayName(member)
              const isMe        = member.userId === auth.userId
              const canRemove   = isOwner && !isMe && members.length > 1

              return (
                <div
                  key={member.id}
                  className="flex items-center gap-3 py-2.5 border-b border-border last:border-0"
                >
                  {/* Avatar */}
                  <Avatar className="size-10 shrink-0">
                    <AvatarFallback style={{ background: color }}>
                      {getInitial(member)}
                    </AvatarFallback>
                  </Avatar>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <span>{displayName}</span>
                      {isMe && <span className="text-xs text-muted-foreground">(you)</span>}
                      <Badge
                        variant={member.role === 'owner' ? 'default' : 'secondary'}
                        className="text-[10px] px-1.5 py-0 capitalize"
                      >
                        {member.role === 'owner' ? 'Admin' : member.role}
                      </Badge>
                    </div>
                    {member.email && (
                      <div className="text-xs text-muted-foreground truncate">{member.email}</div>
                    )}
                    <div className="text-[11px] text-muted-foreground/70">
                      Joined {new Date(member.joinedAt).toLocaleDateString()}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1.5 shrink-0">
                    {isOwner && !isMe && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingMember(member)}
                      >
                        Rename
                      </Button>
                    )}
                    {canRemove && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemove(member)}
                        className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Right: invite code (owner only) */}
        {isOwner && (
          <div className="flex-none basis-64 bg-card rounded-lg border border-border p-5">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Family Invite Code
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Share this code with family members so they can join.
            </p>
            <InviteCodeSection groupId={auth.groupId} currentUserId={auth.userId} />
          </div>
        )}
      </div>

      {/* Rename dialog */}
      {editingMember && (
        <RenameMemberDialog
          member={editingMember}
          onSave={handleRenameSave}
          onCancel={() => setEditingMember(null)}
        />
      )}
    </div>
  )
}
