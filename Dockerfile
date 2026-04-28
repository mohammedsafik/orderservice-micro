# Use official Node image
FROM node:20

# Create app directory
WORKDIR /app

# Copy package files first (for caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy rest of the code
COPY . .

# Expose port
EXPOSE 4004

# Run the app
CMD ["node", "server.js"]