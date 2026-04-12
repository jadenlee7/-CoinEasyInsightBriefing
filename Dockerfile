FROM node:20-slim

WORKDIR /app

# Install FFmpeg, Python3, pip for Edge TTS, fonts, and node-canvas dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
        python3 \
            python3-pip \
                python3-venv \
                    fonts-noto-cjk \
                        fonts-dejavu-core \
                            libcairo2-dev \
                                libpango1.0-dev \
                                    libjpeg-dev \
                                        libgif-dev \
                                            librsvg2-dev \
                                                pkg-config \
                                                    build-essential \
                                                        && rm -rf /var/lib/apt/lists/*

                                                        # Install Edge TTS (Korean TTS engine)
                                                        RUN pip3 install --break-system-packages edge-tts

                                                        # Copy everything
                                                        COPY . /repo

                                                        # Find the CORRECT coineasy-briefing-bot directory (the one with generator.js)
                                                        RUN DIR=$(find /repo -type f -name "generator.js" -path "*/coineasy-briefing-bot/src/*" -exec dirname {} \; | head -1 | xargs dirname) && \
                                                            echo "Using bot directory: $DIR" && \
                                                            cp -r "$DIR"/. /app/

                                                            # Install dependencies
                                                            RUN npm install --only=production

                                                            # Default command
                                                            CMD ["npm", "start"]
