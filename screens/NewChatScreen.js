// screens/NewChatScreen.js
import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Image, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';

export default function NewChatScreen({ navigation }) {
  const { colors } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const searchUsers = async (query) => {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .ilike('username', `%${query}%`)
      .neq('id', user.id)
      .limit(10);

    setSearchResults(data || []);
  };

  const startChat = async (otherUser) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Проверяем, есть ли уже чат с этим пользователем
    const { data: existingMemberships } = await supabase
      .from('chat_members')
      .select('chat_id')
      .eq('user_id', user.id);

    if (existingMemberships) {
      const chatIds = existingMemberships.map(m => m.chat_id);
      if (chatIds.length > 0) {
        const { data: existingChats } = await supabase
          .from('chat_members')
          .select('chat_id')
          .in('chat_id', chatIds)
          .eq('user_id', otherUser.id);

        if (existingChats && existingChats.length > 0) {
          const commonChatId = existingChats[0].chat_id;
          navigation.navigate('Chat', { chatId: commonChatId, title: otherUser.username });
          return;
        }
      }
    }

    // Создаем новый чат
    const { data: newChat, error: chatError } = await supabase
      .from('chats')
      .insert({ is_group: false })
      .select()
      .single();

    if (chatError) return Alert.alert('Ошибка', chatError.message);

    await supabase.from('chat_members').insert([
      { chat_id: newChat.id, user_id: user.id },
      { chat_id: newChat.id, user_id: otherUser.id }
    ]);

    navigation.navigate('Chat', { chatId: newChat.id, title: otherUser.username });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TextInput
        style={[styles.searchInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
        placeholder="Поиск по имени пользователя..."
        placeholderTextColor={colors.textSecondary}
        value={searchQuery}
        onChangeText={searchUsers}
        autoFocus
      />

      <FlatList
        data={searchResults}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={[styles.userItem, { borderBottomColor: colors.border }]} 
            onPress={() => startChat(item)}
          >
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.inputBackground }]}>
                <Text>👤</Text>
              </View>
            )}
            <Text style={[styles.username, { color: colors.text }]}>{item.username}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          searchQuery.length >= 2 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Пользователи не найдены</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 40 },
  searchInput: { height: 50, borderRadius: 12, paddingHorizontal: 15, marginBottom: 15, fontSize: 16, borderWidth: 1 },
  userItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1 },
  avatar: { width: 50, height: 50, borderRadius: 25, marginRight: 15 },
  avatarPlaceholder: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  username: { fontSize: 18, fontWeight: '600' },
  emptyText: { textAlign: 'center', marginTop: 50, fontSize: 16 },
});