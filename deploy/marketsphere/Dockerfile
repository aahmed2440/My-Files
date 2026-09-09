FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY public ./public
EXPOSE 3000
ENV NODE_ENV=production PORT=3000
CMD ["node","server.js"]
