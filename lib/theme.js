// lib/theme.js
import { useColorScheme } from 'react-native';

export const useTheme = () => {
  // useColorScheme автоматически определяет тему устройства (светлая/темная)
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return {
    isDark,
    colors: {
      background: isDark ? '#121212' : '#f5f5f5',
      surface: isDark ? '#1E1E1E' : '#ffffff',
      text: isDark ? '#ffffff' : '#000000',
      textSecondary: isDark ? '#aaaaaa' : '#888888',
      primary: '#007AFF',
      border: isDark ? '#333333' : '#eeeeee',
      myMessage: '#007AFF',
      otherMessage: isDark ? '#2C2C2E' : '#ffffff',
      inputBackground: isDark ? '#2C2C2E' : '#f0f0f0',
    }
  };
};