#!/bin/bash
set -e

echo "==> Starting NATS Server..."
# Start NATS server in the background with JetStream enabled
# Note: Suppressing debug logs to reduce noise from health check HTTP requests
nats-server --jetstream --store_dir=/data --port=4222 --http_port=8222 -l /dev/null &
NATS_PID=$!

# Wait for NATS to be ready
echo "==> Waiting for NATS to be ready..."
for i in {1..30}; do
    if nc -z localhost 4222 2>/dev/null; then
        echo "==> NATS is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "==> ERROR: NATS failed to start within 30 seconds"
        exit 1
    fi
    echo "==> Waiting for NATS... ($i/30)"
    sleep 1
done

# Start the FastAPI application
echo "==> Starting FastAPI application..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
