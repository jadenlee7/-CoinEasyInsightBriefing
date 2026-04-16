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

                                                        # Cache bust: change this value to force a fresh build
                                                        ARG CACHE_BUST=20260416v5-hyperlinks

                                                        # Copy everything
                                                        COPY . /repo

                                                        # Use bash for proper Unicode path handling (Korean NFD/NFC folder names)
                                                        SHELL ["/bin/bash", "-c"]

                                                        # Find coineasy-briefing-bot directory safely
                                                        # Uses typefully-poster.js as anchor (only exists in the correct folder)
                                                        # Falls back to generator.js if not found
                                                        RUN BOT_DIR="" && \
                                                            while IFS= read -r -d '' file; do \
                                                                    BOT_DIR="$(dirname "$(dirname "$file")")"; \
                                                                            break; \
                                                                                done < <(find /repo -type f -name "typefully-poster.js" -path "*/coineasy-briefing-bot/src/*" -print0) && \
                                                                                    if [ -z "$BOT_DIR" ]; then \
                                                                                            while IFS= read -r -d '' file; do \
                                                                                                        BOT_DIR="$(dirname "$(dirname "$file")")"; \
                                                                                                                    break; \
                                                                                                                            done < <(find /repo -type f -name "generator.js" -path "*/coineasy-briefing-bot/src/*" -print0); \
                                                                                                                                fi && \
                                                                                                                                    if [ -z "$BOT_DIR" ]; then \
                                                                                                                                            echo "ERROR: coineasy-briefing-bot directory not found!" && exit 1; \
                                                                                                                                                fi && \
                                                                                                                                                    echo "Using bot directory: $BOT_DIR" && \
                                                                                                                                                        ls -la "$BOT_DIR/src/" && \
                                                                                                                                                            cp -r "$BOT_DIR"/. /app/
                                                                                                                                                            
                                                                                                                                                            # Install dependencies
                                                                                                                                                            RUN npm install --only=production
                                                                                                                                                            
                                                                                                                                                            # Default command
                                                                                                                                                            CMD ["npm", "start"]
