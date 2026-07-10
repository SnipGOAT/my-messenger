// screens/ChatScreen.js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, Image, ActivityIndicator, Alert, Pressable, Modal } from 'react-native';
import { useRealtimeMessages } from '../hooks/useRealtimeMessages';
import { useMessageReactions } from '../hooks/useMessageReactions';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { supabase } from '../lib/supabase';
import { uploadImage } from '../lib/storage';
import { useTheme } from '../contexts/ThemeContext';
import { parseMarkdown, wrapWithMarkdown } from '../lib/markdown';
import AudioPlayer from '../components/AudioPlayer';
import FileMessage from '../components/FileMessage';
import { Video, ResizeMode } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👎'];

const FILE_ICONS = {
  pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
  ppt: '📽️', pptx: '📽️', zip: '🗜️', rar: '🗜️', '7z': '🗜️',
  txt: '📃', default: '📎'
};

const formatTime = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
};

const formatDateHeader = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isToday = date.toDateString() === today.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return 'Сегодня';
  if (isYesterday) return 'Вчера';

  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
};

const groupMessagesByDate = (messages) => {
  const groups = {};
  messages.forEach(msg => {
    if (!msg || !msg.id) return;
    const date = new Date(msg.created_at);
    const dateKey = date.toDateString();
    if (!groups[dateKey]) {
      groups[dateKey] = { date: msg.created_at, messages: [] };
    }
    groups[dateKey].messages.push(msg);
  });
  return Object.values(groups).sort((a, b) => new Date(a.date) - new Date(b.date));
};

const downloadFile = async (url, filename, type = 'image') => {
  try {
    if (Platform.OS === 'web') {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return true;
    } else {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Ошибка', 'Необходимо разрешение на доступ к медиафайлам');
        return false;
      }
      const fileUri = FileSystem.documentDirectory + filename;
      const { uri } = await FileSystem.downloadAsync(url, fileUri);
      if (type === 'video') {
        await MediaLibrary.saveToLibraryAsync(uri);
      } else {
        await MediaLibrary.createAssetAsync(uri);
      }
      await FileSystem.deleteAsync(uri, { idempotent: true });
      return true;
    }
  } catch (error) {
    console.error('Ошибка скачивания:', error);
    Alert.alert('Ошибка', 'Не удалось скачать файл');
    return false;
  }
};

