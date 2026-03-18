import { useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import type { ProposedEvent } from '../../../../lib/types'
import { Button } from '../../../../components/ui/button'
import { ThumbsUp, ThumbsDown, HelpCircle } from 'lucide-react'

interface Props {
  userId: string
  groupId: string | undefined
  eventId: string | null
  aiSuggestion: ProposedEvent
  onDone: () => void
}

type FeedbackType = 'correct' | 'wrong' | 'ask-next-time'

export default function FeedbackWidget({ userId, groupId, eventId, aiSuggestion, onDone }: Props) {
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleFeedback(feedbackType: FeedbackType) {
    setSaving(true)
    const userAction = feedbackType === 'correct' ? 'accept' : feedbackType === 'wrong' ? 'reject' : 'accept'

    await supabase.from('event_feedback').insert({
      user_id:       userId,
      group_id:      groupId ?? null,
      event_id:      eventId,
      ai_suggestion: aiSuggestion,
      user_action:   userAction,
      feedback_type: feedbackType,
    })

    setSaving(false)
    setSubmitted(true)
    setTimeout(onDone, 1200)
  }

  if (submitted) {
    return (
      <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 text-sm mb-2.5">
        <span className="text-xs text-success">Thanks — AI will learn from this.</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 text-sm mb-2.5 flex-wrap">
      <span className="text-xs text-muted-foreground mr-1">Was this correct?</span>
      <Button
        variant="ghost"
        size="sm"
        disabled={saving}
        onClick={() => handleFeedback('correct')}
        title="Yes, this suggestion was correct"
        className="h-7 px-2 text-success hover:text-success hover:bg-success/10"
      >
        <ThumbsUp className="size-3.5" />
        Yes
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={saving}
        onClick={() => handleFeedback('wrong')}
        title="No, this suggestion was wrong"
        className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
      >
        <ThumbsDown className="size-3.5" />
        No
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={saving}
        onClick={() => handleFeedback('ask-next-time')}
        title="Ask me next time"
        className="h-7 px-2 text-muted-foreground"
      >
        <HelpCircle className="size-3.5" />
        Later
      </Button>
    </div>
  )
}
