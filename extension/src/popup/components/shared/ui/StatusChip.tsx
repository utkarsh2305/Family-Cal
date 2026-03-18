import { cn } from '../../../../lib/utils'

type StatusVariant = 'default' | 'success' | 'warning' | 'danger' | 'info'

interface StatusChipProps {
  label: string
  variant?: StatusVariant
  className?: string
}

const variantClasses: Record<StatusVariant, string> = {
  default: 'bg-muted text-muted-foreground',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger:  'bg-destructive/10 text-destructive',
  info:    'bg-accent-primary-muted text-accent-primary',
}

export default function StatusChip({ label, variant = 'default', className }: StatusChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5',
        'text-[10px] font-semibold uppercase tracking-wide',
        variantClasses[variant],
        className
      )}
    >
      {label}
    </span>
  )
}
