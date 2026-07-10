// components/FileMessage.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native';

const FILE_ICONS = {
  pdf: '📄',
  doc: '📝',
  docx: '📝',
  xls: '📊',
  xlsx: '📊',
  ppt: '📽️',
  pptx: '📽️',
  zip: '🗜️',
  rar: '🗜️',
  '7z': '🗜️',
  txt: '📃',
  default: '📎'
};

const formatFileSize = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

export default function FileMessage({ fileName, fileSize, fileType, fileUrl, colors }) {
  const getExtension = () => {
    if (!fileName) return 'default';
    const ext = fileName.split('.').pop().toLowerCase();
    return FILE_ICONS[ext] ? ext : 'default';
  };

  const handleOpenFile = async () => {
    if (!fileUrl) return;
    try {
      if (Platform.OS === 'web') {
        window.open(fileUrl, '_blank');
      } else {
        await Linking.openURL(fileUrl);
      }
    } catch (error) {
      console.error('Ошибка открытия файла:', error);
    }
  };

  const ext = getExtension();
  const icon = FILE_ICONS[ext] || FILE_ICONS.default;

  return (
    <TouchableOpacity 
      style={[styles.container, { backgroundColor: 'rgba(0,0,0,0.05)' }]} 
      onPress={handleOpenFile}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.fileIcon}>{icon}</Text>
      </View>
      <View style={styles.info}>
        <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={2}>
          {fileName || 'Файл'}
        </Text>
        <Text style={[styles.fileSize, { color: colors.textSecondary }]}>
          {formatFileSize(fileSize)}
        </Text>
      </View>
      <Text style={styles.downloadIcon}>⬇️</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginVertical: 4,
    minWidth: 200,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  fileIcon: {
    fontSize: 24,
  },
  info: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  fileSize: {
    fontSize: 12,
  },
  downloadIcon: {
    fontSize: 20,
    marginLeft: 8,
  },
});