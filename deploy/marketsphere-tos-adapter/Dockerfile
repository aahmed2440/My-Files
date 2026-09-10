FROM node:24.18.0-alpine

WORKDIR /app

COPY package.json ./package.json
COPY SOURCE_SHA256SUMS ./SOURCE_SHA256SUMS
COPY qtrust_bridge.mjs ./qtrust_bridge.mjs
COPY src ./src

# Fail the image build if certified source bytes drift or JavaScript syntax breaks.
RUN sha256sum -c SOURCE_SHA256SUMS \
 && node --check src/server.mjs \
 && node --check src/adapter.mjs \
 && node --check src/state.mjs \
 && node --check qtrust_bridge.mjs

ENV NODE_ENV=production
EXPOSE 3000

USER node
CMD ["node", "src/server.mjs"]
