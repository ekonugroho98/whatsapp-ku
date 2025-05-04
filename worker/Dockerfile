FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

# ⬇️ Tambahkan ini
RUN apk add --no-cache curl

COPY . .

CMD ["node", "index.js"]
