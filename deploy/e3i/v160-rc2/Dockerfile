FROM dhi.io/node:22.23.2-alpine3.24@sha256:c06ba634c5a7105d65a6be7cf533cc0c1f0c8f0c7eee10b9d8083e4448876163

WORKDIR /app

COPY --chown=1000:1000 app ./app
COPY --chown=1000:1000 public ./public
COPY --chown=1000:1000 package.json ./package.json

USER 1000
EXPOSE 8080

CMD ["node","app/server.js"]
