FROM node:20

WORKDIR /app

# 👇 go one level up (important)
COPY ../package*.json ./
RUN npm install

# 👇 copy full project (not just grpc)
COPY .. .

EXPOSE 50051

CMD ["node", "grpc/server.js"]