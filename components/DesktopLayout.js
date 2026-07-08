// components/DesktopLayout.js
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import ChatListScreen from '../screens/ChatListScreen';
import ChatScreen from '../screens/ChatScreen';
import NewChatScreen from '../screens/NewChatScreen';

export default function DesktopLayout() {
  const [selectedChat, setSelectedChat] = useState(null);
  const [showNewChat, setShowNewChat] = useState(false); // Новое состояние

  const fakeNavigation = {
    navigate: (screen, params) => {
      console.log('🧭 Навигация:', screen, params);
      if (screen === 'Chat') {
        setSelectedChat(params);
        setShowNewChat(false);
      } else if (screen === 'NewChat') {
        setShowNewChat(true);
        setSelectedChat(null);
      }
    },
    setOptions: () => {},
    addListener: () => {},
    goBack: () => {
      setSelectedChat(null);
      setShowNewChat(false);
    },
  };

  const handleBack = () => {
    setSelectedChat(null);
    setShowNewChat(false);
  };

  return (
    <View style={styles.container}>
      {/* ЛЕВАЯ КОЛОНКА */}
      <View style={styles.sidebar}>
        <View style={styles.sidebarHeader}>
          <Text style={styles.sidebarTitle}>Мои чаты</Text>
        </View>
        <View style={styles.sidebarContent}>
          <ChatListScreen navigation={fakeNavigation} />
        </View>
      </View>

      {/* ПРАВАЯ КОЛОНКА */}
      <View style={styles.main}>
        {selectedChat ? (
          <>
            <View style={styles.chatHeader}>
              <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                <Text style={styles.backButtonText}>←</Text>
              </TouchableOpacity>
              <Text style={styles.chatTitle}>{selectedChat.title}</Text>
            </View>
            <View style={styles.chatContent}>
              <ChatScreen 
                route={{ params: selectedChat }} 
                navigation={{ goBack: handleBack, setOptions: () => {} }} 
              />
            </View>
          </>
        ) : showNewChat ? (
          <>
            <View style={styles.chatHeader}>
              <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                <Text style={styles.backButtonText}>←</Text>
              </TouchableOpacity>
              <Text style={styles.chatTitle}>Новый чат</Text>
            </View>
            <View style={styles.chatContent}>
              <NewChatScreen 
                navigation={fakeNavigation} 
              />
            </View>
          </>
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Выберите чат слева или нажмите 🔍 для поиска</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', backgroundColor: '#fff' },
  sidebar: { width: 350, borderRightWidth: 1, borderColor: '#e0e0e0', backgroundColor: '#f8f8f8' },
  sidebarHeader: { padding: 20, borderBottomWidth: 1, borderColor: '#e0e0e0', backgroundColor: '#fff' },
  sidebarTitle: { fontSize: 24, fontWeight: 'bold' },
  sidebarContent: { flex: 1 },
  main: { flex: 1, flexDirection: 'column', backgroundColor: '#fff' },
  chatHeader: { padding: 20, borderBottomWidth: 1, borderColor: '#e0e0e0', flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff' },
  backButton: { marginRight: 15, padding: 5 },
  backButtonText: { fontSize: 24, color: '#007AFF' },
  chatTitle: { fontSize: 20, fontWeight: '600' },
  chatContent: { flex: 1 },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  placeholderText: { fontSize: 18, color: '#888' },
});