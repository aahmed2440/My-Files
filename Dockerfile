FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends unzip python3 python3-venv ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY deploy/cryptosphere-integrated/SHA256.txt /tmp/release/SHA256.txt
COPY deploy/cryptosphere-integrated/cryptosphere-owner-runtime.zip /tmp/release/cryptosphere-owner-runtime.zip
COPY deploy/cryptosphere-integrated/cryptosphere-core-runtime.zip /tmp/release/cryptosphere-core-runtime.zip
COPY deploy/cryptosphere-integrated/gateway.mjs /app/gateway.mjs

RUN cd /tmp/release \
 && sha256sum -c SHA256.txt \
 && unzip -t cryptosphere-owner-runtime.zip \
 && unzip -t cryptosphere-core-runtime.zip \
 && mkdir -p /app/owner /app/core \
 && unzip cryptosphere-owner-runtime.zip -d /app/owner \
 && unzip cryptosphere-core-runtime.zip -d /app/core \
 && rm -rf /tmp/release \
 && python3 -m venv /venv \
 && /venv/bin/pip install --disable-pip-version-check --no-cache-dir -r /app/core/requirements.txt \
 && node --check /app/gateway.mjs \
 && node --check /app/owner/server.mjs \
 && PYTHONPATH=/app/core /venv/bin/python -c "import server; assert server.APP_VERSION == '0.90.1'; print('CryptoSphere core import 0.90.1 PASS')"

ENV NODE_ENV=production \
    CORE_PYTHON=/venv/bin/python \
    CRYPTOSPHERE_OWNER_DIR=/app/owner \
    CRYPTOSPHERE_CORE_DIR=/app/core \
    CRYPTOSPHERE_CORE_MODE=ADVISORY_ONLY

EXPOSE 8080
CMD ["node","/app/gateway.mjs"]
