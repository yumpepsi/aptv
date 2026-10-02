"use strict";

// แก้ URL สตรีมได้ที่นี่ แต่ละช่องรองรับ URL สำรองตามลำดับ
const channels = [
  { id: "ch3", name: "3HD", number: "ช่อง 33", label: "3 HD", bg: "linear-gradient(135deg,#1763bf 0 33%,#20a05a 33% 66%,#e53935 66%)", streams: ["https://live-us1.thaimomo.com/live-as/ch3hd-3/playlist.m3u8"] },
  { id: "ch7", name: "7HD", number: "ช่อง 35", label: "7 HD", bg: "linear-gradient(135deg,#178e4e,#225cc1 55%,#e63039)", streams: ["https://live-us1.thaimomo.com/live-as/ch7hd-3/playlist.m3u8"] },
  { id: "workpoint", name: "Workpoint", number: "ช่อง 23", label: "WORK\nPOINT", bg: "linear-gradient(145deg,#6548a8,#ef445c 45%,#f4cc38)", streams: ["https://edge6a.v2h-cdn.com/workpoint/workpoint.stream/playlist.m3u8", "https://smt.goiptv.us.ci/workpoint_pat/playlist.m3u8"] },
  { id: "one31", name: "ONE31", number: "ช่อง 31", label: "one 31", bg: "linear-gradient(135deg,#b81774,#e86322 45%,#79bd42)", streams: ["https://live-us1.thaimomo.com/live-as/chone-3/playlist.m3u8"] },
  { id: "gmm25", name: "GMM25", number: "ช่อง 25", label: "GMM\n25", bg: "linear-gradient(135deg,#48505e,#24282e)", streams: ["https://smt.goiptv.us.ci/gmmchannel_pat/playlist.m3u8", "https://cdn-laos.workpoint.news/hd-gmmone_720/index.m3u8"] },
  { id: "mono29", name: "MONO29", number: "ช่อง 29", label: "MONO\n29", bg: "linear-gradient(135deg,#dd292f,#8d1118)", streams: ["https://ctrl.laotv.la/live/MONO29/index.m3u8", "https://smt.goiptv.us.ci/mono29_pat/playlist.m3u8"] },
  { id: "thaipbs", name: "Thai PBS", number: "ช่อง 3", label: "Thai\nPBS", bg: "linear-gradient(135deg,#ef6c22,#b73c1d)", streams: ["https://live-us1.thaimomo.com/live-as/chThaipbshd-2/playlist.m3u8"] },
  { id: "pptv", name: "PPTV HD 36", number: "ช่อง 36", label: "PPTV\n36", bg: "linear-gradient(135deg,#257bbd,#162f7b)", streams: ["https://live-us1.thaimomo.com/live-as/chpptv-3/playlist.m3u8"] },
  { id: "thairath", name: "Thairath TV", number: "ช่อง 32", label: "ไทยรัฐ\n32", bg: "linear-gradient(135deg,#38a94d,#106a32)", streams: ["https://live-us1.thaimomo.com/live-as/chthairathhd-3/playlist.m3u8"] },
  { id: "amarin", name: "Amarin TV", number: "ช่อง 34", label: "AMARIN\n34", bg: "linear-gradient(135deg,#13a851,#1487b9 55%,#9858a8)", streams: ["https://live-us1.thaimomo.com/live-as/chamarin-3/playlist.m3u8"] }
];

const video = document.getElementById("video");
const grid = document.getElementById("channelGrid");
const loading = document.getElementById("loading");
const placeholder = document.getElementById("placeholder");
const errorMessage = document.getElementById("errorMessage");
const channelOverlay = document.getElementById("channelOverlay");
const nowPlaying = document.getElementById("nowPlaying");
const playIcon = document.getElementById("playIcon");
const playText = document.getElementById("playText");
const muteIcon = document.getElementById("muteIcon");
const qualitySelect = document.getElementById("qualitySelect");
let hls = null;
let activeChannel = null;
let streamIndex = 0;
let retrying = false;
let bufferTimer = null;
let stallTimer = null;
let recoveryAttempts = 0;

function renderChannels() {
  grid.innerHTML = channels.map((channel) => `
    <button class="channel-card" type="button" data-channel="${channel.id}" aria-label="ดู ${channel.name}">
      <span class="channel-logo" style="--logo-bg:${channel.bg}">${channel.label.replace("\n", "<br>")}</span>
      <span class="channel-name">${channel.name}<small class="channel-number">${channel.number}</small></span>
    </button>`).join("");
  document.getElementById("channelCount").textContent = `${channels.length} ช่อง`;
}

function destroyPlayer() {
  if (hls) { hls.destroy(); hls = null; }
  if (bufferTimer) { window.clearInterval(bufferTimer); bufferTimer = null; }
  if (stallTimer) { window.clearTimeout(stallTimer); stallTimer = null; }
  video.onerror = null;
  video.onloadedmetadata = null;
  video.removeAttribute("src");
  video.load();
}

function setLoading(isLoading) {
  loading.hidden = !isLoading;
  if (isLoading) errorMessage.hidden = true;
}

function showError() {
  setLoading(false);
  errorMessage.hidden = false;
  updatePlayButton();
}

function tryFallback() {
  if (!activeChannel || retrying || streamIndex >= activeChannel.streams.length - 1) {
    showError();
    return;
  }
  retrying = true;
  streamIndex += 1;
  window.setTimeout(() => {
    retrying = false;
    attachStream(activeChannel.streams[streamIndex]);
  }, 500);
}

