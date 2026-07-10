// components/IncomingCallModal.js
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { supabase } from '../lib/supabase';

export default function IncomingCallModal({ visible, onClose, onAccept }) {
  const [callRequest, setCallRequest] = useState(null);
  const [callerName, setCallerName] = useState('');

  useEffect(() => {
    if (!visible) return;

    // Подписываемся на новые запросы на звонок
    const channel = supabase
      .channel('incoming_calls')
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'call_requests',
          filter: `receiver_id=eq.${/* нужен текущий user_id */}`
        },
        async (payload) => {
          const newCall = payload.new;
          
          // Получаем имя звонящего
          const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', newCall.caller_id)
            .single();

          setCallRequest(newCall);
          setCallerName(profile?.username || 'Неизвестный');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [visible]);

  const handleAccept = async () => {
    if (!callRequest) return;

    // Обновляем статус
    await supabase
      .from('call_requests')
      .update({ status: 'accepted' })
      .eq('id', callRequest.id);

    onAccept(callRequest);
  };

  const handleReject = async () => {
    if (!callRequest) return;

    await supabase
      .from('call_requests')
      .update({ status: 'rejected' })
      .eq('id', callRequest.id);

    setCallRequest(null);
    onClose();
  };

  if (!callRequest) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Входящий звонок</Text>
          <Text style={styles.callerName}>{callerName}</Text>
          
          <View style={styles.buttons}>
            <TouchableOpacity style={[styles.button, styles.acceptButton]} onPress={handleAccept}>
              <Text style={styles.buttonText}>Принять</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.button, styles.rejectButton]} onPress={handleReject}>
              <Text style={styles.buttonText}>Отклонить</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 30,
    width: '80%',
    maxWidth: 400,
    alignItems: 'center'
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10
  },
  callerName: {
    fontSize: 18,
    color: '#666',
    marginBottom: 30
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%'
  },
  button: {
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    minWidth: 120
  },
  acceptButton: {
    backgroundColor: '#4CAF50'
  },
  rejectButton: {
    backgroundColor: '#F44336'
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold'
  }
});