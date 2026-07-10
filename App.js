// App.js
import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
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

// Функция для получения заголовка по route
const getDocumentTitle = (route) => {
  if (!route) return 'MAX 2.0';

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

  return titleMap[route.name] || 'MAX 2.0';
};

// Функция для получения текущего route
const getActiveRoute = (state) => {
  if (!state) return null;
  const route = state.routes[state.index];
  if (route.state) {
    return getActiveRoute(route.state);
  }
  return route;
};

function AppContent() {
  const { session, loading } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width > 768;
  const navigationRef = useRef(null);

  usePushNotifications();

  // Базовый заголовок при загрузке
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'MAX 2.0';
    }
  }, []);

  // Обработчик изменения навигации
  const handleStateChange = (state) => {
    if (typeof document === 'undefined' || !state) return;
    const route = getActiveRoute(state);
    document.title = getDocumentTitle(route);
  };

  // При готовности навигации
  const handleReady = () => {
    if (typeof document === 'undefined' || !navigationRef.current) return;
    const state = navigationRef.current.getRootState();
    const route = getActiveRoute(state);
    document.title = getDocumentTitle(route);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Загрузка...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer 
      ref={navigationRef}
      onStateChange={handleStateChange}
      onReady={handleReady}
    >
      {!session ? (
        <Stack.Navigator>
          <Stack.Screen 
            name="Auth" 
            component={AuthScreen} 
            options={{ headerShown: false }} 
          />
        </Stack.Navigator>
      ) : isDesktop ? (
        <DesktopLayout />
      ) : (
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
      )}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </AuthProvider>
  );
}