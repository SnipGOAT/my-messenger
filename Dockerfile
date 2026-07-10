# ============================================
# Этап 1: Сборка приложения
# ============================================
FROM node:20-alpine AS builder

# Объявляем build arguments (передаются из Amvera)
ARG EXPO_PUBLIC_SUPABASE_URL
ARG EXPO_PUBLIC_SUPABASE_ANON_KEY

WORKDIR /app

# Копируем файлы зависимостей
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci

# Копируем весь код
COPY . .

# Создаём файл .env с переменными для Expo
RUN echo "EXPO_PUBLIC_SUPABASE_URL=${EXPO_PUBLIC_SUPABASE_URL}" > .env && \
    echo "EXPO_PUBLIC_SUPABASE_ANON_KEY=${EXPO_PUBLIC_SUPABASE_ANON_KEY}" >> .env && \
    echo "✅ Created .env file with:" && \
    cat .env

# Собираем веб-версию (Expo прочитает .env)
RUN npx expo export -p web

# ============================================
# Этап 2: Раздача статики через nginx
# ============================================
FROM nginx:alpine

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]