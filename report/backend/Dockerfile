FROM python:3.12-slim-bookworm

WORKDIR /app

# Install system dependencies for WeasyPrint and NATS
RUN apt-get update && apt-get install -y \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    gir1.2-pango-1.0 \
    shared-mime-info \
    wget \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# Install NATS Server
RUN wget https://github.com/nats-io/nats-server/releases/download/v2.10.7/nats-server-v2.10.7-linux-amd64.tar.gz \
    && tar -xzf nats-server-v2.10.7-linux-amd64.tar.gz \
    && mv nats-server-v2.10.7-linux-amd64/nats-server /usr/local/bin/ \
    && rm -rf nats-server-v2.10.7-linux-amd64* \
    && mkdir -p /data

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code
COPY . .

# Make start script executable
RUN chmod +x scripts/start_prod.sh

# Expose the port
EXPOSE 8000

# Command to run the application
CMD ["./scripts/start_prod.sh"]
