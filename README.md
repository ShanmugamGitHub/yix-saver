# 🎬 YIX Saver

<p align="center">
  <strong>A premium, light-speed, and ad-free video downloader for YouTube, Instagram, and X (Twitter).</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/github/license/ShanmugamGitHub/yix-saver" alt="License">
  <img src="https://img.shields.io/github/stars/ShanmugamGitHub/yix-saver" alt="Stars">
  <img src="https://img.shields.io/github/forks/ShanmugamGitHub/yix-saver" alt="Forks">
</p>

---

## ✨ Features

- **Multi-Platform Support**: Seamless downloads from **YouTube**, **Instagram (Reels/IGTV)**, and **X (Twitter)**.
- **Premium Video + Audio Merging**: Resolves HLS streams on X/Instagram and merges them with high-definition audio tracks seamlessly using `ffmpeg` and `yt-dlp`. No silent videos!
- **Fast, Ad-Free Glassmorphism UI**: Beautiful, interactive interface with smooth CSS transitions, glowing cards, and zero annoying popups.
- **CORS-Safe Dynamic Thumbnails**: In-built backend proxy fetches Instagram/X CDN images directly, solving cross-origin blocking issues.
- **Production-Ready Docker Config**: Deploy to Railway, Render, or any cloud platform in minutes.

---

## 🛠️ Technology Stack

- **Frontend**: Vanilla HTML5, CSS3 (Modern custom design system, glassmorphism, responsive grid), Vanilla JavaScript ES6.
- **Backend**: Node.js, Express.js (RESTful API, Proxy handling, child processes spawning).
- **Core Engine**: `yt-dlp` (High-performance metadata extractor & downloader).
- **Remuxing Engine**: `ffmpeg` (Audio and video merging & MP4 `-faststart` optimization).

---

## 🚀 Getting Started (Local Setup)

### Prerequisites

1. **Node.js**: Ensure Node.js (v18+) is installed on your computer.
2. **Python**: Ensure Python (v3+) is installed (needed by `yt-dlp`).
3. **yt-dlp**: Install the Python module:
   ```bash
   pip install yt-dlp
   ```
4. **ffmpeg**:
   - **Windows**: Place `ffmpeg.exe` in the root folder of this project (already excluded in git).
   - **macOS/Linux**: Install via Homebrew/apt:
     ```bash
     brew install ffmpeg  # macOS
     sudo apt install ffmpeg  # Linux
     ```

### Installation & Run

1. Clone this repository:
   ```bash
   git clone https://github.com/ShanmugamGitHub/yix-saver.git
   cd yix-saver
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to:
   [http://localhost:4000/index.html](http://localhost:4000/index.html)

---

## ☁️ Cloud Deployment

Since this application requires system binaries (`yt-dlp` and `ffmpeg`), standard serverless platforms like Netlify or Vercel cannot run it. You can host it on dynamic cloud environments:

### Option A: Railway.app (Recommended)

Railway automatically detects the `Dockerfile` and builds the entire environment with Node, Python, yt-dlp, and ffmpeg:

1. Create a free account on [Railway.app](https://railway.app).
2. Click **New Project** → **Deploy from GitHub repo**.
3. Select your `yix-saver` repository.
4. Railway will build and launch your container. Once completed, go to **Settings** and generate a public Domain.
5. In your frontend `app.js`, update the backend API endpoint to point to your new Railway domain!

### Option B: Render.com

1. Create an account on [Render.com](https://render.com).
2. Click **New** → **Web Service**.
3. Connect your GitHub repository.
4. Select **Docker** as the Runtime (Render will automatically use the `Dockerfile` in the project root).
5. Deploy and get your live backend URL!

---

## 📝 License

This project is licensed under the ISC License.

Developed with ❤️ by **[Major_shammmu](https://github.com/ShanmugamGitHub)**.
