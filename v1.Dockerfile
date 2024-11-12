FROM node:20-alpine
WORKDIR /app
COPY package.* .
COPY /prisma .
RUN npx prisma generate
RUN npm install
COPY . .
CMD [ "node","server.js" ]