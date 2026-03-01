// Create the Messages panel in DevTools
chrome.devtools.panels.create(
  'Messages',
  '', // No icon for now
  'panel/index.html',
  (_panel) => {
    // Panel created successfully
  }
);
