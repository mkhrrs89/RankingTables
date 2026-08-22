(() => {
  // Keep the image-options control available to the existing image-tools logic,
  // but remove it completely from the visible card so nothing covers the image.
  const style = document.createElement("style");
  style.textContent = `
    .ranking-image-tools-button {
      display: none !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(style);

  // The ranking cards already have a hidden image-options button wired to the
  // full editor. Intercept the image-box click before the original file-picker
  // listener runs, then invoke that editor control instead. This preserves all
  // existing Choose Image / Paste / zoom / reposition features inside the menu.
  document.addEventListener(
    "click",
    (event) => {
      const imageButton = event.target.closest?.(".ranking-image-button");
      if (!imageButton) return;

      const card = imageButton.closest(".ranking-card");
      const toolsButton = card?.querySelector(
        ":scope > .ranking-image-tools-button"
      );
      if (!toolsButton) return;

      event.preventDefault();
      event.stopPropagation();
      toolsButton.click();
    },
    true
  );
})();
