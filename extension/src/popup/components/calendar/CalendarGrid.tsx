import { cn } from '../../../lib/utils'
import { isSameDay, isSameMonth, isToday, DAY_LABELS } from './calendarUtils'
import DayCell from './DayCell'

interface Props {
  days: Date[]
  viewMonth: Date
  selectedDate: Date
  dotsForDay: (d: Date) => string[]
  onSelectDay: (d: Date) => void
}

export default function CalendarGrid({ days, viewMonth, selectedDate, dotsForDay, onSelectDay }: Props) {
  return (
    <div className="px-4 pb-2">
      {/* Day-of-week labels */}
      <div className="grid grid-cols-7 mb-0.5">
        {DAY_LABELS.map((d, i) => (
          <div
            key={i}
            className={cn(
              'text-center text-[10px] font-semibold tracking-widest py-0.5',
              (i === 0 || i === 6) ? 'text-destructive/50' : 'text-muted-foreground/60'
            )}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Date grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((day, i) => (
          <DayCell
            key={i}
            day={day}
            inMonth={isSameMonth(day, viewMonth)}
            today={isToday(day)}
            selected={isSameDay(day, selectedDate)}
            dots={dotsForDay(day)}
            onClick={() => onSelectDay(day)}
          />
        ))}
      </div>
    </div>
  )
}
