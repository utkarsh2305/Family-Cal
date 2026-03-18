import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
import type { FamilyMember } from '../../../lib/types'
import { cn } from '../../../lib/utils'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'

interface Props {
  member: FamilyMember
  onSave: (nickname: string, color: string) => void
  onCancel: () => void
}

export const MEMBER_COLORS: { label: string; value: string }[] = [
  { label: 'Red',    value: '#d93025' },
  { label: 'Blue',   value: '#1a73e8' },
  { label: 'Green',  value: '#137333' },
  { label: 'Purple', value: '#7c4dff' },
  { label: 'Orange', value: '#e37400' },
  { label: 'Pink',   value: '#e91e8c' },
]

export default function RenameMemberDialog({ member, onSave, onCancel }: Props) {
  const defaultName = member.nickname ?? (member.email?.split('@')[0] ?? '')
  const defaultColor = member.color ?? '#1a73e8'

  const [name, setName]     = useState(defaultName)
  const [color, setColor]   = useState(defaultColor)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) { setError('Display name is required.'); return }
    if (trimmed.length > 30) { setError('Max 30 characters.'); return }
    setSaving(true)
    setError(null)
    const { error: dbErr } = await supabase
      .from('family_members')
      .update({ nickname: trimmed, color })
      .eq('id', member.id)
    if (dbErr) {
      setError(dbErr.message)
      setSaving(false)
      return
    }
    onSave(trimmed, color)
  }

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl border border-border p-5 w-full max-w-xs shadow-xl">
        <h3 className="text-sm font-semibold text-foreground mb-3">Rename Member</h3>

        {member.email && (
          <p className="text-xs text-muted-foreground mb-3">{member.email}</p>
        )}

        <div className="space-y-1.5 mb-3">
          <Label htmlFor="display-name">Display name</Label>
          <Input
            id="display-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            placeholder="e.g. Dad, Mom, Sarah"
            autoFocus
          />
          <p className="text-[10px] text-muted-foreground text-right">{name.length}/30</p>
        </div>

        <div className="space-y-1.5 mb-4">
          <Label>Color</Label>
          <div className="flex gap-2">
            {MEMBER_COLORS.map((c) => (
              <button
                key={c.value}
                title={c.label}
                onClick={() => setColor(c.value)}
                className={cn(
                  'size-7 rounded-full cursor-pointer transition-all border-2',
                  color === c.value
                    ? 'ring-2 ring-offset-2 ring-foreground border-transparent'
                    : 'border-transparent'
                )}
                style={{ background: c.value }}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Updates instantly for all family members.</p>
        </div>

        {error && (
          <p className="text-xs text-destructive mb-3">{error}</p>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
