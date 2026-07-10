// components/StoriesBar.js
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';

export default function StoriesBar({ currentUserId, currentUserAvatar, onAddPress, onViewPress }) {
  const { colors } = useTheme();
  const [stories, setStories] = useState([]);
  const [myStories, setMyStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userAvatar, setUserAvatar] = useState(currentUserAvatar || null);

  useEffect(() => {
    loadStories();
    loadUserAvatar();

    const channel = supabase
      .channel('stories_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, () => {
        loadStories();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUserId]);

  const loadUserAvatar = async () => {
    if (!currentUserId) return;
    
    console.log('🔍 Загружаем аватарку текущего пользователя:', currentUserId);
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', currentUserId)
      .single();

    console.log('👤 Аватарка текущего пользователя:', profile?.avatar_url);
    if (profile?.avatar_url) {
      setUserAvatar(profile.avatar_url);
    }
  };

  const loadStories = async () => {
    setLoading(true);
    try {
      // Удаляем старые статусы
      await supabase.rpc('cleanup_old_stories');

      // Загружаем все актуальные статусы БЕЗ join с profiles
      const { data: allStories, error: storiesError } = await supabase
        .from('stories')
        .select('*')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      console.log('📊 Статусы из базы:', allStories);

      if (!allStories || allStories.length === 0) {
        setStories([]);
        setMyStories([]);
        setLoading(false);
        return;
      }

      // Получаем уникальные user_id
      const userIds = [...new Set(allStories.map(s => s.user_id))];
      
      // Загружаем профили всех пользователей
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', userIds);

      console.log('👤 Профили:', profiles);

      // Создаем мапу профилей
      const profilesMap = {};
      profiles?.forEach(p => {
        profilesMap[p.id] = p;
      });

      // Загружаем просмотры для текущего пользователя
      const { data: views } = await supabase
        .from('story_views')
        .select('story_id')
        .eq('viewer_id', currentUserId);

      const viewedStoryIds = new Set(views?.map(v => v.story_id) || []);

      // Разделяем свои и чужие статусы
      const myStoriesList = allStories.filter(s => s.user_id === currentUserId);
      console.log(' Мои статусы:', myStoriesList);
      setMyStories(myStoriesList);

      const otherStories = allStories.filter(s => s.user_id !== currentUserId);

      // Группируем чужие статусы по пользователям
      const grouped = {};
      otherStories.forEach(story => {
        const profile = profilesMap[story.user_id];
        
        if (!grouped[story.user_id]) {
          grouped[story.user_id] = {
            userId: story.user_id,
            username: profile?.username || 'Аноним',
            avatar: profile?.avatar_url,
            stories: [],
            hasUnviewed: false,
          };
        }
        grouped[story.user_id].stories.push(story);

        if (!viewedStoryIds.has(story.id)) {
          grouped[story.user_id].hasUnviewed = true;
        }
      });

      // Сортируем: сначала с непросмотренными, потом по дате
      const sorted = Object.values(grouped).sort((a, b) => {
        if (a.hasUnviewed && !b.hasUnviewed) return -1;
        if (!a.hasUnviewed && b.hasUnviewed) return 1;
        return new Date(b.stories[0].created_at) - new Date(a.stories[0].created_at);
      });

      console.log('✅ Итоговый список:', sorted);
      setStories(sorted);
    } catch (error) {
      console.error(' Ошибка загрузки статусов:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMyStoryPress = () => {
    if (myStories.length > 0) {
      // Если есть свои статусы — открываем просмотрщик
      onViewPress?.({
        userId: currentUserId,
        username: 'Вы',
        avatar: userAvatar,
        stories: myStories,
        isMe: true,
      });
    } else {
      // Если статусов нет — открываем создание (через onViewPress с флагом isCreate)
      onViewPress?.({ isCreate: true });
    }
  };

  const hasMyUnviewed = myStories.length > 0;

  if (loading && stories.length === 0 && myStories.length === 0) {
    return (
      <View style={[styles.container, { borderBottomColor: colors.border }]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  // Объединяем "Мой статус" и чужие статусы в один список
  const allItems = [
    { isMe: true },
    ...stories,
  ];

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      <FlatList
        data={allItems}
        renderItem={({ item }) => {
          if (item.isMe) {
            // Мой статус (объединённый с кнопкой добавления)
            const borderColor = hasMyUnviewed ? colors.primary : colors.textSecondary;
            console.log('️ Аватарка для моего статуса:', userAvatar);
            
            return (
              <TouchableOpacity style={styles.storyItem} onPress={handleMyStoryPress}>
                <View style={[styles.avatarContainer, { borderColor }]}>
                  {userAvatar ? (
                    <Image 
                      source={{ uri: userAvatar, cache: 'reload' }} 
                      style={styles.avatar}
                      onError={(e) => console.log('❌ Ошибка загрузки моей аватарки:', e.nativeEvent.error)}
                    />
                  ) : (
                    <View style={[styles.avatarPlaceholder, { backgroundColor: colors.inputBackground }]}>
                      <Text>👤</Text>
                    </View>
                  )}
                  {/* Значок "+" в углу */}
                  <View style={[styles.addBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.addBadgeText}>+</Text>
                  </View>
                </View>
                <Text style={[styles.username, { color: colors.text }]} numberOfLines={1}>
                  Ваш статус
                </Text>
              </TouchableOpacity>
            );
          }

          // Чужой статус
          const borderColor = item.hasUnviewed ? colors.primary : colors.textSecondary;
          return (
            <TouchableOpacity
              style={styles.storyItem}
              onPress={() => onViewPress?.(item)}
            >
              <View style={[styles.avatarContainer, { borderColor }]}>
                {item.avatar ? (
                  <Image source={{ uri: item.avatar }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: colors.inputBackground }]}>
                    <Text></Text>
                  </View>
                )}
              </View>
              <Text style={[styles.username, { color: colors.text }]} numberOfLines={1}>
                {item.username}
              </Text>
            </TouchableOpacity>
          );
        }}
        keyExtractor={item => item.isMe ? 'me' : item.userId}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  listContent: {
    paddingHorizontal: 10,
  },
  storyItem: {
    alignItems: 'center',
    marginRight: 15,
    width: 70,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  addBadgeText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    lineHeight: 20,
  },
  username: {
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 70,
  },
});