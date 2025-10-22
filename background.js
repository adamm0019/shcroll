chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.sync.set({
      autoScrollEnabled: true,
      scrollDelay: 1
    });
  });
  