import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonButton, IonText, IonSelect, IonSelectOption, IonInput, IonAlert, IonSpinner, } from '@ionic/react';
import { supabase } from '../lib/supabase';
const GCAL_CONNECTING_KEY = 'gcal_connecting';
export default function SettingsPage() {
    const [googleConnected, setGoogleConnected] = useState(false);
    const [icloudConnected, setIcloudConnected] = useState(false);
    const [icloudAppleId, setIcloudAppleId] = useState(null);
    const [aiProvider, setAiProvider] = useState('platform');
    const [aiApiKey, setAiApiKey] = useState('');
    const [aiSaving, setAiSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [icloudLoading, setIcloudLoading] = useState(false);
    const [showIcloudAlert, setShowIcloudAlert] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        // Check if we just returned from Google Calendar OAuth redirect
        if (localStorage.getItem(GCAL_CONNECTING_KEY)) {
            handleGoogleOAuthReturn();
        }
        else {
            loadSettings();
        }
    }, []);
    async function loadSettings() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user)
            return;
        const [{ data: connections }, { data: aiSettings }] = await Promise.all([
            supabase.from('user_calendar_connections').select('provider, sync_enabled, calendar_id').eq('user_id', user.id),
            supabase.from('user_ai_settings').select('provider, api_key_encrypted').eq('user_id', user.id).single(),
        ]);
        setGoogleConnected(connections?.some((c) => c.provider === 'google') ?? false);
        const icloud = connections?.find((c) => c.provider === 'icloud');
        setIcloudConnected(!!icloud);
        setIcloudAppleId(icloud?.calendar_id ?? null);
        setAiProvider(aiSettings?.provider ?? 'platform');
        setAiApiKey(aiSettings?.api_key_encrypted ?? '');
        setLoading(false);
    }
    async function handleAiSave() {
        setAiSaving(true);
        setError(null);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { error: upsertError } = await supabase.from('user_ai_settings').upsert({
                user_id: user.id,
                provider: aiProvider,
                api_key_encrypted: aiProvider === 'platform' ? null : aiApiKey || null,
            }, { onConflict: 'user_id' });
            if (upsertError)
                setError(upsertError.message);
        }
        setAiSaving(false);
    }
    async function handleGoogleOAuthReturn() {
        localStorage.removeItem(GCAL_CONNECTING_KEY);
        setGoogleLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const { data: { user } } = await supabase.auth.getUser();
            if (session?.provider_token && user) {
                const { error: upsertError } = await supabase.from('user_calendar_connections').upsert({
                    user_id: user.id,
                    provider: 'google',
                    calendar_id: 'primary',
                    access_token: session.provider_token,
                    refresh_token: session.provider_refresh_token ?? null,
                    sync_enabled: true,
                }, { onConflict: 'user_id,provider' });
                if (upsertError)
                    setError(upsertError.message);
            }
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Google Calendar connection failed.');
        }
        await loadSettings();
        setGoogleLoading(false);
    }
    async function handleGoogleConnect() {
        setGoogleLoading(true);
        setError(null);
        localStorage.setItem(GCAL_CONNECTING_KEY, '1');
        const { error: authError } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                scopes: 'openid email profile https://www.googleapis.com/auth/calendar.events',
                queryParams: { access_type: 'offline', prompt: 'consent' },
                redirectTo: window.location.origin + '/settings',
            },
        });
        if (authError) {
            localStorage.removeItem(GCAL_CONNECTING_KEY);
            setError(authError.message);
            setGoogleLoading(false);
        }
        // No error: browser redirects away; spinner stays intentionally
    }
    async function handleGoogleDisconnect() {
        setGoogleLoading(true);
        setError(null);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { error: deleteError } = await supabase.from('user_calendar_connections')
                .delete().eq('user_id', user.id).eq('provider', 'google');
            if (deleteError)
                setError(deleteError.message);
        }
        await loadSettings();
        setGoogleLoading(false);
    }
    async function handleIcloudConnect(appleId, appPassword) {
        if (!appleId.trim() || !appPassword.trim()) {
            setError('Apple ID and App-Specific Password are required.');
            return;
        }
        setIcloudLoading(true);
        setError(null);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { error: upsertError } = await supabase.from('user_calendar_connections').upsert({
                user_id: user.id,
                provider: 'icloud',
                calendar_id: appleId.trim(),
                access_token: appPassword.trim(),
                sync_enabled: true,
            }, { onConflict: 'user_id,provider' });
            if (upsertError)
                setError(upsertError.message);
        }
        await loadSettings();
        setIcloudLoading(false);
    }
    async function handleIcloudDisconnect() {
        setIcloudLoading(true);
        setError(null);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { error: deleteError } = await supabase.from('user_calendar_connections')
                .delete().eq('user_id', user.id).eq('provider', 'icloud');
            if (deleteError)
                setError(deleteError.message);
        }
        await loadSettings();
        setIcloudLoading(false);
    }
    async function handleSignOut() {
        await supabase.auth.signOut();
    }
    if (loading) {
        return (_jsx(IonPage, { children: _jsx(IonContent, { className: "ion-text-center ion-padding", children: _jsx(IonSpinner, {}) }) }));
    }
    return (_jsxs(IonPage, { children: [_jsx(IonHeader, { children: _jsx(IonToolbar, { children: _jsx(IonTitle, { children: "Settings" }) }) }), _jsxs(IonContent, { children: [error && (_jsx(IonText, { color: "danger", children: _jsx("p", { style: { fontSize: 14, margin: '12px 16px 0' }, children: error }) })), _jsxs(IonList, { inset: true, children: [_jsxs(IonItem, { children: [_jsxs(IonLabel, { children: [_jsx("h2", { children: "Google Calendar" }), _jsx("p", { children: googleConnected ? 'Connected — bidirectional sync enabled' : 'Not connected' })] }), _jsx(IonButton, { slot: "end", fill: "outline", size: "small", color: googleConnected ? 'danger' : 'primary', disabled: googleLoading, onClick: googleConnected ? handleGoogleDisconnect : handleGoogleConnect, children: googleLoading
                                            ? _jsx(IonSpinner, { name: "dots", style: { width: 16, height: 16 } })
                                            : googleConnected ? 'Disconnect' : 'Connect' })] }), _jsxs(IonItem, { children: [_jsxs(IonLabel, { children: [_jsx("h2", { children: "iCloud Calendar" }), _jsx("p", { children: icloudConnected
                                                    ? `Connected (${icloudAppleId}) — polling every 10 min`
                                                    : 'Not connected' })] }), _jsx(IonButton, { slot: "end", fill: "outline", size: "small", color: icloudConnected ? 'danger' : 'primary', disabled: icloudLoading, onClick: icloudConnected ? handleIcloudDisconnect : () => setShowIcloudAlert(true), children: icloudLoading
                                            ? _jsx(IonSpinner, { name: "dots", style: { width: 16, height: 16 } })
                                            : icloudConnected ? 'Disconnect' : 'Connect' })] })] }), _jsxs(IonList, { inset: true, children: [_jsxs(IonItem, { children: [_jsx(IonLabel, { children: "AI Provider" }), _jsxs(IonSelect, { slot: "end", value: aiProvider, onIonChange: (e) => setAiProvider(e.detail.value), interface: "action-sheet", children: [_jsx(IonSelectOption, { value: "platform", children: "Platform (default)" }), _jsx(IonSelectOption, { value: "openai", children: "OpenAI" }), _jsx(IonSelectOption, { value: "gemini", children: "Gemini" }), _jsx(IonSelectOption, { value: "claude", children: "Claude" }), _jsx(IonSelectOption, { value: "grok", children: "Grok" })] })] }), aiProvider !== 'platform' && (_jsxs(IonItem, { children: [_jsx(IonLabel, { position: "stacked", children: "API Key" }), _jsx(IonInput, { value: aiApiKey, onIonChange: (e) => setAiApiKey(e.detail.value ?? ''), type: "password", placeholder: "sk-...", clearInput: true })] })), _jsx(IonItem, { children: _jsx(IonButton, { expand: "block", fill: "clear", disabled: aiSaving, onClick: handleAiSave, children: aiSaving ? _jsx(IonSpinner, { name: "dots", style: { width: 16, height: 16 } }) : 'Save AI Settings' }) })] }), _jsx(IonList, { inset: true, children: _jsx(IonItem, { button: true, onClick: handleSignOut, color: "danger", children: _jsx(IonLabel, { children: "Sign Out" }) }) }), _jsx(IonAlert, { isOpen: showIcloudAlert, header: "Connect iCloud Calendar", subHeader: "Use an App-Specific Password, not your Apple ID password.", message: "Generate one at appleid.apple.com \u2192 Sign-In and Security \u2192 App-Specific Passwords.", inputs: [
                            { name: 'appleId', type: 'email', placeholder: 'Apple ID (email)' },
                            { name: 'appPassword', type: 'password', placeholder: 'App-Specific Password' },
                        ], buttons: [
                            { text: 'Cancel', role: 'cancel', handler: () => setShowIcloudAlert(false) },
                            {
                                text: 'Connect',
                                handler: (data) => {
                                    setShowIcloudAlert(false);
                                    handleIcloudConnect(data.appleId ?? '', data.appPassword ?? '');
                                },
                            },
                        ], onDidDismiss: () => setShowIcloudAlert(false) })] })] }));
}
