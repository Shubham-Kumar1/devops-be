FROM node:20-slim
WORKDIR /app

RUN apt-get update && apt-get install -y openssl && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY prisma ./prisma/
RUN npx prisma generate

COPY . .

EXPOSE 4400
CMD ["node", "server.js"]