FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Tạo thư mục logs cho promtail/loki nếu cần
RUN mkdir -p /var/log/app && \
    addgroup -S appgroup && adduser -S appuser -G appgroup && \
    chown -R appuser:appgroup /app /var/log/app

USER appuser

EXPOSE 3000

CMD ["node", "server.js"]
