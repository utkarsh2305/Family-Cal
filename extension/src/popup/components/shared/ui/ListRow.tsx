import { cn } from '../../../../lib/utils'

interface ListRowProps {
  leading?: React.ReactNode
  title: string
  subtitle?: string
  trailing?: React.ReactNode
  onClick?: () => void
  className?: string
}

export default function ListRow({ leading, title, subtitle, trailing, onClick, className }: ListRowProps) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick() } : undefined}
      className={cn(
        'flex items-center gap-3 px-4 py-2.5',
        'transition-colors',
        onClick && 'cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:bg-muted',
        className
      )}
    >
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-foreground truncate">{title}</div>
        {subtitle && (
          <div className="text-[11px] text-muted-foreground truncate">{subtitle}</div>
        )}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  )
}
