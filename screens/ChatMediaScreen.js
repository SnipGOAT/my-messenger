// screens/ChatMediaScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, Image, TouchableOpacity, ActivityIndicator, Platform, Linking } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';

const FILE_ICONS = {
  pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
  ppt: '📽️', pptx: '📽️', zip: '🗜️', rar: '🗜️', '7z': '🗜️',
  txt: '📃', default: '📎'
};

const formatFileSize = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

const getFileIcon = (fileName) => {
  if (!fileName) return '📎';
  const ext = fileName.split('.').pop().toLowerCase();
  return FILE_ICONS[ext] || FILE_ICONS.default;
};

export default function ChatMediaScreen({ route, navigation }) {
  const { chatId } = route.params;
  const { colors } = useTheme();
  
  const [photos, setPhotos] = useState([]);
  const [files, setFiles] = useState([]);
  const [audios, setAudios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('photos'); // 'photos', 'files', 'audios'

  useEffect(() => {
    loadMedia();

    // Realtime подписка на новые медиа
    const channel = supabase
      .channel(`media_updates:${chatId}`)
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'messages',
          filter: `chat_id=eq.${chatId}`
        },
        (payload) => {
          const newMsg = payload.new;
          // Если это медиа-сообщение, добавляем его в соответствующий список
          if (newMsg.file_url) {
            setPhotos(prev => [{
              id: newMsg.id,
              url: newMsg.file_url,
              date: newMsg.created_at,
              author: 'Новое фото'
            }, ...prev]);
          }
          if (newMsg.file_document_url) {
            setFiles(prev => [{
              id: newMsg.id,
              url: newMsg.file_document_url,
              name: newMsg.file_name,
              size: newMsg.file_size,
              date: newMsg.created_at,
              author: 'Новый файл'
            }, ...prev]);
          }
          if (newMsg.audio_url) {
            setAudios(prev => [{
              id: newMsg.id,
              url: newMsg.audio_url,
              date: newMsg.created_at,
              author: 'Новое голосовое'
            }, ...prev]);
          }
        }
      )
      .on(
        'postgres_changes',
        { 
          event: 'DELETE', 
          schema: 'public', 
          table: 'messages',
          filter: `chat_id=eq.${chatId}`
        },
        (payload) => {
          const deletedMsg = payload.old;
          // Удаляем из всех списков
          setPhotos(prev => prev.filter(p => p.id !== deletedMsg.id));
          setFiles(prev => prev.filter(f => f.id !== deletedMsg.id));
          setAudios(prev => prev.filter(a => a.id !== deletedMsg.id));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [chatId]);

  const loadMedia = async () => {
    setLoading(true);
    try {
      // Загружаем все сообщения с медиа
      const { data: messages } = await supabase
        .from('messages')
        .select('id, file_url, file_document_url, file_name, file_size, audio_url, created_at, profiles(username)')
        .eq('chat_id', chatId)
        .or('file_url.not.is.null,file_document_url.not.is.null,audio_url.not.is.null')
        .order('created_at', { ascending: false });

      if (messages) {
        const photosList = messages.filter(m => m.file_url).map(m => ({
          id: m.id,
          url: m.file_url,
          date: m.created_at,
          author: m.profiles?.username || 'Аноним'
        }));

        const filesList = messages.filter(m => m.file_document_url).map(m => ({
          id: m.id,
          url: m.file_document_url,
          name: m.file_name,
          size: m.file_size,
          date: m.created_at,
          author: m.profiles?.username || 'Аноним'
        }));

        const audiosList = messages.filter(m => m.audio_url).map(m => ({
          id: m.id,
          url: m.audio_url,
          date: m.created_at,
          author: m.profiles?.username || 'Аноним'
        }));

        setPhotos(photosList);
        setFiles(filesList);
        setAudios(audiosList);
      }
    } catch (error) {
      console.error('Ошибка загрузки медиа:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenFile = async (url) => {
    try {
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        await Linking.openURL(url);
      }
    } catch (error) {
      console.error('Ошибка открытия:', error);
    }
  };

  const renderPhoto = ({ item }) => (
    <TouchableOpacity 
      style={styles.photoItem} 
      onPress={() => handleOpenFile(item.url)}
      activeOpacity={0.8}
    >
      <Image source={{ uri: item.url }} style={styles.photoImage} resizeMode="cover" />
    </TouchableOpacity>
  );

  const renderFile = ({ item }) => (
    <TouchableOpacity 
      style={[styles.fileItem, { borderBottomColor: colors.border }]} 
      onPress={() => handleOpenFile(item.url)}
      activeOpacity={0.7}
    >
      <View style={[styles.fileIconContainer, { backgroundColor: colors.inputBackground }]}>
        <Text style={styles.fileIcon}>{getFileIcon(item.name)}</Text>
      </View>
      <View style={styles.fileInfo}>
        <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={[styles.fileMeta, { color: colors.textSecondary }]}>
          {formatFileSize(item.size)} • {item.author}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderAudio = ({ item }) => (
    <TouchableOpacity 
      style={[styles.audioItem, { borderBottomColor: colors.border }]} 
      onPress={() => handleOpenFile(item.url)}
      activeOpacity={0.7}
    >
      <View style={[styles.audioIconContainer, { backgroundColor: colors.inputBackground }]}>
        <Text style={styles.audioIcon}>🎤</Text>
      </View>
      <View style={styles.audioInfo}>
        <Text style={[styles.audioTitle, { color: colors.text }]}>Голосовое сообщение</Text>
        <Text style={[styles.audioMeta, { color: colors.textSecondary }]}>
          {item.author}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    if (activeTab === 'photos') {
      if (photos.length === 0) {
        return <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Нет фотографий</Text>;
      }
      return (
        <FlatList
          data={photos}
          renderItem={renderPhoto}
          keyExtractor={item => item.id}
          numColumns={3}
          contentContainerStyle={styles.photosGrid}
        />
      );
    }

    if (activeTab === 'files') {
      if (files.length === 0) {
        return <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Нет файлов</Text>;
      }
      return (
        <FlatList
          data={files}
          renderItem={renderFile}
          keyExtractor={item => item.id}
        />
      );
    }

    if (activeTab === 'audios') {
      if (audios.length === 0) {
        return <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Нет голосовых сообщений</Text>;
      }
      return (
        <FlatList
          data={audios}
          renderItem={renderAudio}
          keyExtractor={item => item.id}
        />
      );
    }
  };

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

      {/* Вкладки */}
      <View style={[styles.tabsContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'photos' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('photos')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'photos' ? colors.primary : colors.textSecondary }]}>
             Фото ({photos.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'files' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('files')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'files' ? colors.primary : colors.textSecondary }]}>
            📎 Файлы ({files.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'audios' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('audios')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'audios' ? colors.primary : colors.textSecondary }]}>
            🎤 Голосовые ({audios.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Контент */}
      <View style={styles.content}>
        {renderContent()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  tabsContainer: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, paddingVertical: 15, alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '600' },
  
  content: { flex: 1 },
  
  // Фото
  photosGrid: { padding: 2 },
  photoItem: { flex: 1, aspectRatio: 1, margin: 2, borderRadius: 8, overflow: 'hidden' },
  photoImage: { width: '100%', height: '100%' },
  
  // Файлы
  fileItem: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1 },
  fileIconContainer: { width: 50, height: 50, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  fileIcon: { fontSize: 28 },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  fileMeta: { fontSize: 12 },
  
  // Аудио
  audioItem: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1 },
  audioIconContainer: { width: 50, height: 50, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  audioIcon: { fontSize: 28 },
  audioInfo: { flex: 1 },
  audioTitle: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  audioMeta: { fontSize: 12 },
  
  emptyText: { textAlign: 'center', marginTop: 60, fontSize: 16 },
});