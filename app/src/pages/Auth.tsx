import { useState } from 'react'
import {
  IonPage, IonContent, IonButton, IonText, IonSpinner,
} from '@ionic/react'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { supabase } from '../lib/supabase'

const DEEP_LINK_REDIRECT = 'com.familycal.app://auth/callback'

export default function AuthPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function signInWithGoogle() {
    setLoading(true)
    setError(null)
    const isNative = Capacitor.isNativePlatform()
    const redirectTo = isNative ? DEEP_LINK_REDIRECT : window.location.origin
    const { data, error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: isNative },
    })
    if (authError) { setError(authError.message); setLoading(false); return }
    if (isNative && data.url) await Browser.open({ url: data.url })
    setLoading(false)
  }

  async function signInWithApple() {
    setLoading(true)
    setError(null)
    const isNative = Capacitor.isNativePlatform()
    const { data, error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: isNative ? DEEP_LINK_REDIRECT : window.location.origin,
        skipBrowserRedirect: isNative,
      },
    })
    if (authError) { setError(authError.message); setLoading(false); return }
    if (isNative && data.url) await Browser.open({ url: data.url })
    setLoading(false)
  }

  return (
    <IonPage>
      <IonContent className="ion-padding" style={{ '--background': '#fff' }}>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100%', gap: 16, maxWidth: 320, margin: '0 auto',
        }}>
          {/* Logo placeholder */}
          <div style={{ fontSize: 64, marginBottom: 8 }}>🗓</div>

          <h1 style={{ fontSize: 24, fontWeight: 700, textAlign: 'center', margin: 0 }}>
            Family Calendar
          </h1>
          <p style={{ color: '#5f6368', textAlign: 'center', marginBottom: 24 }}>
            Keep the whole family in sync.
          </p>

          {error && (
            <IonText color="danger">
              <p style={{ fontSize: 14, textAlign: 'center' }}>{error}</p>
            </IonText>
          )}

          {loading ? (
            <IonSpinner />
          ) : (
            <>
              <IonButton expand="block" style={{ width: '100%' }} onClick={signInWithGoogle}>
                Continue with Google
              </IonButton>
              <IonButton expand="block" fill="outline" style={{ width: '100%' }} onClick={signInWithApple}>
                Continue with Apple
              </IonButton>
            </>
          )}
        </div>
      </IonContent>
    </IonPage>
  )
}
