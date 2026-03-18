import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { Button } from '../../../components/ui/button'
import { Copy, Check, RefreshCw } from 'lucide-react'

interface Props {
  groupId: string
  currentUserId: string
}

interface Invite {
  id: string
  code: string
  expires_at: string
}

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes)
    .map((b) => b.toString(36).toUpperCase())
    .join('')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8)
}

export default function InviteCodeSection({ groupId, currentUserId }: Props) {
  const [invite, setInvite] = useState<Invite | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('family_invites')
      .select('id, code, expires_at')
      .eq('group_id', groupId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { setInvite(data); setLoading(false) })
  }, [groupId])

  async function handleGenerate() {
    setGenerating(true)
    const code = generateCode()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from('family_invites')
      .insert({ group_id: groupId, code, created_by: currentUserId, expires_at: expiresAt })
      .select('id, code, expires_at')
      .single()
    if (error) { setError(error.message); setGenerating(false); return }
    if (data) setInvite(data)
    setGenerating(false)
  }

  async function handleRevoke() {
    if (!invite) return
    setError(null)
    const { error: deleteError } = await supabase.from('family_invites').delete().eq('id', invite.id)
    if (deleteError) { setError(deleteError.message); return }
    setInvite(null)
  }

  async function handleCopy() {
    if (!invite) return
    await navigator.clipboard.writeText(invite.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return (
    <div className="flex items-center gap-2 px-1 py-3 text-[13px] text-muted-foreground">
      <div className="size-4 animate-spin rounded-full border-2 border-border border-t-foreground shrink-0" />
      Loading invite code…
    </div>
  )

  const daysLeft = invite
    ? Math.max(1, Math.ceil((new Date(invite.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0

  return (
    <div className="bg-muted rounded-lg border border-border p-3 mb-3">
      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Invite Code
      </div>
      {error && <p className="text-xs text-destructive mb-2">{error}</p>}
      {invite ? (
        <>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-mono text-lg font-bold tracking-widest bg-background rounded-lg px-3 py-1.5 text-foreground border border-border flex-1 text-center">
              {invite.code}
            </span>
            <Button variant="ghost" size="icon" onClick={handleCopy} title="Copy code">
              {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
            </Button>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}</span>
            <button
              onClick={handleRevoke}
              className="text-destructive text-xs hover:underline bg-transparent border-0 cursor-pointer p-0"
            >
              Revoke
            </button>
          </div>
        </>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          disabled={generating}
          className="w-full"
        >
          <RefreshCw className={generating ? 'size-4 animate-spin' : 'size-4'} />
          {generating ? 'Generating…' : 'Generate invite code'}
        </Button>
      )}
    </div>
  )
}
