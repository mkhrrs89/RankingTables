(() => {
  const style = document.createElement("style");
  style.textContent = `
    .tab-panel:not([data-panel="main"]) .ranking-score {
      cursor: pointer;
      border-radius: 9px;
      padding: 5px 7px;
      margin: -5px -7px;
    }

    .tab-panel:not([data-panel="main"]) .ranking-score:hover,
    .tab-panel:not([data-panel="main"]) .ranking-score:focus-visible {
      background: rgba(56, 189, 248, 0.10);
      outline: 1px solid rgba(56, 189, 248, 0.32);
    }

    .rating-editor-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      background: rgba(2, 6, 23, 0.82);
      backdrop-filter: blur(8px);
    }

    .rating-editor-backdrop[hidden] {
      display: none;
    }

    .rating-editor-dialog {
      width: min(390px, 100%);
      border: 1px solid rgba(148, 163, 184, 0.35);
      border-radius: 16px;
      background: #0f172a;
      color: #e5e7eb;
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.65);
      padding: 18px;
    }

    .rating-editor-title {
      font-size: 1.05rem;
      font-weight: 750;
      margin-bottom: 4px;
    }

    .rating-editor-subtitle {
      color: #9ca3af;
      font-size: 0.82rem;
      margin-bottom: 15px;
    }

    .rating-editor-label {
      display: grid;
      gap: 7px;
      color: #cbd5e1;
      font-size: 0.82rem;
    }

    .rating-editor-input {
      width: 100%;
      border-radius: 10px;
      border: 1px solid rgba(148, 163, 184, 0.45);
      background: #020617;
      color: #e5e7eb;
      padding: 10px 11px;
      font: inherit;
      font-size: 1rem;
      outline: none;
    }

    .rating-editor-input:focus {
      border-color: #38bdf8;
      box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.18);
    }

    .rating-editor-status {
      min-height: 20px;
      margin-top: 8px;
      color: #fca5a5;
      font-size: 0.8rem;
    }

    .rating-editor-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 12px;
    }

    .rating-editor-actions button {
      border-radius: 10px;
    }
  `;
  document.head.appendChild(style);

  const backdrop = document.createElement("div");
  backdrop.className = "rating-editor-backdrop";
  backdrop.hidden = true;

  const dialog = document.createElement("div");
  dialog.className = "rating-editor-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "ratingEditorTitle");

  const title = document.createElement("div");
  title.className = "rating-editor-title";
  title.id = "ratingEditorTitle";
  title.textContent = "Edit rating";

  const subtitle = document.createElement("div");
  subtitle.className = "rating-editor-subtitle";

  const label = document.createElement("label");
  label.className = "rating-editor-label";
  const labelText = document.createElement("span");
  labelText.textContent = "Rating";
  const input = document.createElement("input");
  input.className = "rating-editor-input";
  input.type = "number";
  input.step = "any";
  input.inputMode = "decimal";
  label.append(labelText, input);

  const status = document.createElement("div");
  status.className = "rating-editor-status";

  const actions = document.createElement("div");
  actions.className = "rating-editor-actions";
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "Save rating";
  actions.append(cancelButton, saveButton);

  dialog.append(title, subtitle, label, status, actions);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  let editContext = null;

  function getRatingContext(scoreElement) {
    const card = scoreElement?.closest?.(".ranking-card");
    const panel = card?.closest?.(".tab-panel");
    const category = panel?.dataset?.panel || "";
    const name = card?.querySelector(".ranking-name")?.textContent?.trim() || "";
    if (!card || !name || !category || category === "main") return null;

    const columns = getColumnDefinitions();
    const nameIndex = findColumnIndexByLabel(columns, NAME_LABEL);
    const ratingIndex = findColumnIndexByLabel(columns, category);
    if (nameIndex === -1 || ratingIndex === -1) return null;

    const ratingColumn = columns[ratingIndex];
    const normalizedName = normalizePersonName(name);
    const matchingRows = Array.from(tbody.querySelectorAll("tr")).filter((row) => {
      const nameCell = row.children[nameIndex]?.querySelector(".cell, .name-cell");
      return normalizePersonName(nameCell?.textContent || "") === normalizedName;
    });
    if (!matchingRows.length) return null;

    // Names are normally unique in the ranking table. If a duplicate exists,
    // prefer the row whose current score matches the card that was tapped.
    const displayedScore = Number.parseFloat(
      card.querySelector(".ranking-score strong")?.textContent || ""
    );
    let row = matchingRows[0];
    if (matchingRows.length > 1 && Number.isFinite(displayedScore)) {
      const matchedByScore = matchingRows.find((candidate) => {
        const cell = candidate.children[ratingIndex]?.querySelector(".cell, .name-cell");
        const value = Number.parseFloat(cell?.textContent || "");
        return Number.isFinite(value) && Math.abs(value - displayedScore) < 0.000001;
      });
      if (matchedByScore) row = matchedByScore;
    }

    const cell = row.children[ratingIndex]?.querySelector(".cell, .name-cell");
    if (!cell) return null;

    return {
      card,
      panel,
      category,
      name,
      row,
      cell,
      ratingColumn,
      displayLabel: ratingColumn.label || category,
    };
  }

  function closeEditor() {
    backdrop.hidden = true;
    editContext = null;
    status.textContent = "";
  }

  function openEditor(scoreElement) {
    const context = getRatingContext(scoreElement);
    if (!context) return;

    editContext = context;
    title.textContent = `Edit ${context.displayLabel} rating`;
    subtitle.textContent = context.name;
    input.value = context.cell.textContent.trim();
    status.textContent = context.ratingColumn.formula?.trim()
      ? "This rating is calculated by a formula and cannot be edited directly."
      : "";
    input.disabled = Boolean(context.ratingColumn.formula?.trim());
    saveButton.disabled = input.disabled;
    backdrop.hidden = false;

    if (input.disabled) {
      cancelButton.focus();
    } else {
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
    }
  }

  function saveRating() {
    if (!editContext || input.disabled) return;
    const rawValue = input.value.trim();
    const value = Number(rawValue);
    if (!rawValue || !Number.isFinite(value)) {
      status.textContent = "Enter a valid numeric rating.";
      input.focus();
      return;
    }

    editContext.cell.textContent = rawValue;
    applyNumericStyling(editContext.cell);

    // Use the app's normal cell-change path so dependent formulas, persistence,
    // Age behavior, and all ranking lists update exactly as they do from Main.
    handleCellChange({ target: editContext.cell });
    queueAllRankingsRender();
    closeEditor();
  }

  cancelButton.addEventListener("click", closeEditor);
  saveButton.addEventListener("click", saveRating);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveRating();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeEditor();
    }
  });

  backdrop.addEventListener("mousedown", (event) => {
    if (event.target === backdrop) closeEditor();
  });

  document.addEventListener("keydown", (event) => {
    if (!backdrop.hidden && event.key === "Escape") closeEditor();
  });

  document.addEventListener("click", (event) => {
    const scoreElement = event.target.closest?.(
      '.tab-panel:not([data-panel="main"]) .ranking-score'
    );
    if (!scoreElement) return;
    event.preventDefault();
    event.stopPropagation();
    openEditor(scoreElement);
  });

  // Make the score area keyboard-accessible too without changing its visual
  // presentation or the existing ranking-card markup.
  function enhanceScoreElements(root = document) {
    root.querySelectorAll?.(
      '.tab-panel:not([data-panel="main"]) .ranking-score'
    ).forEach((scoreElement) => {
      if (scoreElement.dataset.ratingEditorAttached === "true") return;
      scoreElement.tabIndex = 0;
      scoreElement.setAttribute("role", "button");
      scoreElement.title = "Tap to edit this rating";
      scoreElement.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openEditor(scoreElement);
      });
      scoreElement.dataset.ratingEditorAttached = "true";
    });
  }

  const appRoot = document.querySelector(".app") || document.body;
  const observer = new MutationObserver(() => enhanceScoreElements(appRoot));
  observer.observe(appRoot, { childList: true, subtree: true });
  enhanceScoreElements(appRoot);
})();
