import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { signInWithGoogle } from '../lib/auth'
import { parseEmailWithAI, buildLearningContext } from '../lib/ai'
import { eventsOverlapProposed, mapRowToCalendarEvent } from '../lib/conflicts'
import { getGoogleCalendarToken, refreshGoogleCalendarToken, createGoogleCalendarEvent } from '../lib/google-calendar'
import type {
  AISettings,
  CalendarEvent,
  ExtensionUser,
  PendingInvitation,
  PollResult,
  ProcessedEmail,
  ProposedEvent,
  RawEmailContent,
} from '../lib/types'
import { shouldAnalyzeEmail, DEFAULT_CATEGORIES } from '../lib/preferences'
import { Button } from '../components/ui/button'
import { Calendar, History, Users, Settings, CheckCircle, Search } from 'lucide-react'
import { AppShell, TopBar, SearchBar, IconButton, TabBar, TabBarItem } from './components/shared/ui'
import EventCard from './components/recents/EventCard'
import EmailHistory from './components/recents/EmailHistory'
import AISettingsPanel from './components/settings/AISettings'
import FamilySetup from './components/onboarding/FamilySetup'
import MembersPanel from './components/members/MembersPanel'
import FeedbackWidget from './components/shared/overlays/FeedbackWidget'
import FamilyCalendarView from './components/family/FamilyCalendarView'
import NotifyMembersModal from './components/shared/overlays/NotifyMembersModal'
import InvitationCard from './components/shared/overlays/InvitationCard'
import CommandPalette from './components/shared/overlays/CommandPalette'

type View = 'loading' | 'auth' | 'setup' | 'parse' | 'history' | 'settings' | 'members' | 'calendars' | 'family'

const HISTORY_DAYS = 15

async function isAlreadyProcessed(messageId: string): Promise<ProcessedEmail | null> {
  return new Promise((resolve) =>
    chrome.storage.local.get('processedEmails', (result) => {
      const all: ProcessedEmail[] = result.processedEmails ?? []
      resolve(all.find((e) => e.gmailMessageId === messageId && e.status !== 'proposed') ?? null)
    })
  )
}

