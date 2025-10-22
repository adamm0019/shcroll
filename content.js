let autoScrollEnabled = true;
let scrollDelay = 0; // seconds - delay AFTER video ends
let scrollBeforeEnd = 0.5; // seconds - scroll this many seconds BEFORE video ends
let attachedVideo = null;
let timeUpdateHandler = null;
let mutationObserver = null;
let lastVideoSrc = null;
let hasTriggered = false; // prevent double-firing

// Load settings from storage
chrome.storage.sync.get(["autoScrollEnabled", "scrollDelay", "scrollBeforeEnd"], (data) => {
  if (data.autoScrollEnabled !== undefined) autoScrollEnabled = data.autoScrollEnabled;
  if (data.scrollDelay !== undefined) scrollDelay = data.scrollDelay;
  if (data.scrollBeforeEnd !== undefined) scrollBeforeEnd = data.scrollBeforeEnd;
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.autoScrollEnabled) autoScrollEnabled = changes.autoScrollEnabled.newValue;
  if (changes.scrollDelay) scrollDelay = changes.scrollDelay.newValue;
  if (changes.scrollBeforeEnd) scrollBeforeEnd = changes.scrollBeforeEnd.newValue;
});

// Helper: find the currently playing short's <video> element robustly
function findShortVideo() {
  const candidates = Array.from(document.querySelectorAll("video"));
  if (!candidates.length) return null;

  for (const v of candidates) {
    const rect = v.getBoundingClientRect();
    if (rect.width > 20 && rect.height > 20 && (v.duration > 0 || v.readyState > 0)) {
      return v;
    }
  }
  return candidates[0];
}

function scrollToNextShort() {
  console.log("[Shorts AutoScroll] Scrolling to next Short...");
  
  try {
    // Method 1: Keyboard event (most reliable for YouTube Shorts)
    const keyEvent = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      code: 'ArrowDown',
      keyCode: 40,
      which: 40,
      bubbles: true,
      cancelable: true
    });
    
    if (document.activeElement) {
      document.activeElement.dispatchEvent(keyEvent);
      document.dispatchEvent(keyEvent);
      return;
    }

    // Method 2: Look for buttons in shadow DOM
    const controls = document.querySelector("ytd-shorts-player-controls");
    if (controls && controls.shadowRoot) {
      const selectors = [
        'button[aria-label="Next"]',
        'button[aria-label="Next video"]',
        'yt-button-shape[aria-label="Next"]',
        'button[title="Next"]',
        '#navigation-button-down',
        '.navigation-button[aria-label*="Next"]'
      ];
      
      for (const selector of selectors) {
        const btn = controls.shadowRoot.querySelector(selector);
        if (btn) {
          console.log(`[Shorts AutoScroll] Found Next button: ${selector}`);
          btn.click();
          return;
        }
      }
    }

    // Method 3: Look outside shadow DOM
    const buttonSelectors = [
      'button[aria-label="Next"]',
      'button[aria-label="Next video"]',
      'ytd-reel-player-header-renderer button[aria-label="Next"]'
    ];
    
    for (const selector of buttonSelectors) {
      const btn = document.querySelector(selector);
      if (btn) {
        btn.click();
        return;
      }
    }

    // Method 4: Fallback to link navigation
    const nextLink = document.querySelector('a[href*="/shorts/"]:not([aria-current="true"])');
    if (nextLink) {
      nextLink.click();
      return;
    }

    console.warn("[Shorts AutoScroll] All methods failed.");
    
  } catch (err) {
    console.error("[Shorts AutoScroll] Error:", err);
  }
}

// detach previous listeners
function detachVideoListeners() {
  if (!attachedVideo) return;
  if (timeUpdateHandler) {
    attachedVideo.removeEventListener("timeupdate", timeUpdateHandler);
    attachedVideo.removeEventListener("ended", endedHandler);
    timeUpdateHandler = null;
  }
  attachedVideo = null;
  lastVideoSrc = null;
  hasTriggered = false;
}

// Ended handler
function endedHandler() {
  if (!autoScrollEnabled || hasTriggered) return;
  hasTriggered = true;
  setTimeout(scrollToNextShort, scrollDelay * 1000);
}

