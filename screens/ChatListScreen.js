// screens/ChatListScreen.js
import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { formatLastSeen } from '../lib/timeAgo';
import StoriesBar from '../components/StoriesBar';

export default function ChatListScreen({ navigation }) {
  const { colors, themeMode, toggleTheme } = useTheme();
  const [chats, setChats] = useState([]);
  const [userId, setUserId] = useState(null);

  useOnlineStatus();

  useFocusEffect(
    React.useCallback(() => {
      loadUserData();
      loadChats();
    }, [])
  );

  // Realtime подписка на обновления профилей, сообщений, групп и чатов
  useFocusEffect(
    React.useCallback(() => {
      const channel = supabase
        .channel('list_updates')
        // Обновления профилей (статусы онлайн)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles' },
          (payload) => {
            const updatedProfile = payload.new;
            setChats(prev => 
              prev.map(chat => {
                if (chat.otherUserId === updatedProfile.id) {
                  return { ...chat, lastSeen: updatedProfile.last_seen, avatar: updatedProfile.avatar_url || chat.avatar };
                }
                return chat;
              })
            );
          }
        )
        // Новые сообщения (увеличиваем счетчик непрочитанных)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          (payload) => {
            const newMsg = payload.new;
            if (newMsg.sender_id !== userId && !newMsg.is_read) {
              setChats(prev => prev.map(chat => 
                chat.id === newMsg.chat_id 
                  ? { ...chat, unreadCount: (chat.unreadCount || 0) + 1 } 
                  : chat
              ));
            }
          }
        )
        // Обновления сообщений (помечаем как прочитанные)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'messages' },
          (payload) => {
            const updatedMsg = payload.new;
            if (updatedMsg.is_read === true) {
              setChats(prev => prev.map(chat => 
                chat.id === updatedMsg.chat_id 
                  ? { ...chat, unreadCount: Math.max(0, (chat.unreadCount || 1) - 1) } 
                  : chat
              ));
            }
          }
        )
        // === НОВОЕ: Удаление сообщений (уменьшаем счетчик непрочитанных) ===
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'messages' },
          (payload) => {
            const deletedMsg = payload.old;
            if (deletedMsg.sender_id !== userId && !deletedMsg.is_read) {
              setChats(prev => prev.map(chat => 
                chat.id === deletedMsg.chat_id 
                  ? { ...chat, unreadCount: Math.max(0, (chat.unreadCount || 1) - 1) } 
                  : chat
              ));
            }
          }
        )
        // Обновления групп (название, аватарка)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'chats' },
          (payload) => {
            const updatedChat = payload.new;
            setChats(prev => prev.map(chat => {
              if (chat.id === updatedChat.id && chat.isGroup) {
                return { 
                  ...chat, 
                  title: updatedChat.name || chat.title,
                  avatar: updatedChat.avatar_url || chat.avatar
                };
              }
              return chat;
            }));
          }
        )
        // === НОВОЕ: Удаление чатов (когда группу удалили) ===
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'chats' },
          (payload) => {
            const deletedChat = payload.old;
            setChats(prev => prev.filter(chat => chat.id !== deletedChat.id));
          }
        )
        // === НОВОЕ: Создание новых чатов (когда тебя добавили в группу или создали личный чат) ===
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_members' },
          (payload) => {
            const newMember = payload.new;
            console.log('➕ Новое членство в чате:', newMember);
            if (newMember.user_id === userId) {
              console.log('🔄 Перезагрузка списка чатов (добавлен в новый чат)');
              loadChats();
            }
          }
        )
        // === НОВОЕ: Удаление из чатов (когда тебя удалили из группы) ===
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'chat_members' },
          (payload) => {
            const deletedMember = payload.old;
            console.log('➖ Удаление из чата:', deletedMember);
            if (deletedMember.user_id === userId) {
              console.log('🔄 Перезагрузка списка чатов (удален из чата)');
              loadChats();
            }
          }
        )
        // === НОВОЕ: Обновления статусов (Stories) ===
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'stories' },
          () => {
            console.log('📷 Обновление статусов');
            // StoriesBar сам подписан на обновления, но на всякий случай перезагрузим чаты
            // (не обязательно, но полезно для синхронизации)
          }
        )
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }, [userId])
  );

  const loadUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
    }
  };

  const loadChats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      console.log('📥 Загрузка чатов для пользователя:', user.id);

      const { data: memberships } = await supabase.from('chat_members').select('chat_id').eq('user_id', user.id);
      if (!memberships || memberships.length === 0) { 
        console.log('⚠️ Чатов не найдено');
        setChats([]); 
        return; 
      }
      const chatIds = memberships.map(m => m.chat_id);
      console.log('📋 ID чатов:', chatIds);

      const { data: chatsData, error: chatsError } = await supabase
        .from('chats')
        .select(`
          id,
          name,
          is_group,
          avatar_url,
          chat_members (
            user_id,
            profiles (
              id,
              username,
              avatar_url,
              last_seen
            )
          )
        `)
        .in('id', chatIds);

      if (chatsError) {
        console.error('❌ Ошибка загрузки чатов:', chatsError);
        return;
      }

      console.log('📊 Получены чаты из базы:', chatsData);

      const { data: unreadMessages } = await supabase
        .from('messages')
        .select('chat_id')
        .eq('is_read', false)
        .neq('sender_id', user.id)
        .in('chat_id', chatIds);

      const unreadCounts = {};
      unreadMessages?.forEach(msg => {
        unreadCounts[msg.chat_id] = (unreadCounts[msg.chat_id] || 0) + 1;
      });

      const formattedChats = chatsData.map(chat => {
        console.log('🔄 Обработка чата:', chat);
        
        if (chat.is_group) {
          const formatted = { 
            id: chat.id, 
            title: chat.name || 'Групповой чат',
            avatar: chat.avatar_url,
            lastSeen: null,
            otherUserId: null,
            unreadCount: unreadCounts[chat.id] || 0,
            isGroup: true
          };
          console.log('✅ Групповой чат:', formatted);
          return formatted;
        }

        const otherMember = chat.chat_members?.find(m => m.user_id !== user.id);
        console.log('👤 Другой участник:', otherMember);
        console.log('📸 Профиль участника:', otherMember?.profiles);
        console.log('🖼️ URL аватарки:', otherMember?.profiles?.avatar_url);

        const formatted = { 
          id: chat.id, 
          title: otherMember?.profiles?.username || 'Неизвестный',
          avatar: otherMember?.profiles?.avatar_url || null,
          lastSeen: otherMember?.profiles?.last_seen,
          otherUserId: otherMember?.user_id,
          unreadCount: unreadCounts[chat.id] || 0,
          isGroup: false
        };
        
        console.log('✅ Личный чат:', formatted);
        return formatted;
      });

      console.log('🎯 Итоговый список чатов:', formattedChats);
      setChats(formattedChats);
    } catch (error) {
      console.error('💥 Ошибка в loadChats:', error);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Мои чаты</Text>
        <TouchableOpacity style={[styles.themeButton, { backgroundColor: colors.inputBackground }]} onPress={toggleTheme}>
          <Text style={styles.themeButtonText}>{themeMode === 'light' ? '☀️' : '🌙'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.searchIconButton, { backgroundColor: colors.primary }]} onPress={() => navigation.navigate('NewChat')}>
          <Text style={styles.searchIconText}>🔍</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.groupButton, { backgroundColor: colors.primary }]} 
          onPress={() => navigation.navigate('CreateGroup')}
        >
          <Text style={styles.groupButtonText}>👥</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.settingsButton, { backgroundColor: colors.inputBackground }]} 
          onPress={() => navigation.navigate('Settings')}
        >
          <Text style={styles.settingsButtonText}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* === СТАТУСЫ / ИСТОРИИ === */}
      <StoriesBar 
        currentUserId={userId}
        currentUserAvatar={null}
        onAddPress={() => navigation.navigate('CreateStory')}
        onViewPress={async (storyUser) => {
          if (storyUser.isCreate) {
            navigation.navigate('CreateStory');
            return;
          }

          const { data: userStories } = await supabase
            .from('stories')
            .select('*')
            .eq('user_id', storyUser.userId)
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .order('created_at', { ascending: true });

          if (userStories && userStories.length > 0) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('username, avatar_url')
              .eq('id', storyUser.userId)
              .single();

            const storiesWithProfile = userStories.map(s => ({
              ...s,
              profiles: profile || { username: storyUser.username, avatar_url: storyUser.avatar }
            }));

            navigation.navigate('StoryViewer', {
              stories: storiesWithProfile,
              initialIndex: 0,
              currentUserId: userId,
            });
          }
        }}
      />

      <FlatList
        data={chats}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const statusText = item.isGroup ? 'Групповой чат' : formatLastSeen(item.lastSeen);
          const isOnline = !item.isGroup && statusText === 'онлайн';

          console.log('🎨 Рендер чата:', item);

          return (
            <TouchableOpacity 
              style={[styles.chatItem, { borderBottomColor: colors.border }]} 
              onPress={() => navigation.navigate('Chat', { chatId: item.id, title: item.title })}
            >
              <View style={styles.chatRow}>
                {item.avatar ? (
                  <Image 
                    source={{ 
                      uri: item.avatar,
                      cache: 'reload'
                    }} 
                    style={styles.chatAvatar}
                    onError={(e) => {
                      console.log('❌ Ошибка загрузки аватарки на вебе:', e.nativeEvent.error);
                      console.log('URL аватарки:', item.avatar);
                    }}
                  />
                ) : (
                  <View style={[styles.chatAvatarPlaceholder, { backgroundColor: colors.inputBackground }]}>
                    <Text>{item.isGroup ? '👥' : '👤'}</Text>
                  </View>
                )}
                <View style={styles.chatInfo}>
                  <Text style={[styles.chatTitle, { color: colors.text }]}>{item.title}</Text>
                  <Text style={[styles.chatStatus, { color: isOnline ? '#34C759' : colors.textSecondary }]}>
                    {statusText}
                  </Text>
                </View>
                
                {item.unreadCount > 0 && (
                  <View style={styles.badgeContainer}>
                    <Text style={styles.badgeText}>
                      {item.unreadCount > 99 ? '99+' : item.unreadCount}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.textSecondary }]}>Нет чатов. Создайте первый!</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', flex: 1 },
  themeButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  themeButtonText: { fontSize: 20 },
  searchIconButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  searchIconText: { fontSize: 20, color: '#fff' },
  groupButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  groupButtonText: {
    fontSize: 20,
    color: '#fff',
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsButtonText: {
    fontSize: 20,
  },
  chatItem: { padding: 15, borderBottomWidth: 1 },
  chatRow: { flexDirection: 'row', alignItems: 'center' },
  chatAvatar: { width: 50, height: 50, borderRadius: 25, marginRight: 15 },
  chatAvatarPlaceholder: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  chatInfo: { flex: 1, justifyContent: 'center' },
  chatTitle: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  chatStatus: { fontSize: 14 },
  emptyText: { textAlign: 'center', marginTop: 50, fontSize: 16 },
  badgeContainer: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 10,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});