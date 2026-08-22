(() => {
  const currentScriptUrl = document.currentScript?.src || document.baseURI;
  const baseUrl = new URL(".", currentScriptUrl);

  // Desktop-only width override. The inline app styles cap the shell at 1100px;
  // remove that cap on desktop so the Main table can use the browser's full
  // available width. Mobile/tablet sizing remains unchanged.
  const desktopWidthStyle = document.createElement("style");
  desktopWidthStyle.textContent = `
    @media (min-width: 768px) {
      .app {
        max-width: none;
      }
    }
  `;
  document.head.appendChild(desktopWidthStyle);

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
    .catch((err) => console.error("App helper loading failed", err));
})();