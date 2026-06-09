FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV PORT=8787

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl python3 ffmpeg \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY public ./public
COPY downloads/.gitkeep ./downloads/.gitkeep

EXPOSE 8787
CMD ["node", "server.js"]
