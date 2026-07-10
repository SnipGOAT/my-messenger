# ============================================
# Этап 1: Сборка приложения
# ============================================
FROM node:18-alpine AS builder

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем файлы зависимостей
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci

# Копируем весь код
COPY . .

# Собираем веб-версию
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