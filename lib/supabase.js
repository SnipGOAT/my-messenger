// lib/supabase.js
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://zgrdrrcyrcaidobxvnmo.supabase.co'; // Скопируй из Settings -> API в панели Supabase
const supabaseAnonKey = 'sb_publishable_nk6NLhQTSIxzKnGR2Ech9g_nqMzIR-4'; // Скопируй оттуда же (public, не service_role!)

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage, // Хранит сессию пользователя
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});