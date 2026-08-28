(() => {
  function addRowAtTop(event) {
    event.preventDefault();
    event.stopImmediatePropagation();

    const columnDefinitions = getColumnDefinitions();
    const tr = document.createElement("tr");

    columnDefinitions.forEach((col) => {
      tr.appendChild(createCell(col.type, { formula: col.formula }));
    });

    tbody.insertBefore(tr, tbody.firstChild);
    applyColumnWidthsToRow(tr);
    applyStickyColumns();
    syncFormulaColumnCells();
    recalculateFormulas();
    saveTableState();
  }

  addRowBtn.addEventListener("click", addRowAtTop, true);
})();
