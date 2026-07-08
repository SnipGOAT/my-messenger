// screens/ChatListScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Image, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { uploadImage } from '../lib/storage';
import { useTheme } from '../contexts/ThemeContext';
import * as ImagePicker from 'expo-image-picker';

export default function ChatListScreen({ navigation }) {
  const { colors, themeMode, toggleTheme } = useTheme();

  const [chats, setChats] = useState([]);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [userId, setUserId] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadUserData();
    loadChats();
  }, []);

  // Загрузка данных текущего пользователя (ID и аватарка)
  const loadUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      // Загружаем текущую аватарку из профиля
      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', user.id)
        .single();
      
      if (profile?.avatar_url) {
        setAvatarUrl(profile.avatar_url);
      }
    }
  };

  // Загрузка списка чатов пользователя
  const loadChats = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Находим все чаты, где есть этот юзер
    const { data: memberships } = await supabase
      .from('chat_members')
      .select('chat_id')
      .eq('user_id', user.id);

    if (!memberships || memberships.length === 0) {
      setChats([]);
      return;
    }

    const chatIds = memberships.map(m => m.chat_id);

    // 2. Загружаем сами чаты и участников (чтобы узнать имя собеседника)
    const { data: chatsData } = await supabase
      .from('chats')
      .select(`
        *,
        chat_members (
          user_id,
          profiles ( username )
        )
      `)
      .in('id', chatIds);

    // 3. Форматируем данные: ищем "другого" юзера в чате, чтобы показать его имя
    const formattedChats = chatsData.map(chat => {
      const otherMember = chat.chat_members.find(m => m.user_id !== user.id);
      return {
        id: chat.id,
        title: otherMember ? otherMember.profiles.username : 'Групповой чат',
      };
    });

    setChats(formattedChats);
  };

  // Открытие галереи для выбора аватарки
  const pickImage = async () => {
    // 1. Запрашиваем разрешение (актуально для мобайла)
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      return Alert.alert('Разрешение отклонено', 'Разрешите доступ к галерее!');
    }

    // 2. Открываем галерею
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      await handleUpload(result.assets[0]);
    }
  };

  // Загрузка выбранной картинки в Supabase Storage
  const handleUpload = async (file) => {
    if (!userId) return;
    
    setUploading(true);
    try {
      // 3. Загружаем картинку в бакет 'avatars' в папку с ID пользователя
      const filePath = `${userId}/avatar.jpg`;
      const publicUrl = await uploadImage('avatars', filePath, file);

      // 4. Сохраняем ссылку в таблицу profiles
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);

      if (error) throw error;

      setAvatarUrl(publicUrl);
      Alert.alert('Успех', 'Аватарка обновлена!');
    } catch (error) {
      Alert.alert('Ошибка загрузки', error.message);
    } finally {
      setUploading(false);
    }
  };

  // Временная функция для создания тестового чата
  const createTestChat = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: newChat, error } = await supabase
      .from('chats')
      .insert({})
      .select()
      .single();
    
    if (error) return Alert.alert('Ошибка', error.message);

    // Добавляем себя в чат
    await supabase
      .from('chat_members')
      .insert({ chat_id: newChat.id, user_id: user.id });
    
    loadChats(); // Обновляем список
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ШАПКА С АВАТАРКОЙ, ПЕРЕКЛЮЧАТЕЛЕМ ТЕМЫ И КНОПКОЙ ПОИСКА */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={pickImage} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: colors.inputBackground }]}>
              <Text style={styles.avatarText}>📷</Text>
            </View>
          )}
        </TouchableOpacity>
        
        <View style={{ flex: 1, marginLeft: 15 }}>
          <Text style={[styles.headerText, { color: colors.textSecondary }]}>
            Нажми, чтобы сменить аватарку
          </Text>
        </View>
        
        {/* Кнопка переключения темы */}
        <TouchableOpacity 
          style={[styles.themeButton, { backgroundColor: colors.inputBackground }]}
          onPress={toggleTheme}
        >
          <Text style={styles.themeButtonText}>
            {themeMode === 'light' ? '☀️' : themeMode === 'dark' ? '🌙' : '⚙️'}
          </Text>
        </TouchableOpacity>
        
        {/* Кнопка поиска */}
        <TouchableOpacity 
          style={[styles.searchIconButton, { backgroundColor: colors.primary }]}
          onPress={() => navigation.navigate('NewChat')}
        >
          <Text style={styles.searchIconText}>🔍</Text>
        </TouchableOpacity>
      </View>

      {/* СПИСОК ЧАТОВ */}
      <FlatList
        data={chats}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={[styles.chatItem, { borderBottomColor: colors.border }]}
            onPress={() => navigation.navigate('Chat', { chatId: item.id, title: item.title })}
          >
            <Text style={[styles.chatTitle, { color: colors.text }]}>{item.title}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Нет чатов. Создайте первый!
          </Text>
        }
      />
      
      {/* КНОПКА СОЗДАНИЯ ЧАТА (FAB) */}
      <TouchableOpacity style={[styles.fab, { backgroundColor: colors.primary }]} onPress={createTestChat}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  
  // Стили шапки
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 15, 
    borderBottomWidth: 1,
  },
  avatar: { 
    width: 50, 
    height: 50, 
    borderRadius: 25 
  },
  avatarPlaceholder: { 
    width: 50, 
    height: 50, 
    borderRadius: 25, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  avatarText: { 
    fontSize: 24 
  },
  headerText: { 
    fontSize: 14,
  },
  
  // Кнопка темы
  themeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  themeButtonText: {
    fontSize: 20,
  },
  
  // Кнопка поиска
  searchIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchIconText: {
    fontSize: 20,
    color: '#fff',
  },
  
  // Стили списка чатов
  chatItem: { 
    padding: 20, 
    borderBottomWidth: 1,
  },
  chatTitle: { 
    fontSize: 18, 
    fontWeight: '600' 
  },
  emptyText: { 
    textAlign: 'center', 
    marginTop: 50, 
    fontSize: 16 
  },
  
  // Стили кнопки создания чата (FAB)
  fab: {
    position: 'absolute', 
    bottom: 30, 
    right: 30, 
    width: 60, 
    height: 60, 
    borderRadius: 30, 
    justifyContent: 'center', 
    alignItems: 'center',
    elevation: 5, 
    shadowColor: '#000', 
    shadowOpacity: 0.3, 
    shadowRadius: 5
  },
  fabText: { 
    color: '#fff', 
    fontSize: 30, 
    lineHeight: 32 
  },
});