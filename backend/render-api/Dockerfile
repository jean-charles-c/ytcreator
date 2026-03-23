# ── Stage 1: Build ─────────────────────────────────────────────────
FROM node:20-bookworm AS builder

WORKDIR /app

# Install Chromium dependencies for Remotion
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --production

COPY src/ ./src/
COPY remotion-composition/ ./remotion-composition/
COPY tsconfig.json ./

RUN mkdir -p /app/data/jobs /app/data/renders

# ── Runtime ────────────────────────────────────────────────────────
ENV PORT=4000
ENV RENDER_JOBS_STORAGE_PATH=/app/data/jobs
ENV REMOTION_OUTPUT_DIR=/app/data/renders
ENV REMOTION_COMPOSITION_ID=video-prompt
ENV ENABLE_RENDERER=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 4000

CMD ["node", "src/index.js"]
