FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends unzip python3 python3-venv ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY cryptosphere-owner-runtime.zip /tmp/cryptosphere-owner-runtime.zip
COPY cryptosphere-core-runtime.zip /tmp/cryptosphere-core-runtime.zip
COPY SHA256.txt /tmp/SHA256.txt

RUN cd /tmp \
 && sha256sum -c SHA256.txt \
 && mkdir -p /app/owner /app/core \
 && unzip cryptosphere-owner-runtime.zip -d /app/owner \
 && unzip cryptosphere-core-runtime.zip -d /app/core \
 && rm cryptosphere-owner-runtime.zip cryptosphere-core-runtime.zip SHA256.txt \
 && python3 -m venv /venv \
 && /venv/bin/pip install --no-cache-dir -r /app/core/requirements.txt \
 && sed -i 's#fetch("/api/v1/#fetch("api/v1/#g' /app/core/app.js \
 && chown -R node:node /app /venv

COPY --chown=node:node gateway.mjs /app/gateway.mjs

ENV NODE_ENV=production \
    CORE_PYTHON=/venv/bin/python \
    CRYPTOSPHERE_CORE_MODE=ADVISORY_ONLY

USER node

CMD ["node","/app/gateway.mjs"]
