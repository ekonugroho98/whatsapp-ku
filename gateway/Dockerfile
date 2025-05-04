FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

# install curl + compatibility layer (optional)
RUN apk add --no-cache curl libc6-compat

COPY . .

CMD ["node", "index.js"]
