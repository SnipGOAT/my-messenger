// hooks/useAudioRecorder.js
import { useState, useRef } from 'react';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';

export function useAudioRecorder() {
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState('0:00');
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        console.error('Разрешение на запись аудио отклонено');
        return false;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(recording);
      setIsRecording(true);
      startTimeRef.current = Date.now();

      // Обновляем таймер каждую секунду
      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        setDuration(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      }, 1000);

      return true;
    } catch (error) {
      console.error('Ошибка начала записи:', error);
      return false;
    }
  };

  const stopRecording = async () => {
    if (!recording) return null;

    clearInterval(intervalRef.current);
    setIsRecording(false);
    setDuration('0:00');

    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      const uri = recording.getURI();
      setRecording(null);
      return uri;
    } catch (error) {
      console.error('Ошибка остановки записи:', error);
      return null;
    }
  };

  const cancelRecording = async () => {
    if (!recording) return;

    clearInterval(intervalRef.current);
    setIsRecording(false);
    setDuration('0:00');

    try {
      await recording.stopAndUnloadAsync();
      setRecording(null);
    } catch (error) {
      console.error('Ошибка отмены записи:', error);
    }
  };

  return {
    isRecording,
    duration,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}