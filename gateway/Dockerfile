FROM node:18

   WORKDIR /app

   COPY package.json .

   # Set NPM registry and debug installation
   RUN npm config set registry https://registry.npmjs.org \
       && npm cache clean --force \
       && npm install --verbose || npm install --verbose || npm install --verbose

   # List installed dependencies for debugging
   RUN ls /app/node_modules > /app/installed_modules.txt

   # Verify that @whiskeysockets/baileys is installed
   RUN ls /app/node_modules/@whiskeysockets/baileys || { echo "@whiskeysockets/baileys not found after npm install"; cat /app/installed_modules.txt; exit 1; }

   COPY . .

   CMD ["node", "index.js"]