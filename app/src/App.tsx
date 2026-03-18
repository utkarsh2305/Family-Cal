import { useEffect, useState } from 'react'
import {
  IonApp,
  IonRouterOutlet,
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
} from '@ionic/react'
import { IonReactRouter } from '@ionic/react-router'
import { Route, Redirect } from 'react-router-dom'
import { createBrowserHistory } from 'history'
import { calendarOutline, peopleOutline, settingsOutline } from 'ionicons/icons'
import type { Session } from '@supabase/supabase-js'
import { App as CapApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'

import { supabase } from './lib/supabase'
import { useNotifications } from './hooks/useNotifications'

import AuthPage from './pages/Auth'
import CalendarPage from './pages/Calendar'
import EventDetailPage from './pages/EventDetail'
import FamilyMembersPage from './pages/FamilyMembers'
import OnboardingPage from './pages/Onboarding'
import SettingsPage from './pages/Settings'

// Module-level history so push notification taps can navigate before hooks are ready
const appHistory = createBrowserHistory()

// Handle OAuth deep link callback — implicit flow returns #access_token=...
CapApp.addListener('appUrlOpen', async ({ url }) => {
  if (!url.startsWith('com.familycal.app://')) return
  const hash = url.split('#')[1] ?? ''
  const params = new URLSearchParams(hash)
  const accessToken  = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (accessToken && refreshToken) {
    await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
  }
  await Browser.close()
})

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  useNotifications(
    session?.user.id ?? null,
    (eventId) => appHistory.push(`/calendar/${eventId}`),
  )

  if (session === undefined) return null

  if (!session) {
    return (
      <IonApp>
        <IonReactRouter history={appHistory}>
          <IonRouterOutlet>
            <Route exact path="/auth" component={AuthPage} />
            <Redirect to="/auth" />
          </IonRouterOutlet>
        </IonReactRouter>
      </IonApp>
    )
  }

  return (
    <IonApp>
      <IonReactRouter history={appHistory}>
        <IonTabs>
          <IonRouterOutlet>
            <Route exact path="/onboarding"          component={OnboardingPage} />
            <Route exact path="/calendar"            component={CalendarPage} />
            <Route exact path="/calendar/:eventId"   component={EventDetailPage} />
            <Route exact path="/family"              component={FamilyMembersPage} />
            <Route exact path="/settings"            component={SettingsPage} />
            <Redirect exact from="/" to="/calendar" />
          </IonRouterOutlet>

          <IonTabBar slot="bottom">
            <IonTabButton tab="calendar" href="/calendar">
              <IonIcon icon={calendarOutline} />
              <IonLabel>Calendar</IonLabel>
            </IonTabButton>
            <IonTabButton tab="family" href="/family">
              <IonIcon icon={peopleOutline} />
              <IonLabel>Family</IonLabel>
            </IonTabButton>
            <IonTabButton tab="settings" href="/settings">
              <IonIcon icon={settingsOutline} />
              <IonLabel>Settings</IonLabel>
            </IonTabButton>
          </IonTabBar>
        </IonTabs>
      </IonReactRouter>
    </IonApp>
  )
}
