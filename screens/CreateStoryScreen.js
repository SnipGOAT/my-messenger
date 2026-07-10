// screens/CreateStoryScreen.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator, Alert, TextInput, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { uploadImage } from '../lib/storage';
import { useTheme } from '../contexts/ThemeContext';
import * as ImagePicker from 'expo-image-picker';

export default function CreateStoryScreen({ navigation }) {
  const { colors } = useTheme();
  const [selectedImage, setSelectedImage] = useState(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    // Устанавливаем заголовок для веба
    if (typeof document !== 'undefined') {
      document.title = 'MAX 2.0';
    }
  }, []);

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      return Platform.OS === 'web' ? window.alert('Разрешение отклонено') : Alert.alert('Ошибка', 'Разрешите доступ к галерее');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.8,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0]);
    }
  };

  const handlePublish = async () => {
    if (!selectedImage) {
      return Alert.alert('Ошибка', 'Выберите фото');
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Не авторизован');

      console.log('📤 Начинаем загрузку статуса...');
      console.log('User ID:', user.id);

      const filePath = `stories/${user.id}/${Date.now()}.jpg`;
      
      // Используем нашу функцию uploadImage
      const publicUrl = await uploadImage('story-images', filePath, selectedImage);

      console.log('✅ Файл загружен, URL:', publicUrl);

      const { error: insertError } = await supabase.from('stories').insert({
        user_id: user.id,
        image_url: publicUrl,
        caption: caption.trim() || null,
      });

      if (insertError) throw insertError;

      console.log('✅ Статус опубликован!');
      Alert.alert('Успех', 'Статус опубликован!');
      navigation.goBack();
      
    } catch (error) {
      console.error('💥 Ошибка:', error);
      Alert.alert('Ошибка', error.message || 'Не удалось загрузить статус');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      
      {navigation?.goBack && (
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={{ fontSize: 16, color: colors.primary, fontWeight: 'bold' }}>← Назад</Text>
        </TouchableOpacity>
      )}

      <Text style={[styles.title, { color: colors.text }]}>Новый статус</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Статус будет виден 24 часа</Text>

      {selectedImage ? (
        <View style={styles.previewContainer}>
          <Image source={{ uri: selectedImage.uri }} style={styles.previewImage} resizeMode="cover" />
          <TouchableOpacity 
            style={styles.changeImageButton}
            onPress={pickImage}
          >
            <Text style={styles.changeImageText}>Изменить фото</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={[styles.pickImageButton, { backgroundColor: colors.inputBackground }]} onPress={pickImage}>
          <Text style={{ fontSize: 48, marginBottom: 10 }}>📷</Text>
          <Text style={[styles.pickImageText, { color: colors.text }]}>Выбрать фото</Text>
        </TouchableOpacity>
      )}

      <TextInput
        style={[styles.captionInput, { backgroundColor: colors.inputBackground, color: colors.text, borderColor: colors.border }]}
        placeholder="Добавить подпись (необязательно)..."
        placeholderTextColor={colors.textSecondary}
        value={caption}
        onChangeText={setCaption}
        multiline
        maxLength={200}
      />

      <TouchableOpacity
        style={[styles.publishButton, { backgroundColor: colors.primary, opacity: selectedImage && !uploading ? 1 : 0.5 }]}
        onPress={handlePublish}
        disabled={!selectedImage || uploading}
      >
        {uploading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.publishButtonText}>Опубликовать статус</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 40 },
  backButton: { position: 'absolute', top: 40, left: 20, zIndex: 10, padding: 10 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 5 },
  subtitle: { fontSize: 14, textAlign: 'center', marginBottom: 25 },
  
  pickImageButton: { 
    height: 300, 
    borderRadius: 15, 
    justifyContent: 'center', 
    alignItems: 'center',
    marginBottom: 20,
  },
  pickImageText: { fontSize: 16, fontWeight: '600' },
  
  previewContainer: { marginBottom: 20 },
  previewImage: { 
    width: '100%', 
    height: 400, 
    borderRadius: 15, 
    marginBottom: 10,
  },
  changeImageButton: {
    padding: 10,
    alignItems: 'center',
  },
  changeImageText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  
  captionInput: {
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    marginBottom: 20,
    maxHeight: 100,
  },
  
  publishButton: {
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  publishButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});