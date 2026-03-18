import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from './supabase';
export async function registerPushNotifications(userId, onNotificationTap) {
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted')
        return;
    await PushNotifications.register();
    PushNotifications.addListener('registration', async ({ value: fcmToken }) => {
        const platform = window.Capacitor?.getPlatform() === 'ios' ? 'ios' : 'android';
        await supabase.from('push_subscriptions').upsert({ user_id: userId, platform, token: fcmToken }, { onConflict: 'user_id,platform,token' });
    });
    PushNotifications.addListener('registrationError', (err) => {
        console.error('Push registration error:', err);
    });
    // Background/closed tap: navigate to the relevant event
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const eventId = action.notification.data?.eventId;
        if (eventId && onNotificationTap) {
            onNotificationTap(eventId);
        }
    });
}
export function listenForPushNotifications(onNotification) {
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
        onNotification(notification.title ?? '', notification.body ?? '');
    });
}
