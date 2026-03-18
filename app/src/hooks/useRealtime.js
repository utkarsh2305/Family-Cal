import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
/**
 * Subscribes to real-time changes on calendar_events for all given groups.
 * One channel per group. Automatically unsubscribes on unmount or groupIds change.
 */
export function useRealtimeEvents(groupIds, onChange) {
    const key = groupIds.join(',');
    useEffect(() => {
        if (groupIds.length === 0)
            return;
        const channels = groupIds.map((groupId) => supabase
            .channel(`group-events:${groupId}`)
            .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'calendar_events',
            filter: `group_id=eq.${groupId}`,
        }, (payload) => {
            onChange(payload.eventType, (payload.new ?? payload.old));
        })
            .subscribe());
        return () => { channels.forEach((ch) => supabase.removeChannel(ch)); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, onChange]);
}
