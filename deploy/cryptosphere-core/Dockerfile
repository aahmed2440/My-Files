FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY cryptosphere-core-runtime.zip /tmp/cryptosphere.zip
RUN unzip /tmp/cryptosphere.zip -d /app && rm /tmp/cryptosphere.zip && pip install --no-cache-dir -r /app/requirements.txt
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 CRYPTOSPHERE_CORE_MODE=ADVISORY_ONLY
CMD ["sh","-c","uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]
