FROM node:20-slim

WORKDIR /app

# Copy everything
COPY . /repo

# Find the coineasy-briefing-bot directory and copy its contents to /app
RUN DIR=$(find /repo -type d -name "coineasy-briefing-bot" | head -1) && \
    cp -r "$DIR"/. /app/

    # Install dependencies
    RUN npm ci --only=production

    # Default command
    CMD ["npm", "start"]
