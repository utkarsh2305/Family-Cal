interface TopBarProps {
  icon?: React.ReactNode
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

export default function TopBar({ icon, title, subtitle, actions }: TopBarProps) {
  return (
    <div className="flex items-center h-12 px-4 border-b border-border bg-background shrink-0 gap-2.5">
      {icon && (
        <div className="w-7 h-7 rounded-lg bg-accent-primary flex items-center justify-center shrink-0">
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm text-foreground leading-tight truncate">{title}</div>
        {subtitle && (
          <div className="text-[11px] text-muted-foreground truncate">{subtitle}</div>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-1.5 shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
