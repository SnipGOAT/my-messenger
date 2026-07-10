// supabase/functions/generate-agora-token/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Утилиты для генерации токена Agora (RtcTokenBuilder)
// Используем CDN для импорта
import { RtcTokenBuilder, RtcRole } from 'https://esm.sh/agora-token@2.0.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Обработка CORS preflight запросов
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { chatId, isVideoCall } = await req.json()

    // Получаем App ID и Certificate из переменных окружения
    const appId = Deno.env.get('AGORA_APP_ID')
    const appCertificate = Deno.env.get('AGORA_APP_CERTIFICATE')

    if (!appId || !appCertificate) {
      throw new Error('AGORA_APP_ID или AGORA_APP_CERTIFICATE не заданы')
    }

    // Генерируем уникальный UID для пользователя
    // В реальном приложении можно использовать ID текущего пользователя из Supabase Auth
    const uid = Math.floor(Math.random() * 100000)

    // Время истечения токена (в секундах)
    const tokenExpirationInSeconds = 3600 // 1 час
    const privilegeExpirationInSeconds = 3600

    // Определяем роль (Publisher = может говорить и показывать видео)
    const role = RtcRole.PUBLISHER

    // Генерируем токен
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      `chat_${chatId}`, // Имя канала (должно совпадать с тем, что в CallScreen.js)
      uid,
      role,
      tokenExpirationInSeconds,
      privilegeExpirationInSeconds
    )

    return new Response(
      JSON.stringify({ 
        token, 
        uid,
        appId 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Ошибка генерации токена:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})