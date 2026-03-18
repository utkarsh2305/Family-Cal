import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonFab, IonFabButton, IonIcon, IonList, IonItem, IonLabel, IonBadge, IonSpinner, IonText, IonChip, IonButtons, IonButton, } from '@ionic/react';
import { add } from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { useRealtimeEvents } from '../hooks/useRealtime';
function startOfDay(d) { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; }
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function addMonths(d, n) { const r = new Date(d); r.setMonth(r.getMonth() + n); return r; }
function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isSameMonth(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}
function isToday(d) { return isSameDay(d, new Date()); }
function buildMonthGrid(monthStart) {
    const firstDow = monthStart.getDay();
    const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
    const rows = Math.ceil((firstDow + daysInMonth) / 7);
    const gridStart = addDays(monthStart, -firstDow);
    return Array.from({ length: rows * 7 }, (_, i) => addDays(gridStart, i));
}
const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export default function CalendarPage() {
    const history = useHistory();
    const [memberships, setMemberships] = useState([]);
    const [selectedGroupId, setSelectedGroupId] = useState('all');
    const [groupMap, setGroupMap] = useState(new Map());
    const [memberMap, setMemberMap] = useState(new Map());
    const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
    const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
    const allGroupIds = memberships.map((m) => m.group_id);
    const { events, loading, error } = useCalendarEvents(allGroupIds);
    const [liveEvents, setLiveEvents] = useState([]);
    useEffect(() => { setLiveEvents(events); }, [events]);
    const handleChange = useCallback((type, changed) => {
        setLiveEvents((prev) => {
            if (type === 'DELETE')
                return prev.filter((e) => e.id !== changed.id);
            if (type === 'UPDATE')
                return prev.map((e) => e.id === changed.id ? changed : e);
            return [...prev, changed].sort((a, b) => a.start_at.localeCompare(b.start_at));
        });
    }, []);
    useRealtimeEvents(allGroupIds, handleChange);
    useEffect(() => {
        supabase.auth.getUser().then(async ({ data: { user } }) => {
            if (!user)
                return;
            const { data: rows } = await supabase
                .from('family_members')
                .select('group_id, role, family_groups(name)')
                .eq('user_id', user.id);
            if (!rows || rows.length === 0) {
                history.replace('/onboarding');
                return;
            }
            const parsed = rows.map((r) => ({
                group_id: r.group_id,
                role: r.role,
                group_name: r.family_groups?.name ?? 'Family',
            }));
            setMemberships(parsed);
            const gMap = new Map();
            parsed.forEach((p) => gMap.set(p.group_id, p.group_name));
            setGroupMap(gMap);
            const { data: members } = await supabase
                .from('family_members')
                .select('user_id, nickname, color, user_profiles(email)')
                .in('group_id', parsed.map((p) => p.group_id));
            const map = new Map();
            for (const m of members ?? []) {
                if (!map.has(m.user_id)) {
                    const name = m.nickname ?? m.user_profiles?.email?.split('@')[0] ?? 'Family';
                    map.set(m.user_id, { name, color: m.color ?? '#8792a2' });
                }
            }
            setMemberMap(map);
        });
    }, [history]);
    const ROLE_RANK = { owner: 3, editor: 2, viewer: 1 };
    const activeRole = memberships
        .filter((m) => selectedGroupId === 'all' || m.group_id === selectedGroupId)
        .reduce((best, m) => ROLE_RANK[m.role] > ROLE_RANK[best] ? m.role : best, 'viewer');
    const groupFilteredEvents = selectedGroupId === 'all'
        ? liveEvents
        : liveEvents.filter((e) => e.group_id === selectedGroupId);
    function eventsForDay(day) {
        return groupFilteredEvents.filter((e) => isSameDay(new Date(e.start_at), day));
    }
    function dotsForDay(day) {
        const seen = new Set();
        const colors = [];
        for (const ev of eventsForDay(day)) {
            const c = ev.created_by ? (memberMap.get(ev.created_by)?.color ?? '#8792a2') : '#8792a2';
            if (!seen.has(c)) {
                seen.add(c);
                colors.push(c);
            }
        }
        return colors;
    }
    const monthGrid = buildMonthGrid(viewMonth);
    const agendaEvents = eventsForDay(selectedDate).sort((a, b) => {
        if (a.is_all_day && !b.is_all_day)
            return -1;
        if (!a.is_all_day && b.is_all_day)
            return 1;
        return a.start_at.localeCompare(b.start_at);
    });
    const showGroupChips = memberships.length > 1;
    const monthLabel = viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const selectedDateLabel = selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    return (_jsxs(IonPage, { children: [_jsxs(IonHeader, { children: [_jsxs(IonToolbar, { children: [_jsx(IonButtons, { slot: "start", children: _jsx(IonButton, { onClick: () => setViewMonth((m) => startOfMonth(addMonths(m, -1))), children: "\u2039" }) }), _jsx(IonTitle, { style: { fontSize: 16 }, children: monthLabel }), _jsxs(IonButtons, { slot: "end", children: [!isSameMonth(viewMonth, new Date()) && (_jsx(IonButton, { onClick: () => { setViewMonth(startOfMonth(new Date())); setSelectedDate(startOfDay(new Date())); }, children: "Today" })), _jsx(IonButton, { onClick: () => setViewMonth((m) => startOfMonth(addMonths(m, 1))), children: "\u203A" })] })] }), _jsx(IonToolbar, { style: { '--min-height': '22px' }, children: _jsx("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 10px' }, children: DAY_INITIALS.map((d, i) => (_jsx("div", { style: {
                                    textAlign: 'center', fontSize: 10, fontWeight: 600,
                                    color: i === 0 || i === 6 ? '#ea4335' : '#8792a2',
                                }, children: d }, i))) }) }), _jsx(IonToolbar, { style: { '--min-height': 'auto' }, children: _jsx("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '2px 10px 4px' }, children: monthGrid.map((day, i) => {
                                const inMonth = isSameMonth(day, viewMonth);
                                const today = isToday(day);
                                const selected = isSameDay(day, selectedDate);
                                const dots = dotsForDay(day);
                                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                                return (_jsxs("div", { onClick: () => { setSelectedDate(startOfDay(day)); if (!inMonth)
                                        setViewMonth(startOfMonth(day)); }, style: { display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', padding: '2px 0' }, children: [_jsx("div", { style: {
                                                width: 28, height: 28, borderRadius: '50%',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                background: today ? '#1a73e8' : selected ? '#e8f0fe' : 'transparent',
                                                fontSize: 12, fontWeight: today || selected ? 700 : 400,
                                                color: today ? '#fff' : !inMonth ? '#c5cdd8' : isWeekend ? '#ea4335' : '#1a1f36',
                                            }, children: day.getDate() }), _jsx("div", { style: { display: 'flex', gap: 2, height: 6, alignItems: 'center', marginTop: 1 }, children: dots.slice(0, 3).map((color, j) => (_jsx("div", { style: { width: 4, height: 4, borderRadius: '50%', background: color, opacity: inMonth ? 1 : 0.3 } }, j))) })] }, i));
                            }) }) }), showGroupChips && (_jsx(IonToolbar, { children: _jsxs("div", { style: { display: 'flex', overflowX: 'auto', padding: '4px 8px', gap: 4 }, children: [_jsx(IonChip, { color: selectedGroupId === 'all' ? 'primary' : undefined, outline: selectedGroupId !== 'all', onClick: () => setSelectedGroupId('all'), children: "All" }), memberships.map((m) => (_jsx(IonChip, { color: selectedGroupId === m.group_id ? 'primary' : undefined, outline: selectedGroupId !== m.group_id, onClick: () => setSelectedGroupId(m.group_id), children: m.group_name }, m.group_id)))] }) }))] }), _jsxs(IonContent, { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px 6px', borderBottom: '1px solid #edf0f4' }, children: [_jsx("span", { style: { fontSize: 13, fontWeight: 700, color: '#1a1f36' }, children: selectedDateLabel }), isToday(selectedDate) && (_jsx("span", { style: { fontSize: 10, fontWeight: 700, color: '#1a73e8', background: '#e8f0fe', padding: '2px 7px', borderRadius: 10 }, children: "Today" }))] }), loading && (_jsxs("div", { style: { padding: '16px', display: 'flex', gap: 8, alignItems: 'center', color: '#8792a2', fontSize: 13 }, children: [_jsx(IonSpinner, { name: "dots", style: { width: 16, height: 16 } }), " Loading\u2026"] })), error && _jsx(IonText, { color: "danger", className: "ion-padding", children: _jsx("p", { children: error }) }), !loading && agendaEvents.length === 0 && (_jsx("div", { style: { padding: '32px 16px', textAlign: 'center', color: '#5f6368', fontSize: 13 }, children: "No events scheduled" })), _jsx(IonList, { children: agendaEvents.map((event) => {
                            const creator = event.created_by ? memberMap.get(event.created_by) : undefined;
                            const groupName = showGroupChips && selectedGroupId === 'all' ? (groupMap.get(event.group_id) ?? null) : null;
                            return (_jsxs(IonItem, { button: true, detail: true, onClick: () => history.push(`/calendar/${event.id}`), children: [creator && (_jsx("div", { slot: "start", style: { width: 10, height: 10, borderRadius: '50%', background: creator.color, flexShrink: 0, marginTop: 2 } })), _jsxs(IonLabel, { children: [_jsx("h2", { children: event.title }), _jsxs("p", { children: [event.is_all_day
                                                        ? 'All day'
                                                        : `${new Date(event.start_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} – ${new Date(event.end_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`, event.location ? ` · ${event.location}` : '', creator ? ` · ${creator.name}` : ''] })] }), groupName && _jsx(IonBadge, { slot: "end", color: "medium", children: groupName }), event.is_recurring && _jsx(IonBadge, { slot: "end", color: "primary", children: "\u21BB" })] }, event.id));
                        }) }), activeRole !== 'viewer' && (_jsx(IonFab, { vertical: "bottom", horizontal: "end", slot: "fixed", children: _jsx(IonFabButton, { onClick: () => history.push('/calendar/new'), children: _jsx(IonIcon, { icon: add }) }) }))] })] }));
}
