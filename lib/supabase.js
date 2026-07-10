// lib/supabase.js
import { createClient } from '@supabase/supabase-js';

// ⚠️ ВРЕМЕННЫЙ ХАРДКОД ДЛЯ ПРОВЕРКИ
// ПОТОМ ЗАМЕНИМ НА process.env.EXPO_PUBLIC_*
const supabaseUrl = 'https://zgrdrrcyrcaidobxvnmo.supabase.co'; // ← ЗАМЕНИ НА СВОЙ URL
const supabaseAnonKey = 'sb_publishable_nk6NLhQTSIxzKnGR2Ech9g_nqMzIR-4'; // ← ЗАМЕНИ НА СВОЙ КЛЮЧ

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Ошибка: Не заданы переменные окружения Supabase!');
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
    global: {
      headers: {
        'x-client-info': 'my-messenger/1.0.0',
      },
    },
  }
);

// Убери проверку подключения из App.js, она мешает
export const checkSupabaseConnection = async () => {
  return true;
};

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};