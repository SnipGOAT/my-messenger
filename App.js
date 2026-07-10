// App.js
import React, { useEffect } from 'react';
import { NavigationContainer, useNavigationState } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { usePushNotifications } from './hooks/usePushNotifications';
import AuthScreen from './screens/AuthScreen';
import ChatListScreen from './screens/ChatListScreen';
import ChatScreen from './screens/ChatScreen';
import NewChatScreen from './screens/NewChatScreen';
import DesktopLayout from './components/DesktopLayout';
import SettingsScreen from './screens/SettingsScreen';
import CreateGroupScreen from './screens/CreateGroupScreen';
import ChatInfoScreen from './screens/ChatInfoScreen';
import ChatMediaScreen from './screens/ChatMediaScreen';
import CreateStoryScreen from './screens/CreateStoryScreen';
import StoryViewerScreen from './screens/StoryViewerScreen';
import ViewProfileScreen from './screens/ViewProfileScreen';
import { View, Text, useWindowDimensions, Platform } from 'react-native';

const Stack = createNativeStackNavigator();

// Компонент для отслеживания текущего экрана и изменения заголовка
function DocumentTitleUpdater() {
  const route = useNavigationState(state => state.routes[state.index]);

  useEffect(() => {
    if (typeof document === 'undefined' || !route) return;

    // Маппинг названий экранов на заголовки
    const titleMap = {
      'Auth': 'Вход — MAX 2.0',
      'ChatList': 'Мои чаты — MAX 2.0',
      'Chat': route.params?.title ? `${route.params.title} — MAX 2.0` : 'Чат — MAX 2.0',
      'NewChat': 'Новый чат — MAX 2.0',
      'Settings': 'Настройки — MAX 2.0',
      'CreateGroup': 'Новая группа — MAX 2.0',
      'ChatInfo': 'Информация о чате — MAX 2.0',
      'ChatMedia': 'Медиа — MAX 2.0',
      'CreateStory': 'Новый статус — MAX 2.0',
      'StoryViewer': 'Статус — MAX 2.0',
      'ViewProfile': route.params?.username ? `${route.params.username} — MAX 2.0` : 'Профиль — MAX 2.0',
    };

    const newTitle = titleMap[route.name] || 'MAX 2.0';
    document.title = newTitle;
  }, [route]);

  return null;
}

function AppContent() {
  const { session, loading } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width > 768;

  usePushNotifications();

  // Базовый заголовок при загрузке
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'MAX 2.0';
    }
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Загрузка...</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <Stack.Navigator>
        <Stack.Screen 
          name="Auth" 
          component={AuthScreen} 
          options={{ headerShown: false }} 
        />
      </Stack.Navigator>
    );
  }

  if (isDesktop) {
    return <DesktopLayout />;
  }

  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="ChatList" 
        component={ChatListScreen} 
        options={{ title: 'Мои чаты' }} 
      />
      <Stack.Screen 
        name="Chat" 
        component={ChatScreen} 
        options={({ route }) => ({ title: route.params?.title || 'Чат' })} 
      />
      <Stack.Screen 
        name="NewChat" 
        component={NewChatScreen} 
        options={{ title: 'Новый чат' }} 
      />
      <Stack.Screen 
        name="Settings" 
        component={SettingsScreen} 
        options={{ title: 'Настройки' }} 
      />
      <Stack.Screen 
        name="CreateGroup" 
        component={CreateGroupScreen} 
        options={{ title: 'Новая группа' }} 
      />
      <Stack.Screen 
        name="ChatInfo" 
        component={ChatInfoScreen} 
        options={{ title: 'Информация о чате' }} 
      />
      <Stack.Screen 
        name="ChatMedia" 
        component={ChatMediaScreen} 
        options={{ title: 'Медиа' }} 
      />
      <Stack.Screen 
        name="CreateStory" 
        component={CreateStoryScreen} 
        options={{ title: 'Новый статус' }} 
      />
      <Stack.Screen 
        name="StoryViewer" 
        component={StoryViewerScreen} 
        options={{ headerShown: false }} 
      />
      <Stack.Screen 
        name="ViewProfile" 
        component={ViewProfileScreen} 
        options={{ title: 'Профиль' }} 
      />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <NavigationContainer>
          <DocumentTitleUpdater />
          <AppContent />
        </NavigationContainer>
      </ThemeProvider>
    </AuthProvider>
  );
}