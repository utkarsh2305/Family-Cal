import { useCallback, useEffect, useState } from 'react'
import { X, Pencil, Plus, KeyRound, Bookmark, Trash2 } from 'lucide-react'
import { BOOKMARKLET_URL } from '../../../lib/bookmarklet-url.generated'
import { supabase } from '../../../lib/supabase'
import { cn } from '../../../lib/utils'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Avatar, AvatarFallback } from '../../../components/ui/avatar'
import type { FamilyMember } from '../../../lib/types'
import InviteCodeSection from './InviteCodeSection'
import RenameMemberDialog from './RenameMemberDialog'
import { SectionHeader, ListRow, StatusChip, IconButton } from '../shared/ui'

interface GroupInfo { id: string; name: string; role: 'owner' | 'editor' | 'viewer' }

interface Props {
  groupId: string
  currentUserId: string
  isOwner: boolean
  onBack: () => void
  familyGroups?: GroupInfo[]
  onGroupChanged?: (groupId: string, groupName: string, role: 'owner' | 'editor' | 'viewer') => void
  onGroupDeleted?: (groupId: string) => void
}

const DEFAULT_COLOR = '#111827'

function getRoleLabel(role: string): string {
  if (role === 'owner') return 'Owner'
  if (role === 'editor') return 'Editor'
  return 'Member'
}

function getRoleVariant(role: string): 'info' | 'default' {
  return role === 'owner' ? 'info' : 'default'
}

function getInitial(member: FamilyMember): string {
  const src = member.nickname ?? member.email ?? ''
  return src.charAt(0).toUpperCase() || '?'
}

function getDisplayName(member: FamilyMember): string {
  return member.nickname ?? member.email?.split('@')[0] ?? member.userId.slice(0, 8)
}

