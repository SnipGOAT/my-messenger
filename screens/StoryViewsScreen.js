// screens/StoryViewsScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Image, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';

// Функция для красивого отображения времени ("5 мин. назад")
const timeAgo = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'только что';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} мин. назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч. назад`;
  return `${Math.floor(hours / 24)} дн. назад`;
};

export default function StoryViewsScreen({ route, navigation }) {
  const { storyId } = route.params;
  const { colors } = useTheme();
  const [viewers, setViewers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadViews();
  }, [storyId]);

  const loadViews = async () => {
    setLoading(true);
    try {
      // 1. Загружаем просмотры
      const { data: views } = await supabase
        .from('story_views')
        .select('viewer_id, viewed_at')
        .eq('story_id', storyId)
        .order('viewed_at', { ascending: false });

      if (views && views.length > 0) {
        const viewerIds = views.map(v => v.viewer_id);
        
        // 2. Загружаем профили отдельно (чтобы избежать ошибки foreign key)
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', viewerIds);

        const profilesMap = {};
        profiles?.forEach(p => { profilesMap[p.id] = p; });

        // 3. Собираем данные вместе
        const formattedViewers = views.map(v => ({
          ...v,
          profile: profilesMap[v.viewer_id] || { username: 'Аноним', avatar_url: null }
        }));
        
        setViewers(formattedViewers);
      }
    } catch (error) {
      console.error('Ошибка загрузки просмотров:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderViewer = ({ item }) => (
    <View style={[styles.viewerItem, { borderBottomColor: colors.border }]}>
      {item.profile.avatar_url ? (
        <Image source={{ uri: item.profile.avatar_url }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatarPlaceholder, { backgroundColor: colors.inputBackground }]}>
          <Text>👤</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={[styles.username, { color: colors.text }]}>{item.profile.username}</Text>
        <Text style={[styles.timeAgo, { color: colors.textSecondary }]}>
          {timeAgo(item.viewed_at)}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Кнопка назад для десктопа */}
      {navigation?.goBack && (
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={{ fontSize: 16, color: colors.primary, fontWeight: 'bold' }}>← Назад</Text>
        </TouchableOpacity>
      )}

      <Text style={[styles.title, { color: colors.text }]}>Просмотры</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Всего: {viewers.length}
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
      ) : viewers.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          Пока никто не посмотрел этот статус
        </Text>
      ) : (
        <FlatList
          data={viewers}
          renderItem={renderViewer}
          keyExtractor={item => item.viewer_id}
          style={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 40 },
  backButton: { position: 'absolute', top: 40, left: 20, zIndex: 10, padding: 10 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 5 },
  subtitle: { fontSize: 14, textAlign: 'center', marginBottom: 20 },
  list: { flex: 1 },
  viewerItem: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1 },
  avatar: { width: 50, height: 50, borderRadius: 25, marginRight: 15 },
  avatarPlaceholder: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  info: { flex: 1 },
  username: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  timeAgo: { fontSize: 13 },
  emptyText: { textAlign: 'center', marginTop: 60, fontSize: 16 },
});