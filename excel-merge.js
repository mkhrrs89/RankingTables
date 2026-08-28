(() => {
  const currentScriptUrl = document.currentScript?.src || document.baseURI;
  const baseUrl = new URL(".", currentScriptUrl);

  // Layout-only overrides. Keep the desktop app shell full-width, and on mobile
  // keep editable Main-table cells at Safari's 16px focus threshold so tapping
  // a cell does not trigger the browser's automatic focus zoom. Pinch zoom and
  // the existing table gestures remain enabled.
  const layoutStyle = document.createElement("style");
  layoutStyle.textContent = `
    @media (min-width: 768px) {
      .app {
        max-width: none;
      }
    }

    @media (max-width: 767px) {
      #mainPanel .cell[contenteditable="true"],
      #mainPanel .name-cell[contenteditable="true"] {
        font-size: 16px;
      }
    }
  `;
  document.head.appendChild(layoutStyle);

  function loadClassicScript(fileName) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL(fileName, baseUrl).href;
      script.async = false;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Unable to load ${fileName}`));
      document.head.appendChild(script);
    });
  }

  loadClassicScript("excel-merge-core.js")
    .then(() => loadClassicScript("age-fix.js"))
    .then(() => loadClassicScript("formula-fix.js"))
    .then(() => loadClassicScript("feature-updates.js"))
    .then(() => loadClassicScript("eyes-layout.js"))
    .then(() => loadClassicScript("image-tools.js"))
    .then(() => loadClassicScript("image-click-menu.js"))
    .then(() => loadClassicScript("one-tap-paste.js"))
    .then(() => loadClassicScript("ranking-rating-editor.js"))
    .then(() => loadClassicScript("add-row-top.js"))
    .catch((err) => console.error("App helper loading failed", err));
})();