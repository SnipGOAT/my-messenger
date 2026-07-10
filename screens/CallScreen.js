// screens/CallScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';

// TURN-серверы OpenRelay (бесплатные)
const TURN_SERVERS = [
  {
    urls: 'stun:stun.l.google.com:19302'
  },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

// Импорты для разных платформ
let AgoraRTC = null;
let RTCPeerConnection = null;
let RTCSessionDescription = null;
let RTCIceCandidate = null;
let mediaDevices = null;

if (Platform.OS === 'web') {
  // Для веба используем нативный WebRTC API браузера
  RTCPeerConnection = window.RTCPeerConnection;
  RTCSessionDescription = window.RTCSessionDescription;
  RTCIceCandidate = window.RTCIceCandidate;
  mediaDevices = navigator.mediaDevices;
} else {
  // Для мобильных устройств
  const WebRTC = require('react-native-webrtc');
  RTCPeerConnection = WebRTC.RTCPeerConnection;
  RTCSessionDescription = WebRTC.RTCSessionDescription;
  RTCIceCandidate = WebRTC.RTCIceCandidate;
  mediaDevices = WebRTC.mediaDevices;
}

export default function CallScreen({ route, navigation }) {
  const { chatId, title, isVideoCall } = route.params || {};
  const { colors } = useTheme();
  
  const [status, setStatus] = useState('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(!isVideoCall);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const channelRef = useRef(null);
  const timerRef = useRef(null);

  // Буфер для ICE-кандидатов
  const pendingIceRef = useRef([]);
  const remoteDescSetRef = useRef(false);

  useEffect(() => {
    initCall();
    return () => {
      endCall();
    };
  }, []);

  const fetchToken = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('generate-agora-token', {
        body: { chatId, isVideoCall }
      });
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Ошибка получения токена:', err);
      throw new Error('Не удалось получить токен');
    }
  };

  const applyPendingIce = async () => {
    if (pendingIceRef.current.length > 0 && pcRef.current) {
      console.log(`Применяем ${pendingIceRef.current.length} ICE-кандидатов`);
      for (const candidate of pendingIceRef.current) {
        try {
          await pcRef.current.addIceCandidate(candidate);
        } catch (e) {
          console.error('Ошибка ICE:', e);
        }
      }
      pendingIceRef.current = [];
    }
  };

  const initCall = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Не авторизован');

      // Получаем доступ к микрофону/камере
      const stream = await mediaDevices.getUserMedia({ 
        audio: true, 
        video: isVideoCall 
      });
      localStreamRef.current = stream;

      // Для веба: показываем локальное видео
      if (Platform.OS === 'web' && localVideoRef.current && isVideoCall) {
        localVideoRef.current.srcObject = stream;
      }

      // Создаем RTCPeerConnection
      const pc = new RTCPeerConnection({
        iceServers: TURN_SERVERS
      });
      pcRef.current = pc;

      // Добавляем треки
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Обработка ICE-кандидатов
      pc.onicecandidate = (event) => {
        if (event.candidate && channelRef.current) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'ice-candidate',
            payload: {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              target: route.params?.targetUserId
            }
          });
        }
      };

      // Обработка удаленного трека
      pc.ontrack = (event) => {
        console.log('Получен удаленный трек');
        if (Platform.OS === 'web' && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
        setStatus('connected');
        startTimer();
      };

      // Обработка состояния соединения
      pc.onconnectionstatechange = () => {
        console.log('Состояние соединения:', pc.connectionState);
        if (pc.connectionState === 'failed') {
          setError('Соединение не удалось. Проверьте интернет.');
          setStatus('ended');
        }
      };

      // Подключаемся к каналу сигнализации
      const channel = supabase.channel(`call:${chatId}`, {
        config: { broadcast: { self: true } }
      });

      // Обработка Offer
      channel.on('broadcast', { event: 'offer' }, async ({ payload: sdPayload }) => {
        if (sdPayload.sender_id !== user.id && !remoteDescSetRef.current) {
          console.log('Получен offer');
          try {
            await pc.setRemoteDescription(new RTCSessionDescription({
              type: sdPayload.type,
              sdp: sdPayload.sdp
            }));
            remoteDescSetRef.current = true;
            await applyPendingIce();

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            channel.send({
              type: 'broadcast',
              event: 'answer',
              payload: {
                sdp: pc.localDescription.sdp,
                type: pc.localDescription.type,
                target: sdPayload.sender_id
              }
            });
          } catch (err) {
            console.error('Ошибка обработки offer:', err);
          }
        }
      });

      // Обработка Answer
      channel.on('broadcast', { event: 'answer' }, async ({ payload: sdPayload }) => {
        if (sdPayload.sender_id !== user.id && !remoteDescSetRef.current) {
          console.log('Получен answer');
          try {
            await pc.setRemoteDescription(new RTCSessionDescription({
              type: sdPayload.type,
              sdp: sdPayload.sdp
            }));
            remoteDescSetRef.current = true;
            await applyPendingIce();
          } catch (err) {
            console.error('Ошибка обработки answer:', err);
          }
        }
      });

      // Обработка ICE-кандидатов
      channel.on('broadcast', { event: 'ice-candidate' }, async ({ payload: icePayload }) => {
        if (icePayload.sender_id !== user.id && icePayload.candidate) {
          const candidate = new RTCIceCandidate({
            candidate: icePayload.candidate,
            sdpMid: icePayload.sdpMid,
            sdpMLineIndex: icePayload.sdpMLineIndex
          });

          if (remoteDescSetRef.current) {
            try {
              await pc.addIceCandidate(candidate);
            } catch (e) {
              console.error('Ошибка ICE:', e);
            }
          } else {
            console.log('Буферизуем ICE-кандидат');
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

      // Если мы инициатор - создаем Offer
      if (route.params?.callerId === user.id) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        channel.send({
          type: 'broadcast',
          event: 'offer',
          payload: {
            sdp: pc.localDescription.sdp,
            type: pc.localDescription.type,
            target: route.params?.targetUserId
          }
        });
        setStatus('ringing');
      } else {
        setStatus('ringing');
      }

    } catch (err) {
      console.error('Ошибка инициализации:', err);
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
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!isMuted);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!isVideoOff);
      }
    }
  };

  const endCall = () => {
    if (channelRef.current) {
      channelRef.current.send({ type: 'broadcast', event: 'hangup', payload: {} });
      supabase.removeChannel(channelRef.current);
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (pcRef.current) {
      pcRef.current.close();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setStatus('ended');
  };

  return (
    <View style={[styles.container, { backgroundColor: '#1a1a1a' }]}>
      {isVideoCall && status === 'connected' && (
        Platform.OS === 'web' ? (
          <video ref={remoteVideoRef} autoPlay playsInline style={styles.remoteVideoWeb} />
        ) : (
          <View style={styles.remoteVideoMobile} />
        )
      )}

      {isVideoCall && (
        Platform.OS === 'web' ? (
          <video ref={localVideoRef} autoPlay playsInline muted style={styles.localVideoWeb} />
        ) : (
          <View style={styles.localVideoMobile} />
        )
      )}

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