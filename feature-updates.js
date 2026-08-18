(() => {
  const BIRTHDAY_LABEL = "birthday";
  const NEW_RANKING_CATEGORIES = [
    { key: "eyes", label: "Eyes" },
    { key: "smile", label: "Smile" },
    { key: "lips", label: "Lips" },
    { key: "cute", label: "Cute" },
  ];

  function padDatePart(value) {
    return String(value).padStart(2, "0");
  }

  function datePartsToIso(year, month, day) {
    let numericYear = Number(year);
    const numericMonth = Number(month);
    const numericDay = Number(day);
    if (
      !Number.isInteger(numericYear) ||
      !Number.isInteger(numericMonth) ||
      !Number.isInteger(numericDay)
    ) {
      return null;
    }

    if (numericYear >= 0 && numericYear < 100) {
      const currentTwoDigitYear = new Date().getFullYear() % 100;
      numericYear += numericYear <= currentTwoDigitYear ? 2000 : 1900;
    }

    if (numericYear < 1 || numericMonth < 1 || numericMonth > 12) return null;
    const daysInMonth = new Date(numericYear, numericMonth, 0).getDate();
    if (numericDay < 1 || numericDay > daysInMonth) return null;

    return `${numericYear}-${padDatePart(numericMonth)}-${padDatePart(numericDay)}`;
  }

  function parseBirthdayInput(rawValue) {
    const value = String(rawValue || "").trim();
    if (!value) return null;

    let match = /^(\d{4})[\-/.](\d{1,2})[\-/.](\d{1,2})$/.exec(value);
    if (match) return datePartsToIso(match[1], match[2], match[3]);

    match = /^(\d{1,2})[\-/.](\d{1,2})[\-/.](\d{2}|\d{4})$/.exec(value);
    if (match) return datePartsToIso(match[3], match[1], match[2]);

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return datePartsToIso(
      parsed.getFullYear(),
      parsed.getMonth() + 1,
      parsed.getDate()
    );
  }

  const previousUpdateAgeColumns = updateAgeColumns;

  function updateAgeColumnsWithBirthday(columns = getColumnDefinitions()) {
    const birthdayColumnIndex = findColumnIndexByLabel(columns, BIRTHDAY_LABEL);
    if (birthdayColumnIndex === -1) {
      return previousUpdateAgeColumns(columns);
    }

    const nameColumnIndex = findColumnIndexByLabel(columns, NAME_LABEL);
    const ageColumnIndices = getAgeColumnIndices(columns);
    if (!ageColumnIndices.length) return;

    Array.from(tbody.querySelectorAll("tr")).forEach((row) => {
      const personName =
        nameColumnIndex >= 0
          ? row.children[nameColumnIndex]
              ?.querySelector(".cell, .name-cell")
              ?.textContent.trim() || ""
          : "";
      const birthdayText =
        row.children[birthdayColumnIndex]
          ?.querySelector(".cell, .name-cell")
          ?.textContent.trim() || "";

      ageColumnIndices.forEach((ageIndex) => {
        const ageCell = row.children[ageIndex]?.querySelector(
          ".cell, .name-cell"
        );
        if (!ageCell) return;

        const token = Symbol("birthdayAwareAge");
        ageRequestTokens.set(ageCell, token);

        // A Birthday value is authoritative for this row. If it is invalid,
        // leave Age blank rather than silently using a different web result.
        if (birthdayText) {
          const birthdayIso = parseBirthdayInput(birthdayText);
          const age = birthdayIso ? computeAgeFromDates(birthdayIso) : null;
          ageCell.textContent = Number.isFinite(age) ? String(age) : "";
          applyNumericStyling(ageCell);
          return;
        }

        // With no Birthday entered, preserve the existing public-data lookup.
        if (!personName) {
          ageCell.textContent = "";
          applyNumericStyling(ageCell);
          return;
        }

        ageCell.textContent = "…";
        applyNumericStyling(ageCell);

        Promise.resolve(resolvePersonDates(personName)).then((record) => {
          if (ageRequestTokens.get(ageCell) !== token) return;
          if (!record?.birth) {
            ageCell.textContent = "";
            applyNumericStyling(ageCell);
            return;
          }

          const age = computeAgeFromDates(
            record.birth,
            record.death || undefined
          );
          ageCell.textContent = Number.isFinite(age) ? String(age) : "";
          applyNumericStyling(ageCell);
        });
      });
    });
  }

  updateAgeColumns = updateAgeColumnsWithBirthday;

  // The existing Age helper has its own Name/header observers. Schedule this
  // Birthday-aware pass just after those so a manual Birthday remains the final
  // authority even when a Name edit also triggers the older refresh path.
  let birthdayRefreshTimer = null;
  function queueBirthdayAwareRefresh(delay = 260) {
    if (birthdayRefreshTimer !== null) {
      clearTimeout(birthdayRefreshTimer);
    }
    birthdayRefreshTimer = window.setTimeout(() => {
      birthdayRefreshTimer = null;
      updateAgeColumnsWithBirthday();
    }, delay);
  }

  tbody.addEventListener("input", (event) => {
    const cell = event.target.closest?.(".cell, .name-cell");
    const td = cell?.closest?.("td");
    if (!td) return;

    const columns = getColumnDefinitions();
    const nameIndex = findColumnIndexByLabel(columns, NAME_LABEL);
    const birthdayIndex = findColumnIndexByLabel(columns, BIRTHDAY_LABEL);
    if (td.cellIndex === birthdayIndex) {
      queueBirthdayAwareRefresh(0);
    } else if (td.cellIndex === nameIndex) {
      queueBirthdayAwareRefresh(260);
    }
  });

  const birthdayHeaderObserver = new MutationObserver(() =>
    queueBirthdayAwareRefresh(100)
  );
  birthdayHeaderObserver.observe(headerRow, { childList: true });

  const birthdayRowObserver = new MutationObserver(() =>
    queueBirthdayAwareRefresh(100)
  );
  birthdayRowObserver.observe(tbody, { childList: true });

  // Natural, case-insensitive sorting keeps the autocomplete list predictable:
  // Apple before Banana, and Item 2 before Item 10.
  const previousGetSuggestionsForColumn = getSuggestionsForColumn;
  getSuggestionsForColumn = function (colIndex, currentValue = "") {
    return previousGetSuggestionsForColumn(colIndex, currentValue)
      .slice()
      .sort((a, b) =>
        String(a).localeCompare(String(b), undefined, {
          sensitivity: "base",
          numeric: true,
        })
      );
  };

  const newRankingControllers = new Map();

  function createRankingTab(category) {
    if (document.querySelector(`.tab-button[data-tab="${category.key}"]`)) {
      return;
    }

    const tabs = document.querySelector(".tabs");
    const app = document.querySelector(".app");
    if (!tabs || !app) return;

    const tabId = `${category.key}Tab`;
    const panelId = `${category.key}Panel`;
    const rankingsId = `${category.key}Rankings`;

    const button = document.createElement("button");
    button.className = "tab-button";
    button.type = "button";
    button.role = "tab";
    button.id = tabId;
    button.setAttribute("aria-selected", "false");
    button.setAttribute("aria-controls", panelId);
    button.dataset.tab = category.key;
    button.textContent = category.label;
    button.tabIndex = -1;

    const panel = document.createElement("section");
    panel.className = "tab-panel rankings-panel";
    panel.id = panelId;
    panel.role = "tabpanel";
    panel.setAttribute("aria-labelledby", tabId);
    panel.dataset.panel = category.key;
    panel.hidden = true;

    const heading = document.createElement("div");
    heading.className = "rankings-heading";
    const headingCopy = document.createElement("div");
    const title = document.createElement("div");
    title.className = "rankings-title";
    title.textContent = `${category.label} Power Rankings`;
    const subtitle = document.createElement("div");
    subtitle.className = "rankings-subtitle";
    subtitle.textContent =
      `Top 20 from Main, ranked automatically by the ${category.label} column.`;
    headingCopy.append(title, subtitle);
    heading.appendChild(headingCopy);

    const rankings = document.createElement("div");
    rankings.className = "ranking-list";
    rankings.id = rankingsId;
    rankings.setAttribute("aria-live", "polite");
    panel.append(heading, rankings);

    tabs.appendChild(button);
    app.appendChild(panel);

    // The original app stores these node lists as mutable arrays. Add the new
    // entries so activateTab(), backup active-tab restore, and panel hiding all
    // continue to use the same existing mechanism.
    tabButtons.push(button);
    tabPanels.push(panel);

    const controller = createCategoryRankingsController(
      rankings,
      category.key,
      category.label
    );
    newRankingControllers.set(category.key, controller);

    button.addEventListener("click", () => activateTab(category.key));
  }

  NEW_RANKING_CATEGORIES.forEach(createRankingTab);

  const previousActivateTab = activateTab;
  activateTab = function (tabName) {
    previousActivateTab(tabName);
    newRankingControllers.get(tabName)?.queueRender();
  };

  const previousQueueAllRankingsRender = queueAllRankingsRender;
  queueAllRankingsRender = function () {
    previousQueueAllRankingsRender();
    newRankingControllers.forEach((controller) => controller.queueRender());
  };

  // Include the added categories when reconstructing image metadata from older
  // backup records that have a key but no explicit category field.
  const previousInferImageCategoryFromKey = inferImageCategoryFromKey;
  inferImageCategoryFromKey = function (key) {
    const prefix = String(key || "").split(":", 1)[0];
    if (NEW_RANKING_CATEGORIES.some((category) => category.key === prefix)) {
      return prefix;
    }
    return previousInferImageCategoryFromKey(key);
  };

  const previousInferImageNameFromKey = inferImageNameFromKey;
  inferImageNameFromKey = function (key) {
    const prefix = String(key || "").split(":", 1)[0];
    if (NEW_RANKING_CATEGORIES.some((category) => category.key === prefix)) {
      return String(key || "").slice(prefix.length + 1);
    }
    return previousInferImageNameFromKey(key);
  };

  queueAllRankingsRender();
  queueBirthdayAwareRefresh(0);
})();
