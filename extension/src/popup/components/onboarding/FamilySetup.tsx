import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Avatar, AvatarFallback } from '../../../components/ui/avatar'
import { ChevronLeft, Calendar, Check, Users } from 'lucide-react'
import { cn } from '../../../lib/utils'

interface Props {
  userId: string
  onCreated: (groupId: string, groupName: string, role: 'owner' | 'editor') => void
}

type Screen =
  | 'welcome'
  | 'join_code'
  | 'join_preview'
  | 'join_waiting'
  | 'join_named'
  | 'create_form'
  | 'create_done'

interface PreviewMember {
  nickname: string | null
  color: string
  email: string | null
}

interface PreviewData {
  family_id: string
  family_name: string
  members: PreviewMember[]
}

const DEFAULT_COLOR = '#1a73e8'

function MemberAvatar({ name, color, size = 'md' }: { name: string; color: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <Avatar className={cn(size === 'sm' && 'size-7', size === 'md' && 'size-9', size === 'lg' && 'size-14')}>
      <AvatarFallback style={{ background: color }}>{name.charAt(0).toUpperCase()}</AvatarFallback>
    </Avatar>
  )
}

function memberDisplayName(m: PreviewMember): string {
  return m.nickname ?? m.email?.split('@')[0] ?? '?'
}

