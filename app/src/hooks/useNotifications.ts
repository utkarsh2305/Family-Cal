import { useEffect } from 'react'
import { useIonToast } from '@ionic/react'
import { registerPushNotifications, listenForPushNotifications } from '../lib/notifications'

export function useNotifications(
  userId: string | null,
  onNotificationTap?: (eventId: string) => void,
): void {
  const [presentToast] = useIonToast()

  useEffect(() => {
    if (!userId) return

    registerPushNotifications(userId, onNotificationTap)

    listenForPushNotifications((title, body) => {
      presentToast({
        message: body || title,
        duration: 4000,
        position: 'top',
        color: 'primary',
        buttons: [{ text: 'Dismiss', role: 'cancel' }],
      })
    })
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps
}
