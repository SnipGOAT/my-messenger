// components/DesktopLayout.js
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import ChatListScreen from '../screens/ChatListScreen';
import ChatScreen from '../screens/ChatScreen';
import SettingsScreen from '../screens/SettingsScreen';
import CreateGroupScreen from '../screens/CreateGroupScreen';
import NewChatScreen from '../screens/NewChatScreen';
import ChatInfoScreen from '../screens/ChatInfoScreen';
import ChatMediaScreen from '../screens/ChatMediaScreen';
import CreateStoryScreen from '../screens/CreateStoryScreen';
import StoryViewerScreen from '../screens/StoryViewerScreen';
import ViewProfileScreen from '../screens/ViewProfileScreen';
import CallScreen from '../screens/CallScreen';

export default function DesktopLayout() {
  const [activeChatId, setActiveChatId] = useState(null);
  const [activeScreen, setActiveScreen] = useState('list');
  const [chatTitle, setChatTitle] = useState('');
  const [chatInfoParams, setChatInfoParams] = useState(null);
  const [chatMediaParams, setChatMediaParams] = useState(null);
  const [storyViewerParams, setStoryViewerParams] = useState(null);
  const [viewProfileParams, setViewProfileParams] = useState(null);
  const [callParams, setCallParams] = useState(null);

  const navigation = {
    navigate: (screen, params) => {
      if (screen === 'Chat') {
        setActiveChatId(params.chatId);
        setChatTitle(params.title || 'Чат');
        setActiveScreen('chat');
      } else if (screen === 'Settings') {
        setActiveScreen('settings');
      } else if (screen === 'CreateGroup') {
        setActiveScreen('createGroup');
      } else if (screen === 'NewChat') {
        setActiveScreen('newChat');
      } else if (screen === 'ChatInfo') {
        setActiveScreen('chatInfo');
        setChatInfoParams(params);
      } else if (screen === 'ChatMedia') {
        setActiveScreen('chatMedia');
        setChatMediaParams(params);
      } else if (screen === 'CreateStory') {
        setActiveScreen('createStory');
      } else if (screen === 'StoryViewer') {
        setActiveScreen('storyViewer');
        setStoryViewerParams(params);
      } else if (screen === 'ViewProfile') {
        setActiveScreen('viewProfile');
        setViewProfileParams(params);
      } else if (screen === 'Call') {
        setActiveScreen('call');
        setCallParams(params);
      }
    },
    goBack: () => {
      setActiveScreen('list');
      setActiveChatId(null);
      setChatInfoParams(null);
      setChatMediaParams(null);
      setStoryViewerParams(null);
      setViewProfileParams(null);
      setCallParams(null);
    }
  };

  return (
    <View style={{ flexDirection: 'row', flex: 1, height: '100%' }}>
      {/* Левая панель (Список чатов) */}
      <View style={{ width: 350, borderRightWidth: 1, borderColor: '#ccc', height: '100%' }}>
        <ChatListScreen navigation={navigation} />
      </View>

      {/* Правая панель */}
      <View style={{ flex: 1, height: '100%' }}>
        {activeScreen === 'chat' && activeChatId ? (
          <ChatScreen route={{ params: { chatId: activeChatId, title: chatTitle } }} navigation={navigation} />
        ) : activeScreen === 'settings' ? (
          <SettingsScreen navigation={navigation} />
        ) : activeScreen === 'createGroup' ? (
          <CreateGroupScreen navigation={navigation} />
        ) : activeScreen === 'newChat' ? (
          <NewChatScreen navigation={navigation} />
        ) : activeScreen === 'chatInfo' && chatInfoParams ? (
          <ChatInfoScreen route={{ params: chatInfoParams }} navigation={navigation} />
        ) : activeScreen === 'chatMedia' && chatMediaParams ? (
          <ChatMediaScreen route={{ params: chatMediaParams }} navigation={navigation} />
        ) : activeScreen === 'createStory' ? (
          <CreateStoryScreen navigation={navigation} />
        ) : activeScreen === 'storyViewer' && storyViewerParams ? (
          <StoryViewerScreen route={{ params: storyViewerParams }} navigation={navigation} />
        ) : activeScreen === 'viewProfile' && viewProfileParams ? (
          <ViewProfileScreen route={{ params: viewProfileParams }} navigation={navigation} />
        ) : activeScreen === 'call' && callParams ? (
          <CallScreen route={{ params: callParams }} navigation={navigation} />
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
            <Text style={{ fontSize: 18, color: '#888' }}>Выберите чат или откройте настройки</Text>
          </View>
        )}
      </View>
    </View>
  );
}