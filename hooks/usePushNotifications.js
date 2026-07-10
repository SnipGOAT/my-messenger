// hooks/usePushNotifications.js
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export const usePushNotifications = () => {
  useEffect(() => {
    // Push-уведомления работают только на мобильных устройствах
    if (Platform.OS === 'web') {
      console.log('📱 Push-уведомления не поддерживаются на вебе');
      return;
    }

    let subscription;

    const setupNotifications = async () => {
      try {
        // Запрашиваем разрешения
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        
        if (finalStatus !== 'granted') {
          console.log('Разрешение на уведомления не получено');
          return;
        }

        // Обработчик полученных уведомлений
        subscription = Notifications.addNotificationReceivedListener(notification => {
          console.log('Получено уведомление:', notification);
        });

        console.log('✅ Push-уведомления настроены');
      } catch (error) {
        console.error('Ошибка настройки уведомлений:', error);
      }
    };

    setupNotifications();

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);
};