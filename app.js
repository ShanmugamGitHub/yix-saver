// ═══════════════════════════════════════════════════════════════
//  VideoGrabber — Frontend Logic (Real Backend Edition)
// ═══════════════════════════════════════════════════════════════

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:4000'
  : 'https://YOUR-RENDER-BACKEND-URL.onrender.com'; // <-- REPLACE THIS with your actual Render URL after you deploy to Render!

// ─── App State ────────────────────────────────────────────────
const state = {
  currentPlatform: null,
  activeView: 'home',
  currentMeta: null
};

// ─── URL Detection ────────────────────────────────────────────
const urlPatterns = {
  instagram: /(instagram\.com)\/(p|reel|tv|stories)\/([A-Za-z0-9_-]+)/i,
  youtube:   /(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i,
  x:         /(twitter\.com|x\.com)\/([A-Za-z0-9_]+)\/status\/([0-9]+)/i
};

function detectPlatform(url) {
  if (!url) return null;
  if (urlPatterns.instagram.test(url)) return 'instagram';
  if (urlPatterns.youtube.test(url))   return 'youtube';
  if (urlPatterns.x.test(url))         return 'x';
  return null;
}

// ─── DOM Cache ────────────────────────────────────────────────
let appWrapper, views, urlInput, errorMsg, btnDownload, pasteBtn;
let inputViewTitle, inputTitleIcon, terminalPanel;
let resultMediaFrame, resultMetaCard, variantGrid;
let recentHistoryList, sidebarDrawer, sidebarOverlay, historyCounter;

document.addEventListener('DOMContentLoaded', () => {
  appWrapper    = document.getElementById('app-wrapper');
  views = {
    home:    document.getElementById('view-home'),
    input:   document.getElementById('view-input'),
    loading: document.getElementById('view-loading'),
    result:  document.getElementById('view-result')
  };
  urlInput        = document.getElementById('url-input');
  errorMsg        = document.getElementById('error-msg');
  btnDownload     = document.getElementById('btn-download');
  pasteBtn        = document.getElementById('btn-paste');
  inputViewTitle  = document.getElementById('input-view-title');
  inputTitleIcon  = document.getElementById('input-title-icon');
  terminalPanel   = document.getElementById('terminal-panel');
  resultMediaFrame = document.getElementById('result-media-frame');
  resultMetaCard  = document.getElementById('result-meta-card');
  variantGrid     = document.getElementById('variant-grid');
  recentHistoryList = document.getElementById('recent-history-list');
  sidebarDrawer   = document.getElementById('history-drawer');
  sidebarOverlay  = document.getElementById('drawer-overlay');
  historyCounter  = document.getElementById('history-counter');

  urlInput.addEventListener('input', () => {
    errorMsg.style.display = 'none';
    const detected = detectPlatform(urlInput.value.trim());
    if (detected && detected !== state.currentPlatform) applyPlatformTheme(detected);
  });

  btnDownload.addEventListener('click', handleSubmit);
  urlInput.addEventListener('keypress', e => { if (e.key === 'Enter') handleSubmit(); });
  pasteBtn.addEventListener('click', handlePaste);

  loadHistory();
  showView('home');
});

// ─── Navigation ───────────────────────────────────────────────
function showView(viewName) {
  state.activeView = viewName;
  Object.keys(views).forEach(key => {
    if (key === viewName) {
      views[key].style.display = 'block';
      setTimeout(() => views[key].classList.add('active'), 50);
    } else {
      views[key].classList.remove('active');
      views[key].style.display = 'none';
    }
  });
  if (viewName === 'home') {
    state.currentPlatform = null;
    appWrapper.className = 'app-wrapper';
    urlInput.value = '';
    errorMsg.style.display = 'none';
  }
}

function navigateBack() { showView('input'); }

// ─── Platform Theme ───────────────────────────────────────────
function selectPlatform(platform) {
  applyPlatformTheme(platform);
  showView('input');
  urlInput.focus();
}

function applyPlatformTheme(platform) {
  state.currentPlatform = platform;
  appWrapper.className = `app-wrapper theme-${platform}`;

  const configs = {
    instagram: {
      title: 'Instagram Video Downloader',
      icon: 'fab fa-instagram input-title-icon',
      placeholder: 'Paste Instagram Reel or Video URL (e.g. instagram.com/reel/...)'
    },
    youtube: {
      title: 'YouTube Video Downloader',
      icon: 'fab fa-youtube input-title-icon',
      placeholder: 'Paste YouTube Video or Shorts URL (e.g. youtube.com/watch?v=...)'
    },
    x: {
      title: 'X / Twitter Video Downloader',
      icon: 'fab fa-x-twitter input-title-icon',
      placeholder: 'Paste X/Twitter Tweet URL (e.g. x.com/user/status/...)'
    }
  };

  const cfg = configs[platform];
  inputViewTitle.textContent = cfg.title;
  inputTitleIcon.className   = cfg.icon;
  urlInput.placeholder       = cfg.placeholder;
}

// ─── Paste ────────────────────────────────────────────────────
async function handlePaste() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      urlInput.value = text;
      errorMsg.style.display = 'none';
      const detected = detectPlatform(text);
      if (detected) {
        applyPlatformTheme(detected);
        showToast('Platform detected!', 'success');
      } else {
        showToast('URL pasted. Ensure it\'s from Instagram, YouTube, or X.', 'info');
      }
    }
  } catch {
    showToast('Clipboard blocked — press Ctrl+V to paste.', 'warning');
    urlInput.focus();
  }
}

