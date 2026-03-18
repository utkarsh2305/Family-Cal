import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { IonPage, IonContent, IonButton, IonInput, IonSpinner, } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { supabase } from '../lib/supabase';
const DEFAULT_COLOR = '#1a73e8';
function memberName(m) {
    return m.nickname ?? m.email?.split('@')[0] ?? '?';
}
export default function OnboardingPage() {
    const history = useHistory();
    const [screen, setScreen] = useState('welcome');
    const [codeInput, setCodeInput] = useState('');
    const [codeLoading, setCodeLoading] = useState(false);
    const [codeError, setCodeError] = useState(null);
    const [preview, setPreview] = useState(null);
    const [joinLoading, setJoinLoading] = useState(false);
    const [joinError, setJoinError] = useState(null);
    const [joinedGroupId, setJoinedGroupId] = useState('');
    const [joinedGroupName, setJoinedGroupName] = useState('');
    const [assignedNickname, setAssignedNickname] = useState('');
    const [assignedColor, setAssignedColor] = useState(DEFAULT_COLOR);
    const [familyName, setFamilyName] = useState('');
    const [createLoading, setCreateLoading] = useState(false);
    const [createError, setCreateError] = useState(null);
    const [createdGroupName, setCreatedGroupName] = useState('');
    // Wait for admin to assign nickname after joining
    useEffect(() => {
        if (screen !== 'join_waiting' || !joinedGroupId)
            return;
        const channel = supabase.channel('onboarding_membership')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'family_members', filter: `group_id=eq.${joinedGroupId}` }, async (payload) => {
            const row = payload.new;
            const { data: { user } } = await supabase.auth.getUser();
            if (row.user_id === user?.id && row.nickname) {
                setAssignedNickname(row.nickname);
                setAssignedColor(row.color ?? DEFAULT_COLOR);
                setScreen('join_named');
            }
        }).subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [screen, joinedGroupId]);
    async function handleCodeContinue() {
        const code = codeInput.trim();
        if (!code) {
            setCodeError('Please enter your invite code.');
            return;
        }
        setCodeLoading(true);
        setCodeError(null);
        const { data, error } = await supabase.rpc('preview_family_by_code', { invite_code: code });
        setCodeLoading(false);
        if (error) {
            setCodeError(error.message);
            return;
        }
        if (data?.error === 'invalid_or_expired') {
            setCodeError('Code not found or expired. Check the code and try again.');
            return;
        }
        setPreview(data);
        setScreen('join_preview');
    }
    async function handleJoinFamily() {
        if (!preview)
            return;
        setJoinLoading(true);
        setJoinError(null);
        const { data, error } = await supabase.rpc('join_family_group_by_code', { invite_code: codeInput.trim() });
        setJoinLoading(false);
        if (error) {
            setJoinError(error.message);
            return;
        }
        if (data?.error === 'invalid_or_expired') {
            setJoinError('This code is no longer valid.');
            return;
        }
        const gid = data?.error === 'already_member'
            ? (data.group_id ?? preview.family_id)
            : data.group_id;
        setJoinedGroupId(gid);
        setJoinedGroupName(preview.family_name);
        setScreen('join_waiting');
    }
    async function handleCreateFamily() {
        const name = familyName.trim();
        if (!name) {
            setCreateError('Family name is required.');
            return;
        }
        setCreateLoading(true);
        setCreateError(null);
        const { error } = await supabase.rpc('create_family_group', { group_name: name });
        setCreateLoading(false);
        if (error) {
            setCreateError(error.message);
            return;
        }
        setCreatedGroupName(name);
        setScreen('create_done');
    }
    function goToCalendar() { history.replace('/calendar'); }
    return (_jsx(IonPage, { children: _jsx(IonContent, { children: _jsxs("div", { style: styles.outer, children: [screen === 'welcome' && (_jsxs("div", { style: { ...styles.card, alignItems: 'center', textAlign: 'center' }, children: [_jsx("div", { style: styles.iconBox, children: _jsx("svg", { viewBox: "0 0 24 24", width: "32", height: "32", fill: "#fff", children: _jsx("path", { d: "M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z" }) }) }), _jsx("h1", { style: styles.h1, children: "Family Calendar" }), _jsx("p", { style: styles.subtitle, children: "Coordinate your family's schedule in one shared place." }), _jsx(IonButton, { expand: "block", style: styles.btnFull, onClick: () => setScreen('join_code'), children: "I have an invite code" }), _jsx(IonButton, { expand: "block", fill: "outline", style: styles.btnFull, onClick: () => setScreen('create_form'), children: "Create my family" })] })), screen === 'join_code' && (_jsxs("div", { style: styles.card, children: [_jsx(BackButton, { onClick: () => { setCodeError(null); setCodeInput(''); setScreen('welcome'); } }), _jsx("h2", { style: styles.h2, children: "Enter your invite code" }), _jsx("p", { style: styles.bodyText, children: "Your family admin shared an 8-character code with you." }), _jsx(IonInput, { value: codeInput, onIonInput: (e) => setCodeInput(String(e.detail.value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)), placeholder: "e.g. X7K2M9QP", style: styles.codeInput, clearInput: true }), _jsx("p", { style: styles.hint, children: "Letters and numbers, case doesn't matter." }), codeError && _jsx(ErrorMsg, { children: codeError }), _jsxs("div", { style: styles.row, children: [_jsx(IonButton, { fill: "outline", style: { flex: 1 }, onClick: () => { setCodeError(null); setCodeInput(''); setScreen('welcome'); }, children: "Back" }), _jsx(IonButton, { style: { flex: 1 }, disabled: codeLoading || codeInput.length === 0, onClick: handleCodeContinue, children: codeLoading ? _jsx(IonSpinner, { name: "crescent" }) : 'Continue' })] })] })), screen === 'join_preview' && preview && (_jsxs("div", { style: styles.card, children: [_jsx(BackButton, { onClick: () => { setJoinError(null); setScreen('join_code'); } }), _jsx("h2", { style: styles.h2, children: "You're joining:" }), _jsxs("div", { style: styles.familyNameRow, children: [_jsx("svg", { viewBox: "0 0 24 24", width: "16", height: "16", fill: "#5f6368", children: _jsx("path", { d: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" }) }), _jsx("span", { style: { fontWeight: 700, fontSize: 15 }, children: preview.family_name })] }), preview.members.length > 0 && (_jsxs("div", { style: { marginBottom: 14 }, children: [_jsxs("p", { style: styles.sectionLabel, children: ["Current members (", preview.members.length, ")"] }), preview.members.map((m, i) => (_jsxs("div", { style: styles.memberRow, children: [_jsx("div", { style: { ...styles.dot, background: m.color || DEFAULT_COLOR, width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }, children: memberName(m).charAt(0).toUpperCase() }), _jsx("span", { style: { fontSize: 14 }, children: memberName(m) })] }, i)))] })), _jsxs("div", { style: styles.infoBox, children: [_jsx("p", { style: { fontSize: 11, color: '#5f6368', marginBottom: 6 }, children: "After joining you can:" }), ['View the family calendar', 'Coordinate events with family', 'Receive event updates'].map((b) => (_jsxs("div", { style: styles.checkRow, children: [_jsx("svg", { viewBox: "0 0 24 24", width: "12", height: "12", fill: "#1e7e34", children: _jsx("path", { d: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" }) }), _jsx("span", { style: { fontSize: 12 }, children: b })] }, b)))] }), joinError && _jsx(ErrorMsg, { children: joinError }), _jsxs("div", { style: styles.row, children: [_jsx(IonButton, { fill: "outline", style: { flex: 1 }, onClick: () => { setJoinError(null); setScreen('join_code'); }, children: "Back" }), _jsx(IonButton, { style: { flex: 1 }, disabled: joinLoading, onClick: handleJoinFamily, children: joinLoading ? _jsx(IonSpinner, { name: "crescent" }) : 'Join Family' })] })] })), screen === 'join_waiting' && (_jsxs("div", { style: { ...styles.card, alignItems: 'center', textAlign: 'center' }, children: [_jsx("div", { style: { fontSize: 48, marginBottom: 12 }, children: "\u2705" }), _jsxs("h2", { style: styles.h2, children: ["Welcome to ", joinedGroupName, "!"] }), _jsx("p", { style: styles.bodyText, children: "You've joined. The admin will assign your name shortly." }), _jsx("div", { style: { ...styles.infoBox, textAlign: 'left', width: '100%', marginBottom: 16 }, children: ['View the family calendar', 'See other members', 'Receive event updates'].map((b) => (_jsxs("div", { style: styles.checkRow, children: [_jsx("span", { style: { color: '#5f6368' }, children: "\u2022" }), _jsx("span", { style: { fontSize: 12 }, children: b })] }, b))) }), _jsx("p", { style: { fontSize: 12, color: '#5f6368', marginBottom: 16 }, children: "This updates automatically when your name is assigned." }), _jsx(IonButton, { expand: "block", style: styles.btnFull, onClick: goToCalendar, children: "View Calendar \u2192" })] })), screen === 'join_named' && (_jsxs("div", { style: { ...styles.card, alignItems: 'center', textAlign: 'center' }, children: [_jsx("div", { style: { fontSize: 48, marginBottom: 12 }, children: "\uD83C\uDF89" }), _jsx("h2", { style: styles.h2, children: "You're in!" }), _jsx("p", { style: styles.bodyText, children: "Your admin gave you a name:" }), _jsx("div", { style: { ...styles.dot, background: assignedColor, width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 22, fontWeight: 700, margin: '12px auto 6px' }, children: assignedNickname.charAt(0).toUpperCase() }), _jsx("p", { style: { fontSize: 18, fontWeight: 700, marginBottom: 16 }, children: assignedNickname }), _jsx(IonButton, { expand: "block", style: styles.btnFull, onClick: goToCalendar, children: "View Calendar \u2192" })] })), screen === 'create_form' && (_jsxs("div", { style: styles.card, children: [_jsx(BackButton, { onClick: () => { setCreateError(null); setFamilyName(''); setScreen('welcome'); } }), _jsx("h2", { style: styles.h2, children: "Create your family" }), _jsx("p", { style: styles.bodyText, children: "Give your family a name. You'll be the admin." }), _jsxs("div", { style: { marginBottom: 4 }, children: [_jsx("p", { style: styles.sectionLabel, children: "Family name" }), _jsx(IonInput, { value: familyName, onIonInput: (e) => setFamilyName(String(e.detail.value ?? '').slice(0, 50)), placeholder: "Smith Family, The Johnsons\u2026", style: styles.textInput, clearInput: true, autofocus: true })] }), _jsxs("p", { style: { ...styles.hint, textAlign: 'right', marginBottom: 16 }, children: [familyName.length, "/50"] }), createError && _jsx(ErrorMsg, { children: createError }), _jsxs("div", { style: styles.row, children: [_jsx(IonButton, { fill: "outline", style: { flex: 1 }, onClick: () => { setCreateError(null); setFamilyName(''); setScreen('welcome'); }, children: "Back" }), _jsx(IonButton, { style: { flex: 1 }, disabled: createLoading || !familyName.trim(), onClick: handleCreateFamily, children: createLoading ? _jsx(IonSpinner, { name: "crescent" }) : 'Create' })] })] })), screen === 'create_done' && (_jsxs("div", { style: { ...styles.card, alignItems: 'center', textAlign: 'center' }, children: [_jsx("div", { style: { fontSize: 48, marginBottom: 12 }, children: "\uD83C\uDF89" }), _jsx("h2", { style: styles.h2, children: "Family created!" }), _jsxs("div", { style: styles.familyNameRow, children: [_jsx("svg", { viewBox: "0 0 24 24", width: "16", height: "16", fill: "#5f6368", children: _jsx("path", { d: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" }) }), _jsx("span", { style: { fontWeight: 700, fontSize: 15 }, children: createdGroupName })] }), _jsx("p", { style: styles.bodyText, children: "You're the admin. You can:" }), _jsx("div", { style: { ...styles.infoBox, textAlign: 'left', width: '100%', marginBottom: 12 }, children: ['Invite family members', 'Manage members and their names', 'View the family calendar'].map((b) => (_jsxs("div", { style: styles.checkRow, children: [_jsx("svg", { viewBox: "0 0 24 24", width: "12", height: "12", fill: "#1e7e34", children: _jsx("path", { d: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" }) }), _jsx("span", { style: { fontSize: 12 }, children: b })] }, b))) }), _jsx("p", { style: { fontSize: 12, color: '#5f6368', marginBottom: 16 }, children: "Next: open the Family tab to generate an invite code and add your family." }), _jsx(IonButton, { expand: "block", style: styles.btnFull, onClick: goToCalendar, children: "Go to Calendar \u2192" })] }))] }) }) }));
}
function BackButton({ onClick }) {
    return (_jsx("button", { onClick: onClick, style: { background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#5f6368', padding: '0 0 12px 0', fontSize: 14 }, children: _jsx("svg", { viewBox: "0 0 24 24", width: "20", height: "20", fill: "currentColor", children: _jsx("path", { d: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" }) }) }));
}
function ErrorMsg({ children }) {
    return (_jsx("div", { style: { background: '#fce8e6', border: '1px solid #f5c6cb', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#c5221f' }, children: children }));
}
const styles = {
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
    },
    textInput: {
        '--border-radius': '10px', '--padding-start': '12px',
        background: '#f8f9fa', borderRadius: 10, border: '1px solid #e3e8ef',
        marginBottom: 4, width: '100%',
    },
};
