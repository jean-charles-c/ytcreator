FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY src/ ./src/

RUN mkdir -p /app/data/jobs

ENV PORT=4000
ENV RENDER_JOBS_STORAGE_PATH=/app/data/jobs

EXPOSE 4000

CMD ["node", "src/index.js"]
