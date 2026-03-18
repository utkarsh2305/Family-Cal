import { useEffect, useRef, useState } from 'react'
import { Search, Calendar, Users, History, Settings, Mail } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { ProcessedEmail } from '../../../../lib/types'

type View = 'family' | 'members' | 'history' | 'settings'

interface NavCommand {
  kind: 'nav'
  id: string
  label: string
  description: string
  icon: React.ReactNode
  view: View
}

interface EmailCommand {
  kind: 'email'
  id: string
  label: string
  description: string
  email: ProcessedEmail
}

type Command = NavCommand | EmailCommand

const NAV_COMMANDS: NavCommand[] = [
  { kind: 'nav', id: 'family',   label: 'Family Calendar', description: 'View shared family events',    icon: <Calendar className="size-4" />, view: 'family'   },
  { kind: 'nav', id: 'members',  label: 'Members',         description: 'Manage family members',        icon: <Users    className="size-4" />, view: 'members'  },
  { kind: 'nav', id: 'history',  label: 'Recents',         description: 'Recently processed emails',    icon: <History  className="size-4" />, view: 'history'  },
  { kind: 'nav', id: 'settings', label: 'Settings',        description: 'AI, calendar & preferences',   icon: <Settings className="size-4" />, view: 'settings' },
]

interface Props {
  open: boolean
  onClose: () => void
  onNavigate: (view: View) => void
  history: ProcessedEmail[]
  onSelectEmail: (email: ProcessedEmail) => void
}

export default function CommandPalette({ open, onClose, onNavigate, history, onSelectEmail }: Props) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Reset query when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Build command list
  const emailCommands: EmailCommand[] = history
    .filter((e) => query.length > 0 && e.subject.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 5)
    .map((e) => ({
      kind: 'email',
      id: e.id,
      label: e.subject,
      description: e.sender,
      email: e,
    }))

  const navFiltered = query.length === 0
    ? NAV_COMMANDS
    : NAV_COMMANDS.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.description.toLowerCase().includes(query.toLowerCase())
      )

  const commands: Command[] = [...navFiltered, ...emailCommands]

  // Clamp active index when list changes
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, commands.length - 1)))
  }, [commands.length])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, commands.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runCommand(commands[activeIndex])
    }
  }

  function runCommand(cmd: Command | undefined) {
    if (!cmd) return
    if (cmd.kind === 'nav') {
      onNavigate(cmd.view)
    } else {
      onSelectEmail(cmd.email)
    }
    onClose()
  }

  if (!open) return null

  // Group labels
  const hasNav   = navFiltered.length > 0
  const hasEmail = emailCommands.length > 0
  let navOffset = 0
  let emailOffset = navFiltered.length

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-10 bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-[360px] max-h-[400px] rounded-2xl bg-background shadow-2xl border border-border overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0) }}
            onKeyDown={handleKeyDown}
            placeholder="Search or jump to…"
            className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground outline-none"
          />
          <kbd className="text-[10px] text-muted-foreground/60 border border-border rounded px-1 py-0.5 font-mono shrink-0">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto py-1.5">
          {commands.length === 0 && (
            <p className="px-4 py-6 text-xs text-muted-foreground text-center">No results</p>
          )}

          {hasNav && (
            <>
              <p className="px-4 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                Navigation
              </p>
              {navFiltered.map((cmd, i) => (
                <CommandItem
                  key={cmd.id}
                  icon={cmd.icon}
                  label={cmd.label}
                  description={cmd.description}
                  active={activeIndex === navOffset + i}
                  onSelect={() => runCommand(cmd)}
                  onHover={() => setActiveIndex(navOffset + i)}
                />
              ))}
            </>
          )}

          {hasEmail && (
            <>
              <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                Recent Emails
              </p>
              {emailCommands.map((cmd, i) => (
                <CommandItem
                  key={cmd.id}
                  icon={<Mail className="size-4" />}
                  label={cmd.label}
                  description={cmd.description}
                  active={activeIndex === emailOffset + i}
                  onSelect={() => runCommand(cmd)}
                  onHover={() => setActiveIndex(emailOffset + i)}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function CommandItem({
  icon,
  label,
  description,
  active,
  onSelect,
  onHover,
}: {
  icon: React.ReactNode
  label: string
  description: string
  active: boolean
  onSelect: () => void
  onHover: () => void
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 mx-1.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors',
        active ? 'bg-accent-primary-muted text-foreground' : 'hover:bg-muted text-foreground'
      )}
      onClick={onSelect}
      onMouseEnter={onHover}
    >
      <span className={cn('shrink-0', active ? 'text-accent-primary' : 'text-muted-foreground')}>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium truncate">{label}</div>
        <div className="text-[11px] text-muted-foreground truncate">{description}</div>
      </div>
    </div>
  )
}
