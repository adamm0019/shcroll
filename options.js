document.addEventListener("DOMContentLoaded", () => {
    const enabledCheckbox = document.getElementById("autoScrollEnabled");
    const delayInput = document.getElementById("scrollDelay");
    const status = document.getElementById("status");
  
    chrome.storage.sync.get(["autoScrollEnabled", "scrollDelay"], (data) => {
      enabledCheckbox.checked = data.autoScrollEnabled ?? true;
      delayInput.value = data.scrollDelay ?? 1;
    });
  
    document.getElementById("save").addEventListener("click", () => {
      const newSettings = {
        autoScrollEnabled: enabledCheckbox.checked,
        scrollDelay: parseFloat(delayInput.value),
      };
      chrome.storage.sync.set(newSettings, () => {
        status.textContent = "Settings saved!";
        setTimeout(() => (status.textContent = ""), 1500);
      });
    });
  });
  