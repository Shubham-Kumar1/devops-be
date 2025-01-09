FROM node:20-slim
WORKDIR /app

# Install necessary packages including openssl and netcat-openbsd
RUN apt-get update && apt-get install -y openssl netcat-openbsd && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY prisma ./prisma/
RUN npx prisma generate

COPY . .

EXPOSE 4400
CMD ["node", "server.js"]
