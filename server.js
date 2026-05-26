const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;


app.use(cors());
app.use(express.json());

// Serve the frontend static files
app.use(express.static(path.join(__dirname)));

// ─── Utility: spawn yt-dlp via Python module, with local ffmpeg ──────────────
const FFMPEG_PATH = path.join(__dirname, 'ffmpeg.exe');
const ffmpegExists = require('fs').existsSync(FFMPEG_PATH);

function spawnYtDlp(args, opts) {
  const extraArgs = ffmpegExists ? ['--ffmpeg-location', FFMPEG_PATH] : [];
  return spawn('python', ['-m', 'yt_dlp', ...extraArgs, ...args], opts);
}

// ─── POST /api/info ───────────────────────────────────────────────────────────
// Body: { url: string }
// Returns rich JSON metadata from yt-dlp --dump-json
app.post('/api/info', (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid URL' });
  }

  console.log(`[info] Fetching metadata for: ${url}`);

  const args = [
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    '--socket-timeout', '15',
    '--geo-bypass',
    '--extractor-args', 'youtube:player_client=android,web',
    url
  ];

  const proc = spawnYtDlp(args, { windowsHide: true });

  let stdout = '';
  let stderr = '';

  proc.stdout.on('data', chunk => { stdout += chunk.toString(); });
  proc.stderr.on('data', chunk => { stderr += chunk.toString(); });

  proc.on('close', code => {
    if (code !== 0) {
      console.error(`[info] yt-dlp exited ${code}: ${stderr}`);
      return res.status(500).json({
        error: 'Failed to fetch video info. Make sure the URL is valid and public.',
        detail: stderr.split('\n').find(l => l.includes('ERROR')) || stderr.slice(-200)
      });
    }

    // Ensure stdout is not empty
    if (!stdout || !stdout.trim()) {
      console.error('[info] yt-dlp returned empty output');
      return res.status(500).json({
        error: 'No video data returned from yt-dlp',
        detail: 'The server received no valid response. The URL might be invalid or the video might be unavailable.'
      });
    }

    try {
      const data = JSON.parse(stdout);

      // Filter formats to ones that are useful for the user.
      // Prefer formats that have both video+audio merged (no vcodec=none, no acodec=none).
      // Also include audio-only formats as a separate "Audio" option.
      const allFormats = (data.formats || []);

      // ── Find the best audio-only stream ──────────────────────────────────
      // Prefer m4a/mp4a (compatible with mp4 container without transcoding)
      const bestAudio = allFormats
        .filter(f => (!f.vcodec || f.vcodec === 'none') && f.acodec && f.acodec !== 'none')
        .sort((a, b) => {
          // Prefer m4a for mp4 compatibility
          const aIsM4a = (a.ext === 'm4a' || (a.acodec || '').includes('mp4a')) ? 1 : 0;
          const bIsM4a = (b.ext === 'm4a' || (b.acodec || '').includes('mp4a')) ? 1 : 0;
          if (bIsM4a !== aIsM4a) return bIsM4a - aIsM4a;
          return (b.abr || 0) - (a.abr || 0);
        })[0];

      // ── Get all unique video heights ──────────────────────────────────────
      const allVideoHeights = [
        ...new Set(
          allFormats
            .filter(f => f.vcodec && f.vcodec !== 'none' && f.height)
            .map(f => f.height)
        )
      ].sort((a, b) => b - a);

      // Standard resolution tiers
      const TIERS = [2160, 1440, 1080, 720, 480, 360, 240, 144];
      const availableTiers = TIERS.filter(tier =>
        allVideoHeights.some(h => h >= tier * 0.85 && h <= tier * 1.15)
      );
      const tiersToUse = availableTiers.length > 0 ? availableTiers : allVideoHeights.slice(0, 5);

      // ── Build formats using CONCRETE format IDs for each resolution ───────
      // Priority: prefer a COMBINED stream (already has video+audio merged)
      // so no ffmpeg merge is needed. Fall back to video-only+audio-only pair.
      //
      // IMPORTANT PLATFORM SPLIT:
      // • YouTube  → concrete format IDs (137+140). Accurate, correct.
      // • X / Instagram / others → selector-style strings with `+` so PATH B
      //   (temp-file + ffmpeg) is ALWAYS used. X/Instagram combined streams
      //   often have moov atom at the END — piping them (PATH A) makes browsers
      //   play video but silently drop audio. ffmpeg adds -faststart, fixing it.
      const extractor = (data.extractor || '').toLowerCase();
      const isYouTube = extractor.includes('youtube');
      const isXInstagram = extractor.includes('twitter') || extractor.includes('instagram');
      const audioSize = bestAudio ? (bestAudio.filesize || bestAudio.filesize_approx || 0) : 0;

      let videoFormats;

      if (isYouTube) {
        // ── YouTube: concrete format IDs ─────────────────────────────────────
        videoFormats = tiersToUse.slice(0, 5).map(height => {
          const inRange = f => f.height && f.height >= height * 0.85 && f.height <= height * 1.15;

          // Prefer combined stream first (e.g. format 18 at 360p)
          const combined = allFormats
            .filter(f =>
              f.vcodec && f.vcodec !== 'none' &&
              f.acodec && f.acodec !== 'none' &&
              inRange(f)
            )
            .sort((a, b) => (b.filesize || b.filesize_approx || 0) - (a.filesize || a.filesize_approx || 0))[0];

          // Fall back to video-only (DASH) + separate audio
          const videoOnly = allFormats
            .filter(f =>
              f.vcodec && f.vcodec !== 'none' &&
              (!f.acodec || f.acodec === 'none') &&
              inRange(f)
            )
            .sort((a, b) => (b.filesize || b.filesize_approx || 0) - (a.filesize || a.filesize_approx || 0))[0];

          const bestVideo = combined || videoOnly;
          if (!bestVideo) return null;

          const needs_merge = (!bestVideo.acodec || bestVideo.acodec === 'none') && !!bestAudio;
          const format_id = needs_merge
            ? `${bestVideo.format_id}+${bestAudio.format_id}`
            : bestVideo.format_id;

          const videoSize = bestVideo.filesize || bestVideo.filesize_approx || null;
          const totalBytes = videoSize ? videoSize + (needs_merge ? audioSize : 0) : null;

          return {
            format_id,
            quality: `${height}p`,
            label: `${height}p`,
            ext: 'mp4',
            filesize: totalBytes,
            needs_merge,
            type: 'video'
          };
        }).filter(Boolean);

      } else {
        // ── X / Instagram / other platforms ────────────────────────────────
        // These platforms serve HLS where the audio is in a separate HLS playlist
        // that yt-dlp can discover via the m3u8 manifest, but it does NOT appear
        // in format metadata with acodec != 'none'. So `bestAudio` is null.
        //
        // The fix: use CONCRETE_VIDEO_ID+bestaudio  — this lets yt-dlp resolve
        // the audio playlist internally (e.g. hls-audio-128000-Audio).
        // This is exactly how 'Best' works (bestvideo+bestaudio/best).
        videoFormats = tiersToUse.slice(0, 5).map(height => {
          const inRange = f => f.height && f.height >= height * 0.85 && f.height <= height * 1.15;

          const bestAtHeight = allFormats
            .filter(f => f.vcodec && f.vcodec !== 'none' && inRange(f))
            .sort((a, b) => (b.filesize || b.filesize_approx || 0) - (a.filesize || a.filesize_approx || 0))[0];

          if (!bestAtHeight) return null;

          // Use concrete video ID + bestaudio selector
          // yt-dlp will resolve 'bestaudio' from the HLS manifest
          const format_id = `${bestAtHeight.format_id}+bestaudio`;

          const videoSize = bestAtHeight.filesize || bestAtHeight.filesize_approx || null;

          console.log(`[info] ${height}p → format_id="${format_id}"  video="${bestAtHeight.format_id}"  vcodec="${bestAtHeight.vcodec}"`);

          return {
            format_id,
            quality: `${height}p`,
            label: `${height}p`,
            ext: 'mp4',
            filesize: videoSize,
            needs_merge: true,
            type: 'video'
          };
        }).filter(Boolean);
      }



      // ── "Best" option ─────────────────────────────────────────────────────
      const bestQualityFormat = {
        format_id: 'bestvideo+bestaudio/best',
        quality: 'Best',
        label: 'Best Quality',
        ext: 'mp4',
        filesize: null,
        needs_merge: true,
        type: 'video'
      };

      // ── Audio-only option ─────────────────────────────────────────────────
      const audioFormats = bestAudio ? [{
        format_id: bestAudio.format_id,
        quality: 'Audio',
        label: `${bestAudio.ext?.toUpperCase() || 'M4A'} Audio · ${bestAudio.abr ? Math.round(bestAudio.abr) + 'kbps' : 'Best'}`,
        ext: bestAudio.ext || 'm4a',
        filesize: bestAudio.filesize || bestAudio.filesize_approx || null,
        type: 'audio'
      }] : [];

      // Final list: Best first, then resolutions high→low, then audio
      const formats = [bestQualityFormat, ...videoFormats, ...audioFormats];


      const result = {
        title: data.title || 'Untitled',
        uploader: data.uploader || data.channel || data.creator || 'Unknown',
        uploader_id: data.uploader_id || data.channel_id || '',
        description: data.description || '',
        tags: (data.tags || []).slice(0, 12),
        thumbnail: data.thumbnail || (data.thumbnails && data.thumbnails[data.thumbnails.length - 1]?.url) || null,
        webpage_url: data.webpage_url || url,
        duration: data.duration,
        view_count: data.view_count,
        like_count: data.like_count,
        upload_date: data.upload_date,
        extractor: data.extractor || '',
        formats
      };

      res.json(result);
    } catch (e) {
      console.error('[info] JSON parse error:', e.message);
      console.error('[info] Raw stdout:', stdout.slice(0, 300));
      res.status(500).json({
        error: 'Could not parse video metadata.',
        detail: 'yt-dlp returned invalid data. The URL might be from a private account or an unsupported format.'
      });
    }
  });

  proc.on('error', err => {
    console.error('[info] spawn error:', err);
    res.status(500).json({
      error: 'yt-dlp not found. Please install it: pip install yt-dlp',
      detail: err.message
    });
  });
});

