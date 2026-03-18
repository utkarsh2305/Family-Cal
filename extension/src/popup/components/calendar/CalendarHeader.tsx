import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  monthLabel: string
  showToday: boolean
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}

export default function CalendarHeader({ monthLabel, showToday, onPrev, onNext, onToday }: Props) {
  return (
    <div className="flex items-center px-4 py-2 gap-0.5">
      <button
        onClick={onPrev}
        aria-label="Previous month"
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="flex-1 text-center text-[15px] font-bold text-foreground tracking-tight">
        {monthLabel}
      </span>
      <button
        onClick={onNext}
        aria-label="Next month"
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight className="size-4" />
      </button>
      {showToday && (
        <button
          onClick={onToday}
          className="text-xs text-accent-primary font-semibold ml-1 hover:opacity-70 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          Today
        </button>
      )}
    </div>
  )
}
