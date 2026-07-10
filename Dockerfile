# ============================================
# Этап 1: Сборка приложения
# ============================================
FROM node:20-alpine AS builder

# Объявляем build arguments (передаются из Amvera)
ARG EXPO_PUBLIC_SUPABASE_URL
ARG EXPO_PUBLIC_SUPABASE_ANON_KEY

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем файлы зависимостей
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci

# Копируем весь код
COPY . .

# Передаем переменные окружения в процесс сборки
ENV EXPO_PUBLIC_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL
ENV EXPO_PUBLIC_SUPABASE_ANON_KEY=$EXPO_PUBLIC_SUPABASE_ANON_KEY

# Собираем веб-версию (теперь переменные доступны)
RUN npx expo export -p web

# ============================================
# Этап 2: Раздача статики через nginx
# ============================================
FROM nginx:alpine

# Удаляем стандартный конфиг nginx
RUN rm /etc/nginx/conf.d/default.conf

# Копируем наш конфиг nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Копируем собранный сайт из первого этапа
COPY --from=builder /app/dist /usr/share/nginx/html

# Открываем порт 80
EXPOSE 80

# Запускаем nginx
CMD ["nginx", "-g", "daemon off;"]