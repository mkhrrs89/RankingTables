(() => {
  const originalEvaluateFormula = evaluateFormula;

  function evaluateFormulaWithColumnLetters(formula, row) {
    if (!formula) return "";
    const normalized = formula.trim().replace(/^=/, "");
    if (!normalized) return "";

    const columns = getColumnDefinitions();
    const labelLookup = getColumnLabelLookup(columns);
    const labelPattern = buildColumnLabelPattern(labelLookup);

    const getReferencedValue = (rawLabel) => {
      const index = getColumnIndexByLabel(labelLookup, rawLabel);
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= columns.length
      ) {
        return null;
      }
      return getNumericCellValue(row, index);
    };

    // Aggregate functions use Excel-like blank handling. A genuinely blank or
    // non-numeric referenced cell is omitted from AVERAGE/AVG (and the other
    // aggregate helpers), while an explicit numeric 0 is still included.
    const getAggregateCellValue = (index) => {
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= columns.length
      ) {
        return null;
      }

      const cell = row.children[index]?.querySelector(".cell, .name-cell");
      if (!cell) return null;
      const text = cell.textContent.trim();
      if (!text) return null;
      const value = Number.parseFloat(text);
      return Number.isFinite(value) ? value : null;
    };

    const getAggregateReferencedValue = (rawLabel) => {
      const index = getColumnIndexByLabel(labelLookup, rawLabel);
      return getAggregateCellValue(index);
    };

    const getAggregateRangeValues = (range) => {
      const [startLabel, endLabel] = range
        .split(":")
        .map((part) => part.trim());
      const startIndex = getColumnIndexByLabel(labelLookup, startLabel);
      const endIndex = getColumnIndexByLabel(labelLookup, endLabel);
      if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex)) {
        return [];
      }

      const from = Math.min(startIndex, endIndex);
      const to = Math.max(startIndex, endIndex);
      const values = [];
      for (let index = from; index <= to; index += 1) {
        const value = getAggregateCellValue(index);
        if (value !== null) values.push(value);
      }
      return values;
    };

    const resolveArguments = (argsStr) =>
      argsStr
        .split(",")
        .flatMap((part) => {
          const trimmed = part.trim();
          if (!trimmed) return [];

          if (trimmed.includes(":")) {
            return getAggregateRangeValues(trimmed);
          }

          const referenced = getAggregateReferencedValue(trimmed);
          if (referenced !== null) return [referenced];

          const direct = Number.parseFloat(trimmed);
          return Number.isFinite(direct) ? [direct] : [];
        })
        .filter((value) => Number.isFinite(value));

    let expression = normalized.replace(
      /\b(SUM|AVERAGE|AVG|MIN|MAX)\s*\(([^()]*)\)/gi,
      (_match, fn, args) => {
        const values = resolveArguments(args);
        if (!values.length) return "0";

        switch (fn.toUpperCase()) {
          case "SUM":
            return String(values.reduce((a, b) => a + b, 0));
          case "AVERAGE":
          case "AVG":
            return String(values.reduce((a, b) => a + b, 0) / values.length);
          case "MIN":
            return String(Math.min(...values));
          case "MAX":
            return String(Math.max(...values));
          default:
            return "0";
        }
      }
    );

    // Preserve the existing ability to reference columns by their actual header
    // names before resolving bare Excel-style letters.
    if (labelPattern) {
      expression = expression.replace(labelPattern, (match) => {
        const value = getReferencedValue(match);
        return value === null ? match : String(value);
      });
    }

    // Resolve standalone Excel-style column letters anywhere in arithmetic.
    // Keep the existing non-aggregate behavior where a blank standalone cell is
    // treated as 0; the requested blank-skipping behavior applies to averages.
    expression = expression.replace(/\b([A-Za-z]+)\b/g, (match, letters) => {
      const index = columnLabelToIndex(letters);
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= columns.length
      ) {
        return match;
      }
      return String(getNumericCellValue(row, index));
    });

    if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
      return "ERR";
    }

    try {
      const result = Function('"use strict"; return (' + expression + ')')();
      if (!Number.isFinite(result)) return "";
      const rounded = Math.round(result * 100) / 100;
      return rounded.toFixed(2);
    } catch (err) {
      return "ERR";
    }
  }

  evaluateFormula = evaluateFormulaWithColumnLetters;

  // Refresh existing formula cells immediately so saved formulas begin using
  // the enhanced evaluator as soon as this helper loads.
  try {
    recalculateFormulas();
  } catch (err) {
    console.warn("Formula refresh failed; keeping the previous evaluator available.", err);
    evaluateFormula = originalEvaluateFormula;
  }
})();
