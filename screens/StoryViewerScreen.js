// screens/StoryViewerScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Dimensions, Pressable, ActivityIndicator, Alert, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const STORY_DURATION = 5000; // 5 секунд на один статус
const TAP_THRESHOLD = 200; // Если зажатие меньше 200мс — считаем тапом

export default function StoryViewerScreen({ route, navigation }) {
  const { stories, initialIndex = 0, currentUserId } = route.params;
  const { colors } = useTheme();
  
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewCount, setViewCount] = useState(0);
  const [deleting, setDeleting] = useState(false);
  
  const progressInterval = useRef(null);
  const startTimeRef = useRef(Date.now());
  const elapsedBeforePauseRef = useRef(0);
  const pressStartTimeRef = useRef(0);
  const currentStory = stories[currentIndex];

  useEffect(() => {
    if (currentStory) {
      markAsViewed(currentStory.id);
    }
  }, [currentStory]);

  // Загружаем актуальное количество просмотров
  useEffect(() => {
    if (currentStory?.id) {
      loadViewCount();
    }
  }, [currentStory?.id]);

  const loadViewCount = async () => {
    if (!currentStory?.id) return;
    
    try {
      const { count, error } = await supabase
        .from('story_views')
        .select('*', { count: 'exact', head: true })
        .eq('story_id', currentStory.id);

      if (error) {
        console.error('Ошибка загрузки просмотров:', error);
        return;
      }

      console.log('Количество просмотров:', count);
      setViewCount(count || 0);
    } catch (error) {
      console.error('Ошибка в loadViewCount:', error);
    }
  };

  useEffect(() => {
    startProgress();
    return () => {
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, [currentIndex, isPaused]);

  const startProgress = () => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    
    if (isPaused) {
      return;
    }

    startTimeRef.current = Date.now();
    
    progressInterval.current = setInterval(() => {
      const elapsed = elapsedBeforePauseRef.current + (Date.now() - startTimeRef.current);
      const newProgress = Math.min((elapsed / STORY_DURATION) * 100, 100);
      setProgress(newProgress);

      if (newProgress >= 100) {
        goToNext();
      }
    }, 50);
  };

  const markAsViewed = async (storyId) => {
    try {
      const { error } = await supabase
        .from('story_views')
        .insert({
          story_id: storyId,
          viewer_id: currentUserId,
        });

      if (error) {
        if (error.code === '23505') {
          console.log('Статус уже был просмотрен');
        } else {
          console.log('Не удалось сохранить просмотр:', error.message);
        }
      }
    } catch (error) {
      console.log('Просмотр уже сохранён');
    }
  };

  // === НОВОЕ: Удаление статуса ===
  const handleDeleteStory = async () => {
    if (!currentStory) return;

    const confirmed = Platform.OS === 'web'
      ? window.confirm('Удалить этот статус? Он исчезнет у всех.')
      : await new Promise(resolve => {
          Alert.alert(
            'Удалить статус?',
            'Этот статус исчезнет у всех пользователей.',
            [
              { text: 'Отмена', onPress: () => resolve(false), style: 'cancel' },
              { text: 'Удалить', onPress: () => resolve(true), style: 'destructive' }
            ]
          );
        });

    if (!confirmed) return;

    setDeleting(true);
    try {
      // Удаляем статус из базы
      const { error } = await supabase
        .from('stories')
        .delete()
        .eq('id', currentStory.id)
        .eq('user_id', currentUserId); // Защита: только автор может удалить

      if (error) throw error;

      console.log('✅ Статус удалён:', currentStory.id);

      // Удаляем из локального списка
      const updatedStories = stories.filter(s => s.id !== currentStory.id);

      if (updatedStories.length === 0) {
        // Если это был последний статус — возвращаемся назад
        navigation.goBack();
      } else {
        // Если есть ещё статусы — переходим к следующему (или предыдущему, если удалили последний)
        const newIndex = currentIndex >= updatedStories.length ? updatedStories.length - 1 : currentIndex;
        setCurrentIndex(newIndex);
        setProgress(0);
        elapsedBeforePauseRef.current = 0;
      }
    } catch (error) {
      console.error('❌ Ошибка удаления:', error);
      Platform.OS === 'web' 
        ? window.alert('Ошибка удаления: ' + error.message)
        : Alert.alert('Ошибка', error.message);
    } finally {
      setDeleting(false);
    }
  };

  const goToNext = () => {
    elapsedBeforePauseRef.current = 0;
    setProgress(0);
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      navigation.goBack();
    }
  };

  const goToPrevious = () => {
    elapsedBeforePauseRef.current = 0;
    setProgress(0);
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handlePressIn = (event) => {
    pressStartTimeRef.current = Date.now();
    setIsPaused(true);
  };

  const handlePressOut = (event) => {
    const pressDuration = Date.now() - pressStartTimeRef.current;
    setIsPaused(false);

    if (pressDuration < TAP_THRESHOLD) {
      const { locationX } = event.nativeEvent;
      if (locationX < SCREEN_WIDTH / 2) {
        goToPrevious();
      } else {
        goToNext();
      }
    }
  };

  if (!currentStory) {
    return (
      <View style={[styles.container, { backgroundColor: '#000' }]}>
        <Text style={{ color: '#fff' }}>Статус не найден</Text>
      </View>
    );
  }

  const isMyStory = currentStory.user_id === currentUserId;

  return (
    <View style={[styles.container, { backgroundColor: '#000' }]}>
      
      {/* Прогресс-бары сверху */}
      <View style={styles.progressContainer}>
        {stories.map((_, index) => (
          <View key={index} style={styles.progressBarBackground}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width:
                    index < currentIndex ? '100%' :
                    index === currentIndex ? `${progress}%` : '0%',
                },
              ]}
            />
          </View>
        ))}
      </View>

      {/* Шапка: аватар, имя, просмотры и удаление */}
      <View style={styles.header}>
        {currentStory.profiles?.avatar_url ? (
          <Image source={{ uri: currentStory.profiles.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text>👤</Text>
          </View>
        )}
        <Text style={styles.username}>{currentStory.profiles?.username || 'Аноним'}</Text>
        
        {/* Кнопка просмотров (только для автора) */}
        {isMyStory && (
          <TouchableOpacity 
            onPress={() => navigation.navigate('StoryViews', { storyId: currentStory.id })} 
            style={styles.viewsButton}
            disabled={deleting}
          >
            <Text style={styles.viewsText}>👁️ {viewCount}</Text>
          </TouchableOpacity>
        )}

        {/* НОВОЕ: Кнопка удаления (только для автора) */}
        {isMyStory && (
          <TouchableOpacity 
            onPress={handleDeleteStory}
            disabled={deleting}
            style={[styles.deleteButton, deleting && styles.deleteButtonDisabled]}
          >
            <Text style={styles.deleteButtonText}>
              {deleting ? '' : '🗑️'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton} disabled={deleting}>
          <Text style={styles.closeText}></Text>
        </TouchableOpacity>
      </View>

      {/* Картинка статуса */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
      <Pressable 
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.imageContainer}
        disabled={deleting}
      >
        <Image
          source={{ uri: currentStory.image_url }}
          style={styles.storyImage}
          resizeMode="contain"
          onLoad={() => {
            setLoading(false);
            elapsedBeforePauseRef.current = 0;
          }}
        />
      </Pressable>

      {/* Индикатор паузы */}
      {isPaused && !deleting && (
        <View style={styles.pauseIndicator}>
          <Text style={styles.pauseText}>⏸</Text>
        </View>
      )}

      {/* Индикатор удаления */}
      {deleting && (
        <View style={styles.pauseIndicator}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      {/* Подпись (если есть) */}
      {currentStory.caption && (
        <View style={styles.captionContainer}>
          <Text style={styles.captionText}>{currentStory.caption}</Text>
        </View>
      )}

      {/* Счетчик */}
      <View style={styles.counterContainer}>
        <Text style={styles.counterText}>
          {currentIndex + 1} / {stories.length}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  progressContainer: {
    position: 'absolute',
    top: 50,
    left: 10,
    right: 10,
    flexDirection: 'row',
    zIndex: 10,
  },
  progressBarBackground: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: 2,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#fff',
  },
  
  header: {
    position: 'absolute',
    top: 65,
    left: 15,
    right: 15,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  avatarPlaceholder: { 
    width: 36, height: 36, borderRadius: 18, 
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 10 
  },
  username: { color: '#fff', fontSize: 15, fontWeight: '600', flex: 1 },
  
  viewsButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    marginRight: 8,
  },
  viewsText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  
  deleteButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(255,59,48,0.3)',
    borderRadius: 12,
    marginRight: 8,
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  deleteButtonText: {
    fontSize: 18,
  },
  
  closeButton: { padding: 8 },
  closeText: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  
  imageContainer: { 
    width: SCREEN_WIDTH, 
    height: SCREEN_HEIGHT,
  },
  storyImage: { 
    width: '100%', 
    height: '100%',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
    zIndex: 5,
  },
  
  pauseIndicator: {
    position: 'absolute',
    top: '50%',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
  },
  pauseText: {
    color: '#fff',
    fontSize: 28,
  },
  
  captionContainer: {
    position: 'absolute',
    bottom: 60,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 12,
    borderRadius: 10,
  },
  captionText: { color: '#fff', fontSize: 15, textAlign: 'center' },
  
  counterContainer: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  counterText: { color: '#fff', fontSize: 13 },
});