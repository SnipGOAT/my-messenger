// screens/SettingsScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform, Image, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import { supabase } from '../lib/supabase';
import { uploadImage } from '../lib/storage';
import { useTheme } from '../contexts/ThemeContext';
import * as ImagePicker from 'expo-image-picker';

export default function SettingsScreen({ navigation }) {
  const { colors } = useTheme();
  const [userId, setUserId] = useState(null);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [status, setStatus] = useState('');
  const [link1, setLink1] = useState('');
  const [link2, setLink2] = useState('');
  const [link3, setLink3] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(true);
  const [originalUsername, setOriginalUsername] = useState('');

  useEffect(() => {
    // Устанавливаем заголовок для веба
    if (typeof document !== 'undefined') {
      document.title = 'MAX 2.0';
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    console.log(' Загрузка профиля...');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log(' Пользователь не авторизован');
      return;
    }
    
    setUserId(user.id);
    console.log('👤 User ID:', user.id);
    
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('❌ Ошибка загрузки профиля:', error);
      return;
    }

    console.log('✅ Профиль загружен:', profile);
    console.log('🖼️ Текущая аватарка:', profile.avatar_url);

    if (profile) {
      setUsername(profile.username || '');
      setOriginalUsername(profile.username || '');
      setBio(profile.bio || '');
      setStatus(profile.status || '');
      const linksArray = profile.links || [];
      setLink1(linksArray[0] || '');
      setLink2(linksArray[1] || '');
      setLink3(linksArray[2] || '');
      setAvatarUrl(profile.avatar_url);
    }
  };

  const checkUsername = async (newUsername) => {
    if (newUsername === originalUsername) {
      setUsernameAvailable(true);
      return;
    }

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

    setUsernameAvailable(!data || data.length === 0);
    setCheckingUsername(false);
  };

  const handleUsernameChange = (text) => {
    setUsername(text);
    checkUsername(text);
  };

  const pickImage = async () => {
    console.log('📷 Начинаем выбор изображения...');
    
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      console.log('❌ Разрешение не получено');
      return Platform.OS === 'web' 
        ? window.alert('Разрешение отклонено') 
        : Alert.alert('Ошибка', 'Разрешите доступ к галерее');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    console.log(' Результат выбора:', result);

    if (result.canceled) {
      console.log('️ Выбор отменен');
      return;
    }

    console.log(' Начинаем загрузку аватарки...');
    console.log('User ID:', userId);
    console.log('Файл:', result.assets[0]);

    setUploadingAvatar(true);
    try {
      const filePath = `${userId}/avatar.jpg`;
      console.log('📁 Путь в Storage:', filePath);
      
      const publicUrl = await uploadImage('avatars', filePath, result.assets[0]);
      console.log('✅ Файл загружен, URL:', publicUrl);
      
      console.log('💾 Обновляем профиль в базе...');
      const { data: updateData, error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId)
        .select();

      if (updateError) {
        console.error('❌ Ошибка обновления профиля:', updateError);
        throw updateError;
      }

      console.log('✅ Профиль обновлен:', updateData);
      
      setAvatarUrl(publicUrl);
      console.log('🖼️ Аватарка обновлена в состоянии');
      
      Platform.OS === 'web'
        ? window.alert('Аватарка обновлена!')
        : Alert.alert('Успех', 'Аватарка обновлена!');
    } catch (error) {
      console.error(' Ошибка загрузки аватарки:', error);
      Platform.OS === 'web'
        ? window.alert('Ошибка загрузки: ' + error.message)
        : Alert.alert('Ошибка', error.message);
    } finally {
      setUploadingAvatar(false);
    }
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
      const allLinks = [link1, link2, link3].filter(link => link.trim() !== '');

      const { error } = await supabase
        .from('profiles')
        .update({
          username: username.trim(),
          bio: bio.trim() || null,
          status: status.trim() || null,
          links: allLinks.length > 0 ? allLinks : null,
        })
        .eq('id', userId);

      if (error) throw error;

      Platform.OS === 'web'
        ? window.alert('Профиль обновлён!')
        : Alert.alert('Успех', 'Профиль обновлён!');
      
      navigation.goBack();
    } catch (error) {
      console.error('Ошибка сохранения:', error);
      Platform.OS === 'web'
        ? window.alert('Ошибка: ' + error.message)
        : Alert.alert('Ошибка', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Вы уверены, что хотите выйти?')
      : await new Promise(resolve => {
          Alert.alert(
            'Выход из аккаунта',
            'Вы уверены, что хотите выйти?',
            [
              { text: 'Отмена', onPress: () => resolve(false), style: 'cancel' },
              { text: 'Выйти', onPress: () => resolve(true), style: 'destructive' }
            ]
          );
        });

    if (!confirmed) return;

    await supabase.auth.signOut();
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

        <Text style={[styles.title, { color: colors.text }]}>Настройки</Text>

        {/* Аватарка */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={pickImage} disabled={uploadingAvatar}>
            {uploadingAvatar ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : avatarUrl ? (
              <Image 
                source={{ uri: avatarUrl, cache: 'reload' }} 
                style={styles.avatar}
                onError={(e) => console.log(' Ошибка загрузки изображения:', e.nativeEvent.error)}
              />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.inputBackground }]}>
                <Text style={{ fontSize: 48 }}>👤</Text>
              </View>
            )}
          </TouchableOpacity>
          <Text style={[styles.avatarHint, { color: colors.textSecondary }]}>
            Нажми, чтобы изменить аватарку
          </Text>
        </View>

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
          {usernameAvailable && username.length >= 3 && !checkingUsername && username !== originalUsername && (
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
            placeholder="Например: 🚀 Работаю над проектом"
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
          <TextInput
            style={styles.input}
            value={link1}
            onChangeText={setLink1}
            placeholder="Ссылка 1"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <TextInput
            style={styles.input}
            value={link2}
            onChangeText={setLink2}
            placeholder="Ссылка 2"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <TextInput
            style={styles.input}
            value={link3}
            onChangeText={setLink3}
            placeholder="Ссылка 3"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </View>

        {/* Кнопка сохранения */}
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

        {/* Кнопка выхода */}
        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: '#FF3B30' }]}
          onPress={handleLogout}
        >
          <Text style={styles.logoutButtonText}>Выйти из аккаунта</Text>
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
  
  avatarSection: { alignItems: 'center', marginBottom: 30 },
  avatar: { width: 120, height: 120, borderRadius: 60 },
  avatarPlaceholder: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center' },
  avatarHint: { fontSize: 14, marginTop: 10 },
  
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: {
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ccc',
    minHeight: 50,
    marginBottom: 10,
  },
  hint: { fontSize: 12, marginTop: 5 },
  charCount: { fontSize: 12, textAlign: 'right', marginTop: 5 },
  
  saveButton: {
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 15,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  logoutButton: {
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});