// screens/ViewProfileScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Linking, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { formatLastSeen } from '../lib/timeAgo';

export default function ViewProfileScreen({ route, navigation }) {
  const { userId } = route.params;
  const { colors } = useTheme();
  
  const [profile, setProfile] = useState(null);
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    // Устанавливаем заголовок для веба
    if (typeof document !== 'undefined') {
      document.title = 'MAX 2.0';
    }
  }, []);

  useEffect(() => {
    loadProfile();

    // Realtime подписка на изменения профиля
    const profileChannel = supabase
      .channel(`profile_updates:${userId}`)
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'profiles',
          filter: `id=eq.${userId}`
        },
        (payload) => {
          setProfile(prev => ({ ...prev, ...payload.new }));
        }
      )
      .subscribe();

    // Realtime подписка на новые статусы
    const storiesChannel = supabase
      .channel(`stories_updates:${userId}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'stories',
          filter: `user_id=eq.${userId}`
        },
        () => {
          // Перезагружаем статусы
          loadProfile();
        }
      )
      .subscribe();

    return () => { 
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(storiesChannel);
    };
  }, [userId]);

  const loadCurrentUserId = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);
  };

  const loadProfile = async () => {
    setLoading(true);
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileData) {
        setProfile(profileData);
        
        const { data: storiesData } = await supabase
          .from('stories')
          .select('*')
          .eq('user_id', userId)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: true });

        const storiesWithProfile = (storiesData || []).map(s => ({
          ...s,
          profiles: profileData
        }));

        setStories(storiesWithProfile);
      }
    } catch (error) {
      console.error('Ошибка загрузки профиля:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewStories = () => {
    if (stories.length > 0) {
      navigation.navigate('StoryViewer', {
        stories: stories,
        initialIndex: 0,
        currentUserId: userId,
      });
    }
  };

  const handleOpenLink = async (url) => {
    try {
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        await Linking.openURL(url);
      }
    } catch (error) {
      console.error('Ошибка открытия ссылки:', error);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Пользователь не найден</Text>
      </View>
    );
  }

  const statusText = formatLastSeen(profile.last_seen);
  const isOnline = statusText === 'онлайн';
  const isMyProfile = userId === currentUserId;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      
      {navigation?.goBack && (
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={{ fontSize: 16, color: colors.primary, fontWeight: 'bold' }}>← Назад</Text>
        </TouchableOpacity>
      )}


      {/* Аватарка */}
      <View style={styles.avatarSection}>
        {profile.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.inputBackground }]}>
            <Text style={{ fontSize: 48 }}>👤</Text>
          </View>
        )}
      </View>

      {/* Имя */}
      <Text style={[styles.username, { color: colors.text }]}>{profile.username || 'Аноним'}</Text>

      {/* Статус онлайн */}
      <Text style={[styles.onlineStatus, { color: isOnline ? '#34C759' : colors.textSecondary }]}>
        {statusText}
      </Text>

      {/* Настроение/статус */}
      {profile.status && (
        <View style={[styles.moodSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.moodText, { color: colors.text }]}>
            {profile.status}
          </Text>
        </View>
      )}

      {/* Кнопка просмотра статусов */}
      {stories.length > 0 && (
        <TouchableOpacity
          style={[styles.viewStoriesButton, { backgroundColor: colors.primary }]}
          onPress={handleViewStories}
        >
          <Text style={styles.viewStoriesButtonText}>
            📷 Просмотреть статус{stories.length > 1 ? 'ы' : ''} ({stories.length})
          </Text>
        </TouchableOpacity>
      )}

      {/* Bio */}
      {profile.bio && (
        <View style={[styles.bioSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>О себе</Text>
          <Text style={[styles.bioText, { color: colors.text }]}>{profile.bio}</Text>
        </View>
      )}

      {/* Ссылки */}
      {profile.links && profile.links.length > 0 && (
        <View style={[styles.linksSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Ссылки</Text>
          {profile.links.map((link, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.linkItem, { borderBottomColor: colors.border }]}
              onPress={() => handleOpenLink(link)}
            >
              <Text style={[styles.linkIcon, { color: colors.primary }]}>🔗</Text>
              <Text style={[styles.linkText, { color: colors.primary }]} numberOfLines={1}>
                {link}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Информация */}
      <View style={[styles.infoSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Информация</Text>
        <Text style={[styles.infoText, { color: colors.text }]}>
          ID: {profile.id.substring(0, 8)}...
        </Text>
        <Text style={[styles.infoText, { color: colors.text }]}>
          Зарегистрирован: {new Date(profile.created_at).toLocaleDateString('ru-RU')}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backButton: { position: 'absolute', top: 40, left: 20, zIndex: 10, padding: 10 },
  
  avatarSection: { alignItems: 'center', paddingVertical: 40 },
  avatar: { width: 120, height: 120, borderRadius: 60 },
  avatarPlaceholder: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center' },
  
  username: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  onlineStatus: { fontSize: 14, textAlign: 'center', marginBottom: 20 },
  
  moodSection: {
    marginHorizontal: 20,
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
    alignItems: 'center',
  },
  moodText: { fontSize: 16, textAlign: 'center', fontStyle: 'italic' },
  
  viewStoriesButton: { marginHorizontal: 20, padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 20 },
  viewStoriesButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  
  bioSection: { marginHorizontal: 20, padding: 20, borderRadius: 12, borderWidth: 1, marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  bioText: { fontSize: 15, lineHeight: 22 },
  
  linksSection: { marginHorizontal: 20, padding: 20, borderRadius: 12, borderWidth: 1, marginBottom: 20 },
  linkItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  linkIcon: { fontSize: 18, marginRight: 10 },
  linkText: { fontSize: 14, flex: 1 },
  
  infoSection: { marginHorizontal: 20, padding: 20, borderRadius: 12, borderWidth: 1, marginBottom: 40 },
  infoText: { fontSize: 14, marginBottom: 8 },
});