# Stage 1: Build the React application
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy source code
COPY . .

# Build arguments for environment variables
ARG VITE_API_URL=/api
ARG VITE_TELEGRAM_BOT_USERNAME
ARG VITE_APP_NAME=Cabinet
ARG VITE_APP_LOGO=V
# BlackBird: адрес исходников этой сборки — ссылка «Исходный код» (AGPL-3.0, §13)
ARG VITE_SOURCE_URL=
# BlackBird: адрес лендинга — логотип на главной ведёт туда
ARG VITE_LANDING_URL=
# BlackBird: страница разового ключа — ссылка «Нет доступа к Telegram?» на экране входа
ARG VITE_GUEST_URL=
# BlackBird: страница приглашений для админов — пункт «Приглашения» в админке
ARG VITE_INVITE_URL=

# Set environment variables for build
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_TELEGRAM_BOT_USERNAME=$VITE_TELEGRAM_BOT_USERNAME
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_APP_LOGO=$VITE_APP_LOGO
ENV VITE_SOURCE_URL=$VITE_SOURCE_URL
ENV VITE_LANDING_URL=$VITE_LANDING_URL
ENV VITE_GUEST_URL=$VITE_GUEST_URL
ENV VITE_INVITE_URL=$VITE_INVITE_URL

# Build the application. Type-check намеренно пропущен: tsc --noEmit уже
# гоняется CI на каждый PR (lint.yml), образ собирается из проверенного
# коммита - повторная проверка стоила бы ~10s на каждую сборку.
RUN npm run build:docker

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

