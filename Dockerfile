# Use a lightweight official Node.js image
FROM node:18-bookworm-slim

# Install system dependencies: python3, python3-pip, ffmpeg, curl
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Ensure 'python' points to 'python3' so server.js can run `python -m yt_dlp`
RUN ln -sf /usr/bin/python3 /usr/bin/python

# Install yt-dlp as a python package so that `python -m yt_dlp` works
RUN pip3 install --no-cache-dir --break-system-packages yt-dlp || pip3 install --no-cache-dir yt-dlp

# Set the working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the application files
COPY . .

# Expose the port the server listens on
EXPOSE 4000

# Set environment variables
ENV PORT=4000
ENV NODE_ENV=production

# Start the application
CMD ["npm", "start"]
