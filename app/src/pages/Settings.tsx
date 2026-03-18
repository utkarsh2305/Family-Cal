import { useEffect, useState } from 'react'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonList, IonItem, IonLabel, IonButton,
  IonText, IonSelect, IonSelectOption, IonInput,
  IonAlert, IonSpinner,
} from '@ionic/react'
import { supabase } from '../lib/supabase'

const GCAL_CONNECTING_KEY = 'gcal_connecting'

export default function SettingsPage() {
  const [googleConnected, setGoogleConnected] = useState(false)
  const [icloudConnected, setIcloudConnected] = useState(false)
  const [icloudAppleId, setIcloudAppleId] = useState<string | null>(null)
  const [aiProvider, setAiProvider] = useState<string>('platform')
  const [aiApiKey, setAiApiKey]     = useState<string>('')
  const [aiSaving, setAiSaving]     = useState(false)
  const [loading, setLoading] = useState(true)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [icloudLoading, setIcloudLoading] = useState(false)
  const [showIcloudAlert, setShowIcloudAlert] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Check if we just returned from Google Calendar OAuth redirect
    if (localStorage.getItem(GCAL_CONNECTING_KEY)) {
      handleGoogleOAuthReturn()
    } else {
      loadSettings()
    }
  }, [])

  async function loadSettings() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: connections }, { data: aiSettings }] = await Promise.all([
      supabase.from('user_calendar_connections').select('provider, sync_enabled, calendar_id').eq('user_id', user.id),
      supabase.from('user_ai_settings').select('provider, api_key_encrypted').eq('user_id', user.id).single(),
    ])

    setGoogleConnected(connections?.some((c) => c.provider === 'google') ?? false)
    const icloud = connections?.find((c) => c.provider === 'icloud')
    setIcloudConnected(!!icloud)
    setIcloudAppleId(icloud?.calendar_id ?? null)
    setAiProvider(aiSettings?.provider ?? 'platform')
    setAiApiKey(aiSettings?.api_key_encrypted ?? '')
    setLoading(false)
  }

  async function handleAiSave() {
    setAiSaving(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { error: upsertError } = await supabase.from('user_ai_settings').upsert({
        user_id: user.id,
        provider: aiProvider,
        api_key_encrypted: aiProvider === 'platform' ? null : aiApiKey || null,
      }, { onConflict: 'user_id' })
      if (upsertError) setError(upsertError.message)
    }
    setAiSaving(false)
  }

  async function handleGoogleOAuthReturn() {
    localStorage.removeItem(GCAL_CONNECTING_KEY)
    setGoogleLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data: { user } } = await supabase.auth.getUser()
      if (session?.provider_token && user) {
        const { error: upsertError } = await supabase.from('user_calendar_connections').upsert({
          user_id: user.id,
          provider: 'google',
          calendar_id: 'primary',
          access_token: session.provider_token,
          refresh_token: session.provider_refresh_token ?? null,
          sync_enabled: true,
        }, { onConflict: 'user_id,provider' })
        if (upsertError) setError(upsertError.message)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google Calendar connection failed.')
    }
    await loadSettings()
    setGoogleLoading(false)
  }

  async function handleGoogleConnect() {
    setGoogleLoading(true)
    setError(null)
    localStorage.setItem(GCAL_CONNECTING_KEY, '1')
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'openid email profile https://www.googleapis.com/auth/calendar.events',
        queryParams: { access_type: 'offline', prompt: 'consent' },
        redirectTo: window.location.origin + '/settings',
      },
    })
    if (authError) {
      localStorage.removeItem(GCAL_CONNECTING_KEY)
      setError(authError.message)
      setGoogleLoading(false)
    }
    // No error: browser redirects away; spinner stays intentionally
  }

  async function handleGoogleDisconnect() {
    setGoogleLoading(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { error: deleteError } = await supabase.from('user_calendar_connections')
        .delete().eq('user_id', user.id).eq('provider', 'google')
      if (deleteError) setError(deleteError.message)
    }
    await loadSettings()
    setGoogleLoading(false)
  }

  async function handleIcloudConnect(appleId: string, appPassword: string) {
    if (!appleId.trim() || !appPassword.trim()) {
      setError('Apple ID and App-Specific Password are required.')
      return
    }
    setIcloudLoading(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { error: upsertError } = await supabase.from('user_calendar_connections').upsert({
        user_id: user.id,
        provider: 'icloud',
        calendar_id: appleId.trim(),
        access_token: appPassword.trim(),
        sync_enabled: true,
      }, { onConflict: 'user_id,provider' })
      if (upsertError) setError(upsertError.message)
    }
    await loadSettings()
    setIcloudLoading(false)
  }

  async function handleIcloudDisconnect() {
    setIcloudLoading(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { error: deleteError } = await supabase.from('user_calendar_connections')
        .delete().eq('user_id', user.id).eq('provider', 'icloud')
      if (deleteError) setError(deleteError.message)
    }
    await loadSettings()
    setIcloudLoading(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  if (loading) {
    return (
      <IonPage>
        <IonContent className="ion-text-center ion-padding">
          <IonSpinner />
        </IonContent>
      </IonPage>
    )
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Settings</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        {error && (
          <IonText color="danger">
            <p style={{ fontSize: 14, margin: '12px 16px 0' }}>{error}</p>
          </IonText>
        )}

        <IonList inset>
          {/* Google Calendar */}
          <IonItem>
            <IonLabel>
              <h2>Google Calendar</h2>
              <p>{googleConnected ? 'Connected — bidirectional sync enabled' : 'Not connected'}</p>
            </IonLabel>
            <IonButton
              slot="end"
              fill="outline"
              size="small"
              color={googleConnected ? 'danger' : 'primary'}
              disabled={googleLoading}
              onClick={googleConnected ? handleGoogleDisconnect : handleGoogleConnect}
            >
              {googleLoading
                ? <IonSpinner name="dots" style={{ width: 16, height: 16 }} />
                : googleConnected ? 'Disconnect' : 'Connect'}
            </IonButton>
          </IonItem>

          {/* iCloud Calendar */}
          <IonItem>
            <IonLabel>
              <h2>iCloud Calendar</h2>
              <p>
                {icloudConnected
                  ? `Connected (${icloudAppleId}) — polling every 10 min`
                  : 'Not connected'}
              </p>
            </IonLabel>
            <IonButton
              slot="end"
              fill="outline"
              size="small"
              color={icloudConnected ? 'danger' : 'primary'}
              disabled={icloudLoading}
              onClick={icloudConnected ? handleIcloudDisconnect : () => setShowIcloudAlert(true)}
            >
              {icloudLoading
                ? <IonSpinner name="dots" style={{ width: 16, height: 16 }} />
                : icloudConnected ? 'Disconnect' : 'Connect'}
            </IonButton>
          </IonItem>
        </IonList>

        <IonList inset>
          <IonItem>
            <IonLabel>AI Provider</IonLabel>
            <IonSelect
              slot="end"
              value={aiProvider}
              onIonChange={(e) => setAiProvider(e.detail.value)}
              interface="action-sheet"
            >
              <IonSelectOption value="platform">Platform (default)</IonSelectOption>
              <IonSelectOption value="openai">OpenAI</IonSelectOption>
              <IonSelectOption value="gemini">Gemini</IonSelectOption>
              <IonSelectOption value="claude">Claude</IonSelectOption>
              <IonSelectOption value="grok">Grok</IonSelectOption>
            </IonSelect>
          </IonItem>
          {aiProvider !== 'platform' && (
            <IonItem>
              <IonLabel position="stacked">API Key</IonLabel>
              <IonInput
                value={aiApiKey}
                onIonChange={(e) => setAiApiKey(e.detail.value ?? '')}
                type="password"
                placeholder="sk-..."
                clearInput
              />
            </IonItem>
          )}
          <IonItem>
            <IonButton
              expand="block"
              fill="clear"
              disabled={aiSaving}
              onClick={handleAiSave}
            >
              {aiSaving ? <IonSpinner name="dots" style={{ width: 16, height: 16 }} /> : 'Save AI Settings'}
            </IonButton>
          </IonItem>
        </IonList>

        <IonList inset>
          <IonItem button onClick={handleSignOut} color="danger">
            <IonLabel>Sign Out</IonLabel>
          </IonItem>
        </IonList>

        {/* iCloud credentials alert */}
        <IonAlert
          isOpen={showIcloudAlert}
          header="Connect iCloud Calendar"
          subHeader="Use an App-Specific Password, not your Apple ID password."
          message="Generate one at appleid.apple.com → Sign-In and Security → App-Specific Passwords."
          inputs={[
            { name: 'appleId', type: 'email', placeholder: 'Apple ID (email)' },
            { name: 'appPassword', type: 'password', placeholder: 'App-Specific Password' },
          ]}
          buttons={[
            { text: 'Cancel', role: 'cancel', handler: () => setShowIcloudAlert(false) },
            {
              text: 'Connect',
              handler: (data) => {
                setShowIcloudAlert(false)
                handleIcloudConnect(data.appleId ?? '', data.appPassword ?? '')
              },
            },
          ]}
          onDidDismiss={() => setShowIcloudAlert(false)}
        />
      </IonContent>
    </IonPage>
  )
}
