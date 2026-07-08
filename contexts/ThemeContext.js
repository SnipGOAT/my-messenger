// contexts/ThemeContext.js
import { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ThemeContext = createContext({});

export const ThemeProvider = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState('system'); // 'light', 'dark', 'system'

  // Загружаем сохраненную тему при старте
  useEffect(() => {
    const loadTheme = async () => {
      const savedTheme = await AsyncStorage.getItem('themeMode');
      if (savedTheme) {
        setThemeMode(savedTheme);
      }
    };
    loadTheme();
  }, []);

  // Сохраняем тему при изменении
  useEffect(() => {
    AsyncStorage.setItem('themeMode', themeMode);
  }, [themeMode]);

  // Определяем, темная тема или нет
  const isDark = themeMode === 'system' 
    ? systemColorScheme === 'dark' 
    : themeMode === 'dark';

  const toggleTheme = () => {
    setThemeMode(prev => {
      if (prev === 'light') return 'dark';
      if (prev === 'dark') return 'system';
      return 'light';
    });
  };

  const colors = {
    background: isDark ? '#121212' : '#f5f5f5',
    surface: isDark ? '#1E1E1E' : '#ffffff',
    text: isDark ? '#ffffff' : '#000000',
    textSecondary: isDark ? '#aaaaaa' : '#888888',
    primary: '#007AFF',
    border: isDark ? '#333333' : '#eeeeee',
    myMessage: '#007AFF',
    otherMessage: isDark ? '#2C2C2E' : '#ffffff',
    inputBackground: isDark ? '#2C2C2E' : '#f0f0f0',
  };

  return (
    <ThemeContext.Provider value={{ themeMode, isDark, colors, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);