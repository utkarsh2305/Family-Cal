import { Separator } from '../../../../components/ui/separator'
import { cn } from '../../../../lib/utils'

export default function Divider({ className }: { className?: string }) {
  return <Separator className={cn('my-1', className)} />
}
