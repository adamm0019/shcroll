chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.set({
      autoScrollEnabled: true,
      scrollDelay: 0,
      scrollBeforeEnd: 0.5
    });
  });