export default function ChatScreen({ route, navigation }) {
  const { chatId, title } = route.params || {};
  const { messages, sendMessage, editMessage, deleteMessage, sendAudio, loading } = useRealtimeMessages(chatId);
  const [text, setText] = useState('');
  const [currentUserId, setCurrentUserId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  
  const [isGroup, setIsGroup] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [pinnedMessage, setPinnedMessage] = useState(null);

  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [forwardModalVisible, setForwardModalVisible] = useState(false);
  const [forwardChats, setForwardChats] = useState([]);

  const [stagedMedia, setStagedMedia] = useState(null);

  // НОВОЕ: для Markdown-форматирования
  const [inputSelection, setInputSelection] = useState({ start: 0, end: 0 });

  // Для отслеживания прочтений в группах
  const [messageReads, setMessageReads] = useState({});
  const [readersModalVisible, setReadersModalVisible] = useState(false);
  const [readersList, setReadersList] = useState([]);

  const typingTimeoutRef = useRef(null);
  const channelRef = useRef(null);
  const flatListRef = useRef(null);
  const textInputRef = useRef(null);
  const { colors } = useTheme();
  
  const { isRecording, duration, startRecording, stopRecording, cancelRecording } = useAudioRecorder();

  const messageIds = messages.filter(m => m && m.id).map(m => m.id);
  const { reactions, toggleReaction } = useMessageReactions(messageIds);

  const groupedMessages = useMemo(() => {
    return groupMessagesByDate(messages);
  }, [messages]);

  useEffect(() => {
    const loadChatDetails = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: chat } = await supabase
        .from('chats')
        .select('is_group, creator_id, pinned_message_id')
        .eq('id', chatId)
        .single();

      if (chat) {
        setIsGroup(chat.is_group);
        setIsCreator(chat.creator_id === user.id);
        
        if (chat.pinned_message_id) {
          const { data: msg } = await supabase
            .from('messages')
            .select('*, profiles(username)')
            .eq('id', chat.pinned_message_id)
            .single();
          setPinnedMessage(msg);
        } else {
          setPinnedMessage(null);
        }
      }
    };
    loadChatDetails();

    const channel = supabase.channel(`chat_details:${chatId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chats', filter: `id=eq.${chatId}` }, async (payload) => {
        if (payload.new.pinned_message_id !== payload.old.pinned_message_id) {
          if (payload.new.pinned_message_id) {
            const { data: msg } = await supabase.from('messages').select('*, profiles(username)').eq('id', payload.new.pinned_message_id).single();
            setPinnedMessage(msg);
          } else {
            setPinnedMessage(null);
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [chatId]);

  useEffect(() => {
    if (!isGroup || messageIds.length === 0) return;

    const loadReads = async () => {
      try {
        const { data: reads, error } = await supabase
          .from('message_reads')
          .select('message_id, user_id')
          .in('message_id', messageIds);

        if (error || !reads || reads.length === 0) {
          setMessageReads({});
          return;
        }

        const uniqueUserIds = [...new Set(reads.map(r => r.user_id))];
        if (uniqueUserIds.length === 0) {
          setMessageReads({});
          return;
        }

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', uniqueUserIds);

        const profilesMap = {};
        (profiles || []).forEach(p => {
          profilesMap[p.id] = {
            username: p.username || 'Аноним',
            avatar_url: p.avatar_url
          };
        });

        const readsMap = {};
        reads.forEach(read => {
          if (!readsMap[read.message_id]) {
            readsMap[read.message_id] = [];
          }
          const profile = profilesMap[read.user_id] || { username: 'Аноним', avatar_url: null };
          readsMap[read.message_id].push({
            user_id: read.user_id,
            username: profile.username,
            avatar_url: profile.avatar_url
          });
        });

        setMessageReads(readsMap);
      } catch (err) {
        console.error('Ошибка загрузки прочтений:', err);
        setMessageReads({});
      }
    };

    loadReads();

    const readsChannel = supabase
      .channel(`message_reads:${chatId}`)
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'message_reads' },
        async (payload) => {
          const newRead = payload.new;
          const { data: msg } = await supabase
            .from('messages')
            .select('chat_id')
            .eq('id', newRead.message_id)
            .single();

          if (!msg || msg.chat_id !== chatId) return;

          const { data: profile } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', newRead.user_id)
            .single();

          setMessageReads(prev => {
            const updated = { ...prev };
            if (!updated[newRead.message_id]) {
              updated[newRead.message_id] = [];
            }
            const alreadyExists = updated[newRead.message_id].some(r => r.user_id === newRead.user_id);
            if (!alreadyExists) {
              updated[newRead.message_id].push({
                user_id: newRead.user_id,
                username: profile?.username || 'Аноним',
                avatar_url: profile?.avatar_url
              });
            }
            return updated;
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(readsChannel); };
  }, [chatId, isGroup, messageIds.length]);

  useEffect(() => {
    if (forwardModalVisible) {
      const loadForwardChats = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: memberships } = await supabase.from('chat_members').select('chat_id').eq('user_id', user.id);
        if (!memberships) return;
        const chatIds = memberships.map(m => m.chat_id);

        const { data: chatsData } = await supabase
          .from('chats')
          .select(`*, chat_members (user_id, profiles (username, avatar_url))`)
          .in('id', chatIds);

        const formatted = chatsData.map(chat => {
          if (chat.is_group) {
            return { id: chat.id, title: chat.name || 'Группа', avatar: chat.avatar_url };
          }
          const other = chat.chat_members.find(m => m.user_id !== user.id);
          return { id: chat.id, title: other?.profiles?.username || 'Чат', avatar: other?.profiles?.avatar_url };
        });

        setForwardChats(formatted);
      };
      loadForwardChats();
    }
  }, [forwardModalVisible]);

  useEffect(() => {
    let userId;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        userId = user.id;
        setCurrentUserId(user.id);
        markMessagesAsRead(userId);
        
        const channel = supabase.channel(`typing:${chatId}`, { config: { broadcast: { self: false } } });
        channel.on('broadcast', { event: 'typing' }, (payload) => {
          if (payload.sender_id !== userId) {
            setIsTyping(true);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
          }
        });
        channel.subscribe();
        channelRef.current = channel;
      }
    });
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [chatId]);

  useEffect(() => {
    if (flatListRef.current && messages.length > 0 && !isSearchActive) {
      setTimeout(() => {
        flatListRef.current.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length, isSearchActive]);

  const markMessagesAsRead = async (userId) => {
    if (!userId) return;

    try {
      const { data: unreadMessages } = await supabase
        .from('messages')
        .select('id')
        .eq('chat_id', chatId)
        .neq('sender_id', userId)
        .eq('is_read', false);

      if (!unreadMessages || unreadMessages.length === 0) return;

      if (!isGroup) {
        await supabase
          .from('messages')
          .update({ is_read: true })
          .in('id', unreadMessages.map(m => m.id));
      }
      
      const readsToInsert = unreadMessages.map(msg => ({
        message_id: msg.id,
        user_id: userId
      }));

      await supabase
        .from('message_reads')
        .upsert(readsToInsert, {
          onConflict: 'message_id,user_id',
          ignoreDuplicates: true
        });
    } catch (err) {
      console.error('Ошибка в markMessagesAsRead:', err);
    }
  };

  const handleViewReaders = async (message) => {
    const readers = messageReads[message.id] || [];
    setReadersList(readers);
    setReadersModalVisible(true);
  };

  const handleTextChange = (newText) => {
    setText(newText);
    if (channelRef.current && newText.trim()) {
      channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { sender_id: currentUserId } });
    }
  };

  // НОВОЕ: Обработчик кнопок форматирования
  const handleFormatButton = (marker) => {
    const result = wrapWithMarkdown(text, inputSelection, marker);
    setText(result.text);
    // Возвращаем фокус в поле ввода
    setTimeout(() => {
      if (textInputRef.current) {
        textInputRef.current.focus();
      }
    }, 10);
  };

  const handleSendOrSave = async () => {
    if (!text.trim() && !stagedMedia) return;
    if (editingMessage) {
      await editMessage(editingMessage.id, text);
      setEditingMessage(null);
    } else {
      await sendMessage(text, replyingTo?.id);
      setReplyingTo(null);
    }
    setText('');
  };

  const handleDelete = async () => {
    if (!selectedMessage) return;
    if (selectedMessage.sender_id !== currentUserId) { setActionMenuVisible(false); return; }
    await deleteMessage(selectedMessage.id);
    setActionMenuVisible(false);
    setSelectedMessage(null);
  };

  const handlePinMessage = async (messageId) => {
    const { error } = await supabase.from('chats').update({ pinned_message_id: messageId }).eq('id', chatId);
    if (error) Alert.alert('Ошибка', 'Не удалось закрепить сообщение');
    setActionMenuVisible(false);
  };

  const handleUnpinMessage = async () => {
    const { error } = await supabase.from('chats').update({ pinned_message_id: null }).eq('id', chatId);
    if (error) Alert.alert('Ошибка', 'Не удалось открепить сообщение');
  };

  const executeForward = async (targetChatId) => {
    if (!forwardingMessage) return;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Не авторизован');

      await supabase.from('messages').insert({
        chat_id: targetChatId,
        sender_id: user.id,
        content: forwardingMessage.content || '',
        file_url: forwardingMessage.file_url || null,
        video_url: forwardingMessage.video_url || null,
        audio_url: forwardingMessage.audio_url || null,
        file_document_url: forwardingMessage.file_document_url || null,
        file_name: forwardingMessage.file_name || null,
        file_size: forwardingMessage.file_size || null,
        file_type: forwardingMessage.file_type || null,
        forwarded_from_username: forwardingMessage.profiles?.username || 'Аноним',
      });

      Alert.alert('Успех', `Сообщение переслано в чат!`);
      setForwardModalVisible(false);
      setForwardingMessage(null);
    } catch (error) {
      console.error(error);
      Alert.alert('Ошибка', 'Не удалось переслать сообщение');
    } finally {
      setUploading(false);
    }
  };

  const pickImageForPreview = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) return Alert.alert('Разрешение отклонено', 'Разрешите доступ к галерее!');
    const result = await ImagePicker.launchImageLibraryAsync({ 
      mediaTypes: ImagePicker.MediaTypeOptions.Images, 
      allowsEditing: true, 
      quality: 0.7 
    });
    if (result.canceled) return;
    const file = result.assets[0];
    setStagedMedia({
      type: 'image',
      uri: file.uri,
      name: `image_${Date.now()}.jpg`,
      size: file.fileSize || 0,
      mimeType: 'image/jpeg',
    });
  };

  const pickVideoForPreview = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) return Alert.alert('Разрешение отклонено', 'Разрешите доступ к галерее!');
    const result = await ImagePicker.launchImageLibraryAsync({ 
      mediaTypes: ImagePicker.MediaTypeOptions.Videos, 
      allowsEditing: false,
      quality: 1,
      videoMaxDuration: 300,
    });
    if (result.canceled) return;
    const file = result.assets[0];
    setStagedMedia({
      type: 'video',
      uri: file.uri,
      name: `video_${Date.now()}.mp4`,
      size: file.fileSize || 0,
      mimeType: file.mimeType || 'video/mp4',
    });
  };

  const pickDocumentForPreview = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets[0];
      setStagedMedia({
        type: 'document',
        uri: file.uri,
        name: file.name,
        size: file.size,
        mimeType: file.mimeType,
      });
    } catch (error) {
      console.error('Ошибка выбора файла:', error);
      Alert.alert('Ошибка', 'Не удалось выбрать файл');
    }
  };

  const handleStopRecordingForPreview = async () => {
    const uri = await stopRecording();
    if (uri) {
      setStagedMedia({
        type: 'audio',
        uri: uri,
        name: `voice_${Date.now()}.m4a`,
        size: 0,
        mimeType: 'audio/m4a',
      });
    }
  };

  const sendStagedMedia = async () => {
    if (!stagedMedia) return;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Пользователь не авторизован');

      const fileExt = stagedMedia.name.split('.').pop() || 'mp4';
      let bucketName = 'chat-files';
      if (stagedMedia.type === 'audio') bucketName = 'audio-files';
      if (stagedMedia.type === 'document') bucketName = 'document-files';
      if (stagedMedia.type === 'video') bucketName = 'video-files';

      const filePath = `${chatId}/${Date.now()}.${fileExt}`;
      const publicUrl = await uploadImage(bucketName, filePath, {
        uri: stagedMedia.uri,
        name: stagedMedia.name,
        type: stagedMedia.mimeType,
      });

      const insertData = {
        chat_id: chatId,
        sender_id: user.id,
        content: text.trim() || '',
        reply_to_id: replyingTo?.id || null,
      };

      if (stagedMedia.type === 'image') {
        insertData.file_url = publicUrl;
      } else if (stagedMedia.type === 'video') {
        insertData.video_url = publicUrl;
      } else if (stagedMedia.type === 'audio') {
        insertData.audio_url = publicUrl;
      } else if (stagedMedia.type === 'document') {
        insertData.file_document_url = publicUrl;
        insertData.file_name = stagedMedia.name;
        insertData.file_size = stagedMedia.size;
        insertData.file_type = stagedMedia.mimeType;
      }

      await supabase.from('messages').insert(insertData);

      setStagedMedia(null);
      setText('');
      setReplyingTo(null);
    } catch (error) {
      console.error('Ошибка отправки медиа:', error);
      Alert.alert('Ошибка', 'Не удалось отправить файл');
    } finally {
      setUploading(false);
    }
  };

  const cancelStagedMedia = () => {
    setStagedMedia(null);
    setText('');
  };

  const handleStartRecording = async () => {
    const success = await startRecording();
    if (!success) Platform.OS === 'web' ? window.alert('Не удалось начать запись') : Alert.alert('Ошибка', 'Не удалось начать запись');
  };

  const handleDownload = async (message) => {
    if (message.file_url) {
      const filename = `photo_${Date.now()}.jpg`;
      const success = await downloadFile(message.file_url, filename, 'image');
      if (success) Alert.alert('Успех', 'Фото сохранено');
    } else if (message.video_url) {
      const filename = `video_${Date.now()}.mp4`;
      const success = await downloadFile(message.video_url, filename, 'video');
      if (success) Alert.alert('Успех', 'Видео сохранено');
    }
    setActionMenuVisible(false);
  };

  const filteredMessages = useMemo(() => {
    const validMessages = messages.filter(m => m && m.id);
    if (!isSearchActive || !searchQuery.trim()) return validMessages;
    const query = searchQuery.toLowerCase();
    return validMessages.filter(m => m.content && m.content.toLowerCase().includes(query));
  }, [messages, isSearchActive, searchQuery]);

  const renderQuote = (replyToId) => {
    const originalMessage = messages.find(m => m.id === replyToId);
    if (!originalMessage) return null;
    const isOriginalMe = originalMessage.sender_id === currentUserId;
    const authorName = isOriginalMe ? 'Вы' : (originalMessage.profiles?.username || 'Аноним');
    return (
      <View style={[styles.quoteContainer, { borderLeftColor: isOriginalMe ? colors.myMessage : colors.textSecondary }]}>
        <Text style={[styles.quoteAuthor, { color: isOriginalMe ? colors.myMessage : colors.textSecondary }]}>{authorName}</Text>
        <Text style={[styles.quoteText, { color: colors.textSecondary }]} numberOfLines={2}>
          {originalMessage.audio_url ? '🎤 Голосовое' : originalMessage.video_url ? '🎥 Видео' : originalMessage.file_document_url ? `📎 ${originalMessage.file_name}` : originalMessage.content || '📷 Фото'}
        </Text>
      </View>
    );
  };

  const renderMessage = ({ item }) => {
    if (!item || !item.id) return null;
    const isMe = item.sender_id === currentUserId;
    const hasImage = !!item.file_url;
    const hasVideo = !!item.video_url;
    const hasAudio = !!item.audio_url;
    const hasDocument = !!item.file_document_url;
    const hasText = !!item.content && item.content.trim();
    const messageReactions = reactions[item.id] || [];
    const isPinned = pinnedMessage?.id === item.id;
    const messageTime = formatTime(item.created_at);

    const readers = isGroup ? (messageReads[item.id] || []) : [];
    const readersCount = readers.length;

    const textColor = isMe ? '#fff' : colors.text;

    return (
      <Pressable 
        onLongPress={() => { setSelectedMessage(item); setActionMenuVisible(true); }}
        style={({ pressed }) => [
          styles.messageBubble, 
          isMe ? styles.myMessage : styles.otherMessage,
          { backgroundColor: isMe ? colors.myMessage : colors.otherMessage },
          pressed && { opacity: 0.8 },
          isPinned && { borderWidth: 2, borderColor: colors.primary }
        ]}
      >
        {!isMe && <Text style={[styles.senderName, { color: colors.textSecondary }]}>{item.profiles?.username || 'Аноним'}</Text>}
        
        {item.forwarded_from_username && (
          <Text style={[styles.forwardedLabel, { color: isMe ? 'rgba(255,255,255,0.8)' : colors.primary }]}>
            ↪️ Переслано от {item.forwarded_from_username}
          </Text>
        )}

        {item.reply_to_id && renderQuote(item.reply_to_id)}
        {hasAudio && <AudioPlayer audioUrl={item.audio_url} colors={colors} />}
        {hasDocument && <FileMessage fileName={item.file_name} fileSize={item.file_size} fileType={item.file_type} fileUrl={item.file_document_url} colors={colors} />}
        {hasImage && <Image source={{ uri: item.file_url }} style={styles.messageImage} resizeMode="cover" />}
        
        {hasVideo && (
          <Video
            source={{ uri: item.video_url }}
            style={styles.messageVideo}
            useNativeControls
            resizeMode={ResizeMode.COVER}
            isLooping={false}
            shouldPlay={false}
          />
        )}

        {/* НОВОЕ: Рендер текста с поддержкой Markdown */}
        {hasText && (
          <Text style={[styles.messageText, { color: textColor }, hasImage && styles.textOnImage]}>
            {parseMarkdown(item.content, textColor, !!hasImage)}
          </Text>
        )}
        
        <View style={styles.messageTimeContainer}>
          {isGroup && isMe && readersCount > 0 && (
            <TouchableOpacity 
              style={styles.readersCount}
              onPress={() => handleViewReaders(item)}
              activeOpacity={0.7}
            >
              <Text style={[styles.readersCountText, { color: isMe ? 'rgba(255,255,255,0.7)' : colors.textSecondary }]}>
                ✓✓ {readersCount}
              </Text>
            </TouchableOpacity>
          )}
          
          {!isGroup && isMe && (
            <Text style={[styles.statusText, (hasImage || hasVideo) && styles.statusOnImage]}>
              {item.is_read ? '✓✓' : '✓'}
            </Text>
          )}
          
          <Text style={[styles.messageTime, { color: isMe ? 'rgba(255,255,255,0.7)' : colors.textSecondary }, (hasImage || hasVideo) && styles.timeOnImage]}>
            {messageTime}
          </Text>
        </View>

        {item.edited_at && (
          <Text style={[styles.editedText, { color: isMe ? 'rgba(255,255,255,0.6)' : colors.textSecondary }]}>изменено</Text>
        )}
        {messageReactions.length > 0 && (
          <View style={styles.reactionsContainer}>
            {messageReactions.map((r, index) => (
              <Text key={`${r.id || index}-${r.emoji}`} style={styles.reactionEmoji}>{r.emoji}</Text>
            ))}
          </View>
        )}
      </Pressable>
    );
  };

  const canPin = !isGroup || (isGroup && isCreator);

  const getFileIcon = (fileName) => {
    if (!fileName) return '📎';
    const ext = fileName.split('.').pop().toLowerCase();
    return FILE_ICONS[ext] || FILE_ICONS.default;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleHeaderPress = () => {
    if (!isGroup) {
      const otherUserMessage = messages.find(m => m.sender_id !== currentUserId);
      if (otherUserMessage) {
        navigation?.navigate('ViewProfile', { userId: otherUserMessage.sender_id });
      }
    } else {
      navigation?.navigate('ChatInfo', { chatId, title, isGroup });
    }
  };

  const renderDateGroup = ({ item: dateGroup }) => (
    <View>
      <View style={styles.dateHeaderContainer}>
        <View style={[styles.dateHeaderLine, { backgroundColor: colors.border }]} />
        <Text style={[styles.dateHeaderText, { color: colors.textSecondary, backgroundColor: colors.background }]}>
          {formatDateHeader(dateGroup.date)}
        </Text>
        <View style={[styles.dateHeaderLine, { backgroundColor: colors.border }]} />
      </View>

      {dateGroup.messages.map((msg) => (
        <View key={msg.id} style={styles.messageWrapper}>
          {renderMessage({ item: msg })}
        </View>
      ))}
    </View>
  );

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      
      {isSearchActive ? (
        <View style={[styles.searchHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <TextInput
            style={[styles.searchInput, { backgroundColor: colors.inputBackground, color: colors.text }]}
            placeholder="Поиск по сообщениям..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          <TouchableOpacity onPress={() => { setIsSearchActive(false); setSearchQuery(''); }} style={styles.chatHeaderButton}>
            <Text style={{ fontSize: 20 }}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity 
          style={[styles.chatHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
          onPress={handleHeaderPress}
          activeOpacity={0.7}
        >
          <Text style={[styles.chatHeaderTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
          <TouchableOpacity onPress={() => setIsSearchActive(true)} style={styles.chatHeaderButton}>
            <Text style={{ fontSize: 20 }}>🔍</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation?.navigate('ChatInfo', { chatId, title, isGroup })} style={styles.chatHeaderButton}>
            <Text style={{ fontSize: 20 }}>⚙️</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {pinnedMessage && (
        <View style={[styles.pinnedBanner, { backgroundColor: colors.surface, borderLeftColor: colors.primary }]}>
          <Text style={{ fontSize: 18, marginRight: 10 }}>📌</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pinnedTitle, { color: colors.textSecondary }]}>Закрепленное сообщение</Text>
            <Text style={[styles.pinnedText, { color: colors.text }]} numberOfLines={1}>
              {pinnedMessage.content || (pinnedMessage.audio_url ? '🎤 Голосовое' : pinnedMessage.video_url ? '🎥 Видео' : pinnedMessage.file_document_url ? `📎 ${pinnedMessage.file_name}` : '📷 Фото')}
            </Text>
          </View>
          {canPin && (
            <TouchableOpacity onPress={handleUnpinMessage} style={{ padding: 5 }}>
              <Text style={{ fontSize: 20, color: colors.textSecondary }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {isTyping && (
        <View style={[styles.typingIndicator, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Text style={[styles.typingText, { color: colors.textSecondary }]}>Печатает...</Text>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={groupedMessages}
        renderItem={renderDateGroup}
        keyExtractor={(item) => item.date}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loading ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {isSearchActive && searchQuery ? 'Ничего не найдено' : 'Начните переписку!'}
            </Text>
          ) : null
        }
      />
      
      {replyingTo && (
        <View style={[styles.replyBanner, { backgroundColor: colors.surface, borderLeftColor: colors.primary }]}>
          <View style={styles.replyBannerContent}>
            <Text style={[styles.replyBannerTitle, { color: colors.primary }]}>Ответ {replyingTo.profiles?.username || 'анониму'}</Text>
            <Text style={[styles.replyBannerText, { color: colors.textSecondary }]} numberOfLines={1}>
              {replyingTo.audio_url ? '🎤 Голосовое' : replyingTo.video_url ? '🎥 Видео' : replyingTo.file_document_url ? `📎 ${replyingTo.file_name}` : replyingTo.content || '📷 Фото'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyBannerCancel}>
            <Text style={{ color: colors.textSecondary, fontSize: 20 }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {isRecording && (
        <View style={[styles.recordingBanner, { backgroundColor: colors.surface }]}>
          <View style={styles.recordingIndicator}>
            <View style={[styles.recordingDot, { backgroundColor: '#FF3B30' }]} />
            <Text style={[styles.recordingText, { color: colors.text }]}>Запись: {duration}</Text>
          </View>
          <View style={styles.recordingActions}>
            <TouchableOpacity onPress={cancelRecording} style={styles.recordingButton}><Text style={{ fontSize: 24 }}>✕</Text></TouchableOpacity>
            <TouchableOpacity onPress={handleStopRecordingForPreview} style={[styles.recordingButton, { backgroundColor: colors.primary }]}><Text style={{ fontSize: 24, color: '#fff' }}>✓</Text></TouchableOpacity>
          </View>
        </View>
      )}

      {stagedMedia && !isRecording && (
        <View style={[styles.previewContainer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <View style={styles.previewHeader}>
            <Text style={[styles.previewTitle, { color: colors.textSecondary }]}>
              {stagedMedia.type === 'image' && '📷 Предпросмотр фото'}
              {stagedMedia.type === 'video' && '🎥 Предпросмотр видео'}
              {stagedMedia.type === 'document' && '📎 Предпросмотр файла'}
              {stagedMedia.type === 'audio' && '🎤 Предпросмотр голосового'}
            </Text>
            <TouchableOpacity onPress={cancelStagedMedia} style={styles.previewCancelButton}>
              <Text style={{ fontSize: 22, color: colors.textSecondary }}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.previewContent}>
            {stagedMedia.type === 'image' && (
              <Image source={{ uri: stagedMedia.uri }} style={styles.previewImage} resizeMode="cover" />
            )}
            {stagedMedia.type === 'video' && (
              <Video
                source={{ uri: stagedMedia.uri }}
                style={styles.previewVideo}
                useNativeControls
                resizeMode={ResizeMode.COVER}
                shouldPlay={false}
              />
            )}
            {stagedMedia.type === 'document' && (
              <View style={[styles.previewFileCard, { backgroundColor: colors.inputBackground }]}>
                <Text style={styles.previewFileIcon}>{getFileIcon(stagedMedia.name)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.previewFileName, { color: colors.text }]} numberOfLines={2}>{stagedMedia.name}</Text>
                  <Text style={[styles.previewFileSize, { color: colors.textSecondary }]}>{formatFileSize(stagedMedia.size)}</Text>
                </View>
              </View>
            )}
            {stagedMedia.type === 'audio' && (
              <View style={[styles.previewAudioCard, { backgroundColor: colors.inputBackground }]}>
                <Text style={styles.previewAudioIcon}>🎤</Text>
                <Text style={[styles.previewAudioText, { color: colors.text }]}>Голосовое сообщение</Text>
              </View>
            )}
          </View>

          {(stagedMedia.type === 'image' || stagedMedia.type === 'video' || stagedMedia.type === 'document') && (
            <TextInput
              style={[styles.previewCaptionInput, { backgroundColor: colors.inputBackground, color: colors.text }]}
              placeholder="Добавить подпись..."
              placeholderTextColor={colors.textSecondary}
              value={text}
              onChangeText={setText}
              multiline
            />
          )}

          <TouchableOpacity 
            style={[styles.previewSendButton, { backgroundColor: colors.primary }]} 
            onPress={sendStagedMedia}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.previewSendButtonText}>➤ Отправить</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {!isRecording && !stagedMedia && (
        <>
          {/* НОВОЕ: Панель форматирования Markdown */}
          <View style={[styles.formatToolbar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <TouchableOpacity 
              style={[styles.formatButton, { backgroundColor: colors.inputBackground }]} 
              onPress={() => handleFormatButton('**')}
              activeOpacity={0.7}
            >
              <Text style={[styles.formatButtonText, { color: colors.text, fontWeight: 'bold' }]}>B</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.formatButton, { backgroundColor: colors.inputBackground }]} 
              onPress={() => handleFormatButton('*')}
              activeOpacity={0.7}
            >
              <Text style={[styles.formatButtonText, { color: colors.text, fontStyle: 'italic' }]}>I</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.formatButton, { backgroundColor: colors.inputBackground }]} 
              onPress={() => handleFormatButton('`')}
              activeOpacity={0.7}
            >
              <Text style={[styles.formatButtonText, { color: colors.text, fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier' }]}>&lt;/&gt;</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.formatButton, { backgroundColor: colors.inputBackground }]} 
              onPress={() => handleFormatButton('~~')}
              activeOpacity={0.7}
            >
              <Text style={[styles.formatButtonText, { color: colors.text, textDecorationLine: 'line-through' }]}>S</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <Text style={[styles.formatHint, { color: colors.textSecondary }]}>
              **жирный** *курсив* `код` ~~зачёркнутый~~
            </Text>
          </View>

          <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            {editingMessage && (
              <TouchableOpacity style={styles.cancelEditButton} onPress={() => { setEditingMessage(null); setText(''); }}>
                <Text style={{ color: colors.textSecondary, fontSize: 20 }}>✕</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.attachButton, { backgroundColor: colors.inputBackground }]} onPress={pickImageForPreview} disabled={uploading}>
              {uploading ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.attachButtonText}>🖼️</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.attachButton, { backgroundColor: colors.inputBackground }]} onPress={pickVideoForPreview} disabled={uploading}>
              {uploading ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.attachButtonText}>🎥</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.attachButton, { backgroundColor: colors.inputBackground }]} onPress={pickDocumentForPreview} disabled={uploading}>
              {uploading ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.attachButtonText}>📎</Text>}
            </TouchableOpacity>
            <TextInput 
              ref={textInputRef}
              style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text }]} 
              value={text} 
              onChangeText={handleTextChange}
              onSelectionChange={(e) => setInputSelection(e.nativeEvent.selection)}
              placeholder={editingMessage ? "Изменить сообщение..." : replyingTo ? "Ваш ответ..." : "Напишите сообщение..."} 
              placeholderTextColor={colors.textSecondary} 
              multiline 
            />
            {text.trim() ? (
              <TouchableOpacity style={[styles.sendButton, { backgroundColor: colors.primary }]} onPress={handleSendOrSave}>
                <Text style={styles.sendButtonText}>{editingMessage ? '💾' : '➤'}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.sendButton, { backgroundColor: colors.primary }]} onPress={handleStartRecording} disabled={uploading}>
                <Text style={styles.sendButtonText}>🎤</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      {editingMessage && !isRecording && !stagedMedia && (
        <View style={[styles.editingBanner, { backgroundColor: colors.surface, borderLeftColor: colors.primary }]}>
          <Text style={[styles.editingBannerText, { color: colors.text }]}>Редактирование сообщения</Text>
          <Text style={[styles.editingBannerSubtext, { color: colors.textSecondary }]}>
            {editingMessage.content.substring(0, 30)}{editingMessage.content.length > 30 ? '...' : ''}
          </Text>
        </View>
      )}

      <Modal visible={actionMenuVisible} transparent animationType="fade" onRequestClose={() => setActionMenuVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setActionMenuVisible(false)}>
          <Pressable onPress={(e) => { e.stopPropagation(); }} style={{ flex: 1 }}>
            <View style={[styles.actionMenu, { backgroundColor: colors.surface }]}>
              <Text style={[styles.menuTitle, { color: colors.text, marginBottom: 15, fontSize: 18, fontWeight: 'bold' }]}>Действия с сообщением</Text>
              
              <TouchableOpacity style={styles.actionMenuItem} activeOpacity={0.7} onPress={() => { setReplyingTo(selectedMessage); setActionMenuVisible(false); }}>
                <Text style={[styles.actionMenuText, { color: colors.primary }]}>↩️ Ответить</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.actionMenuItem} 
                activeOpacity={0.7} 
                onPress={() => { 
                  setForwardingMessage(selectedMessage); 
                  setActionMenuVisible(false); 
                  setForwardModalVisible(true); 
                }}
              >
                <Text style={[styles.actionMenuText, { color: colors.primary }]}>↪️ Переслать</Text>
              </TouchableOpacity>

              {(selectedMessage?.file_url || selectedMessage?.video_url) && (
                <TouchableOpacity style={styles.actionMenuItem} activeOpacity={0.7} onPress={() => handleDownload(selectedMessage)}>
                  <Text style={[styles.actionMenuText, { color: colors.primary }]}>⬇️ Скачать</Text>
                </TouchableOpacity>
              )}

              {canPin && selectedMessage?.id !== pinnedMessage?.id && (
                <TouchableOpacity style={styles.actionMenuItem} activeOpacity={0.7} onPress={() => handlePinMessage(selectedMessage.id)}>
                  <Text style={[styles.actionMenuText, { color: colors.primary }]}>📌 Закрепить</Text>
                </TouchableOpacity>
              )}
              {pinnedMessage && selectedMessage?.id === pinnedMessage.id && (
                <TouchableOpacity style={styles.actionMenuItem} activeOpacity={0.7} onPress={handleUnpinMessage}>
                  <Text style={[styles.actionMenuText, { color: '#FF3B30' }]}>Открепить</Text>
                </TouchableOpacity>
              )}

              {selectedMessage?.sender_id === currentUserId && !selectedMessage.file_url && !selectedMessage.video_url && !selectedMessage.audio_url && !selectedMessage.file_document_url && (
                <TouchableOpacity style={styles.actionMenuItem} activeOpacity={0.7} onPress={() => { setText(selectedMessage.content); setEditingMessage(selectedMessage); setActionMenuVisible(false); }}>
                  <Text style={[styles.actionMenuText, { color: colors.text }]}>✏️ Редактировать</Text>
                </TouchableOpacity>
              )}
              {selectedMessage?.sender_id === currentUserId && (
                <TouchableOpacity style={styles.actionMenuItem} activeOpacity={0.7} onPress={handleDelete}>
                  <Text style={[styles.actionMenuText, { color: '#FF3B30' }]}>🗑 Удалить</Text>
                </TouchableOpacity>
              )}
              <Text style={[styles.menuTitle, { color: colors.textSecondary, marginTop: 10, marginBottom: 5, fontSize: 14 }]}>Реакции</Text>
              <View style={styles.emojiRow}>
                {EMOJIS.map((emoji, index) => (
                  <TouchableOpacity key={`${emoji}-${index}`} style={styles.emojiButton} activeOpacity={0.7} onPress={() => { if (selectedMessage && currentUserId) { toggleReaction(selectedMessage.id, emoji, currentUserId); } setActionMenuVisible(false); }}>
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={forwardModalVisible} transparent animationType="slide" onRequestClose={() => setForwardModalVisible(false)}>
        <View style={[styles.forwardModalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.forwardModalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => { setForwardModalVisible(false); setForwardingMessage(null); }}>
              <Text style={{ fontSize: 16, color: colors.textSecondary }}>Отмена</Text>
            </TouchableOpacity>
            <Text style={[styles.forwardModalTitle, { color: colors.text }]}>Переслать сообщение</Text>
            <View style={{ width: 50 }} />
          </View>

          {forwardingMessage && (
            <View style={[styles.forwardPreview, { backgroundColor: colors.surface }]}>
              <Text style={[styles.forwardPreviewText, { color: colors.textSecondary }]} numberOfLines={2}>
                {forwardingMessage.content || (forwardingMessage.audio_url ? '🎤 Голосовое' : forwardingMessage.video_url ? '🎥 Видео' : forwardingMessage.file_document_url ? `📎 ${forwardingMessage.file_name}` : '📷 Фото')}
              </Text>
            </View>
          )}

          <FlatList
            data={forwardChats}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={[styles.forwardChatItem, { borderBottomColor: colors.border }]} 
                onPress={() => executeForward(item.id)}
                disabled={uploading}
              >
                {item.avatar ? (
                  <Image source={{ uri: item.avatar }} style={styles.forwardChatAvatar} />
                ) : (
                  <View style={[styles.forwardChatAvatarPlaceholder, { backgroundColor: colors.inputBackground }]}>
                    <Text>💬</Text>
                  </View>
                )}
                <Text style={[styles.forwardChatTitle, { color: colors.text }]}>{item.title}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      <Modal visible={readersModalVisible} transparent animationType="fade" onRequestClose={() => setReadersModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setReadersModalVisible(false)}>
          <Pressable onPress={(e) => { e.stopPropagation(); }} style={[styles.readersModal, { backgroundColor: colors.surface }]}>
            <View style={styles.readersModalHeader}>
              <Text style={[styles.readersModalTitle, { color: colors.text }]}>
                Прочитали ({readersList.length})
              </Text>
              <TouchableOpacity onPress={() => setReadersModalVisible(false)} style={styles.closeButton}>
                <Text style={{ fontSize: 24, color: colors.textSecondary }}>✕</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={readersList}
              keyExtractor={(item) => item.user_id}
              renderItem={({ item }) => (
                <View style={[styles.readerItem, { borderBottomColor: colors.border }]}>
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={styles.readerAvatar} />
                  ) : (
                    <View style={[styles.readerAvatarPlaceholder, { backgroundColor: colors.inputBackground }]}>
                      <Text>👤</Text>
                    </View>
                  )}
                  <Text style={[styles.readerName, { color: colors.text }]}>
                    {item.username}
                    {item.user_id === currentUserId && ' (Вы)'}
                  </Text>
                </View>
              )}
              ListEmptyComponent={
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  Никто еще не прочитал
                </Text>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1 },
  listContent: { padding: 15 },
  typingIndicator: { padding: 10, borderBottomWidth: 1, alignItems: 'center' },
  typingText: { fontSize: 14, fontStyle: 'italic' },
  
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1 },
  chatHeaderTitle: { fontSize: 18, fontWeight: 'bold', flex: 1 },
  chatHeaderButton: { padding: 5, marginLeft: 10 },
  
  searchHeader: { flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1 },
  searchInput: { flex: 1, height: 40, borderRadius: 20, paddingHorizontal: 15, fontSize: 16 },

  pinnedBanner: { flexDirection: 'row', alignItems: 'center', padding: 12, borderLeftWidth: 4, marginHorizontal: 10, marginTop: 5, borderRadius: 8, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
  pinnedTitle: { fontSize: 12, fontWeight: 'bold', marginBottom: 2 },
  pinnedText: { fontSize: 14 },

  forwardedLabel: { fontSize: 12, fontWeight: 'bold', marginBottom: 4, fontStyle: 'italic' },
  
  messageBubble: { maxWidth: '85%', padding: 10, borderRadius: 15, marginBottom: 8, overflow: 'hidden' },
  myMessage: { alignSelf: 'flex-end', borderBottomRightRadius: 5 },
  otherMessage: { alignSelf: 'flex-start', borderBottomLeftRadius: 5, borderWidth: 1 },
  senderName: { fontSize: 12, marginBottom: 4, fontWeight: 'bold', paddingHorizontal: 4 },
  messageImage: { width: 220, height: 220, borderRadius: 10, marginBottom: 4 },
  messageVideo: { width: 220, height: 220, borderRadius: 10, marginBottom: 4, backgroundColor: '#000' },
  messageText: { fontSize: 16, paddingHorizontal: 4 },
  textOnImage: { color: '#fff', backgroundColor: 'rgba(0,0,0,0.5)', padding: 6, borderRadius: 6, overflow: 'hidden' },
  statusText: { fontSize: 12, color: 'rgba(255, 255, 255, 0.7)', alignSelf: 'flex-end', marginTop: 4, marginRight: 4 },
  statusOnImage: { color: '#fff', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  editedText: { fontSize: 10, alignSelf: 'flex-end', marginTop: 2, marginRight: 4, fontStyle: 'italic' },

  messageTimeContainer: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 4, marginRight: 4 },
  messageTime: { fontSize: 11, marginLeft: 4 },
  timeOnImage: { color: 'rgba(255,255,255,0.8)', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4, marginTop: 4 },

  readersCount: { marginRight: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.1)' },
  readersCountText: { fontSize: 11, fontWeight: '600' },

  reactionsContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, paddingHorizontal: 4 },
  reactionEmoji: { fontSize: 16, marginRight: 4, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 10, paddingHorizontal: 4, paddingVertical: 2 },

  quoteContainer: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 6, backgroundColor: 'rgba(0,0,0,0.05)', paddingVertical: 4, borderRadius: 4 },
  quoteAuthor: { fontSize: 12, fontWeight: 'bold', marginBottom: 2 },
  quoteText: { fontSize: 13 },

  replyBanner: { flexDirection: 'row', alignItems: 'center', padding: 10, borderLeftWidth: 4, marginHorizontal: 10, marginBottom: 5, borderRadius: 4 },
  replyBannerContent: { flex: 1 },
  replyBannerTitle: { fontSize: 14, fontWeight: 'bold' },
  replyBannerText: { fontSize: 12, marginTop: 2 },
  replyBannerCancel: { padding: 5 },

  recordingBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, borderTopWidth: 1 },
  recordingIndicator: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  recordingDot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  recordingText: { fontSize: 16, fontWeight: '600' },
  recordingActions: { flexDirection: 'row' },
  recordingButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginLeft: 10 },

  previewContainer: { borderTopWidth: 1, padding: 10 },
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  previewTitle: { fontSize: 14, fontWeight: '600' },
  previewCancelButton: { padding: 5 },
  previewContent: { marginBottom: 10 },
  previewImage: { width: '100%', height: 200, borderRadius: 10 },
  previewVideo: { width: '100%', height: 200, borderRadius: 10, backgroundColor: '#000' },
  previewFileCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10 },
  previewFileIcon: { fontSize: 32, marginRight: 12 },
  previewFileName: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  previewFileSize: { fontSize: 12 },
  previewAudioCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10 },
  previewAudioIcon: { fontSize: 32, marginRight: 12 },
  previewAudioText: { fontSize: 14, fontWeight: '600' },
  previewCaptionInput: { borderRadius: 10, paddingHorizontal: 15, paddingVertical: 10, marginBottom: 10, fontSize: 14, maxHeight: 80 },
  previewSendButton: { height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  previewSendButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  // НОВОЕ: Стили для панели форматирования
  formatToolbar: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 10, 
    paddingVertical: 6, 
    borderTopWidth: 1,
  },
  formatButton: { 
    width: 34, 
    height: 34, 
    borderRadius: 8, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginRight: 6,
  },
  formatButtonText: { 
    fontSize: 14, 
    fontWeight: '600',
  },
  formatHint: { 
    fontSize: 11, 
    fontStyle: 'italic',
  },

  inputContainer: { flexDirection: 'row', padding: 10, borderTopWidth: 1, alignItems: 'flex-end' },
  cancelEditButton: { padding: 10, marginRight: 5 },
  attachButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  attachButtonText: { fontSize: 20 },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10, marginRight: 8, maxHeight: 100 },
  sendButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  sendButtonText: { color: '#fff', fontSize: 20 },
  emptyText: { textAlign: 'center', marginTop: 20 },

  editingBanner: { padding: 10, borderLeftWidth: 4, marginHorizontal: 10, marginBottom: 5, borderRadius: 4 },
  editingBannerText: { fontSize: 14, fontWeight: 'bold' },
  editingBannerSubtext: { fontSize: 12, marginTop: 2 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 50 },
  actionMenu: { width: '90%', borderRadius: 20, padding: 15, alignItems: 'center' },
  menuTitle: { textAlign: 'center' },
  actionMenuItem: { width: '100%', paddingVertical: 12, paddingHorizontal: 15, borderRadius: 10, marginBottom: 5 },
  actionMenuText: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 10 },
  emojiButton: { padding: 10, margin: 5 },
  emojiText: { fontSize: 28 },

  forwardModalContainer: { flex: 1, paddingTop: 40 },
  forwardModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1 },
  forwardModalTitle: { fontSize: 18, fontWeight: 'bold' },
  forwardPreview: { padding: 15, borderBottomWidth: 1 },
  forwardPreviewText: { fontSize: 14 },
  forwardChatItem: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1 },
  forwardChatAvatar: { width: 45, height: 45, borderRadius: 22.5, marginRight: 15 },
  forwardChatAvatarPlaceholder: { width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  forwardChatTitle: { fontSize: 16, fontWeight: '600' },

  dateHeaderContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 15 },
  dateHeaderLine: { flex: 1, height: 1 },
  dateHeaderText: { fontSize: 13, fontWeight: '600', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  messageWrapper: { marginBottom: 2 },

  readersModal: { width: '90%', maxHeight: '70%', borderRadius: 20, padding: 20 },
  readersModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.1)' },
  readersModalTitle: { fontSize: 18, fontWeight: 'bold' },
  closeButton: { padding: 5 },
  readerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  readerAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  readerAvatarPlaceholder: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  readerName: { fontSize: 15, fontWeight: '500' },
});