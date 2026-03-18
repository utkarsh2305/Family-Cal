import { useEffect, useState } from 'react'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonBackButton, IonButton, IonIcon,
  IonItem, IonLabel, IonInput, IonTextarea, IonToggle,
  IonAlert, IonSpinner, IonText, IonSelect, IonSelectOption,
} from '@ionic/react'
import { trashOutline, saveOutline } from 'ionicons/icons'
import { useParams, useHistory } from 'react-router-dom'
import { supabase, type CalendarEvent } from '../lib/supabase'

const NOTIFY_URL = (import.meta as any).env?.VITE_NOTIFY_FAMILY_URL as string | undefined

interface Membership { group_id: string; role: string; group_name: string }
interface NotifyMember { user_id: string; name: string; color: string }

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const history = useHistory()
  const isNew = eventId === 'new'

  const [event, setEvent]                       = useState<Partial<CalendarEvent>>({})
  const [memberships, setMemberships]           = useState<Membership[]>([])
  const [selectedGroupId, setSelectedGroupId]   = useState<string>('')
  const [loading, setLoading]                   = useState(!isNew)
  const [saving, setSaving]                     = useState(false)
  const [showDelete, setShowDelete]             = useState(false)
  const [error, setError]                       = useState<string | null>(null)

  // Notify sheet
  const [notifyMembers, setNotifyMembers]       = useState<NotifyMember[] | null>(null)
  const [notifySelected, setNotifySelected]     = useState<Set<string>>(new Set())
  const [notifySending, setNotifySending]       = useState(false)
  const [savedEventId, setSavedEventId]         = useState<string | null>(null)

  const activeRole = memberships.find((m) => m.group_id === selectedGroupId)?.role ?? 'viewer'
  const canEdit    = activeRole === 'owner' || activeRole === 'editor'
  const canDelete  = activeRole === 'owner'

  // Load all memberships
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: rows } = await supabase
        .from('family_members')
        .select('group_id, role, family_groups(name)')
        .eq('user_id', user.id)
      const parsed: Membership[] = (rows ?? []).map((r: any) => ({
        group_id:   r.group_id,
        role:       r.role,
        group_name: r.family_groups?.name ?? 'Family',
      }))
      setMemberships(parsed)
      if (parsed.length > 0 && !selectedGroupId) setSelectedGroupId(parsed[0].group_id)
    })
  }, [])

  // Load existing event
  useEffect(() => {
    if (isNew) { setLoading(false); return }
    supabase.from('calendar_events').select('*').eq('id', eventId).single()
      .then(({ data, error: fetchError }) => {
        if (fetchError) setError(fetchError.message)
        else {
          setEvent(data ?? {})
          if (data?.group_id) setSelectedGroupId(data.group_id)
        }
        setLoading(false)
      })
  }, [eventId, isNew])

  async function handleSave() {
    if (!selectedGroupId) return
    setSaving(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    const payload = { ...event, group_id: selectedGroupId, updated_by: user!.id }

    if (isNew) {
      const { data: inserted, error: saveError } = await supabase
        .from('calendar_events')
        .insert({ ...payload, created_by: user!.id })
        .select('id')
        .single()

      if (saveError) { setError(saveError.message); setSaving(false); return }
      setSaving(false)

      // Fetch members to notify (exclude self)
      const { data: members } = await supabase
        .from('family_members')
        .select('user_id, nickname, color, user_profiles(email)')
        .eq('group_id', selectedGroupId)
        .neq('user_id', user!.id)

      const list: NotifyMember[] = (members ?? []).map((m: any) => ({
        user_id: m.user_id,
        name:    m.nickname ?? m.user_profiles?.email?.split('@')[0] ?? 'Member',
        color:   m.color ?? '#8792a2',
      }))
      setSavedEventId(inserted!.id)
      setNotifyMembers(list)
      setNotifySelected(new Set(list.map((m) => m.user_id)))
    } else {
      const { error: saveError } = await supabase
        .from('calendar_events').update(payload).eq('id', eventId)
      if (saveError) setError(saveError.message)
      else history.goBack()
      setSaving(false)
    }
  }

  async function handleNotify() {
    if (notifySelected.size > 0 && NOTIFY_URL && savedEventId) {
      const { data: { session } } = await supabase.auth.getSession()
      setNotifySending(true)
      await fetch(NOTIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ eventId: savedEventId, fromUserId: session?.user.id, targetUserIds: Array.from(notifySelected) }),
      }).catch(() => {})
      setNotifySending(false)
    }
    history.goBack()
  }

  async function handleDelete() {
    const { error: deleteError } = await supabase.from('calendar_events').delete().eq('id', eventId)
    if (deleteError) setError(deleteError.message)
    else history.replace('/calendar')
  }

  if (loading) return <IonPage><IonContent className="ion-text-center ion-padding"><IonSpinner /></IonContent></IonPage>

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start"><IonBackButton defaultHref="/calendar" /></IonButtons>
          <IonTitle>{isNew ? 'New Event' : canEdit ? 'Edit Event' : 'Event'}</IonTitle>
          {canEdit && (
            <IonButtons slot="end">
              {!isNew && canDelete && (
                <IonButton onClick={() => setShowDelete(true)}>
                  <IonIcon icon={trashOutline} color="danger" />
                </IonButton>
              )}
              <IonButton onClick={handleSave} disabled={saving}>
                {saving ? <IonSpinner name="crescent" /> : <IonIcon icon={saveOutline} />}
              </IonButton>
            </IonButtons>
          )}
        </IonToolbar>
      </IonHeader>

      <IonContent>
        {error && <IonText color="danger" className="ion-padding"><p>{error}</p></IonText>}

        {/* Group selector — new events only, multiple groups only */}
        {isNew && memberships.length > 1 && (
          <IonItem>
            <IonLabel>Group</IonLabel>
            <IonSelect slot="end" value={selectedGroupId} onIonChange={(e) => setSelectedGroupId(e.detail.value)} interface="action-sheet">
              {memberships.map((m) => (
                <IonSelectOption key={m.group_id} value={m.group_id}>{m.group_name}</IonSelectOption>
              ))}
            </IonSelect>
          </IonItem>
        )}

        <IonItem>
          <IonLabel position="stacked">Title</IonLabel>
          <IonInput value={event.title ?? ''} onIonChange={(e) => setEvent((p) => ({ ...p, title: e.detail.value! }))} disabled={!canEdit} placeholder="Event title" />
        </IonItem>
        <IonItem>
          <IonLabel position="stacked">Start</IonLabel>
          <IonInput type="datetime-local" value={event.start_at ? event.start_at.slice(0, 16) : ''} onIonChange={(e) => setEvent((p) => ({ ...p, start_at: new Date(e.detail.value!).toISOString() }))} disabled={!canEdit} />
        </IonItem>
        <IonItem>
          <IonLabel position="stacked">End</IonLabel>
          <IonInput type="datetime-local" value={event.end_at ? event.end_at.slice(0, 16) : ''} onIonChange={(e) => setEvent((p) => ({ ...p, end_at: new Date(e.detail.value!).toISOString() }))} disabled={!canEdit} />
        </IonItem>
        <IonItem>
          <IonLabel>All Day</IonLabel>
          <IonToggle checked={event.is_all_day ?? false} onIonChange={(e) => setEvent((p) => ({ ...p, is_all_day: e.detail.checked }))} disabled={!canEdit} />
        </IonItem>
        <IonItem>
          <IonLabel position="stacked">Location</IonLabel>
          <IonInput value={event.location ?? ''} onIonChange={(e) => setEvent((p) => ({ ...p, location: e.detail.value! }))} disabled={!canEdit} placeholder="Optional location" />
        </IonItem>
        <IonItem>
          <IonLabel position="stacked">Description</IonLabel>
          <IonTextarea value={event.description ?? ''} onIonChange={(e) => setEvent((p) => ({ ...p, description: e.detail.value! }))} disabled={!canEdit} rows={4} placeholder="Optional description" />
        </IonItem>
        {event.is_recurring && event.recurrence_rule && (
          <IonItem>
            <IonLabel>Recurrence</IonLabel>
            <IonText slot="end" color="medium" style={{ fontSize: 13 }}>{event.recurrence_rule}</IonText>
          </IonItem>
        )}
      </IonContent>

      <IonAlert
        isOpen={showDelete}
        header="Delete Event"
        message="Are you sure? This cannot be undone."
        buttons={[
          { text: 'Cancel', role: 'cancel', handler: () => setShowDelete(false) },
          { text: 'Delete', role: 'destructive', handler: handleDelete },
        ]}
        onDidDismiss={() => setShowDelete(false)}
      />

      {/* Notify members sheet — shown after saving a new event */}
      {notifyMembers !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', zIndex: 1000 }}>
          <div style={{ width: '100%', background: '#fff', borderRadius: '16px 16px 0 0', padding: '20px 16px 36px', boxShadow: '0 -4px 20px rgba(0,0,0,0.15)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1f36', marginBottom: 4 }}>Notify family members</div>
            <div style={{ fontSize: 13, color: '#5f6368', marginBottom: 16 }}>Event saved. Who should be notified?</div>

            {notifyMembers.length === 0 ? (
              <div style={{ fontSize: 14, color: '#8792a2', textAlign: 'center', padding: '12px 0 16px' }}>No other members in this group.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {notifyMembers.map((m) => (
                  <label key={m.user_id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                    background: notifySelected.has(m.user_id) ? '#f0f4ff' : '#f8f9fa',
                    border: `1px solid ${notifySelected.has(m.user_id) ? '#c5d5f9' : '#e3e8ef'}`,
                  }}>
                    <input type="checkbox" checked={notifySelected.has(m.user_id)}
                      onChange={() => setNotifySelected((prev) => { const n = new Set(prev); n.has(m.user_id) ? n.delete(m.user_id) : n.add(m.user_id); return n })}
                      style={{ width: 18, height: 18, accentColor: '#1a73e8' }} />
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 500, color: '#1a1f36' }}>{m.name}</span>
                  </label>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => history.goBack()} style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid #dadce0', background: '#fff', fontSize: 14, fontWeight: 600, color: '#5f6368', cursor: 'pointer' }}>
                Skip
              </button>
              <button onClick={handleNotify} disabled={notifySending} style={{ flex: 2, padding: '12px 0', borderRadius: 10, border: 'none', background: notifySelected.size > 0 ? '#1a73e8' : '#e3e8ef', color: notifySelected.size > 0 ? '#fff' : '#8792a2', fontSize: 14, fontWeight: 600, cursor: notifySelected.size > 0 ? 'pointer' : 'default' }}>
                {notifySending ? 'Sending…' : `Notify ${notifySelected.size > 0 ? notifySelected.size : ''} member${notifySelected.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </IonPage>
  )
}
