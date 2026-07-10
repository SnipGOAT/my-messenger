// screens/CallScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import Peer from 'peerjs';

export default function CallScreen({ route, navigation }) {
  const { chatId, title, isVideoCall } = route.params || {};
  const { colors } = useTheme();
  
  const [status, setStatus] = useState('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(!isVideoCall);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);
  const [peerId, setPeerId] = useState('');

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const peerRef = useRef(null);
  const callRef = useRef(null);
  const localStreamRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    initPeer();
    return () => {
      endCall();
    };
  }, []);

  const initPeer = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Не авторизован');

      // Создаём Peer с уникальным ID (user.id)
      // ИСПОЛЬЗУЕМ ПУБЛИЧНЫЙ PEERJS CLOUD SERVER
      const peer = new Peer(user.id, {
        debug: 2,
        // Не указываем host/port — используем облачный сервер PeerJS по умолчанию
      });

      peerRef.current = peer;

      peer.on('open', (id) => {
        console.log('Peer ID:', id);
        setPeerId(id);
        setStatus('ringing');
      });

      peer.on('call', async (call) => {
        console.log('Входящий звонок');
        
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: isVideoCall
        });
        localStreamRef.current = stream;

        if (Platform.OS === 'web' && localVideoRef.current && isVideoCall) {
          localVideoRef.current.srcObject = stream;
        }

        call.answer(stream);
        handleCall(call);
      });

      peer.on('error', (err) => {
        console.error('Peer error:', err);
        setError('Ошибка соединения: ' + err.type);
        setStatus('ended');
      });

    } catch (err) {
      console.error('Ошибка инициализации:', err);
      setError(err.message);
      setStatus('ended');
    }
  };

  const handleCall = (call) => {
    callRef.current = call;

    call.on('stream', (remoteStream) => {
      console.log('Получен удаленный поток');
      if (Platform.OS === 'web' && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play().catch(err => {
          console.error('Ошибка воспроизведения:', err);
        });
      }
      
      // Отдельно для аудио
      if (Platform.OS === 'web' && remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch(err => {
          console.error('Ошибка воспроизведения аудио:', err);
        });
      }
      
      setStatus('connected');
      startTimer();
    });

    call.on('close', () => {
      setStatus('ended');
      setTimeout(() => navigation.goBack(), 2000);
    });
  };

  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideoCall
      });
      localStreamRef.current = stream;

      if (Platform.OS === 'web' && localVideoRef.current && isVideoCall) {
        localVideoRef.current.srcObject = stream;
      }

      const targetUserId = route.params?.targetUserId;
      const call = peerRef.current.call(targetUserId, stream);
      handleCall(call);
    } catch (err) {
      console.error('Ошибка звонка:', err);
      setError('Не удалось получить доступ к микрофону/камере');
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
    if (callRef.current) {
      callRef.current.close();
    }
    if (peerRef.current) {
      peerRef.current.destroy();
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setStatus('ended');
  };

  // Если мы инициатор звонка
  useEffect(() => {
    if (status === 'ringing' && route.params?.callerId) {
      startCall();
    }
  }, [status]);

  return (
    <View style={[styles.container, { backgroundColor: '#1a1a1a' }]}>
      {isVideoCall && status === 'connected' && (
        Platform.OS === 'web' ? (
          <>
            <video ref={remoteVideoRef} autoPlay playsInline style={styles.remoteVideoWeb} />
            <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />
          </>
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
            {status === 'ringing' && 'Звоним...'}
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