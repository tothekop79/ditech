FROM node:20-slim

# Install: openssl (Prisma needs it), chromium (Puppeteer for PDF export),
# fonts (Thai support for PDF reports), and CA certs
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    chromium \
    fonts-liberation \
    fonts-noto \
    fonts-noto-cjk \
    fonts-thai-tlwg \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium


# ── M1: Python engine support ──
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-numpy \
    python3-pandas \
    python3-openpyxl \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /app/python-engine /app/uploads/events

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npx prisma generate

EXPOSE 5000

CMD ["npm", "run", "dev"]
