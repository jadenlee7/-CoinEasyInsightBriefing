FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg python3 python3-pip python3-venv \
    fonts-noto-cjk fonts-dejavu-core \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev \
    librsvg2-dev pkg-config build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages edge-tts

COPY ./coineasy-briefing-bot /app

RUN npm install --only=production

CMD ["npm", "start"]
