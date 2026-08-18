(() => {
  const currentScriptUrl = document.currentScript?.src || document.baseURI;
  const baseUrl = new URL(".", currentScriptUrl);

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
    .catch((err) => console.error("App helper loading failed", err));
})();