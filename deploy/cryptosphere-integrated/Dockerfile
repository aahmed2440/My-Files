FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends unzip python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY cryptosphere-owner-runtime.zip /tmp/owner.zip
COPY cryptosphere-core-runtime.zip /tmp/core.zip
RUN mkdir -p /app/owner /app/core \
 && unzip /tmp/owner.zip -d /app/owner \
 && unzip /tmp/core.zip -d /app/core \
 && rm /tmp/owner.zip /tmp/core.zip \
 && python3 -m venv /venv \
 && /venv/bin/pip install --no-cache-dir -r /app/core/requirements.txt \
 && sed -i 's#fetch("/api/v1/#fetch("api/v1/#g' /app/core/app.js
COPY gateway.mjs /app/gateway.mjs
ENV NODE_ENV=production CORE_PYTHON=/venv/bin/python CRYPTOSPHERE_CORE_MODE=ADVISORY_ONLY
CMD ["node","/app/gateway.mjs"]
