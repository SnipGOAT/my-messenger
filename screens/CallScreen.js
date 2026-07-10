// screens/CallScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';

// Конфигурация STUN сервера (бесплатный от Google)
const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

export default function CallScreen({ route, navigation }) {
  const { chatId, title, isVideoCall, callerId, callerName } = route.params || {};
  const { colors } = useTheme();
  
  const [status, setStatus] = useState('connecting'); // connecting, ringing, connected, ended
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(!isVideoCall);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);

  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const channelRef = useRef(null);
  const timerRef = useRef(null);

  // Ссылки на видео элементы (для веба)
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    setupCall();
    return () => {
      endCall();
    };
  }, []);

  const setupCall = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Не авторизован');

      // 1. Получаем доступ к микрофону/камере
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: isVideoCall 
      });
      localStreamRef.current = stream;
      
      // Для веба: привязываем поток к видео элементу
      if (Platform.OS === 'web' && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // 2. Создаем RTCPeerConnection
      const pc = new RTCPeerConnection(rtcConfig);
      peerConnectionRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (event.candidate && channelRef.current) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'ice-candidate',
            payload: { candidate: event.candidate, target: callerId || route.params?.targetUserId }
          });
        }
      };

      pc.ontrack = (event) => {
        remoteStreamRef.current = event.streams[0];
        if (Platform.OS === 'web' && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
        setStatus('connected');
        startTimer();
      };

      // 3. Подключаемся к каналу сигнализации
      const channel = supabase.channel(`call:${chatId}`, {
        config: { broadcast: { self: true } }
      });

      channel.on('broadcast', { event: 'offer' }, async (payload) => {
        if (payload.sender_id !== user.id) {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          channel.send({
            type: 'broadcast',
            event: 'answer',
            payload: { answer, target: payload.sender_id }
          });
        }
      });

      channel.on('broadcast', { event: 'answer' }, async (payload) => {
        if (payload.sender_id !== user.id) {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
        }
      });

      channel.on('broadcast', { event: 'ice-candidate' }, async (payload) => {
        if (payload.sender_id !== user.id && payload.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch (e) {
            console.error('Ошибка ICE кандидата:', e);
          }
        }
      });

      channel.on('broadcast', { event: 'hangup' }, () => {
        setStatus('ended');
        setTimeout(() => navigation.goBack(), 2000);
      });

      channel.subscribe();
      channelRef.current = channel;

      // 4. Если мы инициатор - создаем Offer
      if (callerId === user.id) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        channel.send({
          type: 'broadcast',
          event: 'offer',
          payload: { offer, target: route.params?.targetUserId }
        });
        setStatus('ringing');
      } else {
        setStatus('ringing'); // Ждем offer
      }

    } catch (err) {
      console.error('Ошибка настройки вызова:', err);
      setError('Не удалось получить доступ к микрофону/камере');
      setStatus('ended');
    }
  };

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setDuration(prev => prev + 1);
    }, 1000);
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
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setStatus('ended');
  };

  return (
    <View style={[styles.container, { backgroundColor: '#1a1a1a' }]}>
      {/* Удаленное видео (собеседник) */}
      {isVideoCall && status === 'connected' && (
        <video 
          ref={remoteVideoRef} 
          autoPlay 
          playsInline 
          style={styles.remoteVideo} 
        />
      )}

      {/* Локальное видео (картинка в картинке) */}
      {isVideoCall && (
        <video 
          ref={localVideoRef} 
          autoPlay 
          playsInline 
          muted 
          style={styles.localVideo} 
        />
      )}

      {/* Оверлей с информацией */}
      <View style={styles.overlay}>
        <View style={styles.header}>
          <Text style={styles.title}>{title || 'Вызов'}</Text>
          <Text style={styles.status}>
            {status === 'ringing' && 'Вызов...'}
            {status === 'connecting' && 'Подключение...'}
            {status === 'connected' && formatDuration(duration)}
            {status === 'ended' && 'Звонок завершен'}
          </Text>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {/* Кнопки управления */}
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
  remoteVideo: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#000' },
  localVideo: { position: 'absolute', top: 60, right: 20, width: 120, height: 160, borderRadius: 12, objectFit: 'cover', backgroundColor: '#333', borderWidth: 2, borderColor: '#fff', zIndex: 10 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between', padding: 20, paddingTop: 60, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 5 },
  header: { alignItems: 'center' },
  title: { color: '#fff', fontSize: 28, fontWeight: 'bold', marginBottom: 10 },
  status: { color: 'rgba(255,255,255,0.8)', fontSize: 16 },
  error: { color: '#FF3B30', textAlign: 'center', marginTop: 20, fontSize: 14 },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingBottom: 40 },
  controlBtn: { alignItems: 'center', width: 80 },
  controlBtnActive: { opacity: 0.5 },
  controlIcon: { fontSize: 28, marginBottom: 5 },
  controlText: { color: '#fff', fontSize: 12 },
  hangupBtn: { backgroundColor: '#FF3B30', width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center' },
  backBtn: { alignSelf: 'center', padding: 15, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 25 },
  backBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});