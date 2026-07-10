// lib/storage.js
import { supabase } from './supabase';
import { Platform } from 'react-native';

export const uploadImage = async (bucket, filePath, file) => {
  try {
    console.log(`📤 Загрузка в бакет: ${bucket}, путь: ${filePath}`);
    console.log('Платформа:', Platform.OS);
    
    // Получаем сессию для авторизации
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Нет активной сессии');

    const supabaseUrl = supabase.supabaseUrl;
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${filePath}`;

    let fileToUpload;
    let contentType = file.mimeType || 'image/jpeg';

    if (Platform.OS === 'web') {
      // Для веба используем fetch + blob
      console.log('🌐 Веб-режим');
      
      const response = await fetch(file.uri);
      const blob = await response.blob();
      fileToUpload = blob;
      
      // Используем стандартный fetch для загрузки
      const formData = new FormData();
      formData.append('file', blob, file.fileName || 'image.jpg');

      const response_upload = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'x-upsert': 'true',
        },
        body: blob,
      });

      if (!response_upload.ok) {
        const error_text = await response_upload.text();
        console.error('❌ Ошибка HTTP:', response_upload.status, error_text);
        throw new Error(`HTTP ${response_upload.status}: ${error_text}`);
      }

      console.log('✅ Файл загружен через fetch');
      
    } else {
      // Для мобильных используем expo-file-system
      console.log('📱 Мобильный режим');
      
      const { uploadAsync } = await import('expo-file-system/legacy');
      
      const result = await uploadAsync(uploadUrl, file.uri, {
        httpMethod: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': contentType,
          'x-upsert': 'true',
        },
        fieldName: 'file',
      });

      console.log('📊 Результат загрузки:', result);

      if (result.status !== 200) {
        throw new Error(`Ошибка загрузки: статус ${result.status}, ${result.body}`);
      }

      console.log('✅ Файл загружен через uploadAsync');
    }

    // Получаем публичный URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    console.log('🔗 Публичный URL:', urlData.publicUrl);
    return urlData.publicUrl;
    
  } catch (error) {
    console.error('💥 Ошибка в uploadImage:', error);
    throw error;
  }
};