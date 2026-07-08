// App.js
import React from 'react';
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
import { View, Text, useWindowDimensions, Platform } from 'react-native';

const Stack = createNativeStackNavigator();

// Отдельный компонент, который использует хук push-уведомлений
// Хук должен вызываться внутри провайдера авторизации, чтобы иметь доступ к сессии
function AppContent() {
  const { session, loading } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width > 768;

  // Регистрируем push-токен, когда пользователь авторизован
  // Хук вызывается всегда, но внутри него проверка на user.id
  usePushNotifications();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Загрузка...</Text>
      </View>
    );
  }

  // Если пользователь не авторизован — показываем экран входа
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

  // Если десктоп (широкий экран в браузере) — показываем двухколоночный layout
  if (isDesktop) {
    return <DesktopLayout />;
  }

  // Иначе — мобильная навигация
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
        options={({ route }) => ({ title: route.params.title })} 
      />
      <Stack.Screen 
        name="NewChat" 
        component={NewChatScreen} 
        options={{ title: 'Новый чат' }} 
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