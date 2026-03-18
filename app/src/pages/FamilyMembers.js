import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonBadge, IonButton, IonAlert, IonSpinner, IonText, IonSelect, IonSelectOption, } from '@ionic/react';
import { supabase } from '../lib/supabase';
const ROLE_COLOR = {
    owner: 'primary', editor: 'secondary', viewer: 'medium',
};
function randomCode() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
}
export default function FamilyMembersPage() {
    const [myGroups, setMyGroups] = useState([]);
    const [selectedGroupId, setSelectedGroupId] = useState('');
    const [members, setMembers] = useState([]);
    const [myUserId, setMyUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [membersLoading, setMembersLoading] = useState(false);
    const [generatedCode, setGeneratedCode] = useState(null);
    const [showInviteResult, setShowInviteResult] = useState(false);
    const [showCreateAlert, setShowCreateAlert] = useState(false);
    const [showJoinAlert, setShowJoinAlert] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => { loadGroups(); }, []);
    useEffect(() => {
        if (selectedGroupId)
            loadMembers(selectedGroupId);
    }, [selectedGroupId]);
    async function loadGroups() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            setLoading(false);
            return;
        }
        setMyUserId(user.id);
        const { data: rows } = await supabase
            .from('family_members')
            .select('group_id, role, family_groups(name)')
            .eq('user_id', user.id)
            .order('joined_at', { ascending: true });
        const groups = (rows ?? []).map((r) => ({
            group_id: r.group_id,
            group_name: r.family_groups?.name ?? 'Family',
            role: r.role,
        }));
        setMyGroups(groups);
        if (groups.length > 0)
            setSelectedGroupId(groups[0].group_id);
        setLoading(false);
    }
    async function loadMembers(groupId) {
        setMembersLoading(true);
        const { data } = await supabase
            .from('family_members')
            .select('id, user_id, role, joined_at, nickname, color, user_profiles(email)')
            .eq('group_id', groupId)
            .order('joined_at', { ascending: true });
        setMembers((data ?? []).map((row) => ({
            id: row.id,
            user_id: row.user_id,
            role: row.role,
            joined_at: row.joined_at,
            nickname: row.nickname ?? null,
            color: row.color ?? null,
            email: row.user_profiles?.email ?? undefined,
        })));
        setMembersLoading(false);
    }
    const myRole = myGroups.find((g) => g.group_id === selectedGroupId)?.role ?? 'viewer';
    async function handleRoleChange(memberId, newRole) {
        const { error: updateError } = await supabase.from('family_members').update({ role: newRole }).eq('id', memberId);
        if (updateError)
            setError(updateError.message);
        else
            loadMembers(selectedGroupId);
    }
    async function handleRemove(memberId) {
        const { error: removeError } = await supabase.from('family_members').delete().eq('id', memberId);
        if (removeError)
            setError(removeError.message);
        else
            loadMembers(selectedGroupId);
    }
    async function handleGenerateInvite() {
        if (!selectedGroupId)
            return;
        setError(null);
        const code = randomCode();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const { error: insertError } = await supabase.from('family_invites').insert({
            group_id: selectedGroupId, code, expires_at: expiresAt, max_uses: 1, created_by: myUserId,
        });
        if (insertError) {
            setError(insertError.message);
            return;
        }
        setGeneratedCode(code);
        setShowInviteResult(true);
    }
    async function handleCreateGroup(name) {
        if (!name.trim())
            return;
        setError(null);
        const { error: rpcError } = await supabase.rpc('create_family_group', { group_name: name.trim() });
        if (rpcError) {
            setError(rpcError.message);
            return;
        }
        await loadGroups();
    }
    async function handleJoinGroup(code) {
        if (!code.trim())
            return;
        setError(null);
        const { error: rpcError } = await supabase.rpc('join_family_group_by_code', { invite_code: code.trim().toUpperCase() });
        if (rpcError) {
            setError(rpcError.message);
            return;
        }
        await loadGroups();
    }
    function copyCode() {
        if (generatedCode)
            navigator.clipboard.writeText(generatedCode).catch(() => { });
    }
    function displayName(m) {
        return m.nickname ?? m.email?.split('@')[0] ?? m.user_id.slice(0, 8);
    }
    if (loading)
        return _jsx(IonPage, { children: _jsx(IonContent, { className: "ion-text-center ion-padding", children: _jsx(IonSpinner, {}) }) });
    return (_jsxs(IonPage, { children: [_jsxs(IonHeader, { children: [_jsxs(IonToolbar, { children: [_jsx(IonTitle, { children: "Family" }), _jsx(IonButton, { slot: "end", fill: "clear", size: "small", onClick: () => setShowCreateAlert(true), children: "New Group" }), _jsx(IonButton, { slot: "end", fill: "clear", size: "small", onClick: () => setShowJoinAlert(true), children: "Join" })] }), myGroups.length > 1 && (_jsx(IonToolbar, { children: _jsx("div", { style: { display: 'flex', overflowX: 'auto', padding: '4px 8px', gap: 6 }, children: myGroups.map((g) => (_jsx("div", { onClick: () => setSelectedGroupId(g.group_id), style: {
                                    padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                                    fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                                    background: selectedGroupId === g.group_id ? 'var(--ion-color-primary)' : 'transparent',
                                    color: selectedGroupId === g.group_id ? '#fff' : 'var(--ion-color-medium)',
                                    border: `1px solid ${selectedGroupId === g.group_id ? 'var(--ion-color-primary)' : 'var(--ion-color-medium)'}`,
                                }, children: g.group_name }, g.group_id))) }) }))] }), _jsxs(IonContent, { children: [error && _jsx(IonText, { color: "danger", className: "ion-padding", children: _jsx("p", { children: error }) }), myGroups.length === 0 ? (_jsxs("div", { style: { padding: '48px 16px', textAlign: 'center', color: '#5f6368' }, children: [_jsx("p", { children: "You're not in any group yet." }), _jsx(IonButton, { onClick: () => setShowCreateAlert(true), children: "Create a Group" }), _jsx(IonButton, { fill: "outline", onClick: () => setShowJoinAlert(true), children: "Join with Code" })] })) : (_jsxs(_Fragment, { children: [myRole === 'owner' && members.length < 8 && (_jsx("div", { style: { padding: '12px 16px 0' }, children: _jsx(IonButton, { expand: "block", fill: "outline", onClick: handleGenerateInvite, children: "Generate Invite Code" }) })), membersLoading ? (_jsx("div", { style: { padding: 20, textAlign: 'center' }, children: _jsx(IonSpinner, {}) })) : (_jsx(IonList, { style: { marginTop: 8 }, children: members.map((member) => (_jsxs(IonItem, { children: [_jsx("div", { slot: "start", style: {
                                                width: 12, height: 12, borderRadius: '50%',
                                                background: member.color ?? '#8792a2', flexShrink: 0,
                                            } }), _jsxs(IonLabel, { children: [_jsx("h2", { children: member.user_id === myUserId ? `${displayName(member)} (you)` : displayName(member) }), _jsxs("p", { children: ["Joined ", new Date(member.joined_at).toLocaleDateString()] })] }), myRole === 'owner' && member.user_id !== myUserId ? (_jsxs(_Fragment, { children: [_jsxs(IonSelect, { value: member.role, onIonChange: (e) => handleRoleChange(member.id, e.detail.value), interface: "action-sheet", slot: "end", children: [_jsx(IonSelectOption, { value: "editor", children: "Editor" }), _jsx(IonSelectOption, { value: "viewer", children: "Viewer" })] }), _jsx(IonButton, { slot: "end", fill: "clear", color: "danger", size: "small", onClick: () => handleRemove(member.id), children: "Remove" })] })) : (_jsx(IonBadge, { slot: "end", color: ROLE_COLOR[member.role], children: member.role }))] }, member.id))) }))] })), _jsx(IonAlert, { isOpen: showInviteResult, header: "Invite Code", message: `Share this code. It expires in 7 days and can only be used once.\n\n${generatedCode ?? ''}`, buttons: [
                            { text: 'Copy', handler: copyCode },
                            { text: 'Done', role: 'cancel', handler: () => setShowInviteResult(false) },
                        ], onDidDismiss: () => setShowInviteResult(false) }), _jsx(IonAlert, { isOpen: showCreateAlert, header: "Create New Group", inputs: [{ name: 'name', type: 'text', placeholder: 'e.g. The Smiths' }], buttons: [
                            { text: 'Cancel', role: 'cancel', handler: () => setShowCreateAlert(false) },
                            { text: 'Create', handler: (data) => { setShowCreateAlert(false); handleCreateGroup(data.name ?? ''); } },
                        ], onDidDismiss: () => setShowCreateAlert(false) }), _jsx(IonAlert, { isOpen: showJoinAlert, header: "Join a Group", subHeader: "Enter the 8-character invite code", inputs: [{ name: 'code', type: 'text', placeholder: 'XXXXXXXX', attributes: { maxlength: 8 } }], buttons: [
                            { text: 'Cancel', role: 'cancel', handler: () => setShowJoinAlert(false) },
                            { text: 'Join', handler: (data) => { setShowJoinAlert(false); handleJoinGroup(data.code ?? ''); } },
                        ], onDidDismiss: () => setShowJoinAlert(false) })] })] }));
}