export default function MembersPanel({ groupId, currentUserId, isOwner, onBack: _onBack, familyGroups = [], onGroupChanged, onGroupDeleted }: Props) {
  const [activeGroupId, setActiveGroupId] = useState(groupId)
  const [members, setMembers]             = useState<FamilyMember[]>([])
  const [loading, setLoading]             = useState(true)
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null)

  // Create/join group inline forms
  const [createName, setCreateName]   = useState('')
  const [createOpen, setCreateOpen]   = useState(false)
  const [createBusy, setCreateBusy]   = useState(false)
  const [joinCode, setJoinCode]       = useState('')
  const [joinOpen, setJoinOpen]       = useState(false)
  const [joinBusy, setJoinBusy]       = useState(false)
  const [groupError, setGroupError]   = useState<string | null>(null)

  // Group rename/delete
  const [renamingGroupId, setRenamingGroupId]   = useState<string | null>(null)
  const [renameGroupName, setRenameGroupName]   = useState('')
  const [deletingGroupId, setDeletingGroupId]   = useState<string | null>(null)

  // Inline confirm dialog
  const [confirm, setConfirm] = useState<{ message: string; onOk: () => void } | null>(null)

  // Derive isOwner for the active group
  const activeGroupInfo = familyGroups.find((g) => g.id === activeGroupId)
  const activeIsOwner = activeGroupInfo ? activeGroupInfo.role === 'owner' : isOwner

  const fetchMembers = useCallback(() => {
    setLoading(true)
    supabase
      .from('family_members')
      .select('id, user_id, role, joined_at, nickname, color, user_profiles(email)')
      .eq('group_id', activeGroupId)
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
        setLoading(false)
      })
  }, [activeGroupId])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('family_members_' + activeGroupId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'family_members', filter: `group_id=eq.${activeGroupId}` },
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
  }, [activeGroupId, fetchMembers])

  function handleRemove(member: FamilyMember) {
    const name = getDisplayName(member)
    setConfirm({
      message: `Remove ${name} from this group?`,
      onOk: async () => {
        const { error } = await supabase.from('family_members').delete().eq('id', member.id)
        if (error) { setGroupError(error.message); return }
        setMembers((prev) => prev.filter((m) => m.id !== member.id))
      },
    })
  }

  async function handleCreateGroup() {
    const name = createName.trim()
    if (!name) return
    setCreateBusy(true)
    setGroupError(null)
    const { data, error } = await supabase.rpc('create_family_group', { group_name: name })
    setCreateBusy(false)
    if (error) { setGroupError(error.message); return }
    setCreateOpen(false)
    setCreateName('')
    const newGroupId = data as string
    onGroupChanged?.(newGroupId, name, 'owner')
    setActiveGroupId(newGroupId)
  }

  async function handleJoinGroup() {
    const code = joinCode.trim().toUpperCase()
    if (!code) return
    setJoinBusy(true)
    setGroupError(null)
    const { data, error } = await supabase.rpc('join_family_group_by_code', { invite_code: code })
    setJoinBusy(false)
    if (error) { setGroupError(error.message); return }
    setJoinOpen(false)
    setJoinCode('')
    const result = data as { group_id: string; group_name: string } | null
    if (result?.group_id) {
      onGroupChanged?.(result.group_id, result.group_name, 'editor')
      setActiveGroupId(result.group_id)
    }
  }

  async function handleRenameGroup(gid: string) {
    const name = renameGroupName.trim()
    if (!name) return
    const { error } = await supabase.from('family_groups').update({ name }).eq('id', gid)
    if (error) { setGroupError(error.message); return }
    onGroupChanged?.(gid, name, familyGroups.find((g) => g.id === gid)?.role ?? 'owner')
    setRenamingGroupId(null)
  }

  function handleDeleteGroup(gid: string, groupName: string) {
    setConfirm({
      message: `Delete "${groupName}"? All members and events will be removed permanently.`,
      onOk: async () => {
        setDeletingGroupId(gid)
        const { error } = await supabase.from('family_groups').delete().eq('id', gid)
        setDeletingGroupId(null)
        if (error) { setGroupError(error.message); return }
        onGroupDeleted?.(gid)
        const remaining = familyGroups.filter((g) => g.id !== gid)
        if (remaining.length > 0) {
          const next = remaining[0]
          onGroupChanged?.(next.id, next.name, next.role)
          setActiveGroupId(next.id)
        } else {
          onGroupChanged?.('', '', 'owner')
        }
      },
    })
  }

  function handleRenameSave(nickname: string, color: string) {
    if (!editingMember) return
    setMembers((prev) =>
      prev.map((m) => m.id === editingMember.id ? { ...m, nickname, color } : m)
    )
    setEditingMember(null)
  }

  const otherGroups = familyGroups.filter((g) => g.id !== activeGroupId)

  return (
    <div className="pb-4">

      {/* ── 1. Family Card ─────────────────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border p-4 mx-4 mt-4 mb-1">
        {renamingGroupId === activeGroupId ? (
          <div className="flex gap-1.5 items-center">
            <Input
              autoFocus
              value={renameGroupName}
              onChange={(e) => setRenameGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameGroup(activeGroupId)
                if (e.key === 'Escape') setRenamingGroupId(null)
              }}
              className="h-7 text-sm flex-1"
            />
            <Button size="sm" className="h-7 px-2 text-xs" onClick={() => handleRenameGroup(activeGroupId)}>Save</Button>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setRenamingGroupId(null)}>Cancel</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[17px] font-bold text-foreground truncate">
                {activeGroupInfo?.name ?? 'Family'}
              </span>
              {activeIsOwner && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <IconButton
                    icon={<Pencil className="size-3.5" />}
                    label="Rename group"
                    size="sm"
                    onClick={() => { setRenamingGroupId(activeGroupId); setRenameGroupName(activeGroupInfo?.name ?? '') }}
                  />
                  <IconButton
                    icon={<Trash2 className="size-3.5" />}
                    label="Delete group"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => activeGroupInfo && handleDeleteGroup(activeGroupId, activeGroupInfo.name)}
                    disabled={deletingGroupId === activeGroupId}
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <StatusChip
                label={getRoleLabel(activeGroupInfo?.role ?? (isOwner ? 'owner' : 'viewer'))}
                variant={getRoleVariant(activeGroupInfo?.role ?? (isOwner ? 'owner' : 'viewer'))}
              />
              <span className="text-[11px] text-muted-foreground">
                {members.length} member{members.length !== 1 ? 's' : ''}
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── 2. Members Section ─────────────────────────────────────── */}
      <SectionHeader title="Members" />

      {loading ? (
        <div className="px-4 py-4 flex items-center gap-2 text-sm text-muted-foreground">
          <div className="size-4 animate-spin rounded-full border-2 border-border border-t-foreground shrink-0" />
          Loading…
        </div>
      ) : (
        <div>
          {members.map((member) => {
            const color       = member.color ?? DEFAULT_COLOR
            const displayName = getDisplayName(member)
            const isMe        = member.userId === currentUserId
            const canRemove   = activeIsOwner && !isMe && members.length > 1

            return (
              <ListRow
                key={member.id}
                leading={
                  <Avatar>
                    <AvatarFallback style={{ background: color }}>
                      {getInitial(member)}
                    </AvatarFallback>
                  </Avatar>
                }
                title={displayName + (isMe ? ' (you)' : '')}
                subtitle={member.email ?? undefined}
                trailing={
                  <div className="flex items-center gap-1">
                    <StatusChip label={getRoleLabel(member.role)} variant={getRoleVariant(member.role)} />
                    {activeIsOwner && !isMe && (
                      <IconButton
                        icon={<Pencil className="size-3.5" />}
                        label="Rename"
                        size="sm"
                        onClick={() => setEditingMember(member)}
                      />
                    )}
                    {canRemove && (
                      <IconButton
                        icon={<X className="size-3.5" />}
                        label="Remove"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleRemove(member)}
                      />
                    )}
                  </div>
                }
              />
            )
          })}
        </div>
      )}

      {!loading && members.length <= 1 && activeIsOwner && (
        <p className="px-4 pb-3 text-[11px] text-muted-foreground">
          Share an invite code below to add family members.
        </p>
      )}

      {/* ── 3. Invite Section (owners only) ────────────────────────── */}
      {activeIsOwner && (
        <>
          <SectionHeader title="Invite" />
          <div className="px-4">
            <InviteCodeSection groupId={activeGroupId} currentUserId={currentUserId} />
          </div>
        </>
      )}

      {/* ── 4. Groups Section ──────────────────────────────────────── */}
      <SectionHeader title="Groups" />

      {otherGroups.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden divide-y divide-border mx-4 mb-3">
          {otherGroups.map((g) => {
            const isGOwner   = g.role === 'owner'
            const isRenaming = renamingGroupId === g.id
            const isDeleting = deletingGroupId === g.id
            return (
              <div
                key={g.id}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 bg-background hover:bg-muted/50 cursor-pointer transition-colors'
                )}
                onClick={() => !isRenaming && setActiveGroupId(g.id)}
              >
                {isRenaming ? (
                  <div className="flex flex-1 gap-1.5 items-center" onClick={(e) => e.stopPropagation()}>
                    <Input
                      autoFocus
                      value={renameGroupName}
                      onChange={(e) => setRenameGroupName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameGroup(g.id)
                        if (e.key === 'Escape') setRenamingGroupId(null)
                      }}
                      className="h-7 text-sm flex-1"
                    />
                    <Button size="sm" className="h-7 px-2 text-xs" onClick={() => handleRenameGroup(g.id)}>Save</Button>
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setRenamingGroupId(null)}>Cancel</Button>
                  </div>
                ) : (
                  <>
                    <span className="text-[13px] font-semibold text-foreground truncate flex-1">{g.name}</span>
                    <StatusChip label={getRoleLabel(g.role)} variant={getRoleVariant(g.role)} />
                    {isGOwner && (
                      <div className="flex gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <IconButton
                          icon={<Pencil className="size-3.5" />}
                          label="Rename group"
                          size="sm"
                          onClick={() => { setRenamingGroupId(g.id); setRenameGroupName(g.name) }}
                        />
                        <IconButton
                          icon={<Trash2 className="size-3.5" />}
                          label="Delete group"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleDeleteGroup(g.id, g.name)}
                          disabled={isDeleting}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="px-4">
        {groupError && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 mb-2.5 text-xs text-destructive">
            {groupError}
          </div>
        )}

        {createOpen ? (
          <div className="mb-2">
            <Input
              autoFocus
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateGroup(); if (e.key === 'Escape') setCreateOpen(false) }}
              placeholder="Group name"
              maxLength={50}
              className="mb-1.5"
            />
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => { setCreateOpen(false); setGroupError(null) }}>Cancel</Button>
              <Button size="sm" className="flex-2" onClick={handleCreateGroup} disabled={createBusy || !createName.trim()}>
                {createBusy ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="w-full justify-start mb-1.5" onClick={() => { setCreateOpen(true); setJoinOpen(false); setGroupError(null) }}>
            <Plus className="size-4" />
            New group
          </Button>
        )}

        {joinOpen ? (
          <div className="mt-2">
            <Input
              autoFocus
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') handleJoinGroup(); if (e.key === 'Escape') setJoinOpen(false) }}
              placeholder="8-character invite code"
              maxLength={8}
              className="mb-1.5"
            />
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => { setJoinOpen(false); setGroupError(null) }}>Cancel</Button>
              <Button size="sm" className="flex-2" onClick={handleJoinGroup} disabled={joinBusy || joinCode.trim().length < 6}>
                {joinBusy ? 'Joining…' : 'Join'}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="w-full justify-start" onClick={() => { setJoinOpen(true); setCreateOpen(false); setGroupError(null) }}>
            <KeyRound className="size-4" />
            Join by code
          </Button>
        )}
      </div>

      {/* ── 5. Mobile Gmail Section ────────────────────────────────── */}
      <SectionHeader title="Mobile Gmail" />
      <div className="px-4">
        <p className="text-xs text-muted-foreground mb-3">
          Use Family Cal in Gmail on your phone. Drag the button below to your bookmarks bar — it syncs to Chrome on Android automatically.
        </p>
        <a
          href={BOOKMARKLET_URL}
          draggable
          onClick={(e) => e.preventDefault()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-grab active:cursor-grabbing select-none"
        >
          <Bookmark className="size-3.5" />
          Family Cal
        </a>
        <p className="text-[11px] text-muted-foreground mt-1.5">
          Drag to bookmarks bar · tap while viewing a Gmail email on mobile
        </p>
      </div>

      {/* ── Overlays ───────────────────────────────────────────────── */}
      {editingMember && (
        <RenameMemberDialog
          member={editingMember}
          onSave={handleRenameSave}
          onCancel={() => setEditingMember(null)}
        />
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setConfirm(null)}>
          <div className="w-full bg-background rounded-t-2xl p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-[13px] font-semibold text-foreground mb-1">Are you sure?</p>
            <p className="text-xs text-muted-foreground mb-4">{confirm.message}</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => { confirm.onOk(); setConfirm(null) }}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
