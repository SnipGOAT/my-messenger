// screens/ChatInfoScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, FlatList, Image, Platform, TextInput, Modal, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { uploadImage } from '../lib/storage';
import { useTheme } from '../contexts/ThemeContext';
import * as ImagePicker from 'expo-image-picker';

export default function ChatInfoScreen({ route, navigation }) {
  const { chatId } = route.params;
  const { colors } = useTheme();
  
  const [chatData, setChatData] = useState(null);
  const [members, setMembers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [isCreator, setIsCreator] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Состояния для редактирования
  const [editName, setEditName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  
  // Состояния для добавления участников
  const [addMemberModalVisible, setAddMemberModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [addingUserId, setAddingUserId] = useState(null);

  useEffect(() => {
    // Устанавливаем заголовок для веба
    if (typeof document !== 'undefined') {
      document.title = 'MAX 2.0';
    }
  }, []);

  useEffect(() => {
    loadChatInfo();
  }, [chatId]);

  // Realtime подписка на изменения группы
  useEffect(() => {
    const channel = supabase
      .channel(`chat_info:${chatId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chats', filter: `id=eq.${chatId}` },
        (payload) => {
          setChatData(prev => ({ ...prev, ...payload.new }));
          setEditName(payload.new.name || '');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_members', filter: `chat_id=eq.${chatId}` },
        () => {
          // При любом изменении участников — перезагружаем список
          loadMembers();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [chatId]);

  const loadChatInfo = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setCurrentUserId(user.id);

    const { data: chat } = await supabase
      .from('chats')
      .select('*')
      .eq('id', chatId)
      .single();

    if (chat) {
      setChatData(chat);
      setEditName(chat.name || '');
      setIsCreator(chat.creator_id === user.id);
    }

    await loadMembers();
    setLoading(false);
  };

  const loadMembers = async () => {
    const { data: membersData } = await supabase
      .from('chat_members')
      .select('user_id, profiles(username, avatar_url, last_seen)')
      .eq('chat_id', chatId);

    if (membersData) {
      setMembers(membersData.map(m => ({
        id: m.user_id,
        username: m.profiles?.username || 'Аноним',
        avatar: m.profiles?.avatar_url,
        lastSeen: m.profiles?.lastSeen,
      })));
    }
  };

  // === РЕДАКТИРОВАНИЕ НАЗВАНИЯ ===
  const handleSaveName = async () => {
    if (!editName.trim()) {
      return Platform.OS === 'web' ? window.alert('Название не может быть пустым') : Alert.alert('Ошибка', 'Название не может быть пустым');
    }

    const { error } = await supabase
      .from('chats')
      .update({ name: editName.trim() })
      .eq('id', chatId);

    if (error) {
      Platform.OS === 'web' ? window.alert('Ошибка: ' + error.message) : Alert.alert('Ошибка', error.message);
    } else {
      setIsEditingName(false);
    }
  };

  // === СМЕНА АВАТАРКИ ГРУППЫ ===
  const handleChangeAvatar = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      return Platform.OS === 'web' ? window.alert('Разрешение отклонено') : Alert.alert('Ошибка', 'Разрешите доступ к галерее');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled) return;

    setUploadingAvatar(true);
    try {
      const filePath = `groups/${chatId}/avatar_${Date.now()}.jpg`;
      const publicUrl = await uploadImage('avatars', filePath, result.assets[0]);
      
      const { error } = await supabase
        .from('chats')
        .update({ avatar_url: publicUrl })
        .eq('id', chatId);

      if (error) throw error;
    } catch (error) {
      console.error(error);
      Platform.OS === 'web' ? window.alert('Ошибка загрузки') : Alert.alert('Ошибка', 'Не удалось загрузить аватарку');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // === ПОИСК ПОЛЬЗОВАТЕЛЕЙ ДЛЯ ДОБАВЛЕНИЯ ===
  const searchUsers = async (query) => {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const memberIds = members.map(m => m.id);
    
    const { data } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .ilike('username', `%${query}%`)
      .neq('id', currentUserId)
      .not('id', 'in', `(${memberIds.map(id => `"${id}"`).join(',')})`)
      .limit(10);

    setSearchResults(data || []);
  };

  // === ДОБАВЛЕНИЕ УЧАСТНИКА ===
  const handleAddMember = async (userToAdd) => {
    setAddingUserId(userToAdd.id);
    try {
      const { error } = await supabase
        .from('chat_members')
        .insert({ chat_id: chatId, user_id: userToAdd.id });

      if (error) throw error;

      setSearchResults([]);
      setSearchQuery('');
      setAddMemberModalVisible(false);
    } catch (error) {
      console.error(error);
      Platform.OS === 'web' ? window.alert('Ошибка: ' + error.message) : Alert.alert('Ошибка', error.message);
    } finally {
      setAddingUserId(null);
    }
  };

  // === УДАЛЕНИЕ УЧАСТНИКА ===
  const handleRemoveMember = async (userId, username) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Удалить пользователя "${username}" из группы?`)
      : await new Promise(resolve => {
          Alert.alert('Подтверждение', `Удалить "${username}" из группы?`, [
            { text: 'Отмена', onPress: () => resolve(false), style: 'cancel' },
            { text: 'Удалить', onPress: () => resolve(true), style: 'destructive' }
          ]);
        });

    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('chat_members')
        .delete()
        .eq('chat_id', chatId)
        .eq('user_id', userId);

      if (error) throw error;
    } catch (error) {
      console.error(error);
      Platform.OS === 'web' ? window.alert('Ошибка: ' + error.message) : Alert.alert('Ошибка', error.message);
    }
  };

  // === УДАЛЕНИЕ ГРУППЫ (для админа) ===
  const handleDeleteGroup = async () => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Удалить группу для всех участников? Это действие нельзя отменить.')
      : await new Promise(resolve => {
          Alert.alert('Подтверждение', 'Удалить группу для всех участников?', [
            { text: 'Отмена', onPress: () => resolve(false), style: 'cancel' },
            { text: 'Удалить', onPress: () => resolve(true), style: 'destructive' }
          ]);
        });

    if (!confirmed) return;

    try {
      await supabase.from('messages').delete().eq('chat_id', chatId);
      await supabase.from('chat_members').delete().eq('chat_id', chatId);
      await supabase.from('chats').delete().eq('id', chatId);
      navigation.goBack();
    } catch (error) {
      console.error(error);
      Platform.OS === 'web' ? window.alert('Ошибка удаления') : Alert.alert('Ошибка', 'Не удалось удалить группу');
    }
  };

  // === ПОКИНУТЬ ГРУППУ (для обычного участника) ===
  const handleLeaveGroup = async () => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Вы уверены, что хотите покинуть группу?')
      : await new Promise(resolve => {
          Alert.alert('Подтверждение', 'Покинуть группу?', [
            { text: 'Отмена', onPress: () => resolve(false), style: 'cancel' },
            { text: 'Покинуть', onPress: () => resolve(true), style: 'destructive' }
          ]);
        });

    if (!confirmed) return;

    try {
      await supabase.from('chat_members').delete().eq('chat_id', chatId).eq('user_id', currentUserId);
      navigation.goBack();
    } catch (error) {
      console.error(error);
      Platform.OS === 'web' ? window.alert('Ошибка') : Alert.alert('Ошибка', 'Не удалось покинуть группу');
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!chatData) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Группа не найдена</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      
      {/* Кнопка назад для десктопа */}
      {navigation?.goBack && (
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={{ position: 'absolute', top: 40, left: 20, zIndex: 10, padding: 10 }}
        >
          <Text style={{ fontSize: 16, color: colors.primary, fontWeight: 'bold' }}>← Назад</Text>
        </TouchableOpacity>
      )}

      <FlatList
        ListHeaderComponent={
          <>
            {/* === АВАТАРКА ГРУППЫ === */}
            <View style={styles.avatarSection}>
              <TouchableOpacity onPress={isCreator ? handleChangeAvatar : null} disabled={!isCreator || uploadingAvatar}>
                {uploadingAvatar ? (
                  <ActivityIndicator size="large" color={colors.primary} style={styles.avatarLoader} />
                ) : chatData.avatar_url ? (
                  <Image source={{ uri: chatData.avatar_url }} style={styles.groupAvatar} />
                ) : (
                  <View style={[styles.groupAvatarPlaceholder, { backgroundColor: colors.inputBackground }]}>
                    <Text style={{ fontSize: 48 }}>👥</Text>
                  </View>
                )}
                {isCreator && !uploadingAvatar && (
                  <View style={[styles.avatarEditBadge, { backgroundColor: colors.primary }]}>
                    <Text style={{ color: '#fff', fontSize: 12 }}>📷</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* === НАЗВАНИЕ ГРУППЫ === */}
            <View style={styles.nameSection}>
              {isEditingName ? (
                <View style={styles.editNameContainer}>
                  <TextInput
                    style={[styles.nameInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
                    value={editName}
                    onChangeText={setEditName}
                    autoFocus
                    placeholder="Название группы"
                    placeholderTextColor={colors.textSecondary}
                  />
                  <View style={styles.editNameButtons}>
                    <TouchableOpacity onPress={() => { setIsEditingName(false); setEditName(chatData.name || ''); }} style={[styles.editButton, { backgroundColor: colors.inputBackground }]}>
                      <Text style={{ color: colors.text }}>Отмена</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleSaveName} style={[styles.editButton, { backgroundColor: colors.primary }]}>
                      <Text style={{ color: '#fff', fontWeight: 'bold' }}>Сохранить</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.nameDisplay}>
                  <Text style={[styles.groupName, { color: colors.text }]}>{chatData.name || 'Группа'}</Text>
                  {isCreator && (
                    <TouchableOpacity onPress={() => setIsEditingName(true)} style={styles.editIcon}>
                      <Text style={{ fontSize: 18 }}>✏️</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              <Text style={[styles.memberCount, { color: colors.textSecondary }]}>
                {members.length} {members.length === 1 ? 'участник' : members.length < 5 ? 'участника' : 'участников'}
                {isCreator && ' • Вы администратор'}
              </Text>
            </View>

            {/* === КНОПКА МЕДИА === */}
            <TouchableOpacity
              style={[styles.mediaButton, { backgroundColor: colors.primary }]}
              onPress={() => navigation?.navigate('ChatMedia', { chatId })}
            >
              <Text style={styles.mediaButtonText}>🖼️ Медиа, файлы и голосовые</Text>
            </TouchableOpacity>

            {/* === КНОПКА ДОБАВИТЬ УЧАСТНИКА === */}
            {isCreator && (
              <TouchableOpacity
                style={[styles.addMemberButton, { backgroundColor: colors.primary }]}
                onPress={() => setAddMemberModalVisible(true)}
              >
                <Text style={styles.addMemberButtonText}>➕ Добавить участника</Text>
              </TouchableOpacity>
            )}

            {/* === СПИСОК УЧАСТНИКОВ === */}
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Участники</Text>
          </>
        }
        data={members}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const isMe = item.id === currentUserId;
          const isThisCreator = item.id === chatData.creator_id;
          
          return (
            <TouchableOpacity
              style={[styles.memberItem, { borderBottomColor: colors.border }]}
              onPress={() => {
                if (!isMe) {
                  navigation?.navigate('ViewProfile', { userId: item.id });
                }
              }}
              activeOpacity={0.7}
            >
              {item.avatar ? (
                <Image source={{ uri: item.avatar }} style={styles.memberAvatar} />
              ) : (
                <View style={[styles.memberAvatarPlaceholder, { backgroundColor: colors.inputBackground }]}>
                  <Text>👤</Text>
                </View>
              )}
              <View style={styles.memberInfo}>
                <Text style={[styles.memberName, { color: colors.text }]}>
                  {item.username}
                  {isMe && ' (Вы)'}
                </Text>
                {isThisCreator && (
                  <Text style={[styles.creatorBadge, { color: colors.primary }]}>Администратор</Text>
                )}
              </View>
              {isCreator && !isMe && !isThisCreator && (
                <TouchableOpacity onPress={() => handleRemoveMember(item.id, item.username)} style={styles.removeButton}>
                  <Text style={{ fontSize: 18 }}>✕</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={
          <View style={styles.actionsContainer}>
            {isCreator ? (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#FF3B30' }]}
                onPress={handleDeleteGroup}
              >
                <Text style={styles.actionButtonText}>Удалить группу для всех</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#FF9500' }]}
                onPress={handleLeaveGroup}
              >
                <Text style={styles.actionButtonText}>Покинуть группу</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      {/* === МОДАЛЬНОЕ ОКНО ДОБАВЛЕНИЯ УЧАСТНИКА === */}
      <Modal visible={addMemberModalVisible} transparent animationType="slide" onRequestClose={() => setAddMemberModalVisible(false)}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => { setAddMemberModalVisible(false); setSearchQuery(''); setSearchResults([]); }}>
              <Text style={{ fontSize: 16, color: colors.textSecondary }}>Отмена</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Добавить участника</Text>
            <View style={{ width: 60 }} />
          </View>

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
                style={[styles.searchResultItem, { borderBottomColor: colors.border }]}
                onPress={() => handleAddMember(item)}
                disabled={addingUserId === item.id}
              >
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.searchAvatar} />
                ) : (
                  <View style={[styles.searchAvatarPlaceholder, { backgroundColor: colors.inputBackground }]}>
                    <Text>👤</Text>
                  </View>
                )}
                <Text style={[styles.searchUsername, { color: colors.text }]}>{item.username}</Text>
                {addingUserId === item.id && <ActivityIndicator size="small" color={colors.primary} />}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              searchQuery.length >= 2 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Пользователи не найдены</Text>
              ) : (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Введите имя для поиска</Text>
              )
            }
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  avatarSection: { alignItems: 'center', paddingVertical: 30 },
  groupAvatar: { width: 120, height: 120, borderRadius: 60 },
  groupAvatarPlaceholder: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center' },
  avatarLoader: { width: 120, height: 120 },
  avatarEditBadge: { position: 'absolute', bottom: 0, right: 0, width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#fff' },

  nameSection: { alignItems: 'center', paddingHorizontal: 20, marginBottom: 20 },
  nameDisplay: { flexDirection: 'row', alignItems: 'center' },
  groupName: { fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  editIcon: { marginLeft: 10, padding: 5 },
  editNameContainer: { width: '100%' },
  nameInput: { height: 50, borderRadius: 12, paddingHorizontal: 15, fontSize: 18, borderWidth: 1, marginBottom: 10 },
  editNameButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  editButton: { flex: 1, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginHorizontal: 5 },
  memberCount: { fontSize: 14, marginTop: 8, textAlign: 'center' },

  mediaButton: { marginHorizontal: 20, padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  mediaButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  addMemberButton: { marginHorizontal: 20, padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 20 },
  addMemberButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  sectionTitle: { fontSize: 14, fontWeight: '600', paddingHorizontal: 20, marginBottom: 10 },
  
  memberItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 1 },
  memberAvatar: { width: 45, height: 45, borderRadius: 22.5, marginRight: 12 },
  memberAvatarPlaceholder: { width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 16, fontWeight: '600' },
  creatorBadge: { fontSize: 12, marginTop: 2 },
  removeButton: { padding: 10 },

  actionsContainer: { padding: 20, marginTop: 20 },
  actionButton: { padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  actionButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  // Модалка добавления участника
  modalContainer: { flex: 1, paddingTop: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  searchInput: { height: 50, borderRadius: 12, paddingHorizontal: 15, margin: 15, fontSize: 16, borderWidth: 1 },
  searchResultItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 1 },
  searchAvatar: { width: 45, height: 45, borderRadius: 22.5, marginRight: 12 },
  searchAvatarPlaceholder: { width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  searchUsername: { fontSize: 16, flex: 1 },
  emptyText: { textAlign: 'center', marginTop: 40, fontSize: 14 },
});