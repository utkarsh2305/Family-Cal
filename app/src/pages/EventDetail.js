import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton, IonButton, IonIcon, IonItem, IonLabel, IonInput, IonTextarea, IonToggle, IonAlert, IonSpinner, IonText, IonSelect, IonSelectOption, } from '@ionic/react';
import { trashOutline, saveOutline } from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { supabase } from '../lib/supabase';
const NOTIFY_URL = import.meta.env?.VITE_NOTIFY_FAMILY_URL;
export default function EventDetailPage() {
    const { eventId } = useParams();
    const history = useHistory();
    const isNew = eventId === 'new';
    const [event, setEvent] = useState({});
    const [memberships, setMemberships] = useState([]);
    const [selectedGroupId, setSelectedGroupId] = useState('');
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [showDelete, setShowDelete] = useState(false);
    const [error, setError] = useState(null);
    // Notify sheet
    const [notifyMembers, setNotifyMembers] = useState(null);
    const [notifySelected, setNotifySelected] = useState(new Set());
    const [notifySending, setNotifySending] = useState(false);
    const [savedEventId, setSavedEventId] = useState(null);
    const activeRole = memberships.find((m) => m.group_id === selectedGroupId)?.role ?? 'viewer';
    const canEdit = activeRole === 'owner' || activeRole === 'editor';
    const canDelete = activeRole === 'owner';
    // Load all memberships
    useEffect(() => {
        supabase.auth.getUser().then(async ({ data: { user } }) => {
            if (!user)
                return;
            const { data: rows } = await supabase
                .from('family_members')
                .select('group_id, role, family_groups(name)')
                .eq('user_id', user.id);
            const parsed = (rows ?? []).map((r) => ({
                group_id: r.group_id,
                role: r.role,
                group_name: r.family_groups?.name ?? 'Family',
            }));
            setMemberships(parsed);
            if (parsed.length > 0 && !selectedGroupId)
                setSelectedGroupId(parsed[0].group_id);
        });
    }, []);
    // Load existing event
    useEffect(() => {
        if (isNew) {
            setLoading(false);
            return;
        }
        supabase.from('calendar_events').select('*').eq('id', eventId).single()
            .then(({ data, error: fetchError }) => {
            if (fetchError)
                setError(fetchError.message);
            else {
                setEvent(data ?? {});
                if (data?.group_id)
                    setSelectedGroupId(data.group_id);
            }
            setLoading(false);
        });
    }, [eventId, isNew]);
    async function handleSave() {
        if (!selectedGroupId)
            return;
        setSaving(true);
        setError(null);
        const { data: { user } } = await supabase.auth.getUser();
        const payload = { ...event, group_id: selectedGroupId, updated_by: user.id };
        if (isNew) {
            const { data: inserted, error: saveError } = await supabase
                .from('calendar_events')
                .insert({ ...payload, created_by: user.id })
                .select('id')
                .single();
            if (saveError) {
                setError(saveError.message);
                setSaving(false);
                return;
            }
            setSaving(false);
            // Fetch members to notify (exclude self)
            const { data: members } = await supabase
                .from('family_members')
                .select('user_id, nickname, color, user_profiles(email)')
                .eq('group_id', selectedGroupId)
                .neq('user_id', user.id);
            const list = (members ?? []).map((m) => ({
                user_id: m.user_id,
                name: m.nickname ?? m.user_profiles?.email?.split('@')[0] ?? 'Member',
                color: m.color ?? '#8792a2',
            }));
            setSavedEventId(inserted.id);
            setNotifyMembers(list);
            setNotifySelected(new Set(list.map((m) => m.user_id)));
        }
        else {
            const { error: saveError } = await supabase
                .from('calendar_events').update(payload).eq('id', eventId);
            if (saveError)
                setError(saveError.message);
            else
                history.goBack();
            setSaving(false);
        }
    }
    async function handleNotify() {
        if (notifySelected.size > 0 && NOTIFY_URL && savedEventId) {
            const { data: { session } } = await supabase.auth.getSession();
            setNotifySending(true);
            await fetch(NOTIFY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
                body: JSON.stringify({ eventId: savedEventId, fromUserId: session?.user.id, targetUserIds: Array.from(notifySelected) }),
            }).catch(() => { });
            setNotifySending(false);
        }
        history.goBack();
    }
    async function handleDelete() {
        const { error: deleteError } = await supabase.from('calendar_events').delete().eq('id', eventId);
        if (deleteError)
            setError(deleteError.message);
        else
            history.replace('/calendar');
    }
    if (loading)
        return _jsx(IonPage, { children: _jsx(IonContent, { className: "ion-text-center ion-padding", children: _jsx(IonSpinner, {}) }) });
    return (_jsxs(IonPage, { children: [_jsx(IonHeader, { children: _jsxs(IonToolbar, { children: [_jsx(IonButtons, { slot: "start", children: _jsx(IonBackButton, { defaultHref: "/calendar" }) }), _jsx(IonTitle, { children: isNew ? 'New Event' : canEdit ? 'Edit Event' : 'Event' }), canEdit && (_jsxs(IonButtons, { slot: "end", children: [!isNew && canDelete && (_jsx(IonButton, { onClick: () => setShowDelete(true), children: _jsx(IonIcon, { icon: trashOutline, color: "danger" }) })), _jsx(IonButton, { onClick: handleSave, disabled: saving, children: saving ? _jsx(IonSpinner, { name: "crescent" }) : _jsx(IonIcon, { icon: saveOutline }) })] }))] }) }), _jsxs(IonContent, { children: [error && _jsx(IonText, { color: "danger", className: "ion-padding", children: _jsx("p", { children: error }) }), isNew && memberships.length > 1 && (_jsxs(IonItem, { children: [_jsx(IonLabel, { children: "Group" }), _jsx(IonSelect, { slot: "end", value: selectedGroupId, onIonChange: (e) => setSelectedGroupId(e.detail.value), interface: "action-sheet", children: memberships.map((m) => (_jsx(IonSelectOption, { value: m.group_id, children: m.group_name }, m.group_id))) })] })), _jsxs(IonItem, { children: [_jsx(IonLabel, { position: "stacked", children: "Title" }), _jsx(IonInput, { value: event.title ?? '', onIonChange: (e) => setEvent((p) => ({ ...p, title: e.detail.value })), disabled: !canEdit, placeholder: "Event title" })] }), _jsxs(IonItem, { children: [_jsx(IonLabel, { position: "stacked", children: "Start" }), _jsx(IonInput, { type: "datetime-local", value: event.start_at ? event.start_at.slice(0, 16) : '', onIonChange: (e) => setEvent((p) => ({ ...p, start_at: new Date(e.detail.value).toISOString() })), disabled: !canEdit })] }), _jsxs(IonItem, { children: [_jsx(IonLabel, { position: "stacked", children: "End" }), _jsx(IonInput, { type: "datetime-local", value: event.end_at ? event.end_at.slice(0, 16) : '', onIonChange: (e) => setEvent((p) => ({ ...p, end_at: new Date(e.detail.value).toISOString() })), disabled: !canEdit })] }), _jsxs(IonItem, { children: [_jsx(IonLabel, { children: "All Day" }), _jsx(IonToggle, { checked: event.is_all_day ?? false, onIonChange: (e) => setEvent((p) => ({ ...p, is_all_day: e.detail.checked })), disabled: !canEdit })] }), _jsxs(IonItem, { children: [_jsx(IonLabel, { position: "stacked", children: "Location" }), _jsx(IonInput, { value: event.location ?? '', onIonChange: (e) => setEvent((p) => ({ ...p, location: e.detail.value })), disabled: !canEdit, placeholder: "Optional location" })] }), _jsxs(IonItem, { children: [_jsx(IonLabel, { position: "stacked", children: "Description" }), _jsx(IonTextarea, { value: event.description ?? '', onIonChange: (e) => setEvent((p) => ({ ...p, description: e.detail.value })), disabled: !canEdit, rows: 4, placeholder: "Optional description" })] }), event.is_recurring && event.recurrence_rule && (_jsxs(IonItem, { children: [_jsx(IonLabel, { children: "Recurrence" }), _jsx(IonText, { slot: "end", color: "medium", style: { fontSize: 13 }, children: event.recurrence_rule })] }))] }), _jsx(IonAlert, { isOpen: showDelete, header: "Delete Event", message: "Are you sure? This cannot be undone.", buttons: [
                    { text: 'Cancel', role: 'cancel', handler: () => setShowDelete(false) },
                    { text: 'Delete', role: 'destructive', handler: handleDelete },
                ], onDidDismiss: () => setShowDelete(false) }), notifyMembers !== null && (_jsx("div", { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', zIndex: 1000 }, children: _jsxs("div", { style: { width: '100%', background: '#fff', borderRadius: '16px 16px 0 0', padding: '20px 16px 36px', boxShadow: '0 -4px 20px rgba(0,0,0,0.15)' }, children: [_jsx("div", { style: { fontSize: 16, fontWeight: 700, color: '#1a1f36', marginBottom: 4 }, children: "Notify family members" }), _jsx("div", { style: { fontSize: 13, color: '#5f6368', marginBottom: 16 }, children: "Event saved. Who should be notified?" }), notifyMembers.length === 0 ? (_jsx("div", { style: { fontSize: 14, color: '#8792a2', textAlign: 'center', padding: '12px 0 16px' }, children: "No other members in this group." })) : (_jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }, children: notifyMembers.map((m) => (_jsxs("label", { style: {
                                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                                    background: notifySelected.has(m.user_id) ? '#f0f4ff' : '#f8f9fa',
                                    border: `1px solid ${notifySelected.has(m.user_id) ? '#c5d5f9' : '#e3e8ef'}`,
                                }, children: [_jsx("input", { type: "checkbox", checked: notifySelected.has(m.user_id), onChange: () => setNotifySelected((prev) => { const n = new Set(prev); n.has(m.user_id) ? n.delete(m.user_id) : n.add(m.user_id); return n; }), style: { width: 18, height: 18, accentColor: '#1a73e8' } }), _jsx("div", { style: { width: 10, height: 10, borderRadius: '50%', background: m.color, flexShrink: 0 } }), _jsx("span", { style: { fontSize: 14, fontWeight: 500, color: '#1a1f36' }, children: m.name })] }, m.user_id))) })), _jsxs("div", { style: { display: 'flex', gap: 10 }, children: [_jsx("button", { onClick: () => history.goBack(), style: { flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid #dadce0', background: '#fff', fontSize: 14, fontWeight: 600, color: '#5f6368', cursor: 'pointer' }, children: "Skip" }), _jsx("button", { onClick: handleNotify, disabled: notifySending, style: { flex: 2, padding: '12px 0', borderRadius: 10, border: 'none', background: notifySelected.size > 0 ? '#1a73e8' : '#e3e8ef', color: notifySelected.size > 0 ? '#fff' : '#8792a2', fontSize: 14, fontWeight: 600, cursor: notifySelected.size > 0 ? 'pointer' : 'default' }, children: notifySending ? 'Sending…' : `Notify ${notifySelected.size > 0 ? notifySelected.size : ''} member${notifySelected.size !== 1 ? 's' : ''}` })] })] }) }))] }));
}
