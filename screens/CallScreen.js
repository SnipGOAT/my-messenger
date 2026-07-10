// screens/CallScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

// === НАСТРОЙКИ AGORA (ВСТАВЬ СВОИ ДАННЫЕ!) ===
const APP_ID = 'f3912d4cb8b147428bd8448eefe89d36'; 
const TEMP_TOKEN = '007eJxTYAj4ViR/q7GiLjqnblbKs/nmsze8qqiVfmR6ZIVmyxX30F0KDGnGloZGKSbJSRZJhibmJkYWSSkWJiYWqalpqRaWKcZmLY8DshoCGRlir3MxMzJAIIjPxuDrGGGkZ8DAAADtUSBk'; // Токен из консоли Agora (действует 24ч)
// ==============================================

// Импорты для разных платформ
let AgoraRTC = null;
let RtcEngine = null;
let RtcLocalView = null;
let RtcRemoteView = null;

if (Platform.OS === 'web') {
  AgoraRTC = require('agora-rtc-sdk-ng').default;
} else {
  const Agora = require('react-native-agora');
  RtcEngine = Agora.createAgoraRtcEngine;
  RtcLocalView = Agora.RtcLocalView;
  RtcRemoteView = Agora.RtcRemoteView;
}

export default function CallScreen({ route, navigation }) {
  const { chatId, title, isVideoCall } = route.params || {};
  const { colors } = useTheme();
  
  const [status, setStatus] = useState('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(!isVideoCall);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);

  // Рефы для Web SDK
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const clientRef = useRef(null);
  const localTrackRef = useRef(null);

  // Рефы для Mobile SDK
  const engineRef = useRef(null);
  const [remoteUid, setRemoteUid] = useState(null);

  const timerRef = useRef(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      initWebCall();
    } else {
      initMobileCall();
    }
    return () => {
      endCall();
    };
  }, []);

  // ================= WEB LOGIC =================
  const initWebCall = async () => {
    try {
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      clientRef.current = client;

      client.on('user-published', async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === 'video' && remoteVideoRef.current) {
          user.videoTrack.play(remoteVideoRef.current);
        }
        if (mediaType === 'audio') {
          user.audioTrack.play();
        }
        setStatus('connected');
        startTimer();
      });

      client.on('user-unpublished', (user) => {
        if (remoteVideoRef.current) {
          user.videoTrack?.stop();
        }
      });

      const [microphoneTrack, cameraTrack] = await AgoraRTC.createMicrophoneAndCameraTracks({
        video: { enabled: isVideoCall }
      });
      localTrackRef.current = { microphoneTrack, cameraTrack };

      if (isVideoCall && localVideoRef.current) {
        cameraTrack.play(localVideoRef.current);
      }

      const channelName = `chat_${chatId}`;
      await client.join(APP_ID, channelName, TEMP_TOKEN || null, null);
      await client.publish([microphoneTrack, cameraTrack]);

      setStatus('ringing');
    } catch (err) {
      console.error('Web Call Error:', err);
      setError('Ошибка подключения. Проверьте App ID и Токен.');
      setStatus('ended');
    }
  };

  // ================= MOBILE LOGIC =================
  const initMobileCall = async () => {
    try {
      const engine = RtcEngine();
      engineRef.current = engine;

      engine.initialize({
        appId: APP_ID,
        channelProfile: ChannelProfileType.ChannelProfileCommunication,
      });

      engine.enableVideo();
      engine.setChannelProfile(ChannelProfileType.ChannelProfileCommunication);
      engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);

      engine.addListener('onUserJoined', (uid, elapsed) => {
        setRemoteUid(uid);
        setStatus('connected');
        startTimer();
      });

      engine.addListener('onUserOffline', (uid, reason) => {
        setRemoteUid(null);
      });

      const channelName = `chat_${chatId}`;
      engine.joinChannel(TEMP_TOKEN || '', channelName, null, 0);

      setStatus('ringing');
    } catch (err) {
      console.error('Mobile Call Error:', err);
      setError('Ошибка инициализации движка.');
      setStatus('ended');
    }
  };

  // ================= COMMON LOGIC =================
  const startTimer = () => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => setDuration(prev => prev + 1), 1000);
  };

  const formatDuration = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const toggleMute = async () => {
    if (Platform.OS === 'web') {
      if (localTrackRef.current?.microphoneTrack) {
        await localTrackRef.current.microphoneTrack.setEnabled(!isMuted);
        setIsMuted(!isMuted);
      }
    } else {
      if (engineRef.current) {
        engineRef.current.muteLocalAudioStream(!isMuted);
        setIsMuted(!isMuted);
      }
    }
  };

  const toggleVideo = async () => {
    if (Platform.OS === 'web') {
      if (localTrackRef.current?.cameraTrack) {
        await localTrackRef.current.cameraTrack.setEnabled(!isVideoOff);
        setIsVideoOff(!isVideoOff);
      }
    } else {
      if (engineRef.current) {
        engineRef.current.muteLocalVideoStream(!isVideoOff);
        setIsVideoOff(!isVideoOff);
      }
    }
  };

  const endCall = async () => {
    if (Platform.OS === 'web') {
      if (localTrackRef.current) {
        localTrackRef.current.microphoneTrack?.close();
        localTrackRef.current.cameraTrack?.close();
      }
      if (clientRef.current) {
        await clientRef.current.leave();
      }
    } else {
      if (engineRef.current) {
        engineRef.current.leaveChannel();
        engineRef.current.release();
      }
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setStatus('ended');
  };

  return (
    <View style={[styles.container, { backgroundColor: '#1a1a1a' }]}>
      {/* Видео собеседника */}
      {isVideoCall && status === 'connected' && (
        Platform.OS === 'web' ? (
          <div ref={remoteVideoRef} style={styles.remoteVideoWeb} />
        ) : (
          <RtcRemoteView.SurfaceView
            style={styles.remoteVideoMobile}
            uid={remoteUid || 0}
            channelId={`chat_${chatId}`}
          />
        )
      )}

      {/* Локальное видео (картинка в картинке) */}
      {isVideoCall && (
        Platform.OS === 'web' ? (
          <div ref={localVideoRef} style={styles.localVideoWeb} />
        ) : (
          <RtcLocalView.SurfaceView
            style={styles.localVideoMobile}
            channelId={`chat_${chatId}`}
          />
        )
      )}

      {/* Оверлей */}
      <View style={styles.overlay}>
        <View style={styles.header}>
          <Text style={styles.title}>{title || 'Вызов'}</Text>
          <Text style={styles.status}>
            {status === 'ringing' && 'Соединение...'}
            {status === 'connecting' && 'Подключение...'}
            {status === 'connected' && formatDuration(duration)}
            {status === 'ended' && 'Звонок завершен'}
          </Text>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {status === 'connected' && (
          <View style={styles.controls}>
            <TouchableOpacity style={[styles.controlBtn, isMuted && styles.controlBtnActive]} onPress={toggleMute}>
              <Text style={styles.controlIcon}>{isMuted ? '🔇' : '🎤'}</Text>
              <Text style={styles.controlText}>{isMuted ? 'Вкл' : 'Выкл'}</Text>
            </TouchableOpacity>
            
            {isVideoCall && (
              <TouchableOpacity style={[styles.controlBtn, isVideoOff && styles.controlBtnActive]} onPress={toggleVideo}>
                <Text style={styles.controlIcon}>{isVideoOff ? '📷' : ''}</Text>
                <Text style={styles.controlText}>{isVideoOff ? 'Вкл' : 'Выкл'}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.controlBtn, styles.hangupBtn]} onPress={endCall}>
              <Text style={styles.controlIcon}>📞</Text>
              <Text style={styles.controlText}>Завершить</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === 'ended' && (
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>Вернуться в чат</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  // Web styles (используются как object styles для div)
  remoteVideoWeb: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: '#000' },
  localVideoWeb: { position: 'absolute', top: 60, right: 20, width: 120, height: 160, borderRadius: 12, backgroundColor: '#333', borderWidth: 2, borderColor: '#fff', zIndex: 10 },
  // Mobile styles
  remoteVideoMobile: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: '#000' },
  localVideoMobile: { position: 'absolute', top: 60, right: 20, width: 120, height: 160, borderRadius: 12, backgroundColor: '#333', borderWidth: 2, borderColor: '#fff', zIndex: 10 },
  
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between', padding: 20, paddingTop: 60, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 5 },
  header: { alignItems: 'center' },
  title: { color: '#fff', fontSize: 28, fontWeight: 'bold', marginBottom: 10 },
  status: { color: 'rgba(255,255,255,0.8)', fontSize: 16 },
  error: { color: '#FF3B30', textAlign: 'center', marginTop: 20, fontSize: 14, paddingHorizontal: 20 },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingBottom: 40 },
  controlBtn: { alignItems: 'center', width: 80 },
  controlBtnActive: { opacity: 0.5 },
  controlIcon: { fontSize: 28, marginBottom: 5 },
  controlText: { color: '#fff', fontSize: 12 },
  hangupBtn: { backgroundColor: '#FF3B30', width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center' },
  backBtn: { alignSelf: 'center', padding: 15, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 25 },
  backBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});