# Für Hoster, die Docker wollen (Fly.io, Railway, eigener Server).
#   docker build -t riftrush-signaling server
#   docker run -p 8080:8080 riftrush-signaling
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY signaling-server.js ./
ENV PORT=8080
EXPOSE 8080
CMD ["node", "signaling-server.js"]