// ─── Submit / Fetch Info ──────────────────────────────────────
async function handleSubmit() {
  const url = urlInput.value.trim();
  if (!url) return displayError('Please enter a video URL.');

  const detected = detectPlatform(url);
  if (!detected) return displayError('Invalid URL. Paste a valid YouTube, Instagram, or X link.');

  if (detected !== state.currentPlatform) applyPlatformTheme(detected);

  // Show loading screen with terminal log simulation
  showView('loading');
  startLoadingTerminal(detected);

  try {
    const resp = await fetch(`${API_BASE}/api/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const data = await resp.json();

    if (!resp.ok || data.error) {
      logTerminal(`ERROR: ${data.error || 'Unknown server error'}`, 'error');
      setTimeout(() => {
        showView('input');
        displayError(data.error || 'Failed to fetch video info.');
      }, 1200);
      return;
    }

    logTerminal('Metadata extracted successfully!', 'success');
    logTerminal(`Title: ${data.title}`, 'success');
    logTerminal(`Formats found: ${data.formats.length}`, 'success');

    state.currentMeta = { ...data, url, platform: detected };
    saveToHistory(state.currentMeta);

    setTimeout(() => renderResult(state.currentMeta), 700);

  } catch (err) {
    logTerminal(`Network error: ${err.message}`, 'error');
    setTimeout(() => {
      showView('input');
      displayError('Could not reach the server. Is it running on port 4000?');
    }, 1200);
  }
}

// ─── Terminal Simulation ──────────────────────────────────────
const terminalMessages = {
  instagram: [
    { text: 'Connecting to Instagram API endpoint...', cls: 'cyan' },
    { text: 'Requesting media metadata via yt-dlp...', cls: '' },
    { text: 'Bypassing rate-limit headers...', cls: 'info' },
    { text: 'Extracting GraphQL media object...', cls: '' },
    { text: 'Resolving CDN stream URLs...', cls: 'cyan' }
  ],
  youtube: [
    { text: 'Initialising yt-dlp YouTube handler...', cls: 'cyan' },
    { text: 'Resolving video ID from URL...', cls: '' },
    { text: 'Fetching player response JSON...', cls: '' },
    { text: 'De-obfuscating signature cipher...', cls: 'info' },
    { text: 'Enumerating available formats...', cls: 'cyan' }
  ],
  x: [
    { text: 'Initialising Twitter/X GraphQL client...', cls: 'cyan' },
    { text: 'Authenticating guest token...', cls: '' },
    { text: 'Querying TweetDetail endpoint...', cls: 'info' },
    { text: 'Parsing media variant array...', cls: '' },
    { text: 'Selecting best bitrate stream...', cls: 'cyan' }
  ]
};

let terminalInterval = null;

function startLoadingTerminal(platform) {
  terminalPanel.innerHTML = '';
  const lines = terminalMessages[platform] || terminalMessages.youtube;
  let i = 0;
  if (terminalInterval) clearInterval(terminalInterval);

  terminalInterval = setInterval(() => {
    if (i < lines.length) {
      logTerminal(lines[i].text, lines[i].cls);
      i++;
    }
  }, 400);
}

function logTerminal(text, cls = '') {
  const div = document.createElement('div');
  div.className = `terminal-line ${cls}`;
  const ts = new Date().toLocaleTimeString('en-GB');
  div.innerHTML = `<span style="color:#64748b;font-size:.75rem;margin-right:6px;">[${ts}]</span>${text}`;
  terminalPanel.appendChild(div);
  terminalPanel.scrollTop = terminalPanel.scrollHeight;
}

// ─── Render Result ────────────────────────────────────────────
function renderResult(meta) {
  if (terminalInterval) { clearInterval(terminalInterval); terminalInterval = null; }

  const platform = meta.platform;

  // ── Media frame ──────────────────────────────────────────────
  const platformLabel = { instagram: 'Instagram', youtube: 'YouTube', x: 'X (Twitter)' }[platform];
  const platformIconClass = { instagram: 'fab fa-instagram', youtube: 'fab fa-youtube', x: 'fab fa-x-twitter' }[platform];

  if (meta.thumbnail) {
    // Instagram & X CDNs block cross-origin image loading — proxy through our server
    const thumbUrl = (platform === 'instagram' || platform === 'x')
      ? `${API_BASE}/api/thumbnail?url=${encodeURIComponent(meta.thumbnail)}`
      : meta.thumbnail;

    resultMediaFrame.innerHTML = `
      <img class="media-thumbnail" src="${thumbUrl}" alt="Thumbnail" onerror="this.style.display='none'">
      <div class="media-badge"><i class="${platformIconClass}"></i> ${platformLabel}</div>
    `;

  } else {
    resultMediaFrame.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#64748b;">
        <i class="${platformIconClass}" style="font-size:3rem;"></i>
      </div>
      <div class="media-badge"><i class="${platformIconClass}"></i> ${platformLabel}</div>
    `;
  }

  // ── Meta card ─────────────────────────────────────────────────
  const tagsHtml = (meta.tags || [])
    .slice(0, 10)
    .map(t => `<span class="meta-tag">${t.startsWith('#') ? t : '#' + t}</span>`)
    .join('');

  const descHtml = (meta.description || '')
    .slice(0, 400)
    .replace(/</g, '&lt;')
    .replace(/\n/g, '<br>');

  // Extra stats
  let statsHtml = '';
  if (meta.view_count)  statsHtml += `<span style="margin-right:1rem;"><i class="fas fa-eye" style="margin-right:.3rem;opacity:.6;"></i>${fmtNum(meta.view_count)}</span>`;
  if (meta.like_count)  statsHtml += `<span style="margin-right:1rem;"><i class="fas fa-heart" style="margin-right:.3rem;opacity:.6;"></i>${fmtNum(meta.like_count)}</span>`;
  if (meta.duration)    statsHtml += `<span><i class="fas fa-clock" style="margin-right:.3rem;opacity:.6;"></i>${fmtDuration(meta.duration)}</span>`;

  resultMetaCard.innerHTML = `
    <div class="meta-info-card">
      <div class="meta-channel">
        <i class="${platformIconClass}" style="font-size:1.1rem;opacity:.8;"></i>
        <span>@${meta.uploader || meta.uploader_id || 'Unknown'}</span>
      </div>
      <div class="meta-title">${escHtml(meta.title)}</div>
      ${statsHtml ? `<div style="font-size:.82rem;color:var(--text-muted);margin-bottom:.75rem;">${statsHtml}</div>` : ''}
      ${descHtml ? `<div class="meta-text-content">${descHtml}</div>` : ''}
      ${tagsHtml ? `<div class="meta-tags-container">${tagsHtml}</div>` : ''}
    </div>
    <a href="${escHtml(meta.webpage_url || meta.url)}" target="_blank" rel="noopener" class="source-link">
      <i class="fas fa-external-link-alt"></i> View Original on ${platformLabel}
    </a>
  `;

  // ── Download format pills ─────────────────────────────────────
  variantGrid.innerHTML = '';

  if (!meta.formats || meta.formats.length === 0) {
    variantGrid.innerHTML = `<p style="color:var(--text-muted);font-size:.9rem;">No downloadable formats found.</p>`;
  } else {
  meta.formats.forEach(fmt => {
      const sizeText = fmt.filesize ? fmtBytes(fmt.filesize) : '';
      const containerLabel = fmt.type === 'audio' ? (fmt.ext || 'M4A').toUpperCase() : 'MP4';
      const typeIcon = fmt.type === 'audio' ? 'fa-music' : 'fa-film';
      const btn = document.createElement('button');
      btn.className = 'btn-variant';
      btn.id = `variant-${CSS.escape(fmt.format_id)}`;
      btn.innerHTML = `
        <div class="variant-progress" id="progress-${CSS.escape(fmt.format_id)}"></div>
        <div class="variant-info">
          <span class="variant-res">${fmt.quality}</span>
          <span class="variant-label">
            <i class="fas ${typeIcon}" style="opacity:.5;font-size:.75rem;margin-right:.3rem;"></i>${containerLabel}
            ${sizeText ? `<span class="variant-size">${sizeText}</span>` : ''}
          </span>
        </div>
        <div class="variant-action" id="action-${CSS.escape(fmt.format_id)}">
          <span>Download</span>
          <i class="fas fa-download"></i>
        </div>
      `;
      btn.addEventListener('click', () => triggerDownload(fmt, meta));
      variantGrid.appendChild(btn);
    });
  }

  showView('result');
  showToast('Video info loaded!', 'success');
}

// ─── Download ─────────────────────────────────────────────────
function triggerDownload(fmt, meta) {
  const progressEl = document.getElementById(`progress-${CSS.escape(fmt.format_id)}`);
  const actionEl   = document.getElementById(`action-${CSS.escape(fmt.format_id)}`);

  if (!progressEl || !actionEl) return;

  // Prevent double-clicks
  if (actionEl.dataset.busy === '1') return;
  actionEl.dataset.busy = '1';

  // Visual feedback
  actionEl.innerHTML = `<span>Connecting…</span> <i class="fas fa-spinner fa-spin"></i>`;
  progressEl.style.transition = 'width 30s linear';
  progressEl.style.width = '90%';

  const safeTitle = (meta.title || 'video').replace(/[^a-zA-Z0-9_\- ]/g, '_').slice(0, 60);
  const params = new URLSearchParams({
    url:        meta.url,
    format_id:  fmt.format_id,
    filename:   safeTitle,
    ext:        fmt.ext || 'mp4',
    needs_merge: fmt.needs_merge ? '1' : '0',   // tells server to use temp-file PATH B
    platform_marker: fmt.platform_marker || ''   // X/Instagram signal for ffmpeg remux
  });

  const downloadUrl = `${API_BASE}/api/download?${params.toString()}`;

  // window.open triggers the Save-As dialog immediately as yt-dlp streams bytes
  window.open(downloadUrl, '_blank');

  const label = fmt.quality === 'Audio' ? 'audio' : `${fmt.quality} MP4`;
  showToast(`⬇️ Downloading ${label} — browser Save-As dialog will appear shortly.`, 'success');

  // Reset button
  setTimeout(() => {
    progressEl.style.transition = 'width 0.3s ease';
    progressEl.style.width = '0%';
    actionEl.innerHTML = `<span>Download</span> <i class="fas fa-download"></i>`;
    delete actionEl.dataset.busy;
  }, 5000);
}



// ─── History ──────────────────────────────────────────────────
function loadHistory() {
  try {
    const raw = localStorage.getItem('vg_history_v2');
    state.history = raw ? JSON.parse(raw) : [];
  } catch { state.history = []; }
  renderHistoryUI();
}

function saveToHistory(item) {
  if (!state.history) state.history = [];
  const existing = state.history.findIndex(h => h.url === item.url);
  if (existing !== -1) state.history.splice(existing, 1);
  state.history.unshift({
    id: Date.now(),
    url: item.url,
    title: item.title,
    uploader: item.uploader,
    thumbnail: item.thumbnail,
    platform: item.platform,
    formats: item.formats
  });
  if (state.history.length > 15) state.history.pop();
  localStorage.setItem('vg_history_v2', JSON.stringify(state.history));
  renderHistoryUI();
}

function deleteHistoryItem(id, event) {
  if (event) event.stopPropagation();
  state.history = state.history.filter(h => h.id !== id);
  localStorage.setItem('vg_history_v2', JSON.stringify(state.history));
  renderHistoryUI();
}

function clearAllHistory() {
  if (!confirm('Clear all download history?')) return;
  state.history = [];
  localStorage.removeItem('vg_history_v2');
  renderHistoryUI();
}

function renderHistoryUI() {
  if (!recentHistoryList) return;
  const hist = state.history || [];

  if (historyCounter) {
    historyCounter.textContent = hist.length;
    historyCounter.style.display = hist.length > 0 ? 'inline-flex' : 'none';
  }

  const clearBtn = document.getElementById('btn-clear-history');

  if (hist.length === 0) {
    recentHistoryList.innerHTML = `
      <div class="history-empty-state">
        <i class="fas fa-history"></i>
        <p>No recent grabs yet.</p>
        <span style="font-size:.8rem;opacity:.6;">Your history will appear here.</span>
      </div>`;
    if (clearBtn) clearBtn.style.display = 'none';
    return;
  }

  if (clearBtn) clearBtn.style.display = 'flex';
  recentHistoryList.innerHTML = '';

  hist.forEach(item => {
    const card = document.createElement('div');
    card.className = 'history-card';
    const iconMap = { instagram: 'fab fa-instagram', youtube: 'fab fa-youtube', x: 'fab fa-x-twitter' };
    const icon = iconMap[item.platform] || 'fas fa-video';

    card.innerHTML = `
      <div class="history-card-thumb-wrapper">
        ${item.thumbnail
          ? `<img class="history-card-thumb" src="${escHtml(item.thumbnail)}" alt="thumb" onerror="this.parentElement.innerHTML='<div style=\'display:flex;align-items:center;justify-content:center;height:100%;\'><i class=\'${icon}\' style=\'font-size:1.4rem;opacity:.4;\'></i></div>'">`
          : `<div style="display:flex;align-items:center;justify-content:center;height:100%;"><i class="${icon}" style="font-size:1.4rem;opacity:.4;"></i></div>`}
      </div>
      <div class="history-card-info">
        <div class="history-card-title">${escHtml(item.title || 'Untitled')}</div>
        <div class="history-card-desc">@${escHtml(item.uploader || '')}</div>
        <div class="history-card-footer">
          <span class="history-card-platform ${item.platform}"><i class="${icon}"></i> ${item.platform}</span>
          <button class="btn-history-delete" onclick="deleteHistoryItem(${item.id}, event)"><i class="far fa-trash-alt"></i></button>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      // Reload this item's result view
      applyPlatformTheme(item.platform);
      state.currentMeta = item;
      renderResult(item);
      closeHistoryDrawer();
    });

    recentHistoryList.appendChild(card);
  });
}

// ─── Drawer ───────────────────────────────────────────────────
function openHistoryDrawer()  { sidebarDrawer.classList.add('open');    sidebarOverlay.classList.add('active'); }
function closeHistoryDrawer() { sidebarDrawer.classList.remove('open'); sidebarOverlay.classList.remove('active'); }

// ─── Error UI ─────────────────────────────────────────────────
function displayError(msg) {
  errorMsg.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`;
  errorMsg.style.display = 'flex';
}

// ─── Toast ────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast-item ${type}`;
  const icons = { success: 'fas fa-check-circle', info: 'fas fa-info-circle', warning: 'fas fa-exclamation-triangle', error: 'fas fa-times-circle' };
  toast.innerHTML = `<i class="${icons[type] || icons.info} toast-icon"></i><div class="toast-content">${msg}</div>`;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('active'), 50);
  setTimeout(() => { toast.classList.remove('active'); setTimeout(() => toast.remove(), 400); }, 4500);
}

// ─── Helpers ──────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtNum(n) {
  if (!n) return '0';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString();
}

function fmtDuration(secs) {
  if (!secs) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function fmtBytes(bytes) {
  if (!bytes) return '';
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  return (bytes / 1e3).toFixed(0) + ' KB';
}

// ─── Expose globals for inline HTML onclick attributes ────────
window.showView        = showView;
window.selectPlatform  = selectPlatform;
window.navigateBack    = navigateBack;
window.openHistoryDrawer  = openHistoryDrawer;
window.closeHistoryDrawer = closeHistoryDrawer;
window.deleteHistoryItem  = deleteHistoryItem;
window.clearAllHistory    = clearAllHistory;
