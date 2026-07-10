// components/AudioPlayer.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Audio } from 'expo-av';

export default function AudioPlayer({ audioUrl, colors }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState('0:00');
  const [position, setPosition] = useState('0:00');
  const soundRef = useRef(null);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const formatTime = (millis) => {
    const minutes = Math.floor(millis / 60000);
    const seconds = Math.floor((millis % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const playAudio = async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true }
      );
      
      soundRef.current = sound;
      
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          setDuration(formatTime(status.durationMillis || 0));
          setPosition(formatTime(status.positionMillis || 0));
          setIsPlaying(status.isPlaying);
          
          if (status.didJustFinish) {
            setIsPlaying(false);
            setPosition('0:00');
          }
        }
      });

      setIsPlaying(true);
    } catch (error) {
      console.error('Ошибка воспроизведения:', error);
    }
  };

  const pauseAudio = async () => {
    if (soundRef.current) {
      await soundRef.current.pauseAsync();
      setIsPlaying(false);
    }
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      pauseAudio();
    } else {
      playAudio();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <TouchableOpacity onPress={togglePlayPause} style={styles.playButton}>
        <Text style={[styles.playIcon, { color: colors.primary }]}>
          {isPlaying ? '⏸' : '▶️'}
        </Text>
      </TouchableOpacity>
      <View style={styles.info}>
        <Text style={[styles.duration, { color: colors.text }]}>
          {position} / {duration}
        </Text>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          Голосовое сообщение
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginVertical: 4,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  playIcon: {
    fontSize: 20,
  },
  info: {
    flex: 1,
  },
  duration: {
    fontSize: 14,
    fontWeight: '600',
  },
  label: {
    fontSize: 12,
    marginTop: 2,
  },
});