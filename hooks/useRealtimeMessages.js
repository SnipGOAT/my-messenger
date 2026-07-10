// hooks/useRealtimeMessages.js
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useRealtimeMessages(chatId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!chatId) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*, profiles(username)')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error('Ошибка загрузки сообщений:', error.message);
        setMessages([]);
      } else {
        // Фильтруем сообщения без id
        const validMessages = (data || []).filter(msg => msg && msg.id);
        setMessages(validMessages);
      }
      setLoading(false);
    };

    fetchMessages();

    const channel = supabase
      .channel(`chat:${chatId}`)
      .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}`
        }, (payload) => {
          if (payload.new && payload.new.id) {
            setMessages((prev) => {
              // Проверяем, нет ли уже такого сообщения
              const exists = prev.some(msg => msg.id === payload.new.id);
              if (exists) return prev;
              return [...prev, payload.new];
            });
          }
        }
      )
      .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}`
        }, (payload) => {
          if (payload.new && payload.new.id) {
            setMessages((prev) => prev.map(msg => msg.id === payload.new.id ? payload.new : msg));
          }
        }
      )
      .on('postgres_changes', {
          event: 'DELETE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}`
        }, (payload) => {
          if (payload.old && payload.old.id) {
            console.log('Удаление сообщения:', payload.old.id);
            setMessages((prev) => prev.filter(msg => msg.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId]);

  const sendMessage = async (text, replyToId = null) => {
    if (!text.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data, error } = await supabase.from('messages').insert({
      chat_id: chatId,
      sender_id: user.id,
      content: text,
      reply_to_id: replyToId, // <-- Добавили это поле
    }).select();
    
    if (error) {
      console.error('Ошибка отправки сообщения:', error.message);
    }
  };

  const sendAudio = async (audioUrl, replyToId = null) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data, error } = await supabase.from('messages').insert({
      chat_id: chatId,
      sender_id: user.id,
      audio_url: audioUrl,
      reply_to_id: replyToId,
    }).select();
    
    if (error) {
      console.error('Ошибка отправки аудио:', error.message);
    }
  };

  const editMessage = async (messageId, newText) => {
    if (!newText.trim()) return;
    
    const { error } = await supabase
      .from('messages')
      .update({ content: newText, edited_at: new Date().toISOString() })
      .eq('id', messageId);
    
    if (error) {
      console.error('Ошибка редактирования:', error.message);
    } else {
      console.log('Сообщение отредактировано:', messageId);
    }
  };

  const deleteMessage = async (messageId) => {
    console.log('Попытка удаления сообщения:', messageId);
    
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId);
    
    if (error) {
      console.error('Ошибка удаления:', error.message);
    } else {
      console.log('Сообщение удалено:', messageId);
    }
  };

  return { messages, sendMessage, editMessage, deleteMessage, sendAudio, loading };
}