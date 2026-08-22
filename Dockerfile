FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm install --omit=dev

COPY . .
RUN chmod +x scripts/docker-entrypoint.sh

ENV NODE_ENV=development \
    PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=20s --timeout=5s --start-period=40s --retries=8 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then((res)=>process.exit(res.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
