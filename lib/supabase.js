// lib/supabase.js
import { createClient } from '@supabase/supabase-js';

// Получаем переменные окружения
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Проверяем, что переменные заданы
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Ошибка: Не заданы переменные окружения Supabase!');
  console.error('📋 Необходимые переменные:');
  console.error('  - EXPO_PUBLIC_SUPABASE_URL');
  console.error('  - EXPO_PUBLIC_SUPABASE_ANON_KEY');
  
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    setTimeout(() => {
      window.alert(
        'Ошибка конфигурации Supabase!\n\n' +
        'Проверьте переменные окружения'
      );
    }, 100);
  }
}

// Создаем клиент Supabase
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
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

// Утилита для проверки подключения
export const checkSupabaseConnection = async () => {
  try {
    const { data, error } = await supabase.from('profiles').select('count').limit(1);
    
    if (error) {
      console.error('❌ Ошибка подключения к Supabase:', error.message);
      return false;
    }
    
    console.log('✅ Подключение к Supabase успешно');
    return true;
  } catch (error) {
    console.error('❌ Критическая ошибка подключения:', error);
    return false;
  }
};

// Утилита для получения текущего пользователя
export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error) {
    console.error('Ошибка получения пользователя:', error.message);
    return null;
  }
  
  return user;
};

// Утилита для выхода из аккаунта
export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  
  if (error) {
    console.error('Ошибка выхода:', error.message);
    throw error;
  }
  
  console.log('✅ Успешный выход из аккаунта');
};