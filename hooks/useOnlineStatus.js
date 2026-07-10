// hooks/useOnlineStatus.js
import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

export function useOnlineStatus() {
  const intervalRef = useRef(null);

  const updateLastSeen = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', user.id);
      }
    } catch (error) {
      console.error('Ошибка обновления last_seen:', error);
    }
  };

  useEffect(() => {
    // Обновляем сразу при входе
    updateLastSeen();
    
    // Обновляем каждые 10 секунд
    intervalRef.current = setInterval(updateLastSeen, 10000);

    // При размонтировании (уход со страницы) обновляем last_seen
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      // Обновляем при выходе
      updateLastSeen();
    };
  }, []);
}