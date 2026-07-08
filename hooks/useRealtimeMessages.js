// hooks/useRealtimeMessages.js
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useRealtimeMessages(chatId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!chatId) return;

    // 1. Загружаем историю сообщений
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*, profiles(username)')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });
      
      setMessages(data || []);
      setLoading(false);
    };

    fetchMessages();

    // 2. Подписываемся на новые сообщения И их обновления
    const channel = supabase
      .channel(`chat:${chatId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT', // Слушаем новые сообщения
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          // Когда приходит новое сообщение, добавляем его в массив
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE', // Слушаем обновления (смена статуса на прочитано)
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          // Находим сообщение в массиве и обновляем его статус
          setMessages((prev) => 
            prev.map(msg => msg.id === payload.new.id ? payload.new : msg)
          );
        }
      )
      .subscribe();

    // Отписываемся при размонтировании компонента
    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId]);

  // Функция отправки сообщения
  const sendMessage = async (text) => {
    if (!text.trim()) return;
    
    const { data: { user } } = await supabase.auth.getUser();
    
    await supabase.from('messages').insert({
      chat_id: chatId,
      sender_id: user.id,
      content: text,
    });
  };

  return { messages, sendMessage, loading };
}