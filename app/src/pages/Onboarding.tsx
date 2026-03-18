import { useEffect, useState } from 'react'
import {
  IonPage, IonContent, IonButton, IonInput, IonSpinner,
} from '@ionic/react'
import { useHistory } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Screen =
  | 'welcome'
  | 'join_code'
  | 'join_preview'
  | 'join_waiting'
  | 'join_named'
  | 'create_form'
  | 'create_done'

interface PreviewMember { nickname: string | null; color: string; email: string | null }
interface PreviewData { family_id: string; family_name: string; members: PreviewMember[] }

const DEFAULT_COLOR = '#1a73e8'

function memberName(m: PreviewMember) {
  return m.nickname ?? m.email?.split('@')[0] ?? '?'
}

export default function OnboardingPage() {
  const history = useHistory()
  const [screen, setScreen]                         = useState<Screen>('welcome')

  const [codeInput, setCodeInput]                   = useState('')
  const [codeLoading, setCodeLoading]               = useState(false)
  const [codeError, setCodeError]                   = useState<string | null>(null)
  const [preview, setPreview]                       = useState<PreviewData | null>(null)

  const [joinLoading, setJoinLoading]               = useState(false)
  const [joinError, setJoinError]                   = useState<string | null>(null)
  const [joinedGroupId, setJoinedGroupId]           = useState('')
  const [joinedGroupName, setJoinedGroupName]       = useState('')
  const [assignedNickname, setAssignedNickname]     = useState('')
  const [assignedColor, setAssignedColor]           = useState(DEFAULT_COLOR)

  const [familyName, setFamilyName]                 = useState('')
  const [createLoading, setCreateLoading]           = useState(false)
  const [createError, setCreateError]               = useState<string | null>(null)
  const [createdGroupName, setCreatedGroupName]     = useState('')

  // Wait for admin to assign nickname after joining
  useEffect(() => {
    if (screen !== 'join_waiting' || !joinedGroupId) return
    const channel = supabase.channel('onboarding_membership')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'family_members', filter: `group_id=eq.${joinedGroupId}` },
        async (payload) => {
          const row = payload.new as any
          const { data: { user } } = await supabase.auth.getUser()
          if (row.user_id === user?.id && row.nickname) {
            setAssignedNickname(row.nickname)
            setAssignedColor(row.color ?? DEFAULT_COLOR)
            setScreen('join_named')
          }
        }
      ).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [screen, joinedGroupId])

  async function handleCodeContinue() {
    const code = codeInput.trim()
    if (!code) { setCodeError('Please enter your invite code.'); return }
    setCodeLoading(true); setCodeError(null)
    const { data, error } = await supabase.rpc('preview_family_by_code', { invite_code: code })
    setCodeLoading(false)
    if (error) { setCodeError(error.message); return }
    if ((data as any)?.error === 'invalid_or_expired') {
      setCodeError('Code not found or expired. Check the code and try again.'); return
    }
    setPreview(data as PreviewData)
    setScreen('join_preview')
  }

  async function handleJoinFamily() {
    if (!preview) return
    setJoinLoading(true); setJoinError(null)
    const { data, error } = await supabase.rpc('join_family_group_by_code', { invite_code: codeInput.trim() })
    setJoinLoading(false)
    if (error) { setJoinError(error.message); return }
    if ((data as any)?.error === 'invalid_or_expired') { setJoinError('This code is no longer valid.'); return }
    const gid = (data as any)?.error === 'already_member'
      ? ((data as any).group_id ?? preview.family_id)
      : (data as any).group_id
    setJoinedGroupId(gid)
    setJoinedGroupName(preview.family_name)
    setScreen('join_waiting')
  }

  async function handleCreateFamily() {
    const name = familyName.trim()
    if (!name) { setCreateError('Family name is required.'); return }
    setCreateLoading(true); setCreateError(null)
    const { error } = await supabase.rpc('create_family_group', { group_name: name })
    setCreateLoading(false)
    if (error) { setCreateError(error.message); return }
    setCreatedGroupName(name)
    setScreen('create_done')
  }

  function goToCalendar() { history.replace('/calendar') }

  return (
    <IonPage>
      <IonContent>
        <div style={styles.outer}>

          {/* ── Welcome ─────────────────────────────────────────── */}
          {screen === 'welcome' && (
            <div style={{ ...styles.card, alignItems: 'center', textAlign: 'center' }}>
              <div style={styles.iconBox}>
                <svg viewBox="0 0 24 24" width="32" height="32" fill="#fff">
                  <path d="M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z"/>
                </svg>
              </div>
              <h1 style={styles.h1}>Family Calendar</h1>
              <p style={styles.subtitle}>Coordinate your family's schedule in one shared place.</p>
              <IonButton expand="block" style={styles.btnFull} onClick={() => setScreen('join_code')}>
                I have an invite code
              </IonButton>
              <IonButton expand="block" fill="outline" style={styles.btnFull} onClick={() => setScreen('create_form')}>
                Create my family
              </IonButton>
            </div>
          )}

          {/* ── Enter invite code ────────────────────────────────── */}
          {screen === 'join_code' && (
            <div style={styles.card}>
              <BackButton onClick={() => { setCodeError(null); setCodeInput(''); setScreen('welcome') }} />
              <h2 style={styles.h2}>Enter your invite code</h2>
              <p style={styles.bodyText}>Your family admin shared an 8-character code with you.</p>

              <IonInput
                value={codeInput}
                onIonInput={(e) => setCodeInput(String(e.detail.value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                placeholder="e.g. X7K2M9QP"
                style={styles.codeInput}
                clearInput
              />
              <p style={styles.hint}>Letters and numbers, case doesn't matter.</p>

              {codeError && <ErrorMsg>{codeError}</ErrorMsg>}

              <div style={styles.row}>
                <IonButton fill="outline" style={{ flex: 1 }} onClick={() => { setCodeError(null); setCodeInput(''); setScreen('welcome') }}>Back</IonButton>
                <IonButton style={{ flex: 1 }} disabled={codeLoading || codeInput.length === 0} onClick={handleCodeContinue}>
                  {codeLoading ? <IonSpinner name="crescent" /> : 'Continue'}
                </IonButton>
              </div>
            </div>
          )}

          {/* ── Preview family ───────────────────────────────────── */}
          {screen === 'join_preview' && preview && (
            <div style={styles.card}>
              <BackButton onClick={() => { setJoinError(null); setScreen('join_code') }} />
              <h2 style={styles.h2}>You're joining:</h2>
              <div style={styles.familyNameRow}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="#5f6368"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{preview.family_name}</span>
              </div>

              {preview.members.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <p style={styles.sectionLabel}>Current members ({preview.members.length})</p>
                  {preview.members.map((m, i) => (
                    <div key={i} style={styles.memberRow}>
                      <div style={{ ...styles.dot, background: m.color || DEFAULT_COLOR, width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                        {memberName(m).charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontSize: 14 }}>{memberName(m)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={styles.infoBox}>
                <p style={{ fontSize: 11, color: '#5f6368', marginBottom: 6 }}>After joining you can:</p>
                {['View the family calendar', 'Coordinate events with family', 'Receive event updates'].map((b) => (
                  <div key={b} style={styles.checkRow}>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="#1e7e34"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    <span style={{ fontSize: 12 }}>{b}</span>
                  </div>
                ))}
              </div>

              {joinError && <ErrorMsg>{joinError}</ErrorMsg>}

              <div style={styles.row}>
                <IonButton fill="outline" style={{ flex: 1 }} onClick={() => { setJoinError(null); setScreen('join_code') }}>Back</IonButton>
                <IonButton style={{ flex: 1 }} disabled={joinLoading} onClick={handleJoinFamily}>
                  {joinLoading ? <IonSpinner name="crescent" /> : 'Join Family'}
                </IonButton>
              </div>
            </div>
          )}

          {/* ── Waiting for admin ────────────────────────────────── */}
          {screen === 'join_waiting' && (
            <div style={{ ...styles.card, alignItems: 'center', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <h2 style={styles.h2}>Welcome to {joinedGroupName}!</h2>
              <p style={styles.bodyText}>You've joined. The admin will assign your name shortly.</p>
              <div style={{ ...styles.infoBox, textAlign: 'left', width: '100%', marginBottom: 16 }}>
                {['View the family calendar', 'See other members', 'Receive event updates'].map((b) => (
                  <div key={b} style={styles.checkRow}>
                    <span style={{ color: '#5f6368' }}>•</span>
                    <span style={{ fontSize: 12 }}>{b}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: '#5f6368', marginBottom: 16 }}>This updates automatically when your name is assigned.</p>
              <IonButton expand="block" style={styles.btnFull} onClick={goToCalendar}>View Calendar →</IonButton>
            </div>
          )}

          {/* ── Name assigned ────────────────────────────────────── */}
          {screen === 'join_named' && (
            <div style={{ ...styles.card, alignItems: 'center', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
              <h2 style={styles.h2}>You're in!</h2>
              <p style={styles.bodyText}>Your admin gave you a name:</p>
              <div style={{ ...styles.dot, background: assignedColor, width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 22, fontWeight: 700, margin: '12px auto 6px' }}>
                {assignedNickname.charAt(0).toUpperCase()}
              </div>
              <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{assignedNickname}</p>
              <IonButton expand="block" style={styles.btnFull} onClick={goToCalendar}>View Calendar →</IonButton>
            </div>
          )}

          {/* ── Create family ────────────────────────────────────── */}
          {screen === 'create_form' && (
            <div style={styles.card}>
              <BackButton onClick={() => { setCreateError(null); setFamilyName(''); setScreen('welcome') }} />
              <h2 style={styles.h2}>Create your family</h2>
              <p style={styles.bodyText}>Give your family a name. You'll be the admin.</p>

              <div style={{ marginBottom: 4 }}>
                <p style={styles.sectionLabel}>Family name</p>
                <IonInput
                  value={familyName}
                  onIonInput={(e) => setFamilyName(String(e.detail.value ?? '').slice(0, 50))}
                  placeholder="Smith Family, The Johnsons…"
                  style={styles.textInput}
                  clearInput
                  autofocus
                />
              </div>
              <p style={{ ...styles.hint, textAlign: 'right', marginBottom: 16 }}>{familyName.length}/50</p>

              {createError && <ErrorMsg>{createError}</ErrorMsg>}

              <div style={styles.row}>
                <IonButton fill="outline" style={{ flex: 1 }} onClick={() => { setCreateError(null); setFamilyName(''); setScreen('welcome') }}>Back</IonButton>
                <IonButton style={{ flex: 1 }} disabled={createLoading || !familyName.trim()} onClick={handleCreateFamily}>
                  {createLoading ? <IonSpinner name="crescent" /> : 'Create'}
                </IonButton>
              </div>
            </div>
          )}

          {/* ── Family created ───────────────────────────────────── */}
          {screen === 'create_done' && (
            <div style={{ ...styles.card, alignItems: 'center', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
              <h2 style={styles.h2}>Family created!</h2>
              <div style={styles.familyNameRow}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="#5f6368"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{createdGroupName}</span>
              </div>
              <p style={styles.bodyText}>You're the admin. You can:</p>
              <div style={{ ...styles.infoBox, textAlign: 'left', width: '100%', marginBottom: 12 }}>
                {['Invite family members', 'Manage members and their names', 'View the family calendar'].map((b) => (
                  <div key={b} style={styles.checkRow}>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="#1e7e34"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    <span style={{ fontSize: 12 }}>{b}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: '#5f6368', marginBottom: 16 }}>
                Next: open the Family tab to generate an invite code and add your family.
              </p>
              <IonButton expand="block" style={styles.btnFull} onClick={goToCalendar}>Go to Calendar →</IonButton>
            </div>
          )}

        </div>
      </IonContent>
    </IonPage>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#5f6368', padding: '0 0 12px 0', fontSize: 14 }}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
    </button>
  )
}

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#fce8e6', border: '1px solid #f5c6cb', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#c5221f' }}>
      {children}
    </div>
  )
}

import React from 'react'

const styles: Record<string, React.CSSProperties> = {
  outer: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100%', padding: '24px 20px',
  },
  card: {
    display: 'flex', flexDirection: 'column',
    width: '100%', maxWidth: 380,
    gap: 4,
  },
  iconBox: {
    width: 64, height: 64, borderRadius: 18, background: '#1a1f36',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 12, alignSelf: 'center',
  },
  h1: { fontSize: 22, fontWeight: 700, margin: '0 0 6px', color: '#1a1f36' },
  h2: { fontSize: 17, fontWeight: 700, margin: '0 0 6px', color: '#1a1f36' },
  subtitle: { fontSize: 14, color: '#5f6368', marginBottom: 24, lineHeight: 1.5 },
  bodyText: { fontSize: 13, color: '#5f6368', marginBottom: 14, lineHeight: 1.5 },
  btnFull: { width: '100%', marginBottom: 8 },
  sectionLabel: { fontSize: 11, fontWeight: 600, color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 },
  hint: { fontSize: 11, color: '#5f6368', marginBottom: 12 },
  row: { display: 'flex', gap: 10, marginTop: 'auto', paddingTop: 12 },
  infoBox: {
    background: '#f8f9fa', border: '1px solid #e3e8ef', borderRadius: 10,
    padding: '10px 12px', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 4,
  },
  checkRow: { display: 'flex', alignItems: 'center', gap: 6 },
  memberRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  familyNameRow: { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15, marginBottom: 14, color: '#1a1f36' },
  dot: {},
  codeInput: {
    '--border-radius': '10px', '--padding-start': '16px', '--padding-end': '16px',
    fontFamily: 'monospace', fontSize: 20, letterSpacing: '0.2em', textAlign: 'center',
    background: '#f8f9fa', borderRadius: 10, border: '1px solid #e3e8ef',
    marginBottom: 4, width: '100%',
  } as any,
  textInput: {
    '--border-radius': '10px', '--padding-start': '12px',
    background: '#f8f9fa', borderRadius: 10, border: '1px solid #e3e8ef',
    marginBottom: 4, width: '100%',
  } as any,
}
