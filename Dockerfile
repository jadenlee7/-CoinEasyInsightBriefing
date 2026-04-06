FROM node:20-slim

WORKDIR /app

# Copy everything and find the project directory
COPY . /repo

# Find and copy the project files from the nested Korean folder
RUN find /repo -name "package.json" -path "*/coineasy-briefing-bot/*" -exec dirname {} \; | head -1 | xargs -I {} sh -c 'cp -r {}/* /app/'

# Install dependencies
RUN npm ci --only=production

# Default command (can be overridden by Railway)
CMD ["npm", "start"]