function attachStream(url) {
  destroyPlayer();
  setLoading(true);
  errorMessage.hidden = true;

  // Chromium บางรุ่นตอบ "maybe" สำหรับ native HLS แต่เล่นจริงไม่ได้
  // จึงใช้ hls.js ก่อน และเก็บ native HLS ไว้เป็น fallback สำหรับ Safari/WebKit
  if (window.Hls && Hls.isSupported()) {
    hls = new Hls({
      enableWorker: true,
      startLevel: 0,
      lowLatencyMode: false,
      backBufferLength: 60,
      maxBufferLength: 90,
      maxMaxBufferLength: 120,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 8,
      maxBufferHole: 0.8,
      nudgeMaxRetry: 5,
      manifestLoadingTimeOut: 8000,
      manifestLoadingMaxRetry: 1,
      levelLoadingTimeOut: 8000,
      fragLoadingTimeOut: 10000
    });
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
      updateQualityOptions(data.levels);
      hls.currentLevel = 0;
      startWhenBuffered();
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      else tryFallback();
    });
  } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    qualitySelect.innerHTML = '<option value="native">ตามต้นทาง</option>';
    qualitySelect.disabled = true;
    video.src = url;
    video.onloadedmetadata = () => {
      video.onloadedmetadata = null;
      startPlayback();
    };
    video.onerror = () => {
      video.onerror = null;
      tryFallback();
    };
  } else {
    showError();
  }
}

function startPlayback() {
  video.play().catch(() => setLoading(false));
}

function updateQualityOptions(levels) {
  qualitySelect.disabled = false;
  qualitySelect.innerHTML = levels.map((level, index) => {
    const height = level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)} kbps`;
    const prefix = index === 0 ? "ต่ำ · " : "";
    return `<option value="${index}">${prefix}${height}</option>`;
  }).join("") + '<option value="auto">อัตโนมัติ</option>';
  qualitySelect.value = "0";
}

function clearStallTimer() {
  if (!stallTimer) return;
  window.clearTimeout(stallTimer);
  stallTimer = null;
}

function scheduleRecovery() {
  if (!activeChannel || video.paused || stallTimer) return;

  stallTimer = window.setTimeout(() => {
    stallTimer = null;
    recoveryAttempts += 1;

    if (hls && recoveryAttempts <= 2) {
      hls.startLoad(-1);
      if (Number.isFinite(hls.liveSyncPosition)) video.currentTime = hls.liveSyncPosition;
      else if (video.buffered.length) video.currentTime = Math.max(0, video.buffered.end(video.buffered.length - 1) - 1);
      hls.recoverMediaError();
      video.play().catch(() => {});
      scheduleRecovery();
      return;
    }

    recoveryAttempts = 0;
    streamIndex = 0;
    attachStream(activeChannel.streams[0]);
  }, 6000);
}

function startWhenBuffered() {
  const startedAt = Date.now();
  const minimumBuffer = 18;

  if (bufferTimer) window.clearInterval(bufferTimer);
  bufferTimer = window.setInterval(() => {
    const buffered = video.buffered.length
      ? video.buffered.end(video.buffered.length - 1) - video.currentTime
      : 0;

    // เผื่อภาพล่วงหน้าสำหรับเครือข่ายมือถือที่ความเร็วแกว่ง
    if (buffered >= minimumBuffer || Date.now() - startedAt >= 18000) {
      window.clearInterval(bufferTimer);
      bufferTimer = null;
      startPlayback();
    }
  }, 500);
}

function selectChannel(channel) {
  activeChannel = channel;
  streamIndex = 0;
  placeholder.hidden = true;
  channelOverlay.hidden = false;
  nowPlaying.textContent = `${channel.name} · ${channel.number}`;
  document.querySelectorAll(".channel-card").forEach((card) => {
    const isActive = card.dataset.channel === channel.id;
    card.classList.toggle("active", isActive);
    card.setAttribute("aria-pressed", String(isActive));
  });
  attachStream(channel.streams[0]);
}

function updatePlayButton() {
  const isPlaying = !video.paused && !video.ended;
  playIcon.textContent = isPlaying ? "Ⅱ" : "▶";
  playText.textContent = isPlaying ? "หยุด" : "เล่น";
}

grid.addEventListener("click", (event) => {
  const button = event.target.closest(".channel-card");
  if (!button) return;
  const channel = channels.find((item) => item.id === button.dataset.channel);
  if (channel) selectChannel(channel);
});

document.getElementById("playButton").addEventListener("click", () => {
  if (!activeChannel) { selectChannel(channels[0]); return; }
  if (video.paused) video.play().catch(showError); else video.pause();
});

document.getElementById("muteButton").addEventListener("click", () => {
  video.muted = !video.muted;
  muteIcon.textContent = video.muted ? "🔇" : "🔊";
});

qualitySelect.addEventListener("change", () => {
  if (!hls) return;
  const level = qualitySelect.value === "auto" ? -1 : Number(qualitySelect.value);
  hls.currentLevel = level;
  hls.nextLevel = level;
});

document.getElementById("reloadButton").addEventListener("click", () => {
  if (activeChannel) { streamIndex = 0; attachStream(activeChannel.streams[0]); }
});

document.getElementById("fullscreenButton").addEventListener("click", () => {
  const shell = document.getElementById("playerShell");
  if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
  else if (shell.requestFullscreen) shell.requestFullscreen();
});

video.addEventListener("playing", () => {
  clearStallTimer();
  recoveryAttempts = 0;
  setLoading(false);
  errorMessage.hidden = true;
  updatePlayButton();
});
video.addEventListener("pause", () => { clearStallTimer(); updatePlayButton(); });
video.addEventListener("waiting", () => { setLoading(true); scheduleRecovery(); });
video.addEventListener("stalled", scheduleRecovery);
video.addEventListener("canplay", () => setLoading(false));

function updateClock() {
  document.getElementById("clock").textContent = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

renderChannels();
updateClock();
window.setInterval(updateClock, 15000);
