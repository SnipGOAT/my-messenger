// supabase/functions/send-push-notification/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

// Заголовки CORS (на всякий случай, хотя для вебхуков из БД они не критичны)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Обработка OPTIONS запроса для CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Инициализируем клиент Supabase с сервисным ключом (обходит RLS)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Вебхук из базы данных передает объект { record: { ... }, type: "INSERT" }
    const { record } = await req.json()
    
    if (!record) {
      return new Response(JSON.stringify({ error: 'No record provided' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const chatId = record.chat_id
    const senderId = record.sender_id
    // Если сообщение пустое (только картинка), пишем " Фото"
    const content = record.content && record.content.trim() ? record.content : '📷 Фото'

    console.log(` Новое сообщение в чате ${chatId} от ${senderId}`)

    // 1. Находим имя отправителя
    const { data: senderProfile } = await supabaseClient
      .from('profiles')
      .select('username')
      .eq('id', senderId)
      .single()

    const senderName = senderProfile?.username || 'Неизвестный пользователь'

    // 2. Находим всех участников чата, КРОМЕ отправителя
    const { data: members } = await supabaseClient
      .from('chat_members')
      .select('user_id')
      .eq('chat_id', chatId)
      .neq('user_id', senderId)

    if (!members || members.length === 0) {
      console.log('В чате нет других участников')
      return new Response(JSON.stringify({ message: 'No other members' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const recipientIds = members.map(m => m.user_id)

    // 3. Находим Expo push-токены этих участников
    const { data: tokens } = await supabaseClient
      .from('push_tokens')
      .select('token')
      .in('user_id', recipientIds)

    if (!tokens || tokens.length === 0) {
      console.log('У получателей нет push-токенов')
      return new Response(JSON.stringify({ message: 'No push tokens found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // 4. Формируем payload для Expo Push API
    const messages = tokens.map(t => ({
      to: t.token,
      sound: 'default',
      title: senderName,
      body: content.length > 100 ? content.substring(0, 100) + '...' : content,
      data: { chatId, messageId: record.id },
    }))

    // 5. Отправляем запрос к Expo
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    })

    const result = await response.json()
    console.log('✅ Результат отправки Expo:', result)

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('❌ Ошибка в Edge Function:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})