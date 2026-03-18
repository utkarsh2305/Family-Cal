import { cn } from '../../../../lib/utils'

interface SectionHeaderProps {
  title: string
  action?: React.ReactNode
  className?: string
}

export default function SectionHeader({ title, action, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between px-4 pt-4 pb-1.5', className)}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
        {title}
      </p>
      {action}
    </div>
  )
}
