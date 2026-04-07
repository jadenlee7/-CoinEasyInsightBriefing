FROM node:20-slim

WORKDIR /app

# Install FFmpeg, Python3, pip for Edge TTS, and fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
        python3 \
            python3-pip \
                python3-venv \
                    fonts-noto-cjk \
                        fonts-dejavu-core \
                            && rm -rf /var/lib/apt/lists/*

                            # Install Edge TTS (Korean TTS engine)
                            RUN pip3 install --break-system-packages edge-tts

                            # Copy everything
                            COPY . /repo

                            # Find the coineasy-briefing-bot directory and copy its contents to /app
                            RUN DIR=$(find /repo -type d -name "coineasy-briefing-bot" | head -1) && \
                                cp -r "$DIR"/. /app/

                                # Install dependencies
                                RUN npm install --only=production

                                # Default command
                                CMD ["npm", "start"]
