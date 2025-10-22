let autoScrollEnabled = true;
let scrollDelay = 1; // seconds
let attachedVideo = null;
let timeUpdateHandler = null;
let mutationObserver = null;
let lastVideoSrc = null;
const TIME_MARGIN = 0.35; // seconds before end to trigger

// Load settings from storage
chrome.storage.sync.get(["autoScrollEnabled", "scrollDelay"], (data) => {
  if (data.autoScrollEnabled !== undefined) autoScrollEnabled = data.autoScrollEnabled;
  if (data.scrollDelay !== undefined) scrollDelay = data.scrollDelay;
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.autoScrollEnabled) autoScrollEnabled = changes.autoScrollEnabled.newValue;
  if (changes.scrollDelay) scrollDelay = changes.scrollDelay.newValue;
});

// Helper: find the currently playing short's <video> element robustly
function findShortVideo() {
  // <video> is inside ytd-reel-player-renderer, or single <video>
  const candidates = Array.from(document.querySelectorAll("video"));
  if (!candidates.length) return null;

  // prefer a visible, unmuted, playing one
  for (const v of candidates) {
    const rect = v.getBoundingClientRect();
    if (rect.width > 20 && rect.height > 20 && (v.duration > 0 || v.readyState > 0)) {
      return v;
    }
  }
  // fallback to first video
  return candidates[0];
}

function scrollToNextShort() {
    console.log("[Shorts AutoScroll] Attempting to scroll to next Short...");
  
    try {
      // Look inside shadow DOM of ytd-shorts-player-controls for the Next button
      const controls = document.querySelector("ytd-shorts-player-controls");
      if (controls && controls.shadowRoot) {
        const nextBtn = controls.shadowRoot.querySelector('button[aria-label="Next"], yt-button-shape[aria-label="Next"]');
        if (nextBtn) {
          console.log("[Shorts AutoScroll] Clicking Next button inside shadowRoot...");
          nextBtn.click();
          return;
        }
      }
  
      // fallback: try directly under the main player renderer
      const oldBtn = document.querySelector('ytd-reel-player-header-renderer button[aria-label="Next"]');
      if (oldBtn) {
        console.log("[Shorts AutoScroll] Found legacy Next button, clicking...");
        oldBtn.click();
        return;
      }
  
      // If all else fails, reload Shorts home to trigger next
      const nextLink = document.querySelector('a[href*="/shorts/"]:not([aria-current="true"])');
      if (nextLink) {
        console.log("[Shorts AutoScroll] Navigating to next short via link...");
        nextLink.click();
        return;
      }
  
      console.warn("[Shorts AutoScroll] No next button found — layout may have changed.");
    } catch (err) {
      console.error("[Shorts AutoScroll] Error:", err);
    }
  }
  
// detach previous listeners
function detachVideoListeners() {
  if (!attachedVideo) return;
  if (timeUpdateHandler) {
    attachedVideo.removeEventListener("timeupdate", timeUpdateHandler);
    timeUpdateHandler = null;
  }
  attachedVideo = null;
  lastVideoSrc = null;
}

// attach robust listener that triggers when currentTime reaches near end
function attachToVideo(video) {
  if (!video) return;
  if (attachedVideo === video) return; // already attached

  detachVideoListeners();
  attachedVideo = video;
  lastVideoSrc = video.currentSrc || video.src || "";

  timeUpdateHandler = () => {
    if (!autoScrollEnabled) return;
    // sometimes duration is 0 or NaN — guard
    const dur = video.duration;
    const t = video.currentTime;
    if (!isFinite(dur) || dur <= 0) return;

    // If within TIME_MARGIN of end -> schedule the scroll
    if (dur - t <= TIME_MARGIN) {
      // Some shorts loop immediately when they end. To avoid double firings, detach first.
      detachVideoListeners();
      // Small safety: ensure we wait the user-specified delay before scrolling.
      setTimeout(() => {
        // Double-check page is still a shorts page (user may have navigated)
        if (!window.location.href.includes("/shorts/")) return;
        scrollToNextShort();
      }, Math.max(0, (scrollDelay || 0) * 1000));
    }
  };

  // listen for timeupdate (fires often)
  video.addEventListener("timeupdate", timeUpdateHandler);

  // also listen for ended as a backup
  video.addEventListener("ended", () => {
    if (!autoScrollEnabled) return;
    // tiny delay to mimic natural behaviour
    setTimeout(scrollToNextShort, Math.max(0, (scrollDelay || 0) * 1000));
  });

  // If the video element is replaced in DOM, we need to detect that
  // We'll use a MutationObserver in setupObserver() below to re-run attach logic.
  console.log("[Shorts AutoScroll] attached to video", lastVideoSrc);
}

// Watch for DOM changes (SPA navigation creates/destroys the player)
function setupObserver() {
  if (mutationObserver) return;

  mutationObserver = new MutationObserver(() => {
    try {
      const v = findShortVideo();
      if (v && v !== attachedVideo) {
        attachToVideo(v);
      }
    } catch (e) {
      console.error("Observer error:", e);
    }
  });

  mutationObserver.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
  });
}

// initial attempt and periodic retries to find video (handles slow load)
function init() {
  setupObserver();

  // try immediately to attach
  const v = findShortVideo();
  if (v) attachToVideo(v);

  // retry a few times in case of slow load/navigation
  let tries = 0;
  const retry = setInterval(() => {
    tries++;
    if (attachedVideo) {
      clearInterval(retry);
      return;
    }
    const v2 = findShortVideo();
    if (v2) {
      attachToVideo(v2);
      clearInterval(retry);
      return;
    }
    if (tries > 10) clearInterval(retry);
  }, 700);
}

// Ensure we re-init after history navigation (SPA)
window.addEventListener("yt-navigate-finish", init, true);
window.addEventListener("popstate", init);
window.addEventListener("pushstate", init); // safety: some sites emit; harmless if not present
// fallback after load
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") init(); });

init();
