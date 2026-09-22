(() => {
  const WORKSPACES = [
    { key: "one", label: "One" },
    { key: "two", label: "Two" },
  ];
  const WORKSPACE_META_KEY = "ranking-tables-workspace-meta-v1";
  const ACTIVE_WORKSPACE_KEY = "ranking-tables-active-workspace-v1";
  const IMAGE_WORKSPACE_PREFIX = "rtws:";
  const IMAGE_VIEW_STORAGE_KEY = "ranking-tables-image-view-v1";
  const WORKBOOK_EXPORT_FORMAT = "ranking-tables-workbook";
  const WORKBOOK_EXPORT_VERSION = 1;

  const rawStorageGet = storage.getItem;
  const rawStorageSet = storage.setItem;
  const rawStorageRemove = storage.removeItem;
  const originalImageKeyForName = imageKeyForName;
  const originalSerializeStoredImagesForExport = serializeStoredImagesForExport;
  const originalReplaceStoredImagesFromExport = replaceStoredImagesFromExport;
  const originalActivateTab = activateTab;

  function tableStorageKey(workspaceKey) {
    return workspaceKey === "one"
      ? STORAGE_KEY
      : `${STORAGE_KEY}::workspace:${workspaceKey}`;
  }

  function imagePrefixForWorkspace(workspaceKey) {
    return workspaceKey === "one"
      ? ""
      : `${IMAGE_WORKSPACE_PREFIX}${workspaceKey}|`;
  }

  function normalizeWorkspaceKey(value) {
    return WORKSPACES.some((workspace) => workspace.key === value)
      ? value
      : "one";
  }

  function readWorkspaceMeta() {
    try {
      const parsed = JSON.parse(rawStorageGet(WORKSPACE_META_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  let workspaceMeta = readWorkspaceMeta();
  WORKSPACES.forEach((workspace) => {
    if (!workspaceMeta[workspace.key]) {
      workspaceMeta[workspace.key] = { activeTab: "main", scrollTop: 0, scrollLeft: 0 };
    }
  });

  let activeWorkspace = "one";
  const requestedInitialWorkspace = normalizeWorkspaceKey(
    rawStorageGet(ACTIVE_WORKSPACE_KEY) || "one"
  );

  function buildBlankSecondWorkspaceState() {
    const currentState = collectTableState();
    const headers = Array.isArray(currentState?.headers) && currentState.headers.length
      ? currentState.headers.map((header) => ({ ...header }))
      : buildDefaultState().headers;
    const rows = Array.from({ length: DEFAULT_ROW_COUNT }, () =>
      headers.map(() => "")
    );
    return { headers, rows };
  }

  if (!rawStorageGet(tableStorageKey("two"))) {
    rawStorageSet(
      tableStorageKey("two"),
      JSON.stringify(buildBlankSecondWorkspaceState())
    );
  }

  function persistWorkspaceMeta() {
    rawStorageSet(WORKSPACE_META_KEY, JSON.stringify(workspaceMeta));
    rawStorageSet(ACTIVE_WORKSPACE_KEY, activeWorkspace);
  }

  function routeStorageKey(key) {
    return key === STORAGE_KEY ? tableStorageKey(activeWorkspace) : key;
  }

  // Route the app's existing persistence calls to the active workbook tab. This
  // also protects the original beforeunload and Clear Data handlers, which were
  // registered before this helper loaded and still reference STORAGE_KEY.
  storage.getItem = (key) => rawStorageGet(routeStorageKey(key));
  storage.setItem = (key, value) => rawStorageSet(routeStorageKey(key), value);
  storage.removeItem = (key) => rawStorageRemove(routeStorageKey(key));

  imageKeyForName = function (name, category = "") {
    const baseKey = originalImageKeyForName(name, category);
    if (!baseKey) return "";
    return `${imagePrefixForWorkspace(activeWorkspace)}${baseKey}`;
  };

  function imageBelongsToWorkspace(key, workspaceKey) {
    const value = String(key || "");
    const prefix = imagePrefixForWorkspace(workspaceKey);
    return workspaceKey === "one"
      ? !value.startsWith(IMAGE_WORKSPACE_PREFIX)
      : value.startsWith(prefix);
  }

  function stripWorkspaceImagePrefix(key, workspaceKey) {
    const value = String(key || "");
    const prefix = imagePrefixForWorkspace(workspaceKey);
    if (workspaceKey !== "one" && value.startsWith(prefix)) {
      return value.slice(prefix.length);
    }
    return value;
  }

  function addWorkspaceImagePrefix(key, workspaceKey) {
    const value = String(key || "");
    if (!value) return value;
    return workspaceKey === "one"
      ? value.replace(/^rtws:[^|]+\|/, "")
      : `${imagePrefixForWorkspace(workspaceKey)}${value.replace(/^rtws:[^|]+\|/, "")}`;
  }

  async function putRawImageRecords(records) {
    if (!records?.length) return;
    const db = await openImageDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(IMAGE_STORE_NAME, "readwrite");
      const store = transaction.objectStore(IMAGE_STORE_NAME);
      records.forEach((record) => store.put(record));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error || new Error("Unable to restore workspace images."));
      transaction.onabort = () =>
        reject(transaction.error || new Error("Workspace image restore was aborted."));
    });
  }

  serializeStoredImagesForExport = async function () {
    const workspaceKey = activeWorkspace;
    const records = await originalSerializeStoredImagesForExport();
    return records
      .filter((record) => imageBelongsToWorkspace(record?.key, workspaceKey))
      .map((record) => ({
        ...record,
        key: stripWorkspaceImagePrefix(record.key, workspaceKey),
      }));
  };

  replaceStoredImagesFromExport = async function (images) {
    const workspaceKey = activeWorkspace;
    const allRecords = await getAllStoredImages();
    const preservedRecords = allRecords.filter(
      (record) => !imageBelongsToWorkspace(record?.key, workspaceKey)
    );
    const mappedImages = Array.isArray(images)
      ? images.map((record) => ({
          ...record,
          key: addWorkspaceImagePrefix(record?.key, workspaceKey),
        }))
      : [];

    await originalReplaceStoredImagesFromExport(mappedImages);
    await putRawImageRecords(preservedRecords);
  };

  function updateCurrentWorkspaceMeta() {
    const meta = workspaceMeta[activeWorkspace] || {};
    meta.activeTab = getActiveTabName();
    meta.scrollTop = tableWrapper?.scrollTop || 0;
    meta.scrollLeft = tableWrapper?.scrollLeft || 0;
    workspaceMeta[activeWorkspace] = meta;
  }

  activateTab = function (tabName) {
    originalActivateTab(tabName);
    if (!workspaceMeta[activeWorkspace]) return;
    workspaceMeta[activeWorkspace].activeTab = tabName;
    persistWorkspaceMeta();
  };

  function readWorkspaceState(workspaceKey) {
    const saved = rawStorageGet(tableStorageKey(workspaceKey));
    if (!saved) return buildDefaultState();
    try {
      const parsed = JSON.parse(saved);
      if (parsed && Array.isArray(parsed.headers) && Array.isArray(parsed.rows)) {
        return parsed;
      }
    } catch (err) {
      console.warn("Unable to read workspace state", workspaceKey, err);
    }
    return buildDefaultState();
  }

  function saveWorkspaceState(workspaceKey, state) {
    rawStorageSet(tableStorageKey(workspaceKey), JSON.stringify(state));
  }

  function updateWorkspaceButtons() {
    document.querySelectorAll(".workspace-tab-button").forEach((button) => {
      const isActive = button.dataset.workspace === activeWorkspace;
      button.setAttribute("aria-selected", String(isActive));
      button.tabIndex = isActive ? 0 : -1;
    });
    document.querySelector(".app")?.setAttribute("data-workspace", activeWorkspace);
  }

  function restoreWorkspaceScroll(workspaceKey) {
    const meta = workspaceMeta[workspaceKey] || {};
    requestAnimationFrame(() => {
      if (!tableWrapper || activeWorkspace !== workspaceKey) return;
      tableWrapper.scrollTop = Number(meta.scrollTop) || 0;
      tableWrapper.scrollLeft = Number(meta.scrollLeft) || 0;
      if (topScrollbar) {
        topScrollbar.scrollLeft = tableWrapper.scrollLeft;
      }
      refreshScrollbars();
    });
  }

  function switchWorkspace(workspaceKey, { saveCurrent = true } = {}) {
    const nextWorkspace = normalizeWorkspaceKey(workspaceKey);
    if (nextWorkspace === activeWorkspace && saveCurrent) return;

    hideSuggestionDropdown?.();

    if (saveCurrent) {
      updateCurrentWorkspaceMeta();
      saveTableState();
    }

    activeWorkspace = nextWorkspace;
    persistWorkspaceMeta();

    const state = readWorkspaceState(activeWorkspace);
    applyState(state);

    const availableTabs = new Set(tabButtons.map((button) => button.dataset.tab));
    const requestedInnerTab = workspaceMeta[activeWorkspace]?.activeTab || "main";
    activateTab(availableTabs.has(requestedInnerTab) ? requestedInnerTab : "main");

    updateWorkspaceButtons();
    restoreWorkspaceScroll(activeWorkspace);
    queueAllRankingsRender();
  }

  const style = document.createElement("style");
  style.textContent = `
    .workspace-tabs {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
      margin-bottom: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.34);
      overflow-x: auto;
      scrollbar-width: thin;
    }

    .workspace-tab-button {
      flex: 0 0 auto;
      min-width: 88px;
      justify-content: center;
      border-radius: 12px;
      padding: 9px 18px;
      font-size: 0.95rem;
      font-weight: 750;
      letter-spacing: 0.02em;
      background: rgba(2, 6, 23, 0.72);
      border-color: rgba(148, 163, 184, 0.42);
      color: #cbd5e1;
      box-shadow: none;
    }

    .workspace-tab-button[aria-selected="true"] {
      color: #f8fafc;
      border-color: #22c55e;
      background: rgba(34, 197, 94, 0.17);
      box-shadow: inset 0 -2px 0 #22c55e;
    }

    .workspace-tab-button:hover {
      border-color: rgba(34, 197, 94, 0.75);
      box-shadow: none;
    }

    @media (max-width: 767px) {
      .workspace-tabs {
        margin-bottom: 8px;
        padding-bottom: 8px;
      }

      .workspace-tab-button {
        min-width: 76px;
        padding: 8px 16px;
        font-size: 0.9rem;
      }
    }
  `;
  document.head.appendChild(style);

  const app = document.querySelector(".app");
  const innerTabs = app?.querySelector(":scope > .tabs");
  const workspaceTabs = document.createElement("div");
  workspaceTabs.className = "workspace-tabs";
  workspaceTabs.setAttribute("role", "tablist");
  workspaceTabs.setAttribute("aria-label", "Workspaces");

  WORKSPACES.forEach((workspace) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "workspace-tab-button";
    button.dataset.workspace = workspace.key;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", "false");
    button.textContent = workspace.label;
    button.addEventListener("click", () => switchWorkspace(workspace.key));
    workspaceTabs.appendChild(button);
  });

  if (app && innerTabs) {
    app.insertBefore(workspaceTabs, innerTabs);
  }

  function readImageViews() {
    try {
      const parsed = JSON.parse(localStorage.getItem(IMAGE_VIEW_STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function viewKeyForRecord(record, workspaceKey) {
    const rawKey = String(record?.key || "");
    const baseKey = stripWorkspaceImagePrefix(rawKey, workspaceKey);
    if (baseKey.startsWith("person:")) {
      const name = record?.name || baseKey.slice("person:".length);
      const faceKey = originalImageKeyForName(name, "face");
      return `${imagePrefixForWorkspace(workspaceKey)}${faceKey}`;
    }
    return rawKey;
  }

  async function serializeWorkspaceImages(workspaceKey) {
    const records = await getAllStoredImages();
    const views = readImageViews();
    const selected = records.filter((record) =>
      imageBelongsToWorkspace(record?.key, workspaceKey)
    );

    return await Promise.all(
      selected.map(async (record) => {
        const viewKey = viewKeyForRecord(record, workspaceKey);
        const displayView = views[viewKey];
        const serialized = {
          key: stripWorkspaceImagePrefix(record.key, workspaceKey),
          name: record.name,
          category: record.category || null,
          mimeType: record.mimeType || record.blob?.type || "image/webp",
          width: record.width,
          height: record.height,
          size: record.size || record.blob?.size || 0,
          updatedAt: record.updatedAt || null,
          data: await blobToDataUrl(record.blob),
        };
        if (displayView) serialized.displayView = displayView;
        return serialized;
      })
    );
  }

  function getEasternExportStamp() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).formatToParts(new Date());
    const getPart = (type) => parts.find((part) => part.type === type)?.value || "";
    return `${getPart("year")}-${getPart("month")}-${getPart("day")}-${getPart("hour")}_${getPart("minute")}_${getPart("dayPeriod").toUpperCase()}`;
  }

  async function exportWorkbook(event) {
    event.preventDefault();
    event.stopImmediatePropagation();

    updateCurrentWorkspaceMeta();
    saveTableState();
    persistWorkspaceMeta();

    const backup = {
      format: WORKBOOK_EXPORT_FORMAT,
      version: WORKBOOK_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      activeWorkspace,
      workspaces: {},
    };

    for (const workspace of WORKSPACES) {
      let images = null;
      try {
        images = await serializeWorkspaceImages(workspace.key);
      } catch (err) {
        console.warn(`Images for workspace ${workspace.label} could not be exported.`, err);
      }

      backup.workspaces[workspace.key] = {
        label: workspace.label,
        activeTab: workspaceMeta[workspace.key]?.activeTab || "main",
        table: readWorkspaceState(workspace.key),
        images,
      };
    }

    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ranking-tables-workbook-${getEasternExportStamp()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function restoreWorkbookImages(workspaces) {
    const originalWorkspace = activeWorkspace;
    try {
      for (const workspace of WORKSPACES) {
        const images = workspaces?.[workspace.key]?.images;
        if (!Array.isArray(images)) continue;
        activeWorkspace = workspace.key;
        await replaceStoredImagesFromExport(images);
      }
    } finally {
      activeWorkspace = originalWorkspace;
    }
  }

  async function importWorkbookBackup(parsed) {
    WORKSPACES.forEach((workspace) => {
      const state = parsed?.workspaces?.[workspace.key]?.table;
      saveWorkspaceState(
        workspace.key,
        state && Array.isArray(state.headers) && Array.isArray(state.rows)
          ? state
          : buildDefaultState()
      );
      workspaceMeta[workspace.key] = {
        ...(workspaceMeta[workspace.key] || {}),
        activeTab: parsed?.workspaces?.[workspace.key]?.activeTab || "main",
        scrollTop: 0,
        scrollLeft: 0,
      };
    });

    await restoreWorkbookImages(parsed?.workspaces || {});

    activeWorkspace = normalizeWorkspaceKey(parsed?.activeWorkspace || "one");
    persistWorkspaceMeta();
    applyState(readWorkspaceState(activeWorkspace));

    const availableTabs = new Set(tabButtons.map((button) => button.dataset.tab));
    const innerTab = workspaceMeta[activeWorkspace]?.activeTab || "main";
    activateTab(availableTabs.has(innerTab) ? innerTab : "main");
    updateWorkspaceButtons();
    restoreWorkspaceScroll(activeWorkspace);
    queueAllRankingsRender();
  }

  async function importLegacyJson(parsed) {
    const isAppBackup =
      parsed?.format === APP_EXPORT_FORMAT &&
      parsed?.tabs?.main;
    const tableState = isAppBackup ? parsed.tabs.main : parsed;
    const applied = applyState(tableState);
    if (!applied) {
      alert("Import failed: file is missing valid table data.");
      return;
    }

    if (isAppBackup && Array.isArray(parsed.images)) {
      try {
        await replaceStoredImagesFromExport(parsed.images);
      } catch (imageErr) {
        console.error("Image restore failed", imageErr);
        alert("The table imported, but some saved images could not be restored.");
      }
    }

    saveTableState();
    queueAllRankingsRender();

    if (isAppBackup) {
      const availableTabs = new Set(tabButtons.map((button) => button.dataset.tab));
      activateTab(availableTabs.has(parsed.activeTab) ? parsed.activeTab : "main");
    }
  }

  exportBtn.addEventListener("click", exportWorkbook, true);

  importFileInput.addEventListener(
    "change",
    (event) => {
      const file = event.target.files?.[0];
      if (!file || !file.name.toLowerCase().endsWith(".json")) return;

      event.stopImmediatePropagation();
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (parsed?.format === WORKBOOK_EXPORT_FORMAT && parsed?.workspaces) {
            await importWorkbookBackup(parsed);
          } else {
            await importLegacyJson(parsed);
          }
        } catch (err) {
          console.error("Import failed", err);
          alert("Import failed: invalid JSON file.");
        } finally {
          importFileInput.value = "";
        }
      };
      reader.readAsText(file);
    },
    true
  );

  // Keep workspace metadata current even when the original beforeunload listener
  // is the one that writes the table state.
  window.addEventListener("beforeunload", () => {
    updateCurrentWorkspaceMeta();
    persistWorkspaceMeta();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      updateCurrentWorkspaceMeta();
      persistWorkspaceMeta();
    }
  });

  // Initial DOM is always bootstrapped from the legacy One state before this
  // helper loads. Switch only after routing is installed, so existing data is
  // preserved exactly and Two can start from the untouched default state.
  if (requestedInitialWorkspace === "two") {
    switchWorkspace("two", { saveCurrent: false });
  } else {
    activeWorkspace = "one";
    workspaceMeta.one.activeTab = getActiveTabName();
    persistWorkspaceMeta();
    updateWorkspaceButtons();
  }
})();
