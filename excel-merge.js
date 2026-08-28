(() => {
  const currentScriptUrl = document.currentScript?.src || document.baseURI;
  const baseUrl = new URL(".", currentScriptUrl);

  // Layout-only overrides. Keep the desktop app shell full-width. On mobile,
  // keep editable Main-table cells at Safari's 16px focus threshold, fit the
  // app shell to the dynamic viewport, and make the active content area the
  // only vertical scroller. Pinch zoom and the existing table gestures remain
  // enabled.
  const layoutStyle = document.createElement("style");
  layoutStyle.textContent = `
    @media (min-width: 768px) {
      .app {
        max-width: none;
      }
    }

    @media (max-width: 767px) {
      html,
      body {
        height: 100%;
        min-height: 0;
        overflow: hidden;
        overscroll-behavior: none;
      }

      body {
        height: 100dvh;
        min-height: 100dvh;
      }

      .app {
        height: 100%;
        max-height: 100%;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .tabs {
        flex: 0 0 auto;
      }

      #mainPanel:not([hidden]) {
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      #mainPanel .controls-panel,
      #mainPanel .table-scrollbar {
        flex: 0 0 auto;
      }

      #mainPanel .table-wrapper {
        flex: 1 1 auto;
        min-height: 0;
        max-height: none;
        overflow: auto;
      }

      #mainPanel .hint-bar {
        display: none !important;
      }

      .rankings-panel:not([hidden]) {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
      }

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