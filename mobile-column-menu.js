(() => {
  function isMobileHeaderMenuMode() {
    return (
      window.matchMedia?.("(pointer: coarse)")?.matches ||
      (navigator.maxTouchPoints || 0) > 0
    );
  }

  let activeHeader = null;
  let activeMode = "menu";

  const style = document.createElement("style");
  style.textContent = `
    .mobile-column-menu-backdrop {
      position: fixed;
      inset: 0;
      z-index: 10020;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding: 14px;
      padding-bottom: calc(14px + env(safe-area-inset-bottom, 0px));
      background: rgba(2, 6, 23, 0.72);
      backdrop-filter: blur(8px);
    }

    .mobile-column-menu-backdrop[hidden] {
      display: none !important;
    }

    .mobile-column-menu-sheet {
      width: min(100%, 520px);
      max-height: min(78dvh, 620px);
      overflow-y: auto;
      border: 1px solid rgba(148, 163, 184, 0.38);
      border-radius: 18px;
      padding: 16px;
      background: rgba(15, 23, 42, 0.99);
      box-shadow: 0 22px 70px rgba(0, 0, 0, 0.62);
    }

    .mobile-column-menu-title {
      font-size: 1rem;
      font-weight: 800;
      color: var(--text);
    }

    .mobile-column-menu-subtitle {
      margin-top: 3px;
      margin-bottom: 14px;
      color: var(--text-muted);
      font-size: 0.78rem;
      line-height: 1.35;
      word-break: break-word;
    }

    .mobile-column-menu-actions {
      display: grid;
      gap: 9px;
    }

    .mobile-column-menu-actions button,
    .mobile-column-editor-actions button {
      width: 100%;
      min-height: 44px;
      justify-content: center;
      border-radius: 12px;
      font-size: 0.94rem;
    }

    .mobile-column-menu-actions button:disabled {
      opacity: 0.45;
      cursor: default;
    }

    .mobile-column-editor {
      display: grid;
      gap: 10px;
    }

    .mobile-column-editor[hidden] {
      display: none !important;
    }

    .mobile-column-editor-label {
      color: var(--text-muted);
      font-size: 0.78rem;
      font-weight: 700;
    }

    .mobile-column-editor-input {
      width: 100%;
      min-height: 46px;
      border: 1px solid rgba(148, 163, 184, 0.48);
      border-radius: 10px;
      padding: 10px 12px;
      outline: none;
      background: rgba(2, 6, 23, 0.92);
      color: var(--text);
      font-family: inherit;
      font-size: 16px;
    }

    .mobile-column-editor-input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px var(--accent);
    }

    .mobile-column-editor-help {
      color: var(--text-muted);
      font-size: 0.74rem;
      line-height: 1.4;
    }

    .mobile-column-editor-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 9px;
    }

    .mobile-column-editor-actions .full-width {
      grid-column: 1 / -1;
    }

    @media (min-width: 768px) and (pointer: fine) {
      .mobile-column-menu-backdrop {
        display: none !important;
      }
    }
  `;
  document.head.appendChild(style);

  const backdrop = document.createElement("div");
  backdrop.className = "mobile-column-menu-backdrop";
  backdrop.hidden = true;
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-label", "Column options");

  const sheet = document.createElement("div");
  sheet.className = "mobile-column-menu-sheet";

  const title = document.createElement("div");
  title.className = "mobile-column-menu-title";

  const subtitle = document.createElement("div");
  subtitle.className = "mobile-column-menu-subtitle";

  const menuActions = document.createElement("div");
  menuActions.className = "mobile-column-menu-actions";

  const formulaButton = document.createElement("button");
  formulaButton.type = "button";

  const renameButton = document.createElement("button");
  renameButton.type = "button";
  renameButton.textContent = "Rename";

  const sortButton = document.createElement("button");
  sortButton.type = "button";
  sortButton.textContent = "Sort";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close";

  menuActions.append(formulaButton, renameButton, sortButton, closeButton);

  const editor = document.createElement("div");
  editor.className = "mobile-column-editor";
  editor.hidden = true;

  const editorLabel = document.createElement("label");
  editorLabel.className = "mobile-column-editor-label";

  const editorInput = document.createElement("input");
  editorInput.className = "mobile-column-editor-input";
  editorInput.type = "text";
  editorInput.autocomplete = "off";
  editorInput.spellcheck = false;

  const editorHelp = document.createElement("div");
  editorHelp.className = "mobile-column-editor-help";

  const editorActions = document.createElement("div");
  editorActions.className = "mobile-column-editor-actions";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "Save";

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.textContent = "Clear Formula";

  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "full-width";
  backButton.textContent = "Back";

  editorActions.append(saveButton, clearButton, backButton);
  editor.append(editorLabel, editorInput, editorHelp, editorActions);

  sheet.append(title, subtitle, menuActions, editor);
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);

  function getHeaderLabel(header) {
    return (
      header?.querySelector(".header-label")?.textContent?.trim() ||
      "Column"
    );
  }

  function getHeaderLetter(header) {
    const index = header ? getHeaderIndex(header) : -1;
    return Number.isInteger(index) && index >= 0
      ? indexToColumnLabel(index)
      : "";
  }

  function showMenuView() {
    activeMode = "menu";
    menuActions.hidden = false;
    editor.hidden = true;
    editorInput.value = "";

    const isIcon = activeHeader?.dataset?.type === COLUMN_TYPES.ICON;
    const currentFormula = activeHeader?.dataset?.formula || "";
    formulaButton.disabled = isIcon;
    formulaButton.textContent = currentFormula ? "Edit Formula" : "Add Formula";

    const letter = getHeaderLetter(activeHeader);
    const label = getHeaderLabel(activeHeader);
    title.textContent = label;
    subtitle.textContent = currentFormula
      ? `${letter ? letter + " · " : ""}Current formula: ${currentFormula}`
      : `${letter ? letter + " · " : ""}Choose what you want to do with this column.`;
  }

  function openMenu(header) {
    if (!header || !isMobileHeaderMenuMode()) return;
    hideSuggestionDropdown?.();
    activeHeader = header;
    showMenuView();
    backdrop.hidden = false;
  }

  function closeMenu() {
    backdrop.hidden = true;
    activeHeader = null;
    activeMode = "menu";
    editorInput.blur();
  }

  function focusEditorInput() {
    requestAnimationFrame(() => {
      editorInput.focus();
      const end = editorInput.value.length;
      editorInput.setSelectionRange?.(end, end);
    });
  }

  function showFormulaEditor() {
    if (!activeHeader || activeHeader.dataset.type === COLUMN_TYPES.ICON) return;
    activeMode = "formula";
    menuActions.hidden = true;
    editor.hidden = false;
    editorLabel.textContent = "Formula";
    editorInput.value = activeHeader.dataset.formula || "";
    editorInput.placeholder = "=AVERAGE(G:H)";
    editorHelp.textContent =
      "Use the same formula syntax as desktop. You can use column letters, names, ranges, and functions such as AVERAGE.";
    clearButton.hidden = false;
    focusEditorInput();
  }

  function showRenameEditor() {
    if (!activeHeader) return;
    activeMode = "rename";
    menuActions.hidden = true;
    editor.hidden = false;
    editorLabel.textContent = "Column name";
    editorInput.value = getHeaderLabel(activeHeader);
    editorInput.placeholder = "Column name";
    editorHelp.textContent = "Rename this column.";
    clearButton.hidden = true;
    focusEditorInput();
  }

  function saveEditor() {
    if (!activeHeader) return;

    if (activeMode === "formula") {
      const raw = editorInput.value.trim();
      if (raw) {
        activeHeader.dataset.formula = raw.startsWith("=") ? raw : `=${raw}`;
      } else {
        delete activeHeader.dataset.formula;
      }

      syncFormulaColumnCells();
      recalculateFormulas();
      saveTableState();
      closeMenu();
      return;
    }

    if (activeMode === "rename") {
      const nextName = editorInput.value.trim();
      if (!nextName) return;
      const label = activeHeader.querySelector(".header-label");
      if (label) {
        label.textContent = nextName;
      }
      recalculateFormulas();
      saveTableState();
      closeMenu();
    }
  }

  formulaButton.addEventListener("click", showFormulaEditor);
  renameButton.addEventListener("click", showRenameEditor);

  sortButton.addEventListener("click", () => {
    if (!activeHeader) return;
    const index = getHeaderIndex(activeHeader);
    closeMenu();
    if (Number.isInteger(index) && index >= 0) {
      sortTable(index);
    }
  });

  closeButton.addEventListener("click", closeMenu);

  clearButton.addEventListener("click", () => {
    if (!activeHeader || activeMode !== "formula") return;
    delete activeHeader.dataset.formula;
    syncFormulaColumnCells();
    recalculateFormulas();
    saveTableState();
    closeMenu();
  });

  backButton.addEventListener("click", showMenuView);
  saveButton.addEventListener("click", saveEditor);

  editorInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveEditor();
    } else if (event.key === "Escape") {
      event.preventDefault();
      showMenuView();
    }
  });

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeMenu();
  });

  // Intercept a normal mobile header tap before the original click-to-sort
  // listener. The existing long-press reorder logic sets suppressHeaderClickUntil;
  // honor it so finishing a drag never opens this menu.
  document.addEventListener(
    "click",
    (event) => {
      if (!isMobileHeaderMenuMode()) return;
      const header = event.target.closest?.(".header-row th");
      if (!header) return;

      if (
        typeof suppressHeaderClickUntil === "number" &&
        Date.now() < suppressHeaderClickUntil
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      openMenu(header);
    },
    true
  );
})();
