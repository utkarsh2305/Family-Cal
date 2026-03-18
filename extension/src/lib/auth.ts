/**
 * Shared Google sign-in helper — used by both the popup and the onboarding page.
 */

import { supabase } from './supabase'

const WEB_CLIENT_ID = '197876073052-jpom7r50c8ii4tj54o7ujjgbdkvpcucu.apps.googleusercontent.com'

export async function signInWithGoogle(): Promise<void> {
  const nonce = crypto.randomUUID()
  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce))
  const hashedNonce = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', WEB_CLIENT_ID)
  authUrl.searchParams.set('response_type', 'id_token')
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', 'openid email profile')
  authUrl.searchParams.set('nonce', hashedNonce)
  authUrl.searchParams.set('prompt', 'select_account')

  const responseUrl = await new Promise<string>((resolve, reject) =>
    chrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive: true },
      (url) => {
        if (chrome.runtime.lastError || !url)
          reject(new Error(chrome.runtime.lastError?.message ?? 'Auth cancelled'))
        else resolve(url)
      }
    )
  )

  const fragment = new URL(responseUrl).hash.slice(1)
  const idToken = new URLSearchParams(fragment).get('id_token')
  if (!idToken) throw new Error('No ID token in Google response')

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
    nonce,
  })
  if (error) throw error
}
