FROM node:20-alpine

WORKDIR /app

# Install runtime deps
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

ENV NODE_ENV=production
EXPOSE 4000

# Default command runs the web server. Override to run worker: `docker run ... node worker.js`
CMD ["node", "index.js"]
