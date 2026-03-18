import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import type { AISettings } from '../../../lib/types'
import { DEFAULT_CATEGORIES } from '../../../lib/preferences'
import { PROVIDERS, getProviderDef, validateApiKey, buildChromeStoragePayload } from '../../../lib/settingsUtils'
import type { Provider, GodMode, GodModeSubtype } from '../../../lib/settingsUtils'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Checkbox } from '../../../components/ui/checkbox'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { SectionHeader } from '../shared/ui'
import { SettingsRow, ConnectionStatusRow } from '.'

interface Props {
  userId: string
  current: AISettings
  onSave: (settings: AISettings) => Promise<void>
  onBack: () => void
}

// ── Calendar connection type ───────────────────────────────────────────────

interface CalConn { provider: 'google' | 'icloud'; calendarId: string | null; syncEnabled: boolean }

// ── Main component ─────────────────────────────────────────────────────────

export default function AISettingsPanel({ userId, current, onSave, onBack: _onBack }: Props) {
  // AI settings state
  const [provider, setProvider]                     = useState<Provider>(current.provider)
  const [apiKey, setApiKey]                         = useState(current.apiKey ?? '')
  const [showKey, setShowKey]                       = useState(false)
  const [fetchUrls, setFetchUrls]                   = useState(current.fetchUrlContent ?? false)
  const [saving, setSaving]                         = useState(false)
  const [error, setError]                           = useState<string | null>(null)
  const [godMode, setGodMode]                       = useState<GodMode>(current.godMode ?? 'manual')
  const [godModeSubtype, setGodModeSubtype]         = useState<GodModeSubtype>(current.godModeSubtype ?? 'open')
  const [pollIntervalHours, setPollIntervalHours]   = useState<number>(current.pollIntervalHours ?? 2)
  const [categories, setCategories]                 = useState<string[]>(current.categories ?? DEFAULT_CATEGORIES)
  const [learningEnabled, setLearningEnabled]       = useState(current.learningEnabled ?? true)
  const [stats, setStats]                           = useState<{ total: number; accepted: number; rejected: number; corrected: number } | null>(null)
  const [resetting, setResetting]                   = useState(false)

  // Calendar connections state
  const [googleViaChrome, setGoogleViaChrome] = useState(false)
  const [connections, setConnections]         = useState<CalConn[]>([])
  const [calLoading, setCalLoading]           = useState(true)
  const [disconnecting, setDisconnecting]     = useState<string | null>(null)
  const [calError, setCalError]               = useState<string | null>(null)

  const providerDef = getProviderDef(provider)

  useEffect(() => {
    supabase
      .from('user_preferences')
      .select('mode, categories, learning_enabled, god_mode_subtype, poll_interval_hours')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setGodMode(data.mode as GodMode)
          setCategories(data.categories ?? DEFAULT_CATEGORIES)
          setLearningEnabled(data.learning_enabled ?? true)
          const subtype = (data.god_mode_subtype as GodModeSubtype) ?? 'open'
          setGodModeSubtype(subtype === 'poll' ? 'open' : subtype)
          setPollIntervalHours(data.poll_interval_hours ?? 2)
        }
      })

    supabase
      .from('event_feedback')
      .select('user_action')
      .eq('user_id', userId)
      .then(({ data }) => {
        if (!data) return
        setStats({
          total:     data.length,
          accepted:  data.filter((r) => r.user_action === 'accept').length,
          rejected:  data.filter((r) => r.user_action === 'reject').length,
          corrected: data.filter((r) => r.user_action === 'correct').length,
        })
      })

    loadCalendarConnections()
  }, [userId])

  async function loadCalendarConnections() {
    try {
      const chromeToken = await new Promise<string | undefined>((resolve) =>
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          void chrome.runtime.lastError
          resolve(token ?? undefined)
        })
      )
      setGoogleViaChrome(!!chromeToken)

      const { data, error: fetchError } = await supabase
        .from('user_calendar_connections')
        .select('provider, calendar_id, sync_enabled')
        .eq('user_id', userId)

      if (!fetchError) {
        setConnections(
          (data ?? []).map((row: any) => ({
            provider:    row.provider,
            calendarId:  row.calendar_id,
            syncEnabled: row.sync_enabled,
          }))
        )
      }
    } catch { /* ignore */ } finally {
      setCalLoading(false)
    }
  }

  async function handleDisconnect(prov: string) {
    setDisconnecting(prov)
    setCalError(null)
    const { error: deleteError } = await supabase
      .from('user_calendar_connections')
      .delete()
      .eq('user_id', userId)
      .eq('provider', prov)
    if (deleteError) {
      setCalError(deleteError.message)
    } else {
      setConnections((prev) => prev.filter((c) => c.provider !== prov))
    }
    setDisconnecting(null)
  }

  async function handleResetLearning() {
    setResetting(true)
    await supabase.from('event_feedback').delete().eq('user_id', userId)
    setStats({ total: 0, accepted: 0, rejected: 0, corrected: 0 })
    setResetting(false)
  }

  function toggleCategory(key: string) {
    setCategories((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  async function handleSave() {
    setSaving(true)
    setError(null)

    let geminiUsesOAuth = false

    if (provider === 'gemini') {
      const token = await new Promise<string | null>((resolve) =>
        chrome.identity.getAuthToken({ interactive: true }, (t) =>
          resolve(chrome.runtime.lastError ? null : (t ?? null))
        )
      )
      if (!token) { setError('Gemini OAuth was cancelled.'); setSaving(false); return }
      geminiUsesOAuth = true
    }

    const keyError = validateApiKey(provider, apiKey)
    if (keyError) { setError(keyError); setSaving(false); return }

    try {
      await supabase.from('user_preferences').upsert({
        user_id: userId,
        mode: godMode,
        categories,
        learning_enabled: learningEnabled,
        god_mode_subtype: godModeSubtype,
        poll_interval_hours: pollIntervalHours,
      }, { onConflict: 'user_id' })

      await chrome.storage.local.set(buildChromeStoragePayload({ godMode, categories, learningEnabled, godModeSubtype, pollIntervalHours }))
      chrome.runtime.sendMessage({ type: 'UPDATE_POLL_ALARM' }).catch(() => {})

      await onSave({
        provider,
        apiKey: providerDef.hasApiKey ? apiKey.trim() : undefined,
        geminiUsesOAuth,
        fetchUrlContent: fetchUrls,
        godMode,
        godModeSubtype,
        pollIntervalHours,
        categories,
        learningEnabled,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const icloud = connections.find((c) => c.provider === 'icloud')

  const ALL_CATEGORIES: { key: string; label: string }[] = [
    { key: 'school',       label: 'School'       },
    { key: 'work',         label: 'Work'          },
    { key: 'sports',       label: 'Sports'        },
    { key: 'appointments', label: 'Appointments'  },
    { key: 'travel',       label: 'Travel'        },
    { key: 'newsletters',  label: 'Newsletters'   },
    { key: 'promotions',   label: 'Promotions'    },
  ]

  return (
    <div className="flex flex-col">
      <div className="flex-1 overflow-y-auto pb-2">

        {/* ── 1. Calendars ─────────────────────────────────────────── */}
        <SectionHeader title="Calendars" />

        {calError && (
          <p className="px-4 pb-1 text-xs text-destructive">{calError}</p>
        )}

        {calLoading ? (
          <div className="px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
            <div className="size-4 animate-spin rounded-full border-2 border-border border-t-foreground shrink-0" />
            Loading…
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            <ConnectionStatusRow
              name="Google Calendar"
              description={googleViaChrome ? 'Connected via Chrome — events added on accept' : 'Not connected'}
              connected={googleViaChrome}
            />
            <ConnectionStatusRow
              name="iCloud Calendar"
              description={
                icloud
                  ? `Connected (${icloud.calendarId}) — polling every 10 min`
                  : 'iCloud sync requires the Family Cal iOS app'
              }
              connected={!!icloud}
              action={
                icloud ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={disconnecting === 'icloud'}
                    onClick={() => handleDisconnect('icloud')}
                    className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                  >
                    {disconnecting === 'icloud' ? '…' : 'Disconnect'}
                  </Button>
                ) : (
                  <span className="text-[11px] text-muted-foreground bg-muted rounded-md px-2 py-1">
                    iOS app required
                  </span>
                )
              }
            />
          </div>
        )}

        {/* ── 2. AI Provider ───────────────────────────────────────── */}
        <SectionHeader title="AI Provider" className="mt-2" />

        <SettingsRow label="Provider" description="Choose which AI model analyzes your emails">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            className="h-8 rounded-md border border-input bg-background px-2 py-1 text-[13px] shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </SettingsRow>

        {providerDef.hasApiKey && (
          <SettingsRow
            label="API Key"
            description="Stored encrypted. Never sent to third parties."
          >
            <div className="relative">
              <Input
                id="apiKey"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="h-8 text-[13px] pr-8 w-44"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
          </SettingsRow>
        )}

        {providerDef.hasOAuth && (
          <p className="px-4 pb-2 text-[11px] text-muted-foreground leading-relaxed">
            You'll be asked to grant Gemini access to your Google account when you save.
          </p>
        )}

        <SettingsRow
          label="Fetch linked page content"
          description="Visit URLs in emails to find additional event details"
          htmlFor="fetchUrls"
        >
          <Checkbox
            id="fetchUrls"
            checked={fetchUrls}
            onCheckedChange={(v) => setFetchUrls(!!v)}
          />
        </SettingsRow>

        {/* ── 3. Processing Mode ───────────────────────────────────── */}
        <SectionHeader title="Processing Mode" className="mt-2" />

        <div className="px-4 py-3 space-y-3">
          {(['automatic', 'manual', 'disabled'] as GodMode[]).map((m) => (
            <label key={m} className={m === 'automatic' ? 'flex items-start gap-2.5 cursor-not-allowed opacity-50' : 'flex items-start gap-2.5 cursor-pointer'}>
              <input
                type="radio"
                name="godMode"
                value={m}
                checked={godMode === m}
                onChange={() => { if (m !== 'automatic') setGodMode(m) }}
                disabled={m === 'automatic'}
                className="mt-0.5 shrink-0"
              />
              <span>
                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                  {m === 'automatic' ? 'Automatic' : m === 'manual' ? 'Manual' : 'Disabled'}
                  {m === 'automatic' && (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-accent-primary-muted text-accent-primary border border-accent-primary-border leading-none">
                      Soon
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-muted-foreground leading-relaxed">
                  {m === 'automatic' && 'Analyzes emails automatically — available in a future update'}
                  {m === 'manual'    && 'Click the Family Cal button to analyze an email'}
                  {m === 'disabled'  && 'Extension inactive — no suggestions or processing'}
                </span>
              </span>
            </label>
          ))}

          {godMode === 'automatic' && false && (
            <div className="ml-5 p-3 bg-muted rounded-lg border border-border space-y-2.5">
              <p className="text-[11px] font-semibold text-foreground uppercase tracking-wide">When to analyze</p>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="godModeSubtype"
                  value="open"
                  checked={godModeSubtype === 'open'}
                  onChange={() => setGodModeSubtype('open')}
                  className="mt-0.5 shrink-0"
                />
                <span>
                  <span className="block text-[13px] font-semibold text-foreground">When I open an email</span>
                  <span className="text-[11px] text-muted-foreground leading-relaxed">Triggers as you read — Gmail must be open</span>
                </span>
              </label>

              <label className="flex items-start gap-2 cursor-not-allowed opacity-50">
                <input type="radio" name="godModeSubtype" value="poll" disabled checked={false} readOnly className="mt-0.5 shrink-0" />
                <span>
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                    Poll my inbox automatically
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-accent-primary-muted text-accent-primary border border-accent-primary-border leading-none">
                      Soon
                    </span>
                  </span>
                  <span className="text-[11px] text-muted-foreground leading-relaxed">Background scan — available in a future update</span>
                </span>
              </label>
            </div>
          )}
        </div>

        {/* ── 4. Email Categories ──────────────────────────────────── */}
        {godMode !== 'disabled' && (
          <>
            <SectionHeader title="Email Categories" className="mt-2" />
            <p className="px-4 pb-2 text-[11px] text-muted-foreground">
              Only emails matching these categories will be analyzed.
            </p>
            <div className="flex flex-wrap gap-2 px-4 pb-4">
              {ALL_CATEGORIES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleCategory(key)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-[12px] font-medium border transition-colors',
                    categories.includes(key)
                      ? 'bg-accent-primary text-accent-primary-foreground border-accent-primary'
                      : 'bg-background text-muted-foreground border-border hover:border-accent-primary-border'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── 5. AI Learning ───────────────────────────────────────── */}
        {godMode !== 'disabled' && (
          <>
            <SectionHeader title="AI Learning" className="mt-2" />

            <SettingsRow
              label="Learn from my feedback"
              description="AI uses your accept/reject history to improve suggestions"
              htmlFor="learning"
            >
              <Checkbox
                id="learning"
                checked={learningEnabled}
                onCheckedChange={(v) => setLearningEnabled(!!v)}
              />
            </SettingsRow>

            {stats !== null && (
              <div className="mx-4 mb-4 bg-muted rounded-lg border border-border p-3 space-y-2">
                <p className="text-[11px] font-semibold text-foreground uppercase tracking-wide">Learning Data</p>
                {stats.total === 0 ? (
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    No feedback yet. Accept or reject suggestions to start learning.
                  </p>
                ) : (
                  <div className="flex gap-3 flex-wrap text-[11px] text-muted-foreground">
                    <span><strong className="text-success">{stats.accepted}</strong> accepted</span>
                    <span><strong className="text-destructive">{stats.rejected}</strong> rejected</span>
                    <span><strong className="text-foreground">{stats.corrected}</strong> corrected</span>
                    <span>Accuracy: <strong>{Math.round((stats.accepted / stats.total) * 100)}%</strong> ({stats.total} total)</span>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetLearning}
                  disabled={resetting || stats.total === 0}
                >
                  {resetting ? 'Resetting…' : 'Reset learning data'}
                </Button>
              </div>
            )}
          </>
        )}

      </div>

      {/* ── Sticky Save Footer ───────────────────────────────────────── */}
      <div className="sticky bottom-0 bg-background border-t border-border px-4 py-3 flex items-center justify-between shrink-0">
        <span className="text-xs text-destructive flex-1 mr-3 leading-relaxed">{error ?? ''}</span>
        <Button size="sm" onClick={handleSave} disabled={saving} className="px-6">
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
