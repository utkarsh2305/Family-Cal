import { cn } from '../../../lib/utils'

interface ConnectionStatusRowProps {
  name: string
  description: string
  connected: boolean
  action?: React.ReactNode
}

export default function ConnectionStatusRow({ name, description, connected, action }: ConnectionStatusRowProps) {
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <span
        className={cn(
          'size-2 rounded-full shrink-0',
          connected ? 'bg-success' : 'bg-muted-foreground/40'
        )}
      />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-foreground">{name}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
      {action && <div className="shrink-0 ml-2">{action}</div>}
    </div>
  )
}
