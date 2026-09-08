FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
COPY --chown=node:node server.js ./
USER node
EXPOSE 8787
CMD ["node","server.js"]
