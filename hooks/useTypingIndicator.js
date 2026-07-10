// hooks/useTypingIndicator.js
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export const useTypingIndicator = (chatId, userId) => {
  const [typingUsers, setTypingUsers] = useState([]);

  useEffect(() => {
    if (!chatId || !userId) return;

    // Загружаем текущих пользователей, которые печатают
    loadTypingUsers();

    // Подписываемся на обновления
    const channel = supabase
      .channel(`typing:${chatId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'typing_indicators',
          filter: `chat_id=eq.${chatId}`,
        },
        () => {
          loadTypingUsers();
        }
      )
      .subscribe();

    // Очищаем старые записи (старше 5 секунд)
    const cleanupInterval = setInterval(async () => {
      const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();
      await supabase
        .from('typing_indicators')
        .delete()
        .lt('updated_at', fiveSecondsAgo);
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(cleanupInterval);
      // Удаляем свой индикатор при размонтировании
      supabase
        .from('typing_indicators')
        .delete()
        .eq('chat_id', chatId)
        .eq('user_id', userId);
    };
  }, [chatId, userId]);

  const loadTypingUsers = async () => {
    if (!chatId) return;

    try {
      // 1. Загружаем индикаторы БЕЗ join с profiles
      const { data: typingData } = await supabase
        .from('typing_indicators')
        .select('user_id')
        .eq('chat_id', chatId)
        .eq('is_typing', true)
        .neq('user_id', userId) // Исключаем текущего пользователя
        .gte('updated_at', new Date(Date.now() - 5000).toISOString()); // Только последние 5 секунд

      if (!typingData || typingData.length === 0) {
        setTypingUsers([]);
        return;
      }

      // 2. Получаем уникальные user_id
      const userIds = [...new Set(typingData.map(t => t.user_id))];

      // 3. Загружаем профили отдельно
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds);

      // 4. Создаем мапу профилей
      const profilesMap = {};
      profiles?.forEach(p => {
        profilesMap[p.id] = p;
      });

      // 5. Собираем данные вместе
      const formattedUsers = typingData.map(t => ({
        user_id: t.user_id,
        profiles: profilesMap[t.user_id] || { username: 'Аноним' }
      }));

      setTypingUsers(formattedUsers);
    } catch (error) {
      console.error('Ошибка загрузки индикаторов:', error);
    }
  };

  // Функция для обновления статуса "печатает"
  const setTyping = useCallback(async (isTyping) => {
    if (!chatId || !userId) return;

    try {
      const { error } = await supabase
        .from('typing_indicators')
        .upsert(
          {
            chat_id: chatId,
            user_id: userId,
            is_typing: isTyping,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'chat_id,user_id' }
        );

      if (error) console.error('Ошибка обновления индикатора:', error);
    } catch (error) {
      console.error('Ошибка в setTyping:', error);
    }
  }, [chatId, userId]);

  // Форматируем текст "печатает..."
  const getTypingText = useCallback(() => {
    if (typingUsers.length === 0) return '';

    if (typingUsers.length === 1) {
      return `${typingUsers[0].profiles?.username || 'Кто-то'} печатает...`;
    }

    if (typingUsers.length === 2) {
      const names = typingUsers.map(u => u.profiles?.username || 'Кто-то');
      return `${names[0]} и ${names[1]} печатают...`;
    }

    return `Несколько человек печатают...`;
  }, [typingUsers]);

  return {
    setTyping,
    typingText: getTypingText(),
    typingUsers,
  };
};