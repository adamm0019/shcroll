const enabled = document.getElementById("enabled");
const before = document.getElementById("before");
const after = document.getElementById("after");
const btn = document.getElementById("btn");
const msg = document.getElementById("msg");

// Load settings
chrome.storage.sync.get(["autoScrollEnabled", "scrollDelay", "scrollBeforeEnd"], (data) => {
  enabled.checked = data.autoScrollEnabled !== false;
  after.value = data.scrollDelay || 0;
  before.value = data.scrollBeforeEnd || 0.5;
});

// Save
btn.onclick = () => {
  chrome.storage.sync.set({
    autoScrollEnabled: enabled.checked,
    scrollDelay: parseFloat(after.value) || 0,
    scrollBeforeEnd: parseFloat(before.value) || 0
  }, () => {
    msg.textContent = "✓ Saved!";
    msg.className = "msg show";
    setTimeout(() => msg.classList.remove("show"), 1500);
  });
};

// Enter to save
[before, after].forEach(input => {
  input.onkeypress = (e) => {
    if (e.key === "Enter") btn.click();
  };
});