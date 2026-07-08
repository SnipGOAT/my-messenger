// screens/ChatScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, Image, ActivityIndicator, Alert, Pressable, Modal } from 'react-native';
import { useRealtimeMessages } from '../hooks/useRealtimeMessages';
import { useMessageReactions } from '../hooks/useMessageReactions';
import { supabase } from '../lib/supabase';
import { uploadImage } from '../lib/storage';
import { useTheme } from '../lib/theme';
import * as ImagePicker from 'expo-image-picker';

const EMOJIS = ['', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👎'];

export default function ChatScreen({ route }) {
  const { chatId, title } = route.params;
  const { messages, sendMessage, loading } = useRealtimeMessages(chatId);
  const [text, setText] = useState('');
  const [currentUserId, setCurrentUserId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState(null); // Для модалки реакций
  
  const typingTimeoutRef = useRef(null);
  const channelRef = useRef(null);
  const { colors } = useTheme(); // Получаем цвета темы

  // Извлекаем ID всех сообщений для хука реакций
  const messageIds = messages.map(m => m.id);
  const { reactions, toggleReaction } = useMessageReactions(messageIds);

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

  const markMessagesAsRead = async (userId) => {
    if (!userId) return;
    const { data: unreadMessages } = await supabase
      .from('messages').select('id').eq('chat_id', chatId).neq('sender_id', userId).eq('is_read', false);
    if (unreadMessages && unreadMessages.length > 0) {
      await supabase.from('messages').update({ is_read: true }).in('id', unreadMessages.map(m => m.id));
    }
  };

  const handleTextChange = (newText) => {
    setText(newText);
    if (channelRef.current && newText.trim()) {
      channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { sender_id: currentUserId } });
    }
  };

  const handleSend = async () => {
    if (text.trim()) { await sendMessage(text); setText(''); }
  };

  const pickAndSendImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) return Alert.alert('Разрешение отклонено', 'Разрешите доступ к галерее!');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.7 });
    if (result.canceled) return;
    const file = result.assets[0];
    setUploading(true);
    try {
      const fileExt = file.uri.split('.').pop() || 'jpg';
      const filePath = `${chatId}/${Date.now()}.${fileExt}`;
      const publicUrl = await uploadImage('chat-files', filePath, file);
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('messages').insert({ chat_id: chatId, sender_id: user.id, content: text.trim() || '', file_url: publicUrl });
      setText('');
    } catch (error) { Alert.alert('Ошибка загрузки', error.message); } 
    finally { setUploading(false); }
  };

  const renderMessage = ({ item }) => {
    const isMe = item.sender_id === currentUserId;
    const hasImage = !!item.file_url;
    const hasText = !!item.content && item.content.trim();
    const messageReactions = reactions[item.id] || [];

    return (
      <Pressable 
        onLongPress={() => setSelectedMessageId(item.id)} // Долгое нажатие открывает выбор реакции
        style={({ pressed }) => [
          styles.messageBubble, 
          isMe ? styles.myMessage : styles.otherMessage,
          { backgroundColor: isMe ? colors.myMessage : colors.otherMessage },
          pressed && { opacity: 0.8 }
        ]}
      >
        {!isMe && <Text style={[styles.senderName, { color: colors.textSecondary }]}>{item.profiles?.username || 'Аноним'}</Text>}
        
        {hasImage && <Image source={{ uri: item.file_url }} style={styles.messageImage} resizeMode="cover" />}
        
        {hasText && <Text style={[styles.messageText, { color: isMe ? '#fff' : colors.text }, hasImage && styles.textOnImage]}>{item.content}</Text>}
        
        {isMe && <Text style={[styles.statusText, hasImage && styles.statusOnImage]}>{item.is_read ? '✓✓' : '✓'}</Text>}

        {/* Отображение реакций под сообщением */}
        {messageReactions.length > 0 && (
          <View style={styles.reactionsContainer}>
            {messageReactions.map((r, index) => (
              <Text key={index} style={styles.reactionEmoji}>{r.emoji}</Text>
            ))}
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      {isTyping && (
        <View style={[styles.typingIndicator, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Text style={[styles.typingText, { color: colors.textSecondary }]}>Печатает...</Text>
        </View>
      )}

      <FlatList
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        inverted
        ListEmptyComponent={!loading ? <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Начните переписку!</Text> : null}
      />
      
      <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TouchableOpacity style={[styles.attachButton, { backgroundColor: colors.inputBackground }]} onPress={pickAndSendImage} disabled={uploading}>
          {uploading ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.attachButtonText}>📎</Text>}
        </TouchableOpacity>

        <TextInput style={[styles.input, { backgroundColor: colors.inputBackground, color: colors.text }]} value={text} onChangeText={handleTextChange} placeholder="Напишите сообщение..." placeholderTextColor={colors.textSecondary} multiline />

        <TouchableOpacity style={[styles.sendButton, { backgroundColor: colors.primary }]} onPress={handleSend}>
          <Text style={styles.sendButtonText}>➤</Text>
        </TouchableOpacity>
      </View>

      {/* Модальное окно для выбора реакции */}
      <Modal visible={!!selectedMessageId} transparent animationType="fade" onRequestClose={() => setSelectedMessageId(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedMessageId(null)}>
          <View style={[styles.reactionPicker, { backgroundColor: colors.surface }]}>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>Выберите реакцию</Text>
            <View style={styles.emojiRow}>
              {EMOJIS.map(emoji => (
                <TouchableOpacity key={emoji} style={styles.emojiButton} onPress={() => {
                  if (selectedMessageId && currentUserId) {
                    toggleReaction(selectedMessageId, emoji, currentUserId);
                  }
                  setSelectedMessageId(null);
                }}>
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1 },
  listContent: { padding: 15, justifyContent: 'flex-end' },
  typingIndicator: { padding: 10, borderBottomWidth: 1, alignItems: 'center' },
  typingText: { fontSize: 14, fontStyle: 'italic' },
  
  messageBubble: { maxWidth: '75%', padding: 10, borderRadius: 15, marginBottom: 8, overflow: 'visible' },
  myMessage: { alignSelf: 'flex-end', borderBottomRightRadius: 5 },
  otherMessage: { alignSelf: 'flex-start', borderBottomLeftRadius: 5, borderWidth: 1 },
  senderName: { fontSize: 12, marginBottom: 4, fontWeight: 'bold', paddingHorizontal: 4 },
  messageImage: { width: 220, height: 220, borderRadius: 10, marginBottom: 4 },
  messageText: { fontSize: 16, paddingHorizontal: 4 },
  textOnImage: { color: '#fff', backgroundColor: 'rgba(0,0,0,0.5)', padding: 6, borderRadius: 6, overflow: 'hidden' },
  statusText: { fontSize: 12, color: 'rgba(255, 255, 255, 0.7)', alignSelf: 'flex-end', marginTop: 4, marginRight: 4 },
  statusOnImage: { color: '#fff', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },

  // Стили для реакций
  reactionsContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, paddingHorizontal: 4 },
  reactionEmoji: { fontSize: 16, marginRight: 4, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 10, paddingHorizontal: 4, paddingVertical: 2 },

  // Панель ввода
  inputContainer: { flexDirection: 'row', padding: 10, borderTopWidth: 1, alignItems: 'flex-end' },
  attachButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  attachButtonText: { fontSize: 20 },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10, marginRight: 8, maxHeight: 100 },
  sendButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  sendButtonText: { color: '#fff', fontSize: 20 },
  emptyText: { textAlign: 'center', marginTop: 20 },

  // Модальное окно
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 50 },
  reactionPicker: { width: '90%', borderRadius: 20, padding: 20, alignItems: 'center' },
  pickerTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  emojiButton: { padding: 10, margin: 5 },
  emojiText: { fontSize: 28 },
});