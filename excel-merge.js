(() => {
  function getImportedFormulaColumnIndexes(worksheet, headerCount) {
    const formulaColumns = new Set();
    if (!worksheet?.["!ref"] || !Number.isInteger(headerCount)) {
      return formulaColumns;
    }

    const range = XLSX.utils.decode_range(worksheet["!ref"]);
    for (let sourceIndex = 0; sourceIndex < headerCount; sourceIndex++) {
      const sheetColumnIndex = range.s.c + sourceIndex;
      if (sheetColumnIndex > range.e.c) break;

      for (let rowIndex = range.s.r + 1; rowIndex <= range.e.r; rowIndex++) {
        const address = XLSX.utils.encode_cell({
          r: rowIndex,
          c: sheetColumnIndex,
        });
        if (worksheet[address]?.f) {
          formulaColumns.add(sourceIndex);
          break;
        }
      }
    }

    return formulaColumns;
  }

  function createBlankExcelImportRow(columns) {
    const row = document.createElement("tr");
    columns.forEach((column) => {
      row.appendChild(createCell(column.type, { formula: column.formula }));
    });
    tbody.appendChild(row);
    applyColumnWidthsToRow(row);
    return row;
  }

  function mergeExcelMatrixIntoMain(matrix, worksheet) {
    if (!Array.isArray(matrix) || !matrix.length || !Array.isArray(matrix[0])) {
      alert("Import failed: the Excel file needs a header row.");
      return null;
    }

    const importHeaders = matrix[0].map((value) => String(value ?? "").trim());
    const importNameIndex = importHeaders.findIndex(
      (label) => normalizeHeaderLabel(label) === NAME_LABEL
    );

    if (importNameIndex === -1) {
      alert('Import failed: the Excel file needs a column named "Name".');
      return null;
    }

    const formulaSourceColumns = getImportedFormulaColumnIndexes(
      worksheet,
      importHeaders.length
    );

    if (formulaSourceColumns.has(importNameIndex)) {
      alert('Import failed: the Excel "Name" column cannot be a formula column.');
      return null;
    }

    const appColumns = getColumnDefinitions();
    const appNameIndex = findColumnIndexByLabel(appColumns, NAME_LABEL);
    if (appNameIndex === -1) {
      alert('Import failed: the Main table needs a column named "Name".');
      return null;
    }

    const writableAppColumns = new Map();
    const ignoredAppFormulaHeaders = [];

    appColumns.forEach((column, index) => {
      const label = normalizeHeaderLabel(column.label);
      if (!label) return;

      const isFormulaColumn = Boolean(column.formula?.trim());
      const isAutoAgeColumn = label === AGE_LABEL;
      const isImageColumn = column.type === COLUMN_TYPES.ICON;

      if (isFormulaColumn || isAutoAgeColumn || isImageColumn) {
        if (isFormulaColumn) ignoredAppFormulaHeaders.push(column.label);
        return;
      }

      if (!writableAppColumns.has(label)) {
        writableAppColumns.set(label, index);
      }
    });

    const mappings = [];
    const ignoredSourceFormulaHeaders = [];

    importHeaders.forEach((header, sourceIndex) => {
      const normalizedHeader = normalizeHeaderLabel(header);
      if (!normalizedHeader) return;

      if (formulaSourceColumns.has(sourceIndex)) {
        ignoredSourceFormulaHeaders.push(header);
        return;
      }

      const targetIndex = writableAppColumns.get(normalizedHeader);
      if (Number.isInteger(targetIndex)) {
        mappings.push({
          sourceIndex,
          targetIndex,
          label: appColumns[targetIndex].label,
        });
      }
    });

    const existingRows = Array.from(tbody.querySelectorAll("tr"));
    const rowsByName = new Map();
    const blankRows = [];

    existingRows.forEach((row) => {
      const nameCell = row.children[appNameIndex]?.querySelector(
        ".cell, .name-cell"
      );
      const normalizedName = normalizePersonName(nameCell?.textContent || "");

      if (normalizedName) {
        if (!rowsByName.has(normalizedName)) {
          rowsByName.set(normalizedName, row);
        }
      } else {
        blankRows.push(row);
      }
    });

    let addedCount = 0;
    let updatedCount = 0;
    let skippedBlankNames = 0;
    const affectedRows = new Set();

    matrix.slice(1).forEach((importRow) => {
      if (!Array.isArray(importRow)) return;

      const importedName = String(importRow[importNameIndex] ?? "").trim();
      const normalizedName = normalizePersonName(importedName);
      if (!normalizedName) {
        skippedBlankNames += 1;
        return;
      }

      let row = rowsByName.get(normalizedName);
      if (!row) {
        row = blankRows.shift() || createBlankExcelImportRow(appColumns);
        rowsByName.set(normalizedName, row);
        addedCount += 1;
      } else {
        updatedCount += 1;
      }

      mappings.forEach(({ sourceIndex, targetIndex }) => {
        const value = importRow[sourceIndex];
        if (value === undefined || value === null) return;

        const textValue = String(value).trim();
        if (!textValue && sourceIndex !== importNameIndex) return;

        const cell = row.children[targetIndex]?.querySelector(
          ".cell, .name-cell"
        );
        if (!cell) return;

        cell.textContent = sourceIndex === importNameIndex
          ? importedName
          : String(value);
      });

      const nameCell = row.children[appNameIndex]?.querySelector(
        ".cell, .name-cell"
      );
      if (nameCell) {
        nameCell.textContent = importedName;
        handleNameInput({ target: nameCell });
      }

      affectedRows.add(row);
    });

    applyStickyColumns();
    syncFormulaColumnCells();
    recalculateFormulas();
    affectedRows.forEach((row) => {
      Array.from(row.querySelectorAll(".cell, .name-cell")).forEach(
        applyNumericStyling
      );
    });
    rebuildColumnSuggestionsFromTable();
    refreshScrollbars();
    saveTableState();

    return {
      addedCount,
      updatedCount,
      skippedBlankNames,
      matchedHeaders: Array.from(
        new Set(mappings.map((mapping) => mapping.label))
      ),
      ignoredSourceFormulaHeaders: Array.from(
        new Set(ignoredSourceFormulaHeaders)
      ),
      ignoredAppFormulaHeaders: Array.from(new Set(ignoredAppFormulaHeaders)),
    };
  }

  function mergeExcelFileIntoMain(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result);
        const workbook = XLSX.read(data, {
          type: "array",
          cellDates: true,
          cellFormula: true,
        });
        const firstSheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheet];

        if (!worksheet) {
          alert("Import failed: the Excel file has no sheets.");
          return;
        }

        const matrix = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          raw: false,
        });
        const result = mergeExcelMatrixIntoMain(matrix, worksheet);
        if (!result) return;

        const matched = result.matchedHeaders.length
          ? result.matchedHeaders.join(", ")
          : "Name only";

        const ignoredFormulaHeaders = Array.from(
          new Set([
            ...result.ignoredSourceFormulaHeaders,
            ...result.ignoredAppFormulaHeaders,
          ].filter(Boolean))
        );
        const formulaNote = ignoredFormulaHeaders.length
          ? ` Formula columns ignored: ${ignoredFormulaHeaders.join(", ")}.`
          : "";
        const blankNameNote = result.skippedBlankNames
          ? ` ${result.skippedBlankNames} row(s) with a blank Name were skipped.`
          : "";

        alert(
          `Excel import complete. ${result.updatedCount} existing row(s) updated, ` +
            `${result.addedCount} new row(s) added. Matched columns: ${matched}.` +
            formulaNote +
            blankNameNote
        );
      } catch (err) {
        console.error("Excel merge import failed", err);
        alert("Import failed: unable to read or merge the Excel file.");
      } finally {
        importFileInput.value = "";
      }
    };

    reader.readAsArrayBuffer(file);
  }

  function handleExcelMergeImport(event) {
    const file = event.target?.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");
    if (!isExcel) return;

    // Capture phase runs before the app's existing change handler. Stop only
    // Excel files here so JSON backup import and CSV import keep their existing
    // behavior unchanged.
    event.stopImmediatePropagation();
    mergeExcelFileIntoMain(file);
  }

  importFileInput.addEventListener("change", handleExcelMergeImport, true);

  /*
    Desktop reorder repair: headers rebuilt from saved state are wired before
    they are inserted into headerRow, so getHeaderIndex() returns -1 during
    attachHeaderEvents(). The original lock check treated -1 as locked and
    skipped the native drag listeners. Require a real non-negative index for
    locking, then add the missing drag listeners to the headers already loaded.
  */
  isLockedColumnIndex = function (index) {
    return (
      Number.isInteger(index) &&
      index >= 0 &&
      index < LOCKED_COLUMN_COUNT
    );
  };

  function attachMissingDesktopDragEvents(th) {
    const index = getHeaderIndex(th);
    if (
      isLockedColumnIndex(index) ||
      th.dataset.desktopDragRepairAttached === "true"
    ) {
      return;
    }

    th.draggable = true;

    th.addEventListener("dragstart", (event) => {
      const sourceIndex = getHeaderIndex(th);
      if (isLockedColumnIndex(sourceIndex)) {
        event.preventDefault();
        return;
      }

      dragSourceIndex = sourceIndex;
      isDraggingColumn = true;
      th.classList.add("dragging");
      event.dataTransfer.setData("text/plain", String(sourceIndex));
      event.dataTransfer.effectAllowed = "move";
    });

    th.addEventListener("dragenter", (event) => {
      event.preventDefault();
      th.classList.add("drag-over");
    });

    th.addEventListener("dragover", (event) => {
      event.preventDefault();
      th.classList.add("drag-over");
      event.dataTransfer.dropEffect = "move";
    });

    th.addEventListener("dragleave", () => {
      th.classList.remove("drag-over");
    });

    th.addEventListener("dragend", () => {
      isDraggingColumn = false;
      dragSourceIndex = null;
      clearHeaderDragState();
    });

    th.addEventListener("drop", (event) => {
      event.preventDefault();
      const targetIndex = getHeaderIndex(th);
      clearHeaderDragState();

      if (
        dragSourceIndex === null ||
        dragSourceIndex === targetIndex ||
        isLockedColumnIndex(targetIndex)
      ) {
        isDraggingColumn = false;
        dragSourceIndex = null;
        return;
      }

      reorderColumns(dragSourceIndex, targetIndex);
      isDraggingColumn = false;
      dragSourceIndex = null;
      saveTableState();
    });

    th.dataset.desktopDragRepairAttached = "true";
  }

  getHeaderCells().forEach(attachMissingDesktopDragEvents);
})();