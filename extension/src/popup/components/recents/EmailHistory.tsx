import { useState } from 'react'
import { Inbox } from 'lucide-react'
import type { ProcessedEmail } from '../../../lib/types'
import EmptyState from '../shared/ui/EmptyState'
import RecentItemCard from './RecentItemCard'

interface Props {
  emails: ProcessedEmail[]
  onSelect: (email: ProcessedEmail) => void
}

export default function EmailHistory({ emails, onSelect }: Props) {
  const [limit, setLimit] = useState(10)

  if (emails.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No recent detections"
        description="Open an email in Gmail and click Family Cal to extract calendar events."
      />
    )
  }

  return (
    <div>
      {/* Subtitle */}
      <div className="px-4 pt-3 pb-2">
        <p className="text-[11px] text-muted-foreground">
          AI-detected events from Gmail — tap to review or view details
        </p>
      </div>

      {/* Activity feed */}
      <div className="pb-2">
        {emails.slice(0, limit).map((email) => (
          <RecentItemCard key={email.id} email={email} onClick={() => onSelect(email)} />
        ))}
      </div>

      {emails.length > limit && (
        <button
          onClick={() => setLimit((l) => l + 10)}
          className="w-full px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Show {Math.min(10, emails.length - limit)} more
        </button>
      )}
    </div>
  )
}
