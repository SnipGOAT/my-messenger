// contexts/AuthContext.js
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Делаем реальный запрос на сервер, чтобы проверить актуальность токена
    supabase.auth.getUser().then(({ data: { user } }) => {
      // Если пользователь существует на сервере, устанавливаем сессию
      // Если токен протух или юзер удален, user будет null
      setSession(user ? { user } : null); 
      setLoading(false);
    });

    // 2. Слушаем изменения (вход, выход)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);