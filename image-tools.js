(() => {
  const IMAGE_VIEW_STORAGE_KEY = "ranking-tables-image-view-v1";
  const DEFAULT_VIEW = Object.freeze({ zoom: 1, x: 50, y: 50 });
  let imageViews = {};

  try {
    const parsed = JSON.parse(localStorage.getItem(IMAGE_VIEW_STORAGE_KEY) || "{}");
    imageViews = parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    imageViews = {};
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeView(view) {
    const zoom = Number(view?.zoom);
    const x = Number(view?.x);
    const y = Number(view?.y);
    return {
      zoom: Number.isFinite(zoom) ? clamp(zoom, 1, 4) : DEFAULT_VIEW.zoom,
      x: Number.isFinite(x) ? clamp(x, 0, 100) : DEFAULT_VIEW.x,
      y: Number.isFinite(y) ? clamp(y, 0, 100) : DEFAULT_VIEW.y,
    };
  }

  function saveViews() {
    try {
      localStorage.setItem(IMAGE_VIEW_STORAGE_KEY, JSON.stringify(imageViews));
    } catch (err) {
      // Framing controls still work for the current session if storage is full
      // or unavailable.
    }
  }

  function getView(key) {
    return normalizeView(imageViews[key] || DEFAULT_VIEW);
  }

  function setView(key, view) {
    if (!key) return;
    imageViews[key] = normalizeView(view);
    saveViews();
  }

  function clearView(key) {
    if (!key || !Object.prototype.hasOwnProperty.call(imageViews, key)) return;
    delete imageViews[key];
    saveViews();
  }

  function getCardContext(card) {
    if (!card) return null;
    const name = card.querySelector(".ranking-name")?.textContent?.trim() || "";
    const panel = card.closest(".tab-panel");
    const category = panel?.dataset?.panel || "";
    if (!name || !category || category === "main") return null;
    return {
      card,
      name,
      category,
      key: imageKeyForName(name, category),
      imageButton: card.querySelector(".ranking-image-button"),
      fileInput: card.querySelector('input[type="file"][accept*="image"]'),
    };
  }

  function applyViewToImage(img, view) {
    if (!img) return;
    const normalized = normalizeView(view);
    img.style.objectFit = "cover";
    img.style.objectPosition = `${normalized.x}% ${normalized.y}%`;
    img.style.transformOrigin = `${normalized.x}% ${normalized.y}%`;
    img.style.transform = `scale(${normalized.zoom})`;
  }

  function applyViewToCard(card) {
    const context = getCardContext(card);
    const img = context?.imageButton?.querySelector("img");
    if (!context || !img) return;
    applyViewToImage(img, getView(context.key));
  }

  const style = document.createElement("style");
  style.textContent = `
    .ranking-card {
      position: relative;
    }

    .ranking-image-tools-button {
      position: absolute;
      top: 4px;
      left: 4px;
      z-index: 8;
      width: 24px;
      height: 24px;
      min-width: 24px;
      padding: 0;
      border-radius: 7px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(226, 232, 240, 0.45);
      background: rgba(2, 6, 23, 0.78);
      color: #e5e7eb;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
      font-size: 15px;
      line-height: 1;
      opacity: 0.88;
    }

    .ranking-image-tools-button:hover,
    .ranking-image-tools-button:focus-visible {
      opacity: 1;
      background: rgba(15, 23, 42, 0.96);
      border-color: rgba(56, 189, 248, 0.8);
      box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.24),
        0 4px 12px rgba(0, 0, 0, 0.4);
      transform: none;
    }

    .image-editor-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      background: rgba(2, 6, 23, 0.82);
      backdrop-filter: blur(8px);
    }

    .image-editor-backdrop[hidden] {
      display: none;
    }

    .image-editor-dialog {
      width: min(620px, 100%);
      max-height: min(760px, calc(100dvh - 36px));
      overflow: auto;
      border: 1px solid rgba(148, 163, 184, 0.35);
      border-radius: 16px;
      background: #0f172a;
      color: #e5e7eb;
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.65);
      padding: 18px;
    }

    .image-editor-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }

    .image-editor-title {
      font-size: 1.05rem;
      font-weight: 750;
    }

    .image-editor-subtitle {
      margin-top: 3px;
      color: #9ca3af;
      font-size: 0.82rem;
    }

    .image-editor-close {
      flex: 0 0 auto;
      padding: 5px 10px;
      border-radius: 9px;
    }

    .image-editor-preview {
      width: min(460px, 100%);
      margin: 0 auto 16px;
      overflow: hidden;
      position: relative;
      border-radius: 12px;
      border: 1px solid rgba(148, 163, 184, 0.35);
      background: rgba(2, 6, 23, 0.82);
      touch-action: none;
      cursor: grab;
      user-select: none;
    }

    .image-editor-preview.dragging {
      cursor: grabbing;
    }

    .image-editor-preview img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
      pointer-events: none;
    }

    .image-editor-preview img[hidden],
    .image-editor-empty[hidden] {
      display: none;
    }

    .image-editor-empty {
      min-height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      color: #9ca3af;
      text-align: center;
      font-size: 0.86rem;
    }

    .image-editor-controls {
      display: grid;
      gap: 10px;
      margin-bottom: 14px;
    }

    .image-editor-control {
      display: grid;
      grid-template-columns: 92px minmax(0, 1fr) 52px;
      align-items: center;
      gap: 10px;
      font-size: 0.82rem;
      color: #cbd5e1;
    }

    .image-editor-control input[type="range"] {
      width: 100%;
    }

    .image-editor-control output {
      text-align: right;
      color: #e5e7eb;
      font-variant-numeric: tabular-nums;
    }

    .image-editor-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .image-editor-actions button {
      border-radius: 10px;
    }

    .image-editor-paste-target {
      margin-top: 12px;
      min-height: 62px;
      padding: 12px;
      border: 1px dashed rgba(56, 189, 248, 0.65);
      border-radius: 10px;
      color: #cbd5e1;
      background: rgba(2, 6, 23, 0.55);
      outline: none;
      font-size: 0.82rem;
    }

    .image-editor-paste-target:focus {
      border-color: #38bdf8;
      box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.18);
    }

    .image-editor-status {
      min-height: 20px;
      margin-top: 10px;
      color: #9ca3af;
      font-size: 0.8rem;
    }

    @media (max-width: 640px) {
      .image-editor-dialog {
        padding: 14px;
      }

      .image-editor-control {
        grid-template-columns: 74px minmax(0, 1fr) 46px;
        gap: 7px;
      }
    }
  `;
  document.head.appendChild(style);

  const backdrop = document.createElement("div");
  backdrop.className = "image-editor-backdrop";
  backdrop.hidden = true;

  const dialog = document.createElement("div");
  dialog.className = "image-editor-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "imageEditorTitle");

  const header = document.createElement("div");
  header.className = "image-editor-header";

  const headingCopy = document.createElement("div");
  const title = document.createElement("div");
  title.className = "image-editor-title";
  title.id = "imageEditorTitle";
  title.textContent = "Image options";
  const subtitle = document.createElement("div");
  subtitle.className = "image-editor-subtitle";
  headingCopy.append(title, subtitle);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "image-editor-close";
  closeButton.textContent = "Close";
  header.append(headingCopy, closeButton);

  const preview = document.createElement("div");
  preview.className = "image-editor-preview";
  const previewImage = document.createElement("img");
  previewImage.alt = "Image framing preview";
  const emptyPreview = document.createElement("div");
  emptyPreview.className = "image-editor-empty";
  emptyPreview.textContent = "No image is saved here yet.";
  preview.append(previewImage, emptyPreview);

  const controls = document.createElement("div");
  controls.className = "image-editor-controls";

  function buildRangeControl(labelText, min, max, step) {
    const row = document.createElement("label");
    row.className = "image-editor-control";
    const label = document.createElement("span");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    const output = document.createElement("output");
    row.append(label, input, output);
    controls.appendChild(row);
    return { row, input, output };
  }

  const zoomControl = buildRangeControl("Zoom", 1, 4, 0.05);
  const xControl = buildRangeControl("Horizontal", 0, 100, 1);
  const yControl = buildRangeControl("Vertical", 0, 100, 1);

  const actions = document.createElement("div");
  actions.className = "image-editor-actions";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "Save framing";

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.textContent = "Center / reset";

  const chooseButton = document.createElement("button");
  chooseButton.type = "button";
  chooseButton.textContent = "Choose image";

  const pasteButton = document.createElement("button");
  pasteButton.type = "button";
  pasteButton.textContent = "Paste image";

  actions.append(saveButton, resetButton, chooseButton, pasteButton);

  const pasteTarget = document.createElement("div");
  pasteTarget.className = "image-editor-paste-target";
  pasteTarget.contentEditable = "true";
  pasteTarget.tabIndex = 0;
  pasteTarget.hidden = true;
  pasteTarget.textContent =
    "Paste here: press Ctrl/Cmd+V, or long-press this box and choose Paste.";

  const status = document.createElement("div");
  status.className = "image-editor-status";

  dialog.append(header, preview, controls, actions, pasteTarget, status);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  let editorContext = null;
  let workingView = { ...DEFAULT_VIEW };
  let dragState = null;

  function setStatus(message) {
    status.textContent = message || "";
  }

  function updateEditorPreview() {
    workingView = normalizeView(workingView);
    zoomControl.input.value = String(workingView.zoom);
    xControl.input.value = String(workingView.x);
    yControl.input.value = String(workingView.y);
    zoomControl.output.value = `${workingView.zoom.toFixed(2)}×`;
    xControl.output.value = `${Math.round(workingView.x)}%`;
    yControl.output.value = `${Math.round(workingView.y)}%`;
    applyViewToImage(previewImage, workingView);
  }

  function setControlsEnabled(enabled) {
    [zoomControl.input, xControl.input, yControl.input, saveButton, resetButton].forEach(
      (control) => {
        control.disabled = !enabled;
      }
    );
  }

  function openEditor(card) {
    const context = getCardContext(card);
    if (!context) return;
    editorContext = context;
    workingView = getView(context.key);
    const currentImage = context.imageButton?.querySelector("img");
    const rect = context.imageButton?.getBoundingClientRect();
    const width = rect?.width > 0 ? rect.width : 1;
    const height = rect?.height > 0 ? rect.height : 1;
    preview.style.aspectRatio = `${width} / ${height}`;

    subtitle.textContent = `${context.name} · ${context.category}`;
    previewImage.hidden = !currentImage;
    emptyPreview.hidden = Boolean(currentImage);
    if (currentImage) {
      previewImage.src = currentImage.src;
    } else {
      previewImage.removeAttribute("src");
    }

    setControlsEnabled(Boolean(currentImage));
    pasteTarget.hidden = true;
    setStatus(
      currentImage
        ? "Drag the preview to reposition it, or use the sliders."
        : "Choose an image or paste one from your clipboard."
    );
    updateEditorPreview();
    backdrop.hidden = false;
    closeButton.focus();
  }

  function closeEditor() {
    backdrop.hidden = true;
    pasteTarget.hidden = true;
    pasteTarget.textContent =
      "Paste here: press Ctrl/Cmd+V, or long-press this box and choose Paste.";
    setStatus("");
    editorContext = null;
    dragState = null;
  }

  closeButton.addEventListener("click", closeEditor);
  backdrop.addEventListener("mousedown", (event) => {
    if (event.target === backdrop) closeEditor();
  });

  [zoomControl.input, xControl.input, yControl.input].forEach((input) => {
    input.addEventListener("input", () => {
      workingView = {
        zoom: Number(zoomControl.input.value),
        x: Number(xControl.input.value),
        y: Number(yControl.input.value),
      };
      updateEditorPreview();
    });
  });

  resetButton.addEventListener("click", () => {
    workingView = { ...DEFAULT_VIEW };
    updateEditorPreview();
  });

  saveButton.addEventListener("click", () => {
    if (!editorContext) return;
    setView(editorContext.key, workingView);
    applyViewToCard(editorContext.card);
    closeEditor();
  });

  chooseButton.addEventListener("click", () => {
    const input = editorContext?.fileInput;
    if (!input) {
      setStatus("This ranking card does not have an image picker available.");
      return;
    }
    input.click();
    closeEditor();
  });

  preview.addEventListener("pointerdown", (event) => {
    if (!editorContext || previewImage.hidden) return;
    event.preventDefault();
    preview.setPointerCapture?.(event.pointerId);
    preview.classList.add("dragging");
    dragState = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: workingView.x,
      startY: workingView.y,
    };
  });

  preview.addEventListener("pointermove", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const rect = preview.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dx = event.clientX - dragState.startClientX;
    const dy = event.clientY - dragState.startClientY;
    workingView = {
      ...workingView,
      x: dragState.startX - (dx / rect.width) * 100,
      y: dragState.startY - (dy / rect.height) * 100,
    };
    updateEditorPreview();
  });

  function endPreviewDrag(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    preview.releasePointerCapture?.(event.pointerId);
    preview.classList.remove("dragging");
    dragState = null;
  }

  preview.addEventListener("pointerup", endPreviewDrag);
  preview.addEventListener("pointercancel", endPreviewDrag);

  async function savePastedBlob(blob) {
    if (!editorContext || !(blob instanceof Blob) || !blob.type.startsWith("image/")) {
      setStatus("No image was found on the clipboard.");
      return false;
    }

    setStatus("Saving pasted image…");
    try {
      const extension = (blob.type.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "");
      const file = new File([blob], `pasted-image.${extension || "png"}`, {
        type: blob.type || "image/png",
      });
      const resized = await resizeRankingImage(file);
      await putStoredPersonImage(
        editorContext.name,
        resized,
        editorContext.category
      );
      clearView(editorContext.key);
      closeEditor();
      queueAllRankingsRender();
      return true;
    } catch (err) {
      console.error("Unable to paste ranking image", err);
      setStatus("That clipboard image could not be saved. Try choosing the image instead.");
      return false;
    }
  }

  async function tryClipboardRead() {
    if (!navigator.clipboard?.read) return false;
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        return await savePastedBlob(blob);
      }
      return false;
    } catch (err) {
      return false;
    }
  }

  pasteButton.addEventListener("click", async () => {
    if (!editorContext) return;
    setStatus("Checking the clipboard…");
    const pasted = await tryClipboardRead();
    if (pasted) return;

    pasteTarget.hidden = false;
    pasteTarget.textContent =
      "Paste here: press Ctrl/Cmd+V, or long-press this box and choose Paste.";
    pasteTarget.focus();
    setStatus("Your browser needs a normal Paste action. Paste into the box above.");
  });

  pasteTarget.addEventListener("paste", async (event) => {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find((item) => item.type?.startsWith("image/"));
    if (!imageItem) {
      setStatus("That clipboard content does not contain an image.");
      return;
    }
    event.preventDefault();
    const blob = imageItem.getAsFile();
    if (blob) await savePastedBlob(blob);
  });

  function enhanceCard(card) {
    if (!(card instanceof Element) || !card.matches(".ranking-card")) return;
    const context = getCardContext(card);
    if (!context?.imageButton) return;

    let toolsButton = card.querySelector(":scope > .ranking-image-tools-button");
    if (!toolsButton) {
      toolsButton = document.createElement("button");
      toolsButton.type = "button";
      toolsButton.className = "ranking-image-tools-button";
      toolsButton.textContent = "⋯";
      toolsButton.setAttribute("aria-label", `Image options for ${context.name}`);
      toolsButton.title = "Image options: edit framing, choose, or paste";
      toolsButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openEditor(card);
      });
      card.appendChild(toolsButton);
    }

    const hasImage = Boolean(context.imageButton.querySelector("img"));
    toolsButton.title = hasImage
      ? "Edit image framing, replace, or paste"
      : "Choose or paste an image";
    applyViewToCard(card);
  }

  function enhanceAllCards(root = document) {
    if (root instanceof Element && root.matches(".ranking-card")) {
      enhanceCard(root);
    }
    root.querySelectorAll?.(".ranking-card").forEach(enhanceCard);
  }

  const cardsObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) enhanceAllCards(node);
      });
      const card = mutation.target instanceof Element
        ? mutation.target.closest?.(".ranking-card")
        : null;
      if (card) enhanceCard(card);
    });
  });

  const appRoot = document.querySelector(".app") || document.body;
  cardsObserver.observe(appRoot, { childList: true, subtree: true });
  enhanceAllCards(appRoot);

  // Preserve the original click-to-choose workflow. When a new file is chosen,
  // reset old framing so the replacement starts centered at 1x zoom.
  document.addEventListener(
    "change",
    (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "file") return;
      if (!input.files?.[0]) return;
      const card = input.closest(".ranking-card");
      const context = getCardContext(card);
      if (context) clearView(context.key);
    },
    true
  );

  // Include framing metadata in the app's existing JSON image backup without
  // changing the stored image blobs or the backup's backwards compatibility.
  const originalSerializeStoredImagesForExport = serializeStoredImagesForExport;
  serializeStoredImagesForExport = async function () {
    const records = await originalSerializeStoredImagesForExport();
    return records.map((record) => {
      let viewKey = record.key;
      if (String(record.key || "").startsWith("person:")) {
        const name = record.name || String(record.key).slice("person:".length);
        viewKey = imageKeyForName(name, "face");
      }
      const savedView = imageViews[viewKey];
      return savedView
        ? { ...record, displayView: normalizeView(savedView) }
        : record;
    });
  };

  const originalReplaceStoredImagesFromExport = replaceStoredImagesFromExport;
  replaceStoredImagesFromExport = async function (images) {
    await originalReplaceStoredImagesFromExport(images);

    if (Array.isArray(images)) {
      images.forEach((record) => {
        let viewKey = record?.key || "";
        if (String(viewKey).startsWith("person:")) {
          const name = record?.name || String(viewKey).slice("person:".length);
          viewKey = imageKeyForName(name, "face");
        }
        if (!viewKey) return;
        delete imageViews[viewKey];
        if (record?.displayView) {
          imageViews[viewKey] = normalizeView(record.displayView);
        }
      });
      saveViews();
    }

    requestAnimationFrame(() => enhanceAllCards(appRoot));
  };
})();