export default function App() {
  const [view, setView] = useState<View>('loading')
  const [user, setUser] = useState<ExtensionUser | null>(null)
  const [pendingEmail, setPendingEmail] = useState<RawEmailContent | null>(null)
  const [proposedEvents, setProposedEvents] = useState<ProposedEvent[]>([])
  const [proposedConflicts, setProposedConflicts] = useState<Map<number, CalendarEvent[]>>(new Map())
  const [pollResultQueue, setPollResultQueue] = useState<PollResult[]>([])
  const skipAutoParseRef = useRef(false)
  const [history, setHistory] = useState<ProcessedEmail[]>([])
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pendingFeedback, setPendingFeedback] = useState<{ eventId: string; aiSuggestion: ProposedEvent } | null>(null)
  const [notifyStep, setNotifyStep] = useState<{ eventId: string; event: ProposedEvent; groupId: string } | null>(null)
  const [groupPickerStep, setGroupPickerStep] = useState<{ event: ProposedEvent } | null>(null)
  const [invitationCard, setInvitationCard] = useState<PendingInvitation | null>(null)
  const [cmdOpen, setCmdOpen] = useState(false)

  // ── On mount: check auth + pending email ──────────────────────────────────
  useEffect(() => {
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        setView('auth')
        return
      }

      // Upsert user profile so co-members can see our email
      await supabase.from('user_profiles').upsert(
        { id: session.user.id, email: session.user.email ?? '' },
        { onConflict: 'id' }
      )

      const { data: profiles } = await supabase
        .from('family_members')
        .select('group_id, family_groups(name), role')
        .eq('user_id', session.user.id)
        .order('joined_at', { ascending: true })
      const profile = profiles?.[0] ?? null

      const { data: aiRow } = await supabase
        .from('user_ai_settings')
        .select('*')
        .eq('user_id', session.user.id)
        .single()

      const aiSettings: AISettings = aiRow
        ? { provider: aiRow.provider, apiKey: aiRow.api_key_encrypted, geminiUsesOAuth: aiRow.gemini_uses_oauth }
        : { provider: 'platform' }

      const { fetchUrlContent: fuc } = await chrome.storage.local.get('fetchUrlContent')
      aiSettings.fetchUrlContent = fuc ?? false

      // Load God Mode preferences and cache for content script
      const { data: prefRow } = await supabase
        .from('user_preferences')
        .select('mode, categories, learning_enabled, god_mode_subtype, poll_interval_hours')
        .eq('user_id', session.user.id)
        .maybeSingle()
      aiSettings.godMode          = (prefRow?.mode as AISettings['godMode']) ?? 'manual'
      aiSettings.godModeSubtype   = (prefRow?.god_mode_subtype as AISettings['godModeSubtype']) ?? 'open'
      aiSettings.pollIntervalHours = prefRow?.poll_interval_hours ?? 2
      aiSettings.categories        = prefRow?.categories ?? DEFAULT_CATEGORIES
      aiSettings.learningEnabled   = prefRow?.learning_enabled ?? true
      await chrome.storage.local.set({
        godMode:          aiSettings.godMode,
        godModeSubtype:   aiSettings.godModeSubtype,
        pollIntervalHours: aiSettings.pollIntervalHours,
        categories:       aiSettings.categories,
        groupId:          profile?.group_id ?? null,
      })

      setUser({
        id: session.user.id,
        email: session.user.email ?? '',
        familyGroupId: profile?.group_id,
        familyGroupName: (profile?.family_groups as any)?.name,
        familyGroups: (profiles ?? []).map((p: any) => ({
          id:   p.group_id,
          name: (p.family_groups as any)?.name ?? 'Family',
          role: p.role as 'owner' | 'editor' | 'viewer',
        })),
        role: profile?.role as ExtensionUser['role'],
        aiSettings,
      })

      // No family group yet — go to setup before anything else
      if (!profile?.group_id) {
        setView('setup')
        return
      }

      // Register Web Push subscription (no-op if already subscribed)
      chrome.runtime.sendMessage({ type: 'SUBSCRIBE_PUSH' })

      loadHistory()

      // Check if a push notification tap left a pending invitation
      const { pendingInvitation } = await new Promise<{ pendingInvitation?: PendingInvitation }>((resolve) =>
        chrome.storage.local.get('pendingInvitation', resolve)
      )
      if (pendingInvitation?.eventId) {
        await chrome.storage.local.remove('pendingInvitation')
        setInvitationCard(pendingInvitation)
        setView('history')
        return
      }

      // Check if a pending email was set by the content script
      const stored = await new Promise<{ pendingEmail?: RawEmailContent }>((resolve) =>
        chrome.storage.local.get('pendingEmail', resolve)
      )

      // Drain any background-polled results into component state
      const { pendingPolledResults } = await new Promise<{ pendingPolledResults?: PollResult[] }>((resolve) =>
        chrome.storage.local.get('pendingPolledResults', resolve)
      )
      if (pendingPolledResults?.length) {
        await chrome.storage.local.remove('pendingPolledResults')
        chrome.action.setBadgeText({ text: '' })
        const [first, ...rest] = pendingPolledResults
        setPollResultQueue(rest)
        skipAutoParseRef.current = true
        setPendingEmail(first.email)
        setProposedEvents(first.proposedEvents)
        setView('parse')
        return
      }

      if (stored.pendingEmail) {
        setPendingEmail(stored.pendingEmail)
        await chrome.storage.local.remove('pendingEmail')
        chrome.action.setBadgeText({ text: '' })
        setView('parse')
      } else {
        setView('history')
      }
    })()
  }, [])

  function loadHistory() {
    const cutoff = Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000
    chrome.storage.local.get('processedEmails', (result) => {
      const all: ProcessedEmail[] = result.processedEmails ?? []
      setHistory(all.filter((e) => new Date(e.processedAt).getTime() > cutoff))
    })
  }

  // ── Sign in with Google ───────────────────────────────────────────────────
  async function handleSignIn() {
    setError(null)
    try {
      await signInWithGoogle()
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed.')
    }
  }

  // ── Parse email ───────────────────────────────────────────────────────────
  async function handleParse() {
    if (!pendingEmail || !user) return

    // Category filter: skip emails the user has opted out of
    if (!shouldAnalyzeEmail(
      pendingEmail.subject,
      user.aiSettings.categories ?? DEFAULT_CATEGORIES,
      user.aiSettings.godMode ?? 'manual',
    )) {
      setError(`"${pendingEmail.subject}" doesn't match your enabled email categories.`)
      return
    }

    // Dedup guard: skip re-parsing emails we've already handled
    const existing = await isAlreadyProcessed(pendingEmail.messageId)
    if (existing) {
      // Re-check alreadyAdded against current DB so the badge is accurate
      if (user?.familyGroupId) {
        const { data: existingEvents } = await supabase
          .from('calendar_events')
          .select('title, start_at')
          .eq('group_id', user.familyGroupId)
        const addedKeys = new Set(
          (existingEvents ?? []).map((e) => `${e.title}||${e.start_at.substring(0, 10)}`)
        )
        setProposedEvents(existing.proposedEvents.map((e) => ({
          ...e,
          alreadyAdded: addedKeys.has(`${e.title}||${e.startAt.substring(0, 10)}`),
        })))
      } else {
        setProposedEvents(existing.proposedEvents)
      }
      if (existing.status === 'accepted' || existing.status === 'partial') {
        setSuccess('Already processed — events below were previously added.')
        setTimeout(() => setSuccess(null), 4000)
      }
      return
    }

    setParsing(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const supabaseToken = session?.access_token ?? ''

      let geminiOAuthToken: string | undefined
      if (user.aiSettings.provider === 'gemini' && user.aiSettings.geminiUsesOAuth) {
        geminiOAuthToken = await new Promise((resolve) =>
          chrome.identity.getAuthToken({ interactive: false }, (t) => resolve(t ?? undefined))
        )
      }

      // Pass URLs to Cloud Function for server-side fetching if user opted in
      let enrichedEmail = { ...pendingEmail }
      if (!user.aiSettings.fetchUrlContent) {
        enrichedEmail = { ...enrichedEmail, urls: undefined }
      }

      // Fetch attachment data via service worker
      if (pendingEmail.attachmentDescriptions.length > 0) {
        const result = await chrome.runtime.sendMessage({ type: 'FETCH_ATTACHMENTS', messageId: pendingEmail.messageId })
        if (result?.attachments?.length) {
          enrichedEmail.attachments = result.attachments
        }
      }

      const learningContext = user.aiSettings.learningEnabled
        ? await buildLearningContext(user.id)
        : ''
      const events = await parseEmailWithAI(enrichedEmail, user.aiSettings, supabaseToken, geminiOAuthToken, learningContext)

      // Mark events already in the family calendar (survives extension reinstall)
      const { data: existingEvents } = await supabase
        .from('calendar_events')
        .select('title, start_at')
        .eq('group_id', user.familyGroupId!)
      // Compare by date string prefix (YYYY-MM-DD) to avoid timezone/format mismatches
      const addedKeys = new Set(
        (existingEvents ?? []).map((e) => `${e.title}||${e.start_at.substring(0, 10)}`)
      )
      const markedEvents = events.map((e) => ({
        ...e,
        alreadyAdded: addedKeys.has(`${e.title}||${e.startAt.substring(0, 10)}`),
      }))
      setProposedEvents(markedEvents)

      // Detect family schedule conflicts for each proposed event
      if (user.familyGroupId && markedEvents.length > 0) {
        const times = markedEvents.flatMap((e) => [e.startAt, e.endAt])
        const minDate = times.reduce((a, b) => (a < b ? a : b))
        const maxDate = times.reduce((a, b) => (a > b ? a : b))
        const { data: familyEvents } = await supabase
          .from('calendar_events')
          .select('id, title, start_at, end_at, is_all_day, created_by')
          .eq('group_id', user.familyGroupId)
          .gte('start_at', minDate.substring(0, 10))
          .lte('start_at', maxDate.substring(0, 10) + 'T23:59:59Z')
        if (familyEvents) {
          const mapped = familyEvents.map(mapRowToCalendarEvent)
          const conflictMap = new Map<number, CalendarEvent[]>()
          markedEvents.forEach((proposed, i) => {
            const overlaps = eventsOverlapProposed(proposed, mapped)
            if (overlaps.length > 0) conflictMap.set(i, overlaps)
          })
          setProposedConflicts(conflictMap)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI parsing failed.')
    } finally {
      setParsing(false)
    }
  }

  // Auto-parse when a pending email arrives (skip if proposals already loaded from poll)
  useEffect(() => {
    if (view === 'parse' && pendingEmail && user) {
      if (skipAutoParseRef.current) {
        skipAutoParseRef.current = false
        return
      }
      handleParse()
    }
  }, [view, pendingEmail, user])

  // ── Accept event ──────────────────────────────────────────────────────────
  async function handleAcceptEvent(event: ProposedEvent, targetGroupId: string) {
    if (!pendingEmail) return
    if (!user) return
    if (!targetGroupId) {
      setError('You need to join a family group first. Ask your family admin to invite you.')
      return
    }

    const { data: inserted, error: insertError } = await supabase
      .from('calendar_events')
      .insert({
        group_id: targetGroupId,
        title: event.title,
        description: event.description,
        start_at: event.startAt,
        end_at: event.endAt,
        location: event.location,
        is_all_day: event.isAllDay,
        is_recurring: event.isRecurring,
        recurrence_rule: event.recurrenceRule,
        created_by: user.id,
        updated_by: user.id,
      })
      .select('id')
      .single()

    if (insertError) {
      if ((insertError as any).code === '23505') {
        // Event already in Supabase — look up its ID and try Google Calendar if not yet linked
        const { data: existing } = await supabase
          .from('calendar_events')
          .select('id')
          .eq('group_id', targetGroupId)
          .eq('title', event.title)
          .gte('start_at', event.startAt.substring(0, 10))
          .lt('start_at', new Date(new Date(event.startAt.substring(0, 10)).getTime() + 86400000).toISOString().substring(0, 10))
          .maybeSingle()

        if (existing?.id) {
          const { data: link } = await supabase
            .from('calendar_event_links')
            .select('id')
            .eq('event_id', existing.id)
            .eq('provider', 'google')
            .maybeSingle()

          if (!link) {
            try {
              const token = await getGoogleCalendarToken()
              if (token) {
                const googleEventId = await createGoogleCalendarEvent(token, event)
                await supabase.from('calendar_event_links').insert({
                  event_id: existing.id,
                  provider: 'google',
                  external_event_id: googleEventId,
                  external_calendar_id: 'primary',
                  last_synced_at: new Date().toISOString(),
                })
                setSuccess(`"${event.title}" already in Family Calendar — also added to Google Calendar.`)
                setTimeout(() => setSuccess(null), 5000)
                setProposedEvents((prev) => prev.map((e) => e === event ? { ...e, alreadyAdded: true } : e))
                return
              }
            } catch (e) {
              console.warn('Google Calendar sync failed:', e)
            }
          }
        }

        setSuccess(`"${event.title}" is already on your family calendar.`)
        setTimeout(() => setSuccess(null), 4000)
        setProposedEvents((prev) => prev.map((e) => e === event ? { ...e, alreadyAdded: true } : e))
        return
      }
      setError(insertError.message)
      return
    }

    // Attempt to add to Google Calendar (best-effort — Supabase save already succeeded)
    let addedToGoogle = false
    let gcalError: string | null = null

    const tryGcalInsert = async (token: string) => {
      const googleEventId = await createGoogleCalendarEvent(token, event)
      await supabase.from('calendar_event_links').insert({
        event_id: inserted!.id,
        provider: 'google',
        external_event_id: googleEventId,
        external_calendar_id: 'primary',
        last_synced_at: new Date().toISOString(),
      })
      addedToGoogle = true
    }

    try {
      const token = await getGoogleCalendarToken()
      console.log('[FamilyCal] gcal token:', token ? `${token.substring(0, 20)}…` : 'NULL', '| inserted.id:', inserted?.id)
      if (token && inserted?.id) {
        try {
          await tryGcalInsert(token)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          // On 401/403 the cached token may be missing calendar.events scope — refresh and retry
          if (msg.includes('401') || msg.includes('403')) {
            console.warn('[FamilyCal] GCal auth error, refreshing token and retrying…')
            const freshToken = await refreshGoogleCalendarToken()
            if (freshToken) {
              await tryGcalInsert(freshToken)
            } else {
              throw e
            }
          } else {
            throw e
          }
        }
      }
    } catch (e) {
      console.error('[FamilyCal] Google Calendar sync failed (Supabase save succeeded):', e)
      gcalError = e instanceof Error ? e.message : String(e)
    }

    setSuccess(
      addedToGoogle
        ? `"${event.title}" added to Family Calendar and Google Calendar.`
        : gcalError
          ? `"${event.title}" saved to Family Calendar. (GCal error: ${gcalError})`
          : `"${event.title}" saved to Family Calendar.`
    )
    setTimeout(() => setSuccess(null), gcalError ? 8000 : 4000)
    setProposedEvents((prev) => prev.map((e) => e === event ? { ...e, alreadyAdded: true } : e))
    saveToHistory('accepted')
    if (inserted?.id) {
      setPendingFeedback({ eventId: inserted.id, aiSuggestion: event })
      setNotifyStep({ eventId: inserted.id, event, groupId: targetGroupId })
    }
  }

  function handleRejectEvent(event: ProposedEvent) {
    setProposedEvents((prev) => prev.filter((e) => e !== event))
    if (proposedEvents.length === 1) saveToHistory('rejected')
  }

  function showNextPollResult() {
    if (pollResultQueue.length === 0) { setView('history'); return }
    const [first, ...rest] = pollResultQueue
    setPollResultQueue(rest)
    skipAutoParseRef.current = true
    setPendingEmail(first.email)
    setProposedEvents(first.proposedEvents)
    setProposedConflicts(new Map())
    setView('parse')
  }

  function saveToHistory(status: ProcessedEmail['status']) {
    if (!pendingEmail) return
    chrome.storage.local.get('processedEmails', (result) => {
      const all: ProcessedEmail[] = result.processedEmails ?? []
      const entry: ProcessedEmail = {
        id: crypto.randomUUID(),
        gmailMessageId: pendingEmail.messageId,
        subject: pendingEmail.subject,
        sender: pendingEmail.sender,
        processedAt: new Date().toISOString(),
        proposedEvents,
        status,
      }
      const cutoff = Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000
      // Upsert: remove any existing entry for this messageId, then prepend new one
      const trimmed = all
        .filter((e) => new Date(e.processedAt).getTime() > cutoff)
        .filter((e) => e.gmailMessageId !== pendingEmail.messageId)
      chrome.storage.local.set({ processedEmails: [entry, ...trimmed] }, () => {
        loadHistory()
      })
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (view === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="animate-spin rounded-full border-2 border-border border-t-foreground size-7" />
        <span className="text-sm text-muted-foreground">Loading…</span>
      </div>
    )
  }

  if (view === 'auth') {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center w-full">
          <div className="w-13 h-13 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Calendar className="size-7 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Family Calendar</h2>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            Sign in with Google to sync events across your family.
          </p>
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 mb-4 text-xs text-destructive text-left">
              {error}
            </div>
          )}
          <Button onClick={handleSignIn} className="w-full">
            Sign in with Google
          </Button>
        </div>
      </div>
    )
  }

  if (view === 'setup') {
    return (
      <div className="flex-1 overflow-hidden flex flex-col">
        <FamilySetup
          userId={user!.id}
          onCreated={(groupId, groupName, role) => {
            setUser((u) => u ? { ...u, familyGroupId: groupId, familyGroupName: groupName, role } : u)
            loadHistory()
            setView('history')
          }}
        />
      </div>
    )
  }

  // ── Views with bottom navigation ──────────────────────────────────────────
  const viewTitle: Record<string, string> = {
    history:  'Recents',
    parse:    user?.familyGroupName ?? 'Family Calendar',
    family:  'Family Calendar',
    members: 'Members',
    settings: 'Settings',
  }

  const topBarSubtitle =
    (view === 'family' || view === 'members') ? (user?.familyGroupName ?? undefined) :
    view === 'parse' ? (pendingEmail?.subject ?? undefined) :
    undefined

  return (
    <AppShell>

      <TopBar
        icon={<Calendar className="size-4 text-accent-primary-foreground" />}
        title={viewTitle[view] ?? 'Family Calendar'}
        subtitle={topBarSubtitle}
        actions={
          <>
            {pollResultQueue.length > 0 && (
              <button
                onClick={showNextPollResult}
                className="text-xs bg-secondary text-secondary-foreground border border-border rounded-full px-2.5 py-1 font-semibold hover:bg-secondary/80 transition-colors"
              >
                +{pollResultQueue.length} more
              </button>
            )}
            <IconButton
              icon={<Search className="size-4" />}
              label="Search or jump to…"
              onClick={() => setCmdOpen(true)}
            />
          </>
        }
      />

      <SearchBar
        onActivate={() => setCmdOpen(true)}
        placeholder="Search events, people…"
      />

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">

        {/* Parse view */}
        {view === 'parse' && (
          <div className="p-4">
            {parsing && (
              <div className="flex items-center gap-2.5 px-4 py-3.5 bg-card rounded-xl mb-2.5 shadow-sm border border-border">
                <div className="size-4 animate-spin rounded-full border-2 border-border border-t-foreground shrink-0" />
                <span className="text-sm text-muted-foreground">Analyzing email with AI…</span>
              </div>
            )}
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 mb-2.5 text-xs text-destructive">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-success/10 border border-success/20 rounded-lg px-3 py-2 mb-2.5 text-xs text-success flex items-center gap-2">
                <CheckCircle className="size-4 shrink-0" />
                {success}
              </div>
            )}
            {pendingFeedback && user?.aiSettings.learningEnabled && (
              <FeedbackWidget
                userId={user!.id}
                groupId={user!.familyGroupId}
                eventId={pendingFeedback.eventId}
                aiSuggestion={pendingFeedback.aiSuggestion}
                onDone={() => setPendingFeedback(null)}
              />
            )}
            {!parsing && proposedEvents.length === 0 && !error && (
              <div className="text-center py-8 px-4 text-muted-foreground">
                <Calendar className="size-10 mx-auto mb-2.5 text-muted-foreground/50" />
                <p className="text-sm">No calendar events found in this email.</p>
              </div>
            )}
            {proposedEvents.map((event, i) => (
              <EventCard
                key={i}
                event={event}
                onAccept={() => {
                  if ((user?.familyGroups?.length ?? 0) > 1) {
                    setGroupPickerStep({ event })
                  } else {
                    handleAcceptEvent(event, user?.familyGroupId ?? '')
                  }
                }}
                onReject={() => handleRejectEvent(event)}
                familyConflicts={proposedConflicts.get(i)}
              />
            ))}
          </div>
        )}

        {/* History view */}
        {view === 'history' && (
          <EmailHistory emails={history} onSelect={(email) => {
            setPendingEmail({
              messageId: email.gmailMessageId,
              subject: email.subject ?? '',
              sender: email.sender ?? '',
              body: '',
              attachmentDescriptions: [],
            })
            setProposedEvents(email.proposedEvents)
            setView('parse')
          }} />
        )}

        {/* Secondary views — rendered inside scroll area, header provides back navigation */}
        {view === 'family' && (
          <FamilyCalendarView
            groupId={user!.familyGroupId!}
            userId={user!.id}
            aiSettings={user!.aiSettings}
            onBack={() => setView('history')}
          />
        )}
        {view === 'members' && (
          <MembersPanel
            groupId={user!.familyGroupId!}
            currentUserId={user!.id}
            isOwner={user!.role === 'owner'}
            onBack={() => setView('history')}
            familyGroups={user!.familyGroups}
            onGroupChanged={(gId, gName, role) => {
              setUser((u) => {
                if (!u) return u
                const existing = u.familyGroups ?? []
                const updated = existing.some((g) => g.id === gId)
                  ? existing.map((g) => g.id === gId ? { ...g, name: gName, role } : g)
                  : [...existing, { id: gId, name: gName, role }]
                return { ...u, familyGroupId: gId, familyGroupName: gName, role, familyGroups: updated }
              })
            }}
            onGroupDeleted={(deletedId) => {
              setUser((u) => {
                if (!u) return u
                const remaining = (u.familyGroups ?? []).filter((g) => g.id !== deletedId)
                return { ...u, familyGroups: remaining }
              })
            }}
          />
        )}
        {view === 'settings' && (
          <AISettingsPanel
            userId={user!.id}
            current={user!.aiSettings}
            onSave={async (settings) => {
              await supabase.from('user_ai_settings').upsert({
                user_id: user!.id,
                provider: settings.provider,
                api_key_encrypted: settings.apiKey ?? null,
                gemini_uses_oauth: settings.geminiUsesOAuth ?? false,
              }, { onConflict: 'user_id' })
              await chrome.storage.local.set({ fetchUrlContent: settings.fetchUrlContent ?? false })
              setUser((u) => u ? { ...u, aiSettings: settings } : u)
              setView('history')
            }}
            onBack={() => setView('history')}
          />
        )}
      </div>

      {/* Group picker — shown when user is in multiple groups and accepts an event */}
      {groupPickerStep && user?.familyGroups && (
        <div className="fixed inset-0 bg-black/45 flex items-end z-50">
          <div className="w-full bg-background rounded-t-2xl p-4 pb-6 shadow-xl border-t border-border">
            <div className="text-sm font-bold text-foreground mb-3.5">Add to which group?</div>
            <div className="flex flex-col gap-2 mb-3.5">
              {user.familyGroups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => { setGroupPickerStep(null); handleAcceptEvent(groupPickerStep.event, g.id) }}
                  className="px-4 py-2.5 rounded-lg border border-border bg-background text-sm font-semibold text-foreground cursor-pointer text-left hover:bg-accent transition-colors"
                >
                  {g.name}
                </button>
              ))}
            </div>
            <button
              onClick={() => setGroupPickerStep(null)}
              className="w-full py-2 rounded-lg border border-border bg-background text-muted-foreground text-sm font-semibold cursor-pointer hover:bg-accent transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Notify members modal — shown after event accept */}
      {notifyStep && (
        <NotifyMembersModal
          eventId={notifyStep.eventId}
          event={notifyStep.event}
          groupId={notifyStep.groupId}
          userId={user!.id}
          onDone={() => setNotifyStep(null)}
        />
      )}

      {/* Invitation card — shown when popup opened from a push notification tap */}
      {invitationCard && user?.familyGroupId && (
        <InvitationCard
          invitation={invitationCard}
          userId={user.id}
          groupId={user.familyGroupId}
          onDone={() => setInvitationCard(null)}
        />
      )}

      {/* Command palette — search + navigation */}
      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onNavigate={(v) => { setCmdOpen(false); setView(v) }}
        history={history}
        onSelectEmail={(email) => {
          setCmdOpen(false)
          setPendingEmail({
            messageId: email.gmailMessageId,
            subject: email.subject ?? '',
            sender: email.sender ?? '',
            body: '',
            attachmentDescriptions: [],
          })
          setProposedEvents(email.proposedEvents)
          setView('parse')
        }}
      />

      {/* Bottom navigation — always visible */}
      <TabBar>
        {user?.familyGroupId && (
          <TabBarItem icon={<Calendar className="size-5" />} label="Family"   active={view === 'family'}                     onClick={() => setView('family')} />
        )}
        <TabBarItem icon={<Users className="size-5" />}     label="Members"  active={view === 'members'}                    onClick={() => setView('members')} />
        <TabBarItem icon={<History className="size-5" />}   label="Recents"  active={view === 'history' || view === 'parse'} onClick={() => setView('history')} />
        <TabBarItem icon={<Settings className="size-5" />}  label="Settings" active={view === 'settings'}                   onClick={() => setView('settings')} />
      </TabBar>
    </AppShell>
  )
}