// ─── GET /api/thumbnail ───────────────────────────────────────────────────────
// Proxy for thumbnails that block cross-origin requests (Instagram CDN, etc.)
// Query: ?url=<encoded_image_url>
app.get('/api/thumbnail', (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).send('Missing url param');

  try {
    const https = require('https');
    const http = require('http');
    const mod = imageUrl.startsWith('https') ? https : http;

    mod.get(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, proxyRes => {
      const contentType = proxyRes.headers['content-type'] || 'image/jpeg';
      if (!contentType.startsWith('image/')) {
        return res.status(400).send('Not an image');
      }
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      proxyRes.pipe(res);
    }).on('error', () => {
      res.status(502).send('Failed to fetch thumbnail');
    });
  } catch {
    res.status(500).send('Proxy error');
  }
});

// ─── GET /api/download ────────────────────────────────────────────────────────

// Query: ?url=...&format_id=...&filename=...&ext=...
// ─── Concurrency Queue for Downloads ─────────────────────────────────────────
// Limits concurrent downloads to protect server memory (ideal for 512MB RAM)
let activeDownloadsCount = 0;
const MAX_CONCURRENT_DOWNLOADS = 2;
const downloadQueue = [];

function processDownloadQueue() {
  if (activeDownloadsCount >= MAX_CONCURRENT_DOWNLOADS) return;
  if (downloadQueue.length === 0) return;

  const { req, res, execute } = downloadQueue.shift();
  
  // If the client already disconnected while waiting in queue, skip it
  if (res.writableEnded || res.destroyed) {
    processDownloadQueue();
    return;
  }

  activeDownloadsCount++;
  console.log(`[queue] Starting download job. Active: ${activeDownloadsCount}/${MAX_CONCURRENT_DOWNLOADS}`);

  let finished = false;
  const finishJob = () => {
    if (!finished) {
      finished = true;
      activeDownloadsCount--;
      console.log(`[queue] Finished download job. Active: ${activeDownloadsCount}/${MAX_CONCURRENT_DOWNLOADS}`);
      processDownloadQueue();
    }
  };

  res.on('finish', finishJob);
  res.on('close', finishJob);

  execute();
}

