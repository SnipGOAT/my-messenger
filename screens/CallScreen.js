// screens/CallScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';

const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

export default function CallScreen({ route, navigation }) {
  const { chatId, title, isVideoCall, callerId } = route.params || {};
  const { colors } = useTheme();
  
  const [status, setStatus] = useState('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(!isVideoCall);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);

  const localStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const channelRef = useRef(null);
  const timerRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // НОВОЕ: Буфер для ICE-кандидатов
  const pendingIceCandidatesRef = useRef([]);
  const remoteDescriptionSetRef = useRef(false);

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

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: isVideoCall 
      });
      localStreamRef.current = stream;
      
      if (Platform.OS === 'web' && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = new RTCPeerConnection(rtcConfig);
      peerConnectionRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (event.candidate && channelRef.current) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'ice-candidate',
            payload: { 
              candidate: event.candidate.candidate, 
              sdpMid: event.candidate.sdpMid, 
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              target: callerId === user.id ? route.params?.targetUserId : callerId
            }
          });
        }
      };

      pc.ontrack = (event) => {
        if (Platform.OS === 'web' && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
        setStatus('connected');
        startTimer();
      };

      // НОВОЕ: Функция для применения буферизованных ICE-кандидатов
      const applyPendingIceCandidates = async () => {
        if (pendingIceCandidatesRef.current.length > 0) {
          console.log(`Применяем ${pendingIceCandidatesRef.current.length} буферизованных ICE-кандидатов`);
          for (const candidate of pendingIceCandidatesRef.current) {
            try {
              await pc.addIceCandidate(candidate);
            } catch (e) {
              console.error('Ошибка применения ICE-кандидата:', e);
            }
          }
          pendingIceCandidatesRef.current = [];
        }
      };

      const channel = supabase.channel(`call:${chatId}`, {
        config: { broadcast: { self: true } }
      });

      channel.on('broadcast', { event: 'offer' }, async ({ payload: sdPayload }) => {
        if (sdPayload.sender_id !== user.id && !remoteDescriptionSetRef.current) {
          console.log('Получен offer');
          try {
            const remoteDesc = { type: sdPayload.type, sdp: sdPayload.sdp };
            await pc.setRemoteDescription(new RTCSessionDescription(remoteDesc));
            remoteDescriptionSetRef.current = true;
            
            // НОВОЕ: Применяем буферизованные ICE-кандидаты
            await applyPendingIceCandidates();

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

      channel.on('broadcast', { event: 'answer' }, async ({ payload: sdPayload }) => {
        if (sdPayload.sender_id !== user.id && !remoteDescriptionSetRef.current) {
          console.log('Получен answer');
          try {
            const remoteDesc = { type: sdPayload.type, sdp: sdPayload.sdp };
            await pc.setRemoteDescription(new RTCSessionDescription(remoteDesc));
            remoteDescriptionSetRef.current = true;
            
            // НОВОЕ: Применяем буферизованные ICE-кандидаты
            await applyPendingIceCandidates();
          } catch (err) {
            console.error('Ошибка обработки answer:', err);
          }
        }
      });

      // НОВОЕ: Буферизация ICE-кандидатов
      channel.on('broadcast', { event: 'ice-candidate' }, async ({ payload: icePayload }) => {
        if (icePayload.sender_id !== user.id && icePayload.candidate) {
          const candidate = new RTCIceCandidate({
            candidate: icePayload.candidate,
            sdpMid: icePayload.sdpMid,
            sdpMLineIndex: icePayload.sdpMLineIndex
          });

          if (remoteDescriptionSetRef.current) {
            // Remote description уже установлен — применяем сразу
            try {
              await pc.addIceCandidate(candidate);
            } catch (e) {
              console.error('Ошибка ICE кандидата:', e);
            }
          } else {
            // НОВОЕ: Remote description еще не установлен — буферизуем
            console.log('Буферизуем ICE-кандидат');
            pendingIceCandidatesRef.current.push(candidate);
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
      console.error('Ошибка настройки вызова:', err);
      setError('Не удалось получить доступ к микрофону/камере. Проверьте разрешения браузера.');
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
      {isVideoCall && status === 'connected' && (
        <video 
          ref={remoteVideoRef} 
          autoPlay 
          playsInline 
          style={styles.remoteVideo} 
        />
      )}

      {isVideoCall && (
        <video 
          ref={localVideoRef} 
          autoPlay 
          playsInline 
          muted 
          style={styles.localVideo} 
        />
      )}

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