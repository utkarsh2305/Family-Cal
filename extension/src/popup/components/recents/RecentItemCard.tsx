import { StatusChip } from '../shared/ui'
import type { ProcessedEmail } from '../../../lib/types'

type StatusVariant = 'default' | 'success' | 'warning' | 'danger' | 'info'

interface TrustState {
  label: string
  variant: StatusVariant
  microcopy: string
  dotColor: string
}

const TRUST: Record<ProcessedEmail['status'], TrustState> = {
  proposed:  { label: 'Detected',  variant: 'warning', microcopy: 'Review before adding',     dotColor: 'var(--warning)' },
  accepted:  { label: 'Added',     variant: 'success', microcopy: 'Added to Google Calendar', dotColor: 'var(--success)' },
  partial:   { label: 'Partial',   variant: 'info',    microcopy: 'Some events added',        dotColor: 'var(--accent-primary)' },
  rejected:  { label: 'Dismissed', variant: 'default', microcopy: 'No events were added',     dotColor: 'var(--border)' },
  duplicate: { label: 'Duplicate', variant: 'default', microcopy: 'Already processed',        dotColor: 'var(--border)' },
}

function extractSenderDisplay(sender: string): string {
  const nameMatch = sender.match(/^([^<]+)</)
  if (nameMatch) {
    const name = nameMatch[1].trim()
    if (name) return name
  }
  const emailMatch = sender.match(/<(.+?)>/) ?? sender.match(/(\S+@\S+)/)
  const email = emailMatch ? emailMatch[1] : sender
  const domain = email.split('@')[1]
  return domain ?? sender
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface Props {
  email: ProcessedEmail
  onClick: () => void
}

export default function RecentItemCard({ email, onClick }: Props) {
  const trust = TRUST[email.status]
  const senderDisplay = extractSenderDisplay(email.sender)
  const dateDisplay = formatDate(email.processedAt)
  const eventCount = email.proposedEvents.length

  return (
    <div
      onClick={onClick}
      className="px-4 py-3 flex items-start gap-3 hover:bg-muted cursor-pointer transition-colors border-b border-border/50 last:border-0"
    >
      {/* Status dot */}
      <div
        className="size-2 rounded-full mt-1.5 shrink-0"
        style={{ background: trust.dotColor }}
      />

      <div className="flex-1 min-w-0">
        {/* Row 1: subject + chip */}
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <span className="text-[13px] font-semibold text-foreground truncate flex-1 leading-snug">
            {email.subject || '(no subject)'}
          </span>
          <StatusChip label={trust.label} variant={trust.variant} />
        </div>

        {/* Row 2: sender · date · event count */}
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span className="truncate">{senderDisplay}</span>
          <span className="shrink-0">·</span>
          <span className="shrink-0">{dateDisplay}</span>
          {eventCount > 0 && (
            <>
              <span className="shrink-0">·</span>
              <span className="shrink-0">{eventCount} event{eventCount !== 1 ? 's' : ''}</span>
            </>
          )}
        </div>

        {/* Row 3: microcopy + review CTA */}
        <div className="flex items-center justify-between mt-1">
          <span className="text-[11px] text-muted-foreground/70">{trust.microcopy}</span>
          {email.status === 'proposed' && (
            <span className="text-[11px] font-semibold text-accent-primary hover:opacity-70 transition-opacity shrink-0 ml-2">
              Review →
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
