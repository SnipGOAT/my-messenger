// screens/CallScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
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
  const remoteAudioRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null); // НОВОЕ: сохраняем удаленный стрим
  const channelRef = useRef(null);
  const timerRef = useRef(null);
  const pendingIceRef = useRef([]);
  const remoteDescSetRef = useRef(false);
  const audioContextRef = useRef(null); // НОВОЕ: аудио-контекст

  useEffect(() => {
    initCall();
    return () => {
      endCall();
    };
  }, []);

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

  // НОВОЕ: Функция для проверки и восстановления аудио
  const checkAndRestoreAudio = () => {
    if (remoteAudioRef.current && remoteStreamRef.current) {
      const audioTracks = remoteStreamRef.current.getAudioTracks();
      console.log('Аудио треки:', audioTracks.length);
      
      audioTracks.forEach((track, index) => {
        console.log(`Трек ${index}:`, {
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
          kind: track.kind
        });
        
        // Если трек отключен, включаем его
        if (!track.enabled) {
          console.log('Включаем отключенный трек');
          track.enabled = true;
        }
      });
      
      // Проверяем состояние аудио элемента
      if (remoteAudioRef.current.paused) {
        console.log('Аудио элемент на паузе, запускаем');
        remoteAudioRef.current.play().catch(err => {
          console.error('Ошибка запуска аудио:', err);
        });
      }
    }
  };

  const initCall = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Не авторизован');

      // Получаем доступ к микрофону/камере
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true,
          autoGainControl: true
        },
        video: isVideoCall ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
      });
      localStreamRef.current = stream;

      // Логируем локальные треки
      console.log('Локальные треки:', stream.getTracks().map(t => ({
        kind: t.kind,
        enabled: t.enabled,
        readyState: t.readyState
      })));

      if (Platform.OS === 'web' && localVideoRef.current && isVideoCall) {
        localVideoRef.current.srcObject = stream;
      }

      // Создаем RTCPeerConnection
      const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
        iceCandidatePoolSize: 10
      });
      pcRef.current = pc;

      // Добавляем треки
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
        console.log('Добавлен локальный трек:', track.kind);
      });

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

      pc.oniceconnectionstatechange = () => {
        console.log('ICE состояние:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
          setError('Потеряно соединение');
          setStatus('ended');
        } else if (pc.iceConnectionState === 'disconnected') {
          console.log('Соединение разорвано, пытаемся восстановить...');
          // Пытаемся восстановить соединение
          setTimeout(() => {
            if (pc.iceConnectionState === 'disconnected') {
              pc.restartIce();
            }
          }, 3000);
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('Состояние соединения:', pc.connectionState);
      };

      // Обработка удаленного трека
      pc.ontrack = (event) => {
        console.log('Получен удаленный трек:', {
          kind: event.track.kind,
          enabled: event.track.enabled,
          readyState: event.track.readyState
        });
        
        if (Platform.OS === 'web') {
          // Сохраняем стрим
          remoteStreamRef.current = event.streams[0];
          
          if (event.track.kind === 'video' && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = event.streams[0];
            remoteVideoRef.current.play().catch(err => {
              console.error('Ошибка видео:', err);
            });
          }
          
          if (event.track.kind === 'audio' && remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = event.streams[0];
            
            // Создаем аудио-контекст для лучшего контроля
            if (!audioContextRef.current) {
              audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            // Резюмируем аудио-контекст (важно для браузеров!)
            if (audioContextRef.current.state === 'suspended') {
              audioContextRef.current.resume().then(() => {
                console.log('Аудио-контекст возобновлен');
              });
            }
            
            remoteAudioRef.current.play().then(() => {
              console.log('Аудио запущено успешно');
            }).catch(err => {
              console.error('Ошибка аудио:', err);
              // Пытаемся запустить снова после взаимодействия пользователя
              setTimeout(() => {
                remoteAudioRef.current.play().catch(e => console.error('Повторная ошибка:', e));
              }, 100);
            });
          }
        }
        
        // Отслеживаем состояние трека
        event.track.onended = () => {
          console.log('Удаленный трек завершен');
        };
        
        event.track.onmute = () => {
          console.log('Удаленный трек замьючен');
        };
        
        event.track.onunmute = () => {
          console.log('Удаленный трек размьючен');
        };
        
        setStatus('connected');
        startTimer();
        
        // Периодически проверяем аудио
        setInterval(checkAndRestoreAudio, 5000);
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
            console.error('Ошибка offer:', err);
            setError('Ошибка при обработке звонка');
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
            console.error('Ошибка answer:', err);
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
            console.log('Буферизуем ICE');
            pendingIceRef.current.push(candidate);
          }
        }
      });

      channel.on('broadcast', { event: 'hangup' }, () => {
        console.log('Получен hangup');
        setStatus('ended');
        setTimeout(() => navigation.goBack(), 2000);
      });

      channel.subscribe();
      channelRef.current = channel;

      // Если мы инициатор - создаем Offer
      if (route.params?.callerId === user.id) {
        console.log('Создаем offer');
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
        console.log('Ждем offer');
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
        console.log('Камера:', videoTrack.enabled ? 'включена' : 'выключена');
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
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setStatus('ended');
  };

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