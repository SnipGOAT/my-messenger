// screens/EditProfileScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform, KeyboardAvoidingView } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';

export default function EditProfileScreen({ route, navigation }) {
  const { userId } = route.params;
  const { colors } = useTheme();
  
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [status, setStatus] = useState('');
  const [links, setLinks] = useState(['', '', '']);
  const [loading, setLoading] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(true);

  useEffect(() => {
    // Устанавливаем заголовок для веба
    if (typeof document !== 'undefined') {
      document.title = 'MAX 2.0';
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [userId]);

  const loadProfile = async () => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profile) {
      setUsername(profile.username || '');
      setBio(profile.bio || '');
      setStatus(profile.status || '');
      setLinks(profile.links || ['', '', '']);
    }
  };

  // Проверка уникальности username
  const checkUsername = async (newUsername) => {
    if (newUsername.length < 3) {
      setUsernameAvailable(false);
      return;
    }

    setCheckingUsername(true);
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', newUsername)
      .neq('id', userId)
      .limit(1);

    setUsernameAvailable(data.length === 0);
    setCheckingUsername(false);
  };

  const handleUsernameChange = (text) => {
    setUsername(text);
    checkUsername(text);
  };

  const handleSave = async () => {
    if (!username.trim() || username.length < 3) {
      return Platform.OS === 'web' 
        ? window.alert('Имя пользователя должно содержать минимум 3 символа')
        : Alert.alert('Ошибка', 'Имя пользователя должно содержать минимум 3 символа');
    }

    if (!usernameAvailable) {
      return Platform.OS === 'web'
        ? window.alert('Это имя уже занято')
        : Alert.alert('Ошибка', 'Это имя уже занято');
    }

    setLoading(true);
    try {
      // Фильтруем пустые ссылки
      const filteredLinks = links.filter(link => link.trim() !== '');

      const { error } = await supabase
        .from('profiles')
        .update({
          username: username.trim(),
          bio: bio.trim() || null,
          status: status.trim() || null,
          links: filteredLinks,
        })
        .eq('id', userId);

      if (error) throw error;

      Platform.OS === 'web'
        ? window.alert('Профиль обновлён!')
        : Alert.alert('Успех', 'Профиль обновлён!');
      
      navigation.goBack();
    } catch (error) {
      console.error(error);
      Platform.OS === 'web'
        ? window.alert('Ошибка: ' + error.message)
        : Alert.alert('Ошибка', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {navigation?.goBack && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={{ fontSize: 16, color: colors.primary, fontWeight: 'bold' }}>← Назад</Text>
          </TouchableOpacity>
        )}

        <Text style={[styles.title, { color: colors.text }]}>Редактировать профиль</Text>

        {/* Username */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Имя пользователя</Text>
          <TextInput
            style={[
              styles.input, 
              { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border },
              !usernameAvailable && username.length >= 3 && { borderColor: '#FF3B30' }
            ]}
            value={username}
            onChangeText={handleUsernameChange}
            placeholder="username"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {checkingUsername && (
            <Text style={[styles.hint, { color: colors.textSecondary }]}>Проверка...</Text>
          )}
          {!usernameAvailable && username.length >= 3 && !checkingUsername && (
            <Text style={[styles.hint, { color: '#FF3B30' }]}>Это имя уже занято</Text>
          )}
          {usernameAvailable && username.length >= 3 && !checkingUsername && (
            <Text style={[styles.hint, { color: '#34C759' }]}>Имя доступно ✓</Text>
          )}
        </View>

        {/* Bio */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>О себе</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
            value={bio}
            onChangeText={setBio}
            placeholder="Расскажите о себе..."
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={150}
          />
          <Text style={[styles.charCount, { color: colors.textSecondary }]}>
            {bio.length} / 150
          </Text>
        </View>

        {/* Status */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Статус / Настроение</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
            value={status}
            onChangeText={setStatus}
            placeholder="Например:  Работаю над проектом"
            placeholderTextColor={colors.textSecondary}
            maxLength={50}
          />
          <Text style={[styles.charCount, { color: colors.textSecondary }]}>
            {status.length} / 50
          </Text>
        </View>

        {/* Links */}
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Ссылки (до 3)</Text>
          {links.map((link, index) => (
            <TextInput
              key={index}
              style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
              value={link}
              onChangeText={(text) => {
                const newLinks = [...links];
                newLinks[index] = text;
                setLinks(newLinks);
              }}
              placeholder={`Ссылка ${index + 1} (например: https://github.com/...)`}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          ))}
        </View>

        <TouchableOpacity
          style={[
            styles.saveButton, 
            { backgroundColor: colors.primary },
            (!usernameAvailable || username.length < 3 || loading) && { opacity: 0.5 }
          ]}
          onPress={handleSave}
          disabled={!usernameAvailable || username.length < 3 || loading}
        >
          <Text style={styles.saveButtonText}>
            {loading ? 'Сохранение...' : 'Сохранить изменения'}
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60 },
  backButton: { position: 'absolute', top: 40, left: 20, zIndex: 10, padding: 10 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 30 },
  
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: {
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    minHeight: 50,
  },
  hint: { fontSize: 12, marginTop: 5 },
  charCount: { fontSize: 12, textAlign: 'right', marginTop: 5 },
  
  saveButton: {
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});