FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production || npm install --production

COPY . .

ENV NODE_ENV=production

CMD ["node", "metric-sender-http.js"]

