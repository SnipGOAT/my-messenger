// screens/AuthScreen.js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const { colors } = useTheme();

  useEffect(() => {
    // Устанавливаем заголовок для веба
    if (typeof document !== 'undefined') {
      document.title = 'MAX 2.0';
    }
  }, []);

  const handleAuth = async () => {
    if (!email || !password) {
      return Alert.alert('Ошибка', 'Введите email и пароль');
    }
    if (isSignUp && !username.trim()) {
      return Alert.alert('Ошибка', 'Введите имя пользователя');
    }

    setLoading(true);

    try {
      if (isSignUp) {
        // 1. Проверяем, не занято ли имя пользователя
        const { data: existingUser } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', username.trim())
          .maybeSingle(); // maybeSingle вернет null, если не найдено

        if (existingUser) {
          Alert.alert('Ошибка', 'Это имя пользователя уже занято. Выберите другое.');
          setLoading(false);
          return;
        }

        // 2. Регистрируем пользователя в Auth
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
          options: {
            data: { username: username.trim() } // Передаем в метаданные
          }
        });

        if (error) throw error;

        // 3. Сохраняем имя в таблицу profiles (гарантированно)
        if (data.user) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            username: username.trim(),
          });
        }
        
        Alert.alert('Успех', 'Аккаунт создан! Теперь войдите в систему.');
        setIsSignUp(false); // Переключаем на экран входа
        setPassword('');
      } else {
        // Вход в систему
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });
        if (error) throw error;
      }
    } catch (error) {
      Alert.alert('Ошибка', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: colors.background }]} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.content, { backgroundColor: colors.surface }]}>
        <Text style={[styles.title, { color: colors.text }]}>
          {isSignUp ? 'Регистрация' : 'Вход в мессенджер'}
        </Text>

        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text }]}
          placeholder="Email"
          placeholderTextColor={colors.textSecondary}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text }]}
          placeholder="Пароль"
          placeholderTextColor={colors.textSecondary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {/* Поле имени пользователя (только для регистрации) */}
        {isSignUp && (
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text }]}
            placeholder="Имя пользователя (логин)"
            placeholderTextColor={colors.textSecondary}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
        )}

        <TouchableOpacity 
          style={[styles.button, { backgroundColor: colors.primary }]} 
          onPress={handleAuth}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {isSignUp ? 'Зарегистрироваться' : 'Войти'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)} style={styles.toggleContainer}>
          <Text style={[styles.toggleText, { color: colors.textSecondary }]}>
            {isSignUp ? 'Уже есть аккаунт? ' : 'Нет аккаунта? '}
            <Text style={[styles.toggleLink, { color: colors.primary }]}>
              {isSignUp ? 'Войти' : 'Зарегистрироваться'}
            </Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  content: { borderRadius: 20, padding: 30, elevation: 5, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
  title: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 30 },
  input: { height: 50, borderRadius: 12, paddingHorizontal: 15, marginBottom: 15, fontSize: 16 },
  button: { height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  toggleContainer: { marginTop: 20, alignItems: 'center' },
  toggleText: { fontSize: 16 },
  toggleLink: { fontWeight: 'bold' },
});