// App.js
import React, { useEffect } from 'react';
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
import { checkSupabaseConnection } from './lib/supabase';

const Stack = createNativeStackNavigator();

function AppContent() {
  const { session, loading } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width > 768;

  usePushNotifications();

  // Проверка подключения к Supabase
  useEffect(() => {
    checkSupabaseConnection();
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
          <AppContent />
        </NavigationContainer>
      </ThemeProvider>
    </AuthProvider>
  );
}