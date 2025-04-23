# Use Node.js base image
FROM node:18

# Set working directory
WORKDIR /app

# Copy dependencies
COPY package*.json ./
RUN npm install

# Copy rest of the app
COPY . .

# Expose the port your app uses
EXPOSE 3000

# Start your WebSocket server
CMD ["node", "server.js"]
