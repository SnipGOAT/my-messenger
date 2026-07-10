// screens/CreateGroupScreen.js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';

export default function CreateGroupScreen({ navigation }) {
  const { colors } = useTheme();
  const [groupName, setGroupName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);

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
      .neq('id', user.id) // Не показывать себя
      .limit(5);

    setSearchResults(data || []);
  };

  const toggleUser = (user) => {
    setSelectedUsers(prev => 
      prev.find(u => u.id === user.id) 
        ? prev.filter(u => u.id !== user.id) 
        : [...prev, user]
    );
  };

  const createGroup = async () => {
    if (!groupName.trim()) {
      return Alert.alert('Ошибка', 'Введите название группы');
    }
    if (selectedUsers.length === 0) {
      return Alert.alert('Ошибка', 'Добавьте хотя бы одного участника');
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Создаем чат
    const { data: newChat, error: chatError } = await supabase
      .from('chats')
      .insert({ is_group: true, name: groupName.trim() })
      .select()
      .single();

    if (chatError) return Alert.alert('Ошибка', chatError.message);

    // 2. Добавляем создателя
    await supabase.from('chat_members').insert({ chat_id: newChat.id, user_id: user.id });

    // 3. Добавляем выбранных участников
    const membersToInsert = selectedUsers.map(u => ({ chat_id: newChat.id, user_id: u.id }));
    await supabase.from('chat_members').insert(membersToInsert);

    Alert.alert('Успех', 'Группа создана!');
    navigation.goBack();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      
      {/* Кнопка назад (появится только на десктопе, где navigation - это наш кастомный объект) */}
      {navigation?.goBack && (
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={{ position: 'absolute', top: 40, left: 20, zIndex: 10, padding: 10 }}
        >
          <Text style={{ fontSize: 16, color: colors.primary, fontWeight: 'bold' }}>← Назад</Text>
        </TouchableOpacity>
      )}

      <Text style={[styles.title, { color: colors.text }]}>Новая группа</Text>

      <TextInput
        style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
        placeholder="Название группы"
        placeholderTextColor={colors.textSecondary}
        value={groupName}
        onChangeText={setGroupName}
      />

      <TextInput
        style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
        placeholder="Поиск пользователей..."
        placeholderTextColor={colors.textSecondary}
        value={searchQuery}
        onChangeText={searchUsers}
      />

      <FlatList
        data={searchResults}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const isSelected = selectedUsers.find(u => u.id === item.id);
          return (
            <TouchableOpacity 
              style={[styles.userItem, { borderBottomColor: colors.border }]} 
              onPress={() => toggleUser(item)}
            >
              <Text style={[styles.username, { color: colors.text }]}>{item.username}</Text>
              <View style={[styles.checkbox, { backgroundColor: isSelected ? colors.primary : 'transparent', borderColor: colors.textSecondary }]}>
                {isSelected && <Text style={styles.checkmark}>✓</Text>}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {selectedUsers.length > 0 && (
        <View style={styles.selectedContainer}>
          <Text style={[styles.selectedText, { color: colors.textSecondary }]}>
            Выбрано: {selectedUsers.length}
          </Text>
        </View>
      )}

      <TouchableOpacity 
        style={[styles.createButton, { backgroundColor: colors.primary }]} 
        onPress={createGroup}
      >
        <Text style={styles.createButtonText}>Создать группу</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 40 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  input: { height: 50, borderRadius: 12, paddingHorizontal: 15, marginBottom: 15, fontSize: 16, borderWidth: 1 },
  userItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1 },
  username: { fontSize: 16 },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  selectedContainer: { padding: 15, alignItems: 'center' },
  selectedText: { fontSize: 14 },
  createButton: { height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 'auto', marginBottom: 20 },
  createButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});