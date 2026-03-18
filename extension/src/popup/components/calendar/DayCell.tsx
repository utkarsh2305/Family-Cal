import { cn } from '../../../lib/utils'

interface Props {
  day: Date
  inMonth: boolean
  today: boolean
  selected: boolean
  dots: string[]
  onClick: () => void
}

export default function DayCell({ day, inMonth, today, selected, dots, onClick }: Props) {
  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      role="button"
      tabIndex={0}
      aria-label={day.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
      className="flex flex-col items-center py-0.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
    >
      <div className={cn(
        'size-7 rounded-full flex items-center justify-center text-[12px] font-medium transition-all',
        selected && 'bg-accent-primary text-accent-primary-foreground font-bold',
        !selected && today && 'ring-2 ring-accent-primary text-accent-primary font-bold',
        !selected && !today && 'hover:bg-muted',
        !inMonth && 'opacity-25',
      )}>
        {day.getDate()}
      </div>
      <div className="flex gap-0.5 h-1.5 items-center mt-0.5">
        {dots.slice(0, 3).map((color, j) => (
          <div
            key={j}
            className={cn('size-1.5 rounded-full', !inMonth && 'opacity-25')}
            style={{ background: color }}
          />
        ))}
        {dots.length > 3 && (
          <span className="text-[7px] text-muted-foreground/60 leading-none">+</span>
        )}
      </div>
    </div>
  )
}
