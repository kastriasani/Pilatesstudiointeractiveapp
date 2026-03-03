import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Subscribes to Postgres changes on the `reservations` table.
 * On any INSERT/UPDATE/DELETE, debounces 1.5 s then calls `onRefresh`.
 *
 * Usage:
 *   useRealtimeAvailability(() => fetchData());
 */
export function useRealtimeAvailability(onRefresh: () => void) {
  const callbackRef = useRef(onRefresh);
  callbackRef.current = onRefresh;

  useEffect(() => {
    const channelName = `availability-${Math.random().toString(36).slice(2, 8)}`;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservations' },
        () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            callbackRef.current();
          }, 1500);
        }
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, []);
}