// Streams the video file directly to the browser
app.get('/api/download', (req, res) => {
  const { url, format_id, filename, ext } = req.query;

  if (!url || !format_id) {
    return res.status(400).json({ error: 'Missing url or format_id' });
  }

  const safeFilename = (filename || 'video').replace(/[^a-zA-Z0-9_\- ]/g, '_');

  const executeDownload = () => {
    const needsMerge = format_id.includes('+') || req.query.needs_merge === '1';
    console.log(`[download] ▶ format_id="${format_id}"  needsMerge=${needsMerge}  url=${url}`);

    if (!needsMerge) {
      // ─── PATH A: Direct pipe ──────────────────────────────────────────────
      console.log('[download] PATH A — direct pipe (single stream)');
      const args = [
        '-f', format_id,
        '--no-playlist',
        '--no-warnings',
        '--geo-bypass',
        '--extractor-args', 'youtube:player_client=android,web',
        '-o', '-',
        url
      ];

      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.mp4"`);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Transfer-Encoding', 'chunked');

      const proc = spawnYtDlp(args, { windowsHide: true });
      proc.stdout.pipe(res);

      let stderrBuf = '';
      proc.stderr.on('data', chunk => {
        const line = chunk.toString();
        stderrBuf += line;
        process.stdout.write(`[yt-dlp] ${line}`);
      });
      proc.on('error', err => {
        console.error('[download] Spawn error:', err);
        if (!res.headersSent) res.status(500).json({ error: err.message });
      });
      proc.on('close', code => {
        console.log(`[download] yt-dlp exited ${code}`);
        if (!res.writableEnded) res.end();
      });
      req.on('close', () => { if (!proc.killed) proc.kill('SIGTERM'); });

    } else {
      // ─── PATH B: Temp file merge ──────────────────────────────────────────
      console.log('[download] PATH B — temp file merge (video+audio DASH)');
      const os = require('os');
      const fs = require('fs');
      const tempBase = path.join(os.tmpdir(), `yix_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      const tempPattern = tempBase + '.%(ext)s';

      const args = [
        '-f', format_id,
        '--no-playlist',
        '--no-warnings',
        '--geo-bypass',
        '--extractor-args', 'youtube:player_client=android,web',
        '--remux-video', 'mp4',          // Force ffmpeg remux TS→MP4 (extracts audio from HLS TS)
        '--merge-output-format', 'mp4',  // If merging two formats, output as MP4
        // Move moov atom to start of file → browser can play immediately, audio works
        '--postprocessor-args', 'Merger:-movflags +faststart',
        '-o', tempPattern,
        url
      ];

      const proc = spawnYtDlp(args, { windowsHide: true });

      let stderrBuf = '';
      proc.stderr.on('data', chunk => {
        const line = chunk.toString();
        stderrBuf += line;
        process.stdout.write(`[yt-dlp] ${line}`);
      });
      proc.stdout.on('data', d => process.stdout.write(d.toString()));

      proc.on('error', err => {
        console.error('[download] Spawn error:', err);
        if (!res.headersSent) res.status(500).json({ error: err.message });
      });

      proc.on('close', code => {
        console.log(`[download] yt-dlp merge exited ${code}`);

        if (code !== 0) {
          if (!res.headersSent) res.status(500).json({
            error: 'Merge failed',
            detail: stderrBuf.split('\n').find(l => l.includes('ERROR')) || stderrBuf.slice(-200)
          });
          return;
        }

        // Find the actual output file (yt-dlp fills in %(ext)s)
        let actualFile = null;
        try {
          const dir = path.dirname(tempBase);
          const base = path.basename(tempBase);
          actualFile = fs.readdirSync(dir)
            .map(f => path.join(dir, f))
            .find(f => path.basename(f).startsWith(base));
        } catch(e) { console.error('[download] Could not list temp dir:', e.message); }

        if (!actualFile || !fs.existsSync(actualFile)) {
          if (!res.headersSent) res.status(500).json({ error: 'Merged file not found.' });
          return;
        }

        // ── For single-format downloads (no '+' in format_id), yt-dlp gives us
        //    TS-in-MP4 via FixupM3u8 which may lose audio. Explicitly remux
        //    with ffmpeg to extract both audio+video tracks properly. ────────
        const needsFFmpegRemux = !format_id.includes('+');

        if (needsFFmpegRemux) {
          const remuxedFile = actualFile.replace(/\.mp4$/i, '_remuxed.mp4');
          console.log(`[download] Running ffmpeg remux: ${actualFile} → ${remuxedFile}`);

          const { execFileSync } = require('child_process');
          try {
            execFileSync('ffmpeg', [
              '-y',
              '-i', actualFile,
              '-c', 'copy',
              '-movflags', '+faststart',
              remuxedFile
            ], { windowsHide: true, timeout: 60000 });

            // Replace the original file with the remuxed one
            fs.unlinkSync(actualFile);
            actualFile = remuxedFile;
            console.log('[download] ffmpeg remux complete ✓');
          } catch (ffErr) {
            console.error('[download] ffmpeg remux failed:', ffErr.message);
            // Fall back to the original file if ffmpeg fails
          }
        }

        const stat = fs.statSync(actualFile);
        console.log(`[download] Streaming merged file: ${actualFile} (${(stat.size/1024/1024).toFixed(1)} MB)`);

        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.mp4"`);
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Length', stat.size);

        const stream = fs.createReadStream(actualFile);
        stream.pipe(res);
        stream.on('end', () => {
          fs.unlink(actualFile, e => e && console.warn('[download] Cleanup error:', e.message));
        });
        stream.on('error', e => { console.error('[download] Read error:', e); res.end(); });

      });

      req.on('close', () => { if (!proc.killed) proc.kill('SIGTERM'); });
    }
  };

  // Add the request to the concurrency queue
  console.log(`[queue] Adding download to queue. Queue length: ${downloadQueue.length + 1}`);
  downloadQueue.push({ req, res, execute: executeDownload });

  // If the user aborts while still in the queue, remove them from the queue
  req.on('close', () => {
    const idx = downloadQueue.findIndex(item => item.req === req);
    if (idx !== -1) {
      console.log('[queue] Client disconnected while in queue. Removing.');
      downloadQueue.splice(idx, 1);
    }
  });

  processDownloadQueue();
});


