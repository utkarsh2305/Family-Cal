import { cn } from '../../../lib/utils'
import type { FamilyMember } from '../../../lib/types'
import { getMemberDisplayName } from './calendarUtils'

interface Props {
  members: FamilyMember[]
  visibleMemberIds: Set<string> | null
  onToggle: (userId: string) => void
}

export default function MemberFilterChips({ members, visibleMemberIds, onToggle }: Props) {
  return (
    <div className="flex gap-1.5 px-4 pb-2 pt-1 overflow-x-auto">
      {members.map((m) => {
        const visible = visibleMemberIds === null || visibleMemberIds.has(m.userId)
        const color   = m.color ?? '#1a73e8'
        const name    = getMemberDisplayName(m)
        const initial = (m.nickname ?? m.email ?? '').charAt(0).toUpperCase() || '?'
        return (
          <button
            key={m.userId}
            onClick={() => onToggle(m.userId)}
            className={cn(
              'flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-[11px] font-medium',
              'border transition-all duration-150 shrink-0 cursor-pointer',
              visible
                ? 'border-transparent text-foreground'
                : 'border-border bg-background text-muted-foreground opacity-50'
            )}
            style={visible ? { background: color + '18', boxShadow: `0 0 0 1.5px ${color}50` } : undefined}
          >
            <div
              className="size-5 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
              style={{
                background: visible ? color + '35' : '#E5E7EB',
                color: visible ? color : '#6B7280',
              }}
            >
              {initial}
            </div>
            <span className="max-w-[60px] truncate">{name}</span>
          </button>
        )
      })}
    </div>
  )
}
