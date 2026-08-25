(() => {
  const VIEW_STORAGE_KEY = "ranking-tables-image-view-v1";
  let lastImageContext = null;

  function setStatus(message) {
    const status = document.querySelector(".image-editor-status");
    if (status) status.textContent = message || "";
  }

  function rememberImageContextFromButton(imageButton) {
    const card = imageButton?.closest?.(".ranking-card");
    const panel = card?.closest?.(".tab-panel");
    const name = card?.querySelector(".ranking-name")?.textContent?.trim() || "";
    const category = panel?.dataset?.panel || "";
    if (!card || !name || !category || category === "main") return;
    lastImageContext = { name, category };
  }

  document.addEventListener(
    "click",
    (event) => {
      const imageButton = event.target.closest?.(".ranking-image-button");
      if (imageButton) rememberImageContextFromButton(imageButton);
    },
    true
  );

  function getCurrentImageContext() {
    if (lastImageContext) return lastImageContext;

    const subtitle = document.querySelector(".image-editor-subtitle")?.textContent || "";
    const separatorIndex = subtitle.lastIndexOf(" · ");
    if (separatorIndex === -1) return null;
    const name = subtitle.slice(0, separatorIndex).trim();
    const category = subtitle.slice(separatorIndex + 3).trim();
    return name && category ? { name, category } : null;
  }

  function clearSavedFraming(context) {
    try {
      const key = imageKeyForName(context.name, context.category);
      const views = JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY) || "{}") || {};
      delete views[key];
      localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(views));
    } catch (err) {
      // Framing cleanup is optional; never block a successful paste because of it.
    }
  }

  async function sourceToImageBlob(source) {
    const value = String(source || "").trim();
    if (!value) return null;

    try {
      if (/^data:image\//i.test(value)) {
        const response = await fetch(value);
        const blob = await response.blob();
        return blob.type.startsWith("image/") ? blob : null;
      }

      if (/^https?:\/\//i.test(value)) {
        const response = await fetch(value, { credentials: "omit" });
        if (!response.ok) return null;
        const blob = await response.blob();
        return blob.type.startsWith("image/") ? blob : null;
      }
    } catch (err) {
      return null;
    }

    return null;
  }

  async function blobFromClipboardItem(item) {
    const imageType = item.types?.find?.((type) => type.startsWith("image/"));
    if (imageType) {
      try {
        const blob = await item.getType(imageType);
        if (blob?.type?.startsWith("image/")) return blob;
      } catch (err) {
        // Keep trying alternate clipboard representations below.
      }
    }

    if (item.types?.includes?.("text/html")) {
      try {
        const html = await (await item.getType("text/html")).text();
        const documentFragment = new DOMParser().parseFromString(html, "text/html");
        const src = documentFragment.querySelector("img")?.getAttribute("src") || "";
        const blob = await sourceToImageBlob(src);
        if (blob) return blob;
      } catch (err) {
        // Continue to URI/plain-text representations.
      }
    }

    for (const type of ["text/uri-list", "text/plain"]) {
      if (!item.types?.includes?.(type)) continue;
      try {
        const text = await (await item.getType(type)).text();
        const firstLine = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find((line) => line && !line.startsWith("#"));
        const blob = await sourceToImageBlob(firstLine || text);
        if (blob) return blob;
      } catch (err) {
        // Try the next representation.
      }
    }

    return null;
  }

  async function readClipboardImageOnce() {
    if (navigator.clipboard?.read) {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const blob = await blobFromClipboardItem(item);
          if (blob) return blob;
        }
      } catch (err) {
        // Some mobile browsers expose read() but deny it. Try readText next.
      }
    }

    if (navigator.clipboard?.readText) {
      try {
        const text = await navigator.clipboard.readText();
        const blob = await sourceToImageBlob(text);
        if (blob) return blob;
      } catch (err) {
        // Fall through to the browser's manual paste event path.
      }
    }

    return null;
  }

  async function saveClipboardBlob(blob, context) {
    const extension = (blob.type.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "");
    const file = new File([blob], `pasted-image.${extension || "png"}`, {
      type: blob.type || "image/png",
    });
    const resized = await resizeRankingImage(file);
    await putStoredPersonImage(context.name, resized, context.category);
    clearSavedFraming(context);
    document.querySelector(".image-editor-close")?.click();
    queueAllRankingsRender();
  }

  function showSingleFallbackPaste() {
    const pasteTarget = document.querySelector(".image-editor-paste-target");
    if (!pasteTarget) {
      setStatus("This browser did not allow direct clipboard access.");
      return;
    }

    pasteTarget.hidden = false;
    pasteTarget.textContent = "Paste the copied image here once.";
    pasteTarget.focus();
    setStatus("Direct clipboard access is blocked here; one normal Paste will finish it.");
  }

  function replacePasteButton() {
    const actions = document.querySelector(".image-editor-actions");
    if (!actions) return;

    const oldButton = Array.from(actions.querySelectorAll("button")).find(
      (button) => button.textContent.trim().toLowerCase() === "paste image"
    );
    if (!oldButton || oldButton.dataset.oneTapPaste === "true") return;

    // Clone the button to intentionally remove the original multi-step click
    // listener while keeping the same visual appearance and the existing manual
    // paste-target listener as a fallback for browsers that block clipboard read.
    const pasteButton = oldButton.cloneNode(true);
    pasteButton.dataset.oneTapPaste = "true";
    oldButton.replaceWith(pasteButton);

    pasteButton.addEventListener("click", async () => {
      const context = getCurrentImageContext();
      if (!context) {
        setStatus("Unable to determine which ranking image is being edited.");
        return;
      }

      pasteButton.disabled = true;
      setStatus("Pasting image…");
      try {
        const blob = await readClipboardImageOnce();
        if (!blob) {
          showSingleFallbackPaste();
          return;
        }

        await saveClipboardBlob(blob, context);
      } catch (err) {
        console.error("One-tap image paste failed", err);
        showSingleFallbackPaste();
      } finally {
        pasteButton.disabled = false;
      }
    });
  }

  replacePasteButton();
})();
