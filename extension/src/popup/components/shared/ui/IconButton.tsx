import { cn } from '../../../../lib/utils'

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode
  label: string
  size?: 'sm' | 'md'
}

export default function IconButton({ icon, label, size = 'md', className, ...props }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        'flex items-center justify-center rounded-md',
        'text-muted-foreground hover:text-foreground hover:bg-muted',
        'transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        size === 'sm' ? 'w-7 h-7' : 'w-8 h-8',
        className
      )}
      {...props}
    >
      {icon}
    </button>
  )
}
