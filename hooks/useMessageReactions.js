// hooks/useMessageReactions.js
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useMessageReactions(messageIds) {
  const [reactions, setReactions] = useState({});

  useEffect(() => {
    if (!messageIds || messageIds.length === 0) return;

    // 1. Загружаем существующие реакции
    const fetchReactions = async () => {
      const { data } = await supabase
        .from('message_reactions')
        .select('*, profiles(username)')
        .in('message_id', messageIds);

      if (data) {
        const grouped = {};
        data.forEach(r => {
          if (!grouped[r.message_id]) grouped[r.message_id] = [];
          grouped[r.message_id].push(r);
        });
        setReactions(grouped);
      }
    };

    fetchReactions();

    // 2. Подписываемся на изменения (INSERT и DELETE)
    const channel = supabase
      .channel('reactions_channel')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'message_reactions' }, 
        (payload) => {
          // Перезагружаем реакции при любом изменении (для простоты)
          fetchReactions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [messageIds]);

  // Функция добавления/удаления реакции
  const toggleReaction = async (messageId, emoji, currentUserId) => {
    const existing = reactions[messageId]?.find(
      r => r.user_id === currentUserId && r.emoji === emoji
    );

    if (existing) {
      // Если реакция уже стоит - удаляем её
      await supabase.from('message_reactions').delete().eq('id', existing.id);
    } else {
      // Если не стоит - добавляем
      await supabase.from('message_reactions').insert({
        message_id: messageId,
        user_id: currentUserId,
        emoji: emoji,
      });
    }
  };

  return { reactions, toggleReaction };
}