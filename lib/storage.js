// lib/storage.js
import { supabase } from './supabase';

/**
 * Загружает картинку в Supabase Storage
 * @param {string} bucket - Имя бакета ('avatars' или 'chat-files')
 * @param {string} filePath - Путь внутри бакета (например, 'user_id/avatar.jpg')
 * @param {object} file - Объект файла из expo-image-picker
 * @returns {string} Публичная ссылка на файл
 */
export async function uploadImage(bucket, filePath, file) {
  // Для веба и мобайла нужен немного разный формат данных
  const response = await fetch(file.uri);
  const blob = await response.blob();

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filePath, blob, {
      contentType: file.mimeType || 'image/jpeg',
      upsert: true, // Перезаписать, если файл с таким именем уже есть
    });

  if (error) throw error;

  // Получаем публичную ссылку
  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath);

  return publicUrl;
}