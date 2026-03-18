import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { signInWithGoogle } from '../lib/auth'
import FamilySetup from '../popup/components/onboarding/FamilySetup'
import { Button } from '../components/ui/button'

type Step = 0 | 1 | 2 | 3

export default function Onboarding() {
  const [step, setStep] = useState<Step>(0)
  const [userId, setUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [signingIn, setSigningIn] = useState(false)

  // If already signed in, skip to the right step
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      setUserId(session.user.id)
      // Upsert profile
      await supabase.from('user_profiles').upsert(
        { id: session.user.id, email: session.user.email ?? '' },
        { onConflict: 'id' }
      )
      // Check if already in a group
      const { data: membership } = await supabase
        .from('family_members')
        .select('group_id')
        .eq('user_id', session.user.id)
        .limit(1)
        .maybeSingle()
      setStep(membership?.group_id ? 3 : 2)
    })
  }, [])

  async function handleSignIn() {
    setSigningIn(true)
    setError(null)
    try {
      await signInWithGoogle()
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setUserId(session.user.id)
        await supabase.from('user_profiles').upsert(
          { id: session.user.id, email: session.user.email ?? '' },
          { onConflict: 'id' }
        )
        setStep(2)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed.')
    } finally {
      setSigningIn(false)
    }
  }

  return (
    <div className="w-full max-w-lg bg-background rounded-xl shadow-lg p-10">
      {/* Step indicator */}
      <div className="flex gap-1.5 mb-8 justify-center">
        {([0, 1, 2, 3] as Step[]).map((s) => (
          <div
            key={s}
            className="h-2 rounded-full transition-all duration-300"
            style={{
              width: s === step ? 24 : 8,
              background: s === step ? 'var(--primary)' : s < step ? 'oklch(0.708 0.14 243)' : 'var(--muted)',
            }}
          />
        ))}
      </div>

      {/* Step 0: Welcome */}
      {step === 0 && (
        <div className="text-center">
          <div className="text-5xl mb-4">🗓️</div>
          <h1 className="text-xl font-bold text-foreground mb-2">Family Calendar</h1>
          <p className="text-sm text-muted-foreground mb-7 leading-relaxed">
            Turn your Gmail emails into shared family calendar events — automatically.
          </p>
          <div className="text-left mb-8 space-y-3">
            {[
              ['📧', 'Open any email in Gmail'],
              ['✨', 'Click the "Family Cal" button to extract events with AI'],
              ['📅', "Add events to your family's shared calendar"],
            ].map(([icon, text]) => (
              <div key={text} className="flex items-center gap-3">
                <span className="text-xl">{icon}</span>
                <span className="text-sm text-foreground">{text}</span>
              </div>
            ))}
          </div>
          <Button onClick={() => setStep(1)} className="w-full">
            Get Started →
          </Button>
        </div>
      )}

      {/* Step 1: Sign in */}
      {step === 1 && (
        <div className="text-center">
          <div className="text-4xl mb-4">👋</div>
          <h2 className="text-lg font-semibold text-foreground mb-2">Sign in with Google</h2>
          <p className="text-sm text-muted-foreground mb-7 leading-relaxed">
            Use your Google account to sync events with your family.
          </p>
          {error && (
            <p className="text-xs text-destructive mb-4">{error}</p>
          )}
          <Button onClick={handleSignIn} disabled={signingIn} className="w-full">
            {signingIn ? 'Signing in…' : 'Sign in with Google'}
          </Button>
        </div>
      )}

      {/* Step 2: Create or join a group */}
      {step === 2 && userId && (
        <div>
          <FamilySetup
            userId={userId}
            onCreated={() => setStep(3)}
          />
        </div>
      )}

      {/* Step 3: Done */}
      {step === 3 && (
        <div className="text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-lg font-semibold text-foreground mb-2">You're all set!</h2>
          <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
            Open Gmail, find an email with an event, and click the{' '}
            <strong>Family Cal</strong> button in the toolbar.
          </p>
          <p className="text-xs text-muted-foreground mb-7">
            💡 Tip: Pin the extension to your toolbar for quick access.
          </p>
          <Button asChild className="w-full">
            <a href="https://mail.google.com" target="_blank" rel="noreferrer">
              Open Gmail →
            </a>
          </Button>
        </div>
      )}
    </div>
  )
}
