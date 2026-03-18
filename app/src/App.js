import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { IonApp, IonRouterOutlet, IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Route, Redirect } from 'react-router-dom';
import { createBrowserHistory } from 'history';
import { calendarOutline, peopleOutline, settingsOutline } from 'ionicons/icons';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { supabase } from './lib/supabase';
import { useNotifications } from './hooks/useNotifications';
import AuthPage from './pages/Auth';
import CalendarPage from './pages/Calendar';
import EventDetailPage from './pages/EventDetail';
import FamilyMembersPage from './pages/FamilyMembers';
import OnboardingPage from './pages/Onboarding';
import SettingsPage from './pages/Settings';
// Module-level history so push notification taps can navigate before hooks are ready
const appHistory = createBrowserHistory();
// Handle OAuth deep link callback — implicit flow returns #access_token=...
CapApp.addListener('appUrlOpen', async ({ url }) => {
    if (!url.startsWith('com.familycal.app://'))
        return;
    const hash = url.split('#')[1] ?? '';
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    }
    await Browser.close();
});
export default function App() {
    const [session, setSession] = useState(undefined);
    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => setSession(data.session));
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
        return () => subscription.unsubscribe();
    }, []);
    useNotifications(session?.user.id ?? null, (eventId) => appHistory.push(`/calendar/${eventId}`));
    if (session === undefined)
        return null;
    if (!session) {
        return (_jsx(IonApp, { children: _jsx(IonReactRouter, { history: appHistory, children: _jsxs(IonRouterOutlet, { children: [_jsx(Route, { exact: true, path: "/auth", component: AuthPage }), _jsx(Redirect, { to: "/auth" })] }) }) }));
    }
    return (_jsx(IonApp, { children: _jsx(IonReactRouter, { history: appHistory, children: _jsxs(IonTabs, { children: [_jsxs(IonRouterOutlet, { children: [_jsx(Route, { exact: true, path: "/onboarding", component: OnboardingPage }), _jsx(Route, { exact: true, path: "/calendar", component: CalendarPage }), _jsx(Route, { exact: true, path: "/calendar/:eventId", component: EventDetailPage }), _jsx(Route, { exact: true, path: "/family", component: FamilyMembersPage }), _jsx(Route, { exact: true, path: "/settings", component: SettingsPage }), _jsx(Redirect, { exact: true, from: "/", to: "/calendar" })] }), _jsxs(IonTabBar, { slot: "bottom", children: [_jsxs(IonTabButton, { tab: "calendar", href: "/calendar", children: [_jsx(IonIcon, { icon: calendarOutline }), _jsx(IonLabel, { children: "Calendar" })] }), _jsxs(IonTabButton, { tab: "family", href: "/family", children: [_jsx(IonIcon, { icon: peopleOutline }), _jsx(IonLabel, { children: "Family" })] }), _jsxs(IonTabButton, { tab: "settings", href: "/settings", children: [_jsx(IonIcon, { icon: settingsOutline }), _jsx(IonLabel, { children: "Settings" })] })] })] }) }) }));
}
