# Use official GCC image as base
FROM gcc:13

# Install Node.js (LTS version)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy server code
COPY server/ ./server/

# Expose backend port
EXPOSE 3001

# Set environment variable to indicate we're in Docker
ENV DOCKER_ENV=true

# Start Express server
CMD ["node", "server/index.js"]
