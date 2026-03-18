import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { IonPage, IonContent, IonButton, IonText, IonSpinner, } from '@ionic/react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { supabase } from '../lib/supabase';
const DEEP_LINK_REDIRECT = 'com.familycal.app://auth/callback';
export default function AuthPage() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    async function signInWithGoogle() {
        setLoading(true);
        setError(null);
        const isNative = Capacitor.isNativePlatform();
        const redirectTo = isNative ? DEEP_LINK_REDIRECT : window.location.origin;
        const { data, error: authError } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo, skipBrowserRedirect: isNative },
        });
        if (authError) {
            setError(authError.message);
            setLoading(false);
            return;
        }
        if (isNative && data.url)
            await Browser.open({ url: data.url });
        setLoading(false);
    }
    async function signInWithApple() {
        setLoading(true);
        setError(null);
        const isNative = Capacitor.isNativePlatform();
        const { data, error: authError } = await supabase.auth.signInWithOAuth({
            provider: 'apple',
            options: {
                redirectTo: isNative ? DEEP_LINK_REDIRECT : window.location.origin,
                skipBrowserRedirect: isNative,
            },
        });
        if (authError) {
            setError(authError.message);
            setLoading(false);
            return;
        }
        if (isNative && data.url)
            await Browser.open({ url: data.url });
        setLoading(false);
    }
    return (_jsx(IonPage, { children: _jsx(IonContent, { className: "ion-padding", style: { '--background': '#fff' }, children: _jsxs("div", { style: {
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', height: '100%', gap: 16, maxWidth: 320, margin: '0 auto',
                }, children: [_jsx("div", { style: { fontSize: 64, marginBottom: 8 }, children: "\uD83D\uDDD3" }), _jsx("h1", { style: { fontSize: 24, fontWeight: 700, textAlign: 'center', margin: 0 }, children: "Family Calendar" }), _jsx("p", { style: { color: '#5f6368', textAlign: 'center', marginBottom: 24 }, children: "Keep the whole family in sync." }), error && (_jsx(IonText, { color: "danger", children: _jsx("p", { style: { fontSize: 14, textAlign: 'center' }, children: error }) })), loading ? (_jsx(IonSpinner, {})) : (_jsxs(_Fragment, { children: [_jsx(IonButton, { expand: "block", style: { width: '100%' }, onClick: signInWithGoogle, children: "Continue with Google" }), _jsx(IonButton, { expand: "block", fill: "outline", style: { width: '100%' }, onClick: signInWithApple, children: "Continue with Apple" })] }))] }) }) }));
}
