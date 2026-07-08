// hooks/usePushNotifications.js
import { useState, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

// Настраиваем, как показывать уведомления, когда приложение открыто
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState('');
  const [notification, setNotification] = useState(false);
  const notificationListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    registerForPushNotificationsAsync().then(token => {
      if (token) {
        setExpoPushToken(token);
        saveTokenToDatabase(token);
      }
    });

    // Слушаем входящие уведомления, когда приложение открыто
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
    });

    // Слушаем нажатие на уведомление (когда юзер тапнул на пуш)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Пользователь тапнул на уведомление:', response);
      // Здесь можно добавить навигацию к конкретному чату
    });

    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  // Сохраняем токен в базу данных
  const saveTokenToDatabase = async (token) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Проверяем, не сохранен ли уже этот токен
    const { data: existing } = await supabase
      .from('push_tokens')
      .select('id')
      .eq('user_id', user.id)
      .eq('token', token)
      .single();

    if (!existing) {
      await supabase.from('push_tokens').insert({
        user_id: user.id,
        token: token,
        platform: Platform.OS,
      });
    }
  };

  return { expoPushToken, notification };
}

async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#007AFF',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Разрешение на push-уведомления отклонено');
      return null;
    }

    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId 
        || Constants.expoConfig?.slug;
      
      token = (await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
      })).data;
    } catch (error) {
      console.log('Ошибка получения push-токена:', error);
      // Для разработки без EAS используем простой вариант
      try {
        token = (await Notifications.getExpoPushTokenAsync()).data;
      } catch (e) {
        console.log('Push-уведомления недоступны в этой среде');
        return null;
      }
    }
  } else {
    console.log('Push-уведомления работают только на реальных устройствах');
    return null;
  }

  return token;
}