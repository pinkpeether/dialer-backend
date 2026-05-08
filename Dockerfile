FROM node:20-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
ARG CACHE_BUST=3
RUN echo "Cache bust: $CACHE_BUST"
COPY src ./src
RUN npx tsc --noEmitOnError false
RUN ls -la dist/
RUN mkdir -p logs
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
