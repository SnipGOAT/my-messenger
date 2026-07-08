// screens/NewChatScreen.js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, FlatList } from 'react-native';
import { supabase } from '../lib/supabase';

export default function NewChatScreen({ navigation }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // Поиск пользователя по username
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Ищем пользователей, у которых username содержит введенную строку (регистронезависимо)
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .ilike('username', `%${searchQuery}%`) // ilike = case-insensitive LIKE
        .neq('id', user.id) // Исключаем самого пользователя
        .limit(10); // Показываем максимум 10 результатов

      if (error) throw error;

      setSearchResults(profiles || []);
    } catch (error) {
      Alert.alert('Ошибка поиска', error.message);
    } finally {
      setLoading(false);
    }
  };

  // Создание или открытие чата с найденным пользователем
  const startChat = async (otherUser) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setLoading(true);
    try {
      // 1. Проверяем, есть ли уже чат между этими двумя пользователями
      const { data: existingMemberships } = await supabase
        .from('chat_members')
        .select('chat_id')
        .eq('user_id', user.id);

      const existingChatIds = existingMemberships?.map(m => m.chat_id) || [];

      if (existingChatIds.length > 0) {
        // Ищем чат, где есть оба пользователя
        const { data: existingChats } = await supabase
          .from('chat_members')
          .select('chat_id')
          .in('chat_id', existingChatIds)
          .eq('user_id', otherUser.id);

        if (existingChats && existingChats.length > 0) {
          // Чат уже существует, просто открываем его
          const chatId = existingChats[0].chat_id;
          
          // Загружаем название чата (имя собеседника)
          const { data: chatData } = await supabase
            .from('chats')
            .select('id')
            .eq('id', chatId)
            .single();

          navigation.navigate('Chat', { 
            chatId: chatId, 
            title: otherUser.username 
          });
          setLoading(false);
          return;
        }
      }

      // 2. Если чата нет, создаем новый
      const { data: newChat, error: chatError } = await supabase
        .from('chats')
        .insert({ is_group: false })
        .select()
        .single();

      if (chatError) throw chatError;

      // 3. Добавляем обоих пользователей в чат
      const { error: memberError } = await supabase
        .from('chat_members')
        .insert([
          { chat_id: newChat.id, user_id: user.id },
          { chat_id: newChat.id, user_id: otherUser.id }
        ]);

      if (memberError) throw memberError;

      // 4. Открываем новый чат
      navigation.navigate('Chat', { 
        chatId: newChat.id, 
        title: otherUser.username 
      });

    } catch (error) {
      Alert.alert('Ошибка создания чата', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Поле поиска */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.input}
          placeholder="Введите username..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
        />
        <TouchableOpacity 
          style={styles.searchButton} 
          onPress={handleSearch}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.searchButtonText}>🔍</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Результаты поиска */}
      <FlatList
        data={searchResults}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.userItem}
            onPress={() => startChat(item)}
          >
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.userAvatar} />
            ) : (
              <View style={styles.userAvatarPlaceholder}>
                <Text style={styles.userAvatarText}>👤</Text>
              </View>
            )}
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{item.username}</Text>
              <Text style={styles.userHint}>Нажмите, чтобы начать чат</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          searchQuery && !loading ? (
            <Text style={styles.emptyText}>Пользователи не найдены</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  searchContainer: { flexDirection: 'row', padding: 15, borderBottomWidth: 1, borderColor: '#eee' },
  input: { 
    flex: 1, 
    backgroundColor: '#f0f0f0', 
    borderRadius: 20, 
    paddingHorizontal: 15, 
    paddingVertical: 10, 
    marginRight: 10,
    fontSize: 16
  },
  searchButton: { 
    backgroundColor: '#007AFF', 
    width: 45, 
    height: 45, 
    borderRadius: 22.5, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  searchButtonText: { color: '#fff', fontSize: 20 },
  userItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 15, 
    borderBottomWidth: 1, 
    borderBottomColor: '#eee' 
  },
  userAvatar: { width: 50, height: 50, borderRadius: 25, marginRight: 15 },
  userAvatarPlaceholder: { 
    width: 50, 
    height: 50, 
    borderRadius: 25, 
    backgroundColor: '#ddd', 
    justifyContent: 'center', 
    alignItems: 'center',
    marginRight: 15
  },
  userAvatarText: { fontSize: 24 },
  userInfo: { flex: 1 },
  userName: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  userHint: { fontSize: 14, color: '#888' },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#888', fontSize: 16 },
});