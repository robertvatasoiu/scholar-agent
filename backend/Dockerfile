FROM python:3.11-slim

WORKDIR /app

# Dependențe sistem pentru compilare pachete științifice și curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copiere și instalare dependențe Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiere cod backend
COPY app ./app

# Expunere port FastAPI
EXPOSE 8000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
