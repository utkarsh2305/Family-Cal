import { Search } from 'lucide-react'
import { cn } from '../../../../lib/utils'

interface SearchBarProps {
  onActivate: () => void
  placeholder?: string
  rightSlot?: React.ReactNode
  className?: string
}

export default function SearchBar({ onActivate, placeholder = 'Search…', rightSlot, className }: SearchBarProps) {
  return (
    <div className={cn('px-4 py-2 shrink-0', className)}>
      <button
        role="search"
        aria-label={placeholder}
        onClick={onActivate}
        className={cn(
          'w-full h-9 flex items-center gap-2.5 px-3 rounded-lg',
          'bg-card border border-border',
          'text-muted-foreground text-[13px]',
          'hover:border-accent-primary-border hover:bg-white transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        )}
      >
        <Search className="size-3.5 shrink-0" />
        <span className="flex-1 text-left truncate">{placeholder}</span>
        {rightSlot}
        <kbd className="text-[10px] text-muted-foreground/50 border border-border rounded px-1 py-0.5 font-mono shrink-0 hidden sm:inline-flex">
          ⌘K
        </kbd>
      </button>
    </div>
  )
}
