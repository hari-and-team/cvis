FROM gcc:13-bookworm

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates coreutils util-linux && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app/server

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/ ./

EXPOSE 3001

ENV DOCKER_ENV=true
ENV NODE_ENV=development

CMD ["npm", "start"]