// ─── GET /api/health ─────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const proc = spawnYtDlp(['--version'], { windowsHide: true });
  let version = '';
  proc.stdout.on('data', d => { version += d.toString().trim(); });
  proc.on('close', code => {
    res.json({ ok: code === 0, yt_dlp_version: version || 'not found' });
  });
  proc.on('error', () => {
    res.json({ ok: false, yt_dlp_version: 'not installed' });
  });
});

// ─── Keep-alive & error safety ───────────────────────────────────────────────
// Prevents Node from exiting if the event loop empties unexpectedly
process.stdin.resume();

process.on('uncaughtException', err => {
  console.error('\n❌ Uncaught Exception:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error(`   Port ${PORT} is already in use. Stop the other process first.`);
  }
  // Don't exit — keep running unless it's fatal
});

process.on('unhandledRejection', (reason) => {
  console.error('\n⚠️  Unhandled Promise Rejection:', reason);
});

// ─── Start ───────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`\n🎬 VideoGrabber server running at http://localhost:${PORT}`);
  console.log(`   Frontend: http://localhost:${PORT}/index.html`);
  console.log(`   Health:   http://localhost:${PORT}/api/health`);
  console.log(`\n   Press Ctrl+C to stop.\n`);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use!`);
    console.error(`   Run this to free it:  npx kill-port ${PORT}`);
    console.error(`   Or use a different port:  PORT=5000 node server.js\n`);
  } else {
    console.error('\n❌ Server error:', err.message);
  }
  process.exit(1);
});

