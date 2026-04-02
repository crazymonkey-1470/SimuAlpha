FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY server.js ./
COPY routes ./routes
COPY services ./services
COPY utils ./utils
EXPOSE 3001
CMD ["node", "server.js"]
