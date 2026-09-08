FROM node:22-alpine
RUN apk add --no-cache unzip
WORKDIR /app
COPY cryptosphere-owner-runtime.zip /tmp/cryptosphere.zip
RUN unzip /tmp/cryptosphere.zip -d /app && rm /tmp/cryptosphere.zip
ENV NODE_ENV=production
CMD ["npm","start"]