export default function FamilySetup({ userId, onCreated }: Props) {
  const [screen, setScreen] = useState<Screen>('welcome')

  const [codeInput, setCodeInput]     = useState('')
  const [codeLoading, setCodeLoading] = useState(false)
  const [codeError, setCodeError]     = useState<string | null>(null)
  const [preview, setPreview]         = useState<PreviewData | null>(null)
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinError, setJoinError]     = useState<string | null>(null)
  const [joinedGroupId, setJoinedGroupId]     = useState('')
  const [joinedGroupName, setJoinedGroupName] = useState('')
  const [assignedNickname, setAssignedNickname] = useState('')
  const [assignedColor, setAssignedColor]       = useState(DEFAULT_COLOR)

  const [familyName, setFamilyName]       = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError]     = useState<string | null>(null)
  const [createdGroupId, setCreatedGroupId]     = useState('')
  const [createdGroupName, setCreatedGroupName] = useState('')

  useEffect(() => {
    if (screen !== 'join_waiting' || !joinedGroupId) return
    const channel = supabase
      .channel('onboarding_membership')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'family_members', filter: `group_id=eq.${joinedGroupId}` },
        (payload) => {
          const row = payload.new as any
          if (row.user_id === userId && row.nickname) {
            setAssignedNickname(row.nickname)
            setAssignedColor(row.color ?? DEFAULT_COLOR)
            setScreen('join_named')
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [screen, joinedGroupId, userId])

  async function handleCodeContinue() {
    const code = codeInput.trim()
    if (!code) { setCodeError('Please enter your invite code.'); return }
    setCodeLoading(true)
    setCodeError(null)
    const { data, error } = await supabase.rpc('preview_family_by_code', { invite_code: code })
    setCodeLoading(false)
    if (error) { setCodeError(error.message); return }
    if ((data as any)?.error === 'invalid_or_expired') {
      setCodeError('Code not found or expired. Check the code and try again.')
      return
    }
    setPreview(data as PreviewData)
    setScreen('join_preview')
  }

  async function handleJoinFamily() {
    if (!preview) return
    setJoinLoading(true)
    setJoinError(null)
    const { data, error } = await supabase.rpc('join_family_group_by_code', { invite_code: codeInput.trim() })
    setJoinLoading(false)
    if (error) { setJoinError(error.message); return }
    if ((data as any)?.error === 'invalid_or_expired') {
      setJoinError('This code is no longer valid.')
      return
    }
    const gid = (data as any)?.error === 'already_member'
      ? ((data as any).group_id ?? preview.family_id)
      : (data as any).group_id
    setJoinedGroupId(gid)
    setJoinedGroupName(preview.family_name)
    setScreen('join_waiting')
  }

  async function handleCreateFamily() {
    const name = familyName.trim()
    if (!name) { setCreateError('Family name is required.'); return }
    setCreateLoading(true)
    setCreateError(null)
    const { data, error } = await supabase.rpc('create_family_group', { group_name: name })
    setCreateLoading(false)
    if (error) { setCreateError(error.message); return }
    const gid = typeof data === 'string' ? data : (data as any)?.id ?? String(data)
    setCreatedGroupId(gid)
    setCreatedGroupName(name)
    setScreen('create_done')
  }

  const containerCls = "p-5 min-h-[320px] flex flex-col"

  // ── Screen 1: Welcome ─────────────────────────────────────────────────────
  if (screen === 'welcome') {
    return (
      <div className={cn(containerCls, "items-center text-center justify-center gap-2")}>
        <div className="bg-primary rounded-2xl p-3 mb-2">
          <Calendar className="size-8 text-primary-foreground" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Family Calendar</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Coordinate your family's calendar in one place.
        </p>
        <Button onClick={() => setScreen('join_code')} className="w-full mb-2">
          I have an invite code
        </Button>
        <Button variant="outline" onClick={() => setScreen('create_form')} className="w-full">
          Create my family
        </Button>
      </div>
    )
  }

  // ── Screen 2: Enter invite code ───────────────────────────────────────────
  if (screen === 'join_code') {
    return (
      <div className={containerCls}>
        <BackButton onClick={() => { setCodeError(null); setCodeInput(''); setScreen('welcome') }} />
        <h3 className="text-base font-bold text-foreground mb-1">Enter your invite code</h3>
        <p className="text-sm text-muted-foreground mb-4">Your family admin shared an 8-character code with you.</p>

        <Input
          type="text"
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
          placeholder="e.g. X7K2M9QP"
          className="font-mono tracking-[0.2em] text-lg text-center mb-1"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && !codeLoading && handleCodeContinue()}
        />
        <p className="text-xs text-muted-foreground mb-4">8 characters, letters and numbers. Case doesn't matter.</p>

        {codeError && <ErrorMsg>{codeError}</ErrorMsg>}

        <div className="flex gap-2 mt-auto">
          <Button variant="outline" className="flex-1" onClick={() => { setCodeError(null); setCodeInput(''); setScreen('welcome') }}>Back</Button>
          <Button
            className="flex-1"
            onClick={handleCodeContinue}
            disabled={codeLoading || codeInput.length === 0}
          >
            {codeLoading ? 'Checking…' : 'Continue'}
          </Button>
        </div>
      </div>
    )
  }

  // ── Screen 3: Preview family before joining ───────────────────────────────
  if (screen === 'join_preview' && preview) {
    return (
      <div className={containerCls}>
        <BackButton onClick={() => { setJoinError(null); setScreen('join_code') }} />
        <h3 className="text-base font-bold text-foreground mb-1">You're joining:</h3>
        <div className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          {preview.family_name}
        </div>

        {preview.members.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-muted-foreground mb-2">
              Current members ({preview.members.length}):
            </p>
            {preview.members.map((m, i) => (
              <div key={i} className="flex items-center gap-2 mb-1.5">
                <MemberAvatar name={memberDisplayName(m)} color={m.color} size="sm" />
                <span className="text-sm text-foreground">{memberDisplayName(m)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="bg-muted rounded-lg border border-border p-3 mb-4 space-y-1">
          <p className="text-xs text-muted-foreground">After joining you can:</p>
          {['View the family calendar', 'Coordinate events with family', 'Receive event updates'].map((b) => (
            <div key={b} className="flex items-center gap-1.5 text-xs text-foreground">
              <Check className="size-3 text-success shrink-0" />{b}
            </div>
          ))}
        </div>

        {joinError && <ErrorMsg>{joinError}</ErrorMsg>}

        <div className="flex gap-2 mt-auto">
          <Button variant="outline" className="flex-1" onClick={() => { setJoinError(null); setScreen('join_code') }}>Back</Button>
          <Button className="flex-1" onClick={handleJoinFamily} disabled={joinLoading}>
            {joinLoading ? 'Joining…' : 'Join Family'}
          </Button>
        </div>
      </div>
    )
  }

  // ── Screen 4: Waiting for admin to assign nickname ────────────────────────
  if (screen === 'join_waiting') {
    return (
      <div className={cn(containerCls, "items-center text-center")}>
        <div className="text-4xl mb-3">✅</div>
        <h3 className="text-base font-bold text-foreground mb-1">Welcome to {joinedGroupName}!</h3>
        <p className="text-sm text-muted-foreground mb-5">
          You've successfully joined. The admin will assign your name shortly.
        </p>
        <div className="bg-muted rounded-lg border border-border p-3 mb-5 text-left w-full space-y-1">
          <p className="text-xs text-muted-foreground">In the meantime:</p>
          {['View the family calendar', 'See other members', 'Receive event updates'].map((b) => (
            <div key={b} className="flex items-center gap-1.5 text-xs text-foreground">
              <span className="text-muted-foreground">•</span>{b}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mb-5">
          This screen updates automatically when your name is assigned.
        </p>
        <Button className="w-full" onClick={() => onCreated(joinedGroupId, joinedGroupName, 'editor')}>
          View Calendar →
        </Button>
      </div>
    )
  }

  // ── Screen 5: Admin assigned nickname ─────────────────────────────────────
  if (screen === 'join_named') {
    return (
      <div className={cn(containerCls, "items-center text-center")}>
        <div className="text-4xl mb-3">🎉</div>
        <h3 className="text-base font-bold text-foreground mb-1">You're in!</h3>
        <p className="text-sm text-muted-foreground mb-5">Your admin gave you a name:</p>
        <div className="flex flex-col items-center gap-2 mb-5">
          <MemberAvatar name={assignedNickname} color={assignedColor} size="lg" />
          <span className="text-lg font-bold text-foreground">{assignedNickname}</span>
        </div>
        <p className="text-xs text-muted-foreground mb-5">
          You can now fully use the family calendar and coordinate with your family.
        </p>
        <Button className="w-full" onClick={() => onCreated(joinedGroupId, joinedGroupName, 'editor')}>
          View Calendar →
        </Button>
      </div>
    )
  }

  // ── Screen 6: Create family form ──────────────────────────────────────────
  if (screen === 'create_form') {
    return (
      <div className={containerCls}>
        <BackButton onClick={() => { setCreateError(null); setFamilyName(''); setScreen('welcome') }} />
        <h3 className="text-base font-bold text-foreground mb-1">Create your family</h3>
        <p className="text-sm text-muted-foreground mb-4">Give your family a name. You'll be the admin.</p>

        <div className="space-y-1.5 mb-1">
          <Label htmlFor="family-name">Family name</Label>
          <Input
            id="family-name"
            type="text"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value.slice(0, 50))}
            placeholder="Smith Family, The Johnsons, Our Family…"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && !createLoading && handleCreateFamily()}
          />
        </div>
        <p className="text-[10px] text-muted-foreground text-right mb-4">{familyName.length}/50</p>

        {createError && <ErrorMsg>{createError}</ErrorMsg>}

        <div className="flex gap-2 mt-auto">
          <Button variant="outline" className="flex-1" onClick={() => { setCreateError(null); setFamilyName(''); setScreen('welcome') }}>Back</Button>
          <Button
            className="flex-1"
            onClick={handleCreateFamily}
            disabled={createLoading || !familyName.trim()}
          >
            {createLoading ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </div>
    )
  }

  // ── Screen 7: Family created ──────────────────────────────────────────────
  if (screen === 'create_done') {
    return (
      <div className={cn(containerCls, "items-center text-center")}>
        <div className="text-4xl mb-3">🎉</div>
        <h3 className="text-base font-bold text-foreground mb-1">Family created!</h3>
        <div className="flex items-center gap-2 text-base font-bold text-foreground mb-4">
          <Users className="size-4 text-muted-foreground" />
          {createdGroupName}
        </div>
        <p className="text-sm text-muted-foreground mb-3">You're the admin. You can:</p>
        <div className="bg-muted rounded-lg border border-border p-3 mb-4 text-left w-full space-y-1">
          {['Invite family members', 'Manage members and their names', 'View the family calendar'].map((b) => (
            <div key={b} className="flex items-center gap-1.5 text-xs text-foreground">
              <Check className="size-3 text-success shrink-0" />{b}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mb-5">
          Next: open the Members tab to generate an invite code and add your family.
        </p>
        <Button className="w-full" onClick={() => onCreated(createdGroupId, createdGroupName, 'owner')}>
          Go to Calendar →
        </Button>
      </div>
    )
  }

  return null
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="self-start mb-3 text-muted-foreground hover:text-foreground transition-colors p-0 bg-transparent border-0 cursor-pointer flex items-center gap-1"
    >
      <ChevronLeft className="size-5" />
    </button>
  )
}

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 mb-3 text-xs text-destructive">
      {children}
    </div>
  )
}

// React is needed for JSX and for ErrorMsg children type
import React from 'react'