// attach robust listener
function attachToVideo(video) {
  if (!video) return;
  
  // Check if this is a new video by comparing the source URL
  const currentSrc = video.currentSrc || video.src || "";
  if (attachedVideo === video && lastVideoSrc === currentSrc) {
    // Same video element AND same source - already attached
    return;
  }

  // Either new video element OR same element with new content
  detachVideoListeners();
  attachedVideo = video;
  lastVideoSrc = currentSrc;
  hasTriggered = false;

  timeUpdateHandler = () => {
    if (!autoScrollEnabled || hasTriggered) return;
    
    // Check if video source changed (YouTube reuses same element)
    const currentSrc = video.currentSrc || video.src || "";
    if (currentSrc && lastVideoSrc && currentSrc !== lastVideoSrc) {
      console.log("[Shorts AutoScroll] Video source changed, re-attaching...");
      attachToVideo(video);
      return;
    }
    
    const dur = video.duration;
    const t = video.currentTime;
    if (!isFinite(dur) || dur <= 0) return;

    // Trigger scrollBeforeEnd seconds before the video ends
    const timeUntilEnd = dur - t;
    if (timeUntilEnd <= scrollBeforeEnd && timeUntilEnd > 0) {
      hasTriggered = true;
      console.log(`[Shorts AutoScroll] Triggering ${timeUntilEnd.toFixed(2)}s before end`);
      
      // Calculate exact delay to scroll right when video would end
      const delayUntilEnd = (timeUntilEnd * 1000) + (scrollDelay * 1000);
      setTimeout(() => {
        if (!window.location.href.includes("/shorts/")) return;
        scrollToNextShort();
      }, delayUntilEnd);
    }
  };

  video.addEventListener("timeupdate", timeUpdateHandler);
  video.addEventListener("ended", endedHandler);
  
  // Listen for when new video loads into same element
  video.addEventListener("loadedmetadata", () => {
    const newSrc = video.currentSrc || video.src || "";
    if (newSrc !== lastVideoSrc) {
      console.log("[Shorts AutoScroll] New video loaded, re-attaching...");
      attachToVideo(video);
    }
  });

  console.log("[Shorts AutoScroll] attached to video", lastVideoSrc);
}

// Watch for DOM changes
function setupObserver() {
  if (mutationObserver) return;

  mutationObserver = new MutationObserver(() => {
    try {
      const v = findShortVideo();
      if (v) {
        // Always check if source changed, even if same element
        const currentSrc = v.currentSrc || v.src || "";
        if (v !== attachedVideo || currentSrc !== lastVideoSrc) {
          attachToVideo(v);
        }
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

// initial attempt and periodic retries
function init() {
  console.log("[Shorts AutoScroll] Initializing...");
  setupObserver();

  const v = findShortVideo();
  if (v) attachToVideo(v);

  // Retry logic for slow loads
  let tries = 0;
  const retry = setInterval(() => {
    tries++;
    const currentVideo = findShortVideo();
    
    if (currentVideo) {
      const currentSrc = currentVideo.currentSrc || currentVideo.src || "";
      // Check if we need to attach/re-attach
      if (!attachedVideo || attachedVideo !== currentVideo || currentSrc !== lastVideoSrc) {
        attachToVideo(currentVideo);
      }
    }
    
    if (tries > 10) clearInterval(retry);
  }, 700);
  
  // Additional periodic check to ensure we stay attached (every 3 seconds)
  setInterval(() => {
    if (!window.location.href.includes("/shorts/")) return;
    const v = findShortVideo();
    if (v) {
      const currentSrc = v.currentSrc || v.src || "";
      if (!attachedVideo || v !== attachedVideo || currentSrc !== lastVideoSrc) {
        console.log("[Shorts AutoScroll] Periodic check - re-attaching...");
        attachToVideo(v);
      }
    }
  }, 3000);
}

window.addEventListener("yt-navigate-finish", init, true);
window.addEventListener("popstate", init);
window.addEventListener("pushstate", init);
document.addEventListener("visibilitychange", () => { 
  if (document.visibilityState === "visible") init(); 
});

init();