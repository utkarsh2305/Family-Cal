import { cn } from '../../../../lib/utils'

interface TabBarItemProps {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}

export function TabBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-14 border-t border-border bg-background shrink-0">
      {children}
    </div>
  )
}

export function TabBarItem({ icon, label, active, onClick }: TabBarItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 flex flex-col items-center justify-center gap-0.5',
        'text-[10px] font-medium transition-colors relative',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        active ? 'text-accent-primary' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {active && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-accent-primary rounded-b" />
      )}
      {icon}
      <span>{label}</span>
    </button>
  )
}
