# ============================================
# Этап 1: Сборка приложения
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем файлы зависимостей
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci

# Копируем весь код (включая .env.production)
COPY . .

# Собираем веб-версию (Expo автоматически прочитает .env.production)
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