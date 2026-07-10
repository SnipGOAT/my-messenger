// screens/CallScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import * as Notifications from 'expo-notifications';

// Настройка уведомлений для мобильных
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true }),
});

const TURN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
];

let RTCPeerConnection = null;
let RTCSessionDescription = null;
let RTCIceCandidate = null;
let mediaDevices = null;

if (Platform.OS === 'web') {
  RTCPeerConnection = window.RTCPeerConnection;
  RTCSessionDescription = window.RTCSessionDescription;
  RTCIceCandidate = window.RTCIceCandidate;
  mediaDevices = navigator.mediaDevices;
} else {
  const WebRTC = require('react-native-webrtc');
  RTCPeerConnection = WebRTC.RTCPeerConnection;
  RTCSessionDescription = WebRTC.RTCSessionDescription;
  RTCIceCandidate = WebRTC.RTCIceCandidate;
  mediaDevices = WebRTC.mediaDevices;
}

export default function CallScreen({ route, navigation }) {
  const { chatId, title, isVideoCall, callerId, targetUserId } = route.params || {};
  const { colors } = useTheme();
  
  const [status, setStatus] = useState('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(!isVideoCall);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null); // НОВОЕ: для звука
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const channelRef = useRef(null);
  const timerRef = useRef(null);

  const pendingIceRef = useRef([]);
  const remoteDescSetRef = useRef(false);

  useEffect(() => {
    requestNotificationPermission();
    initCall();
    return () => {
      endCall();
    };
  }, []);

  // Запрос разрешений на уведомления
  const requestNotificationPermission = async () => {
    if (Platform.OS === 'web') {
      if ('Notification' in window && Notification.permission !== 'granted') {
        await Notification.requestPermission();
      }
    } else {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Внимание', 'Разрешите уведомления, чтобы видеть входящие звонки');
      }
    }
  };

  // Показ уведомления о входящем звонке
  const showCallNotification = (senderName) => {
    if (Platform.OS === 'web') {
      if (Notification.permission === 'granted') {
        const notification = new Notification('📞 Входящий звонок', {
          body: `${senderName || 'Пользователь'} звонит вам`,
          icon: '/favicon.ico',
          tag: 'incoming-call'
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }
    } else {
      Notifications.scheduleNotificationAsync({
        content: {
          title: '📞 Входящий звонок',
          body: `${senderName || 'Пользователь'} звонит вам`,
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null,
      });
    }
  };

  const applyPendingIce = async () => {
    if (pendingIceRef.current.length > 0 && pcRef.current) {
      for (const candidate of pendingIceRef.current) {
        try { await pcRef.current.addIceCandidate(candidate); } catch (e) { console.error('ICE error:', e); }
      }
      pendingIceRef.current = [];
    }
  };

  const initCall = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Не авторизован');

      const stream = await mediaDevices.getUserMedia({ audio: true, video: isVideoCall });
      localStreamRef.current = stream;

      if (Platform.OS === 'web' && localVideoRef.current && isVideoCall) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = new RTCPeerConnection({ iceServers: TURN_SERVERS });
      pcRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (event.candidate && channelRef.current) {
          channelRef.current.send({
            type: 'broadcast', event: 'ice-candidate',
            payload: { candidate: event.candidate.candidate, sdpMid: event.candidate.sdpMid, sdpMLineIndex: event.candidate.sdpMLineIndex, target: targetUserId }
          });
        }
      };

      // НОВОЕ: Обработка удалённого потока + включение звука
      pc.ontrack = (event) => {
        const remoteStream = event.streams[0];
        console.log('Получен удалённый поток');
        
        if (Platform.OS === 'web') {
          if (isVideoCall && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
          } else if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.play().catch(e => console.log('Audio play blocked:', e));
          }
        }
        setStatus('connected');
        startTimer();
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          setError('Соединение разорвано. Проверьте интернет.');
          setStatus('ended');
        }
      };

      const channel = supabase.channel(`call:${chatId}`, { config: { broadcast: { self: true } } });

      channel.on('broadcast', { event: 'offer' }, async ({ payload: sdPayload }) => {
        if (sdPayload.sender_id !== user.id && !remoteDescSetRef.current) {
          showCallNotification('Собеседник'); // Уведомление при входящем
          try {
            await pc.setRemoteDescription(new RTCSessionDescription({ type: sdPayload.type, sdp: sdPayload.sdp }));
            remoteDescSetRef.current = true;
            await applyPendingIce();
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            channel.send({
              type: 'broadcast', event: 'answer',
              payload: { sdp: pc.localDescription.sdp, type: pc.localDescription.type, target: sdPayload.sender_id }
            });
          } catch (err) { console.error('Offer error:', err); }
        }
      });

      channel.on('broadcast', { event: 'answer' }, async ({ payload: sdPayload }) => {
        if (sdPayload.sender_id !== user.id && !remoteDescSetRef.current) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription({ type: sdPayload.type, sdp: sdPayload.sdp }));
            remoteDescSetRef.current = true;
            await applyPendingIce();
          } catch (err) { console.error('Answer error:', err); }
        }
      });

      channel.on('broadcast', { event: 'ice-candidate' }, async ({ payload: icePayload }) => {
        if (icePayload.sender_id !== user.id && icePayload.candidate) {
          const candidate = new RTCIceCandidate({ candidate: icePayload.candidate, sdpMid: icePayload.sdpMid, sdpMLineIndex: icePayload.sdpMLineIndex });
          if (remoteDescSetRef.current) {
            try { await pc.addIceCandidate(candidate); } catch (e) { console.error('ICE:', e); }
          } else {
            pendingIceRef.current.push(candidate);
          }
        }
      });

      channel.on('broadcast', { event: 'hangup' }, () => {
        setStatus('ended');
        setTimeout(() => navigation.goBack(), 2000);
      });

      channel.subscribe();
      channelRef.current = channel;

      if (callerId === user.id) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        channel.send({
          type: 'broadcast', event: 'offer',
          payload: { sdp: pc.localDescription.sdp, type: pc.localDescription.type, target: targetUserId }
        });
        setStatus('ringing');
      } else {
        setStatus('ringing');
      }
    } catch (err) {
      console.error('Init error:', err);
      setError(err.message || 'Ошибка подключения');
      setStatus('ended');
    }
  };

  const startTimer = () => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => setDuration(prev => prev + 1), 1000);
  };

  const formatDuration = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) { audioTrack.enabled = !audioTrack.enabled; setIsMuted(!isMuted); }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) { videoTrack.enabled = !videoTrack.enabled; setIsVideoOff(!isVideoOff); }
    }
  };

  const endCall = () => {
    if (channelRef.current) {
      channelRef.current.send({ type: 'broadcast', event: 'hangup', payload: {} });
      supabase.removeChannel(channelRef.current);
    }
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(track => track.stop());
    if (pcRef.current) pcRef.current.close();
    if (timerRef.current) clearInterval(timerRef.current);
    setStatus('ended');
  };

  return (
    <View style={[styles.container, { backgroundColor: '#1a1a1a' }]}>
      {/* Удалённое видео */}
      {isVideoCall && status === 'connected' && (
        Platform.OS === 'web' ? (
          <video ref={remoteVideoRef} autoPlay playsInline style={styles.remoteVideoWeb} />
        ) : (
          <View style={styles.remoteVideoMobile} />
        )
      )}

      {/* Локальное видео */}
      {isVideoCall && (
        Platform.OS === 'web' ? (
          <video ref={localVideoRef} autoPlay playsInline muted style={styles.localVideoWeb} />
        ) : (
          <View style={styles.localVideoMobile} />
        )
      )}

      {/* НОВОЕ: Скрытый аудио элемент для звука */}
      {Platform.OS === 'web' && <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />}

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
              <Text style={styles.controlIcon}>{isMuted ? '🔇' : ''}</Text>
              <Text style={styles.controlText}>{isMuted ? 'Вкл' : 'Выкл'}</Text>
            </TouchableOpacity>
            
            {isVideoCall && (
              <TouchableOpacity style={[styles.controlBtn, isVideoOff && styles.controlBtnActive]} onPress={toggleVideo}>
                <Text style={styles.controlIcon}>{isVideoOff ? '📷' : '📹'}</Text>
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
  remoteVideoWeb: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: '#000' },
  localVideoWeb: { position: 'absolute', top: 60, right: 20, width: 120, height: 160, borderRadius: 12, backgroundColor: '#333', borderWidth: 2, borderColor: '#fff', zIndex: 10 },
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