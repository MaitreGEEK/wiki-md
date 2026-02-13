FROM oven/bun:alpine
WORKDIR /app
COPY . .
RUN bun install --production
RUN mkdir -p data public views
ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "start"]