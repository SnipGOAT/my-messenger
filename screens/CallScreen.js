// screens/CallScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: 'turn:freestun.net:3478',
    username: 'free',
    credential: 'free'
  },
  {
    urls: 'turn:freestun.net:3478?transport=tcp',
    username: 'free',
    credential: 'free'
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

export default function CallScreen({ route, navigation }) {
  const { chatId, title, isVideoCall } = route.params || {};
  const { colors } = useTheme();
  
  const [status, setStatus] = useState('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(!isVideoCall);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);
  const [hasAudio, setHasAudio] = useState(true);
  const [audioElement, setAudioElement] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const channelRef = useRef(null);
  const timerRef = useRef(null);
  const pendingIceRef = useRef([]);
  const remoteDescSetRef = useRef(false);

  useEffect(() => {
    initCall();
    return () => {
      endCall();
    };
  }, []);

  const applyPendingIce = async () => {
    if (pendingIceRef.current.length > 0 && pcRef.current) {
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

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { 
            echoCancellation: true, 
            noiseSuppression: true,
            autoGainControl: true
          },
          video: isVideoCall ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
        });
        
        // ДИАГНОСТИКА: Проверяем локальный стрим
        console.log('=== ЛОКАЛЬНЫЙ СТРИМ ===');
        console.log('Треки:', stream.getTracks().map(t => ({
          kind: t.kind,
          enabled: t.enabled,
          label: t.label,
          readyState: t.readyState
        })));
        
      } catch (mediaErr) {
        console.error('Ошибка медиа:', mediaErr);
        if (mediaErr.name === 'NotReadableError') {
          setError('Микрофон занят другим приложением');
          setStatus('ended');
          return;
        }
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: isVideoCall });
          setHasAudio(false);
          setError('Микрофон недоступен. Звонок без звука.');
        } catch (e) {
          setError('Не удалось получить доступ к медиа: ' + e.message);
          setStatus('ended');
          return;
        }
      }

      if (!stream) {
        setError('Нет доступа к медиа');
        setStatus('ended');
        return;
      }

      localStreamRef.current = stream;

      if (Platform.OS === 'web' && localVideoRef.current && isVideoCall) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'relay',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      });
      pcRef.current = pc;

      // ДИАГНОСТИКА: Проверяем добавление треков
      stream.getTracks().forEach(track => {
        const sender = pc.addTrack(track, stream);
        console.log('Добавлен трек:', track.kind, 'Sender:', sender);
      });

      // ДИАГНОСТИКА: Логируем SDP
      pc.onnegotiationneeded = async () => {
        console.log('=== NEGOTIATION NEEDED ===');
        const localDesc = pc.localDescription;
        if (localDesc) {
          console.log('Local SDP type:', localDesc.type);
          console.log('Local SDP содержит audio:', localDesc.sdp.includes('audio'));
          console.log('Local SDP содержит video:', localDesc.sdp.includes('video'));
        }
      };

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

      pc.oniceconnectionstatechange = () => {
        console.log('ICE:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
          pc.restartIce();
          setTimeout(() => {
            if (pc.iceConnectionState === 'failed') {
              setError('Соединение не удалось');
              setStatus('ended');
            }
          }, 5000);
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('Соединение:', pc.connectionState);
        if (pc.connectionState === 'failed') {
          setError('Соединение потеряно');
          setStatus('ended');
        }
      };

      pc.ontrack = (event) => {
        console.log('=== ПОЛУЧЕН ТРЕК ===');
        console.log('Трек kind:', event.track.kind);
        console.log('Трек enabled:', event.track.enabled);
        console.log('Трек muted:', event.track.muted);
        console.log('Трек id:', event.track.id);
        console.log('Стримы:', event.streams.length);
        
        if (Platform.OS === 'web') {
          remoteStreamRef.current = event.streams[0];
          
          if (event.track.kind === 'video' && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = event.streams[0];
            remoteVideoRef.current.play().catch(err => {
              console.error('Видео play error:', err);
            });
          }
          
          if (event.track.kind === 'audio') {
            console.log('Создаем audio элемент для удаленного звука');
            
            const audio = document.createElement('audio');
            audio.srcObject = event.streams[0];
            audio.autoplay = true;
            audio.controls = true;
            audio.style.position = 'fixed';
            audio.style.bottom = '100px';
            audio.style.left = '50%';
            audio.style.transform = 'translateX(-50%)';
            audio.style.zIndex = '9999';
            audio.style.width = '300px';
            
            document.body.appendChild(audio);
            setAudioElement(audio);
            
            audio.play().then(() => {
              console.log('✅ Audio play() успешен');
            }).catch(err => {
              console.error('❌ Audio play() ошибка:', err);
              setError('Нажмите на аудио-плеер ниже для включения звука');
            });
            
            audio.onplay = () => console.log('Audio playing');
            audio.onpause = () => console.log('Audio paused');
            audio.onvolumechange = () => console.log('Volume changed:', audio.volume);
            
            // ДИАГНОСТИКА: Проверяем состояние трека через 1 секунду
            setTimeout(() => {
              console.log('=== ЧЕРЕЗ 1 СЕКУНДУ ===');
              console.log('Трек enabled:', event.track.enabled);
              console.log('Трек muted:', event.track.muted);
              console.log('Audio element paused:', audio.paused);
              console.log('Audio element muted:', audio.muted);
              console.log('Audio element volume:', audio.volume);
            }, 1000);
          }
        }
        
        setStatus('connected');
        startTimer();
      };

      const channel = supabase.channel(`call:${chatId}`, {
        config: { broadcast: { self: true } }
      });

      channel.on('broadcast', { event: 'offer' }, async ({ payload: sdPayload }) => {
        if (sdPayload.sender_id !== user.id && !remoteDescSetRef.current) {
          console.log('=== ПОЛУЧЕН OFFER ===');
          console.log('SDP type:', sdPayload.type);
          console.log('SDP содержит audio:', sdPayload.sdp.includes('audio'));
          console.log('SDP содержит video:', sdPayload.sdp.includes('video'));
          
          try {
            await pc.setRemoteDescription(new RTCSessionDescription({
              type: sdPayload.type,
              sdp: sdPayload.sdp
            }));
            remoteDescSetRef.current = true;
            await applyPendingIce();

            const answer = await pc.createAnswer();
            console.log('=== СОЗДАН ANSWER ===');
            console.log('Answer SDP type:', answer.type);
            console.log('Answer SDP содержит audio:', answer.sdp.includes('audio'));
            
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
            console.error('Offer error:', err);
          }
        }
      });

      channel.on('broadcast', { event: 'answer' }, async ({ payload: sdPayload }) => {
        if (sdPayload.sender_id !== user.id && !remoteDescSetRef.current) {
          console.log('=== ПОЛУЧЕН ANSWER ===');
          console.log('SDP type:', sdPayload.type);
          console.log('SDP содержит audio:', sdPayload.sdp.includes('audio'));
          
          try {
            await pc.setRemoteDescription(new RTCSessionDescription({
              type: sdPayload.type,
              sdp: sdPayload.sdp
            }));
            remoteDescSetRef.current = true;
            await applyPendingIce();
          } catch (err) {
            console.error('Answer error:', err);
          }
        }
      });

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
              console.error('ICE error:', e);
            }
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

      if (route.params?.callerId === user.id) {
        console.log('=== СОЗДАЕМ OFFER ===');
        const offer = await pc.createOffer();
        console.log('Offer SDP type:', offer.type);
        console.log('Offer SDP содержит audio:', offer.sdp.includes('audio'));
        console.log('Offer SDP содержит video:', offer.sdp.includes('video'));
        
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
      console.error('Init error:', err);
      setError(err.message);
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
        console.log('Микрофон:', audioTrack.enabled ? 'включен' : 'выключен');
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
    
    if (audioElement) {
      audioElement.remove();
    }
    
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
            {status === 'ringing' && 'Звоним...'}
            {status === 'connecting' && 'Подключение...'}
            {status === 'connected' && formatDuration(duration)}
            {status === 'ended' && 'Звонок завершен'}
          </Text>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
        
        {!hasAudio && status === 'connected' && (
          <Text style={styles.warning}>⚠️ Без звука</Text>
        )}

        {status === 'connected' && (
          <View style={styles.controls}>
            {hasAudio && (
              <TouchableOpacity style={[styles.controlBtn, isMuted && styles.controlBtnActive]} onPress={toggleMute}>
                <Text style={styles.controlIcon}>{isMuted ? '' : '🎤'}</Text>
                <Text style={styles.controlText}>{isMuted ? 'Вкл' : 'Выкл'}</Text>
              </TouchableOpacity>
            )}
            
            {isVideoCall && (
              <TouchableOpacity style={[styles.controlBtn, isVideoOff && styles.controlBtnActive]} onPress={toggleVideo}>
                <Text style={styles.controlIcon}>{isVideoOff ? '' : '📹'}</Text>
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
  warning: { color: '#FFA500', textAlign: 'center', marginTop: 10, fontSize: 14, paddingHorizontal: 20 },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingBottom: 40 },
  controlBtn: { alignItems: 'center', width: 80 },
  controlBtnActive: { opacity: 0.5 },
  controlIcon: { fontSize: 28, marginBottom: 5 },
  controlText: { color: '#fff', fontSize: 12 },
  hangupBtn: { backgroundColor: '#FF3B30', width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center' },
  backBtn: { alignSelf: 'center', padding: 15, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 25 },
  backBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});