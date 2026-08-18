(() => {
  const AGE_CACHE_KEY = "ranking-tables-age-cache-v3";
  const PREVIOUS_AGE_CACHE_KEYS = ["ranking-tables-age-cache-v2"];
  const ageLookupCache = new Map();
  let persistedAgeCache = {};

  // Older Age versions could cache the birthday of a different person who
  // happened to share the typed name. Do not reuse those identity-unsafe rows.
  try {
    PREVIOUS_AGE_CACHE_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch (err) {
    // A cache cleanup failure must never prevent the table from loading.
  }

  try {
    persistedAgeCache = JSON.parse(localStorage.getItem(AGE_CACHE_KEY) || "{}") || {};
  } catch (err) {
    persistedAgeCache = {};
  }

  function savePersistedAgeRecord(name, record) {
    if (!record?.birth) return;
    const key = normalizePersonName(name);
    if (!key) return;
    persistedAgeCache[key] = {
      birth: record.birth,
      death: record.death || null,
      entityId: record.entityId || null,
      sourceTitle: record.sourceTitle || null,
    };
    try {
      localStorage.setItem(AGE_CACHE_KEY, JSON.stringify(persistedAgeCache));
    } catch (err) {
      // The app already has a localStorage fallback; an age-cache write failure
      // should never prevent the table itself from working.
    }
  }

  function getPersistedAgeRecord(name) {
    const key = normalizePersonName(name);
    const record = key ? persistedAgeCache[key] : null;
    return record?.birth ? record : null;
  }

  function normalizeIdentityText(value) {
    return String(value || "")
      .replace(/_/g, " ")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function wikipediaTitleMatchesName(title, name) {
    const normalizedTitle = normalizeIdentityText(title);
    const normalizedName = normalizeIdentityText(name);
    if (!normalizedTitle || !normalizedName) return false;
    return (
      normalizedTitle === normalizedName ||
      normalizedTitle.startsWith(`${normalizedName} (`)
    );
  }

  function bestClaim(claims) {
    if (!Array.isArray(claims)) return null;
    return (
      claims.find((claim) => claim?.rank === "preferred") ||
      claims.find((claim) => claim?.rank !== "deprecated") ||
      null
    );
  }

  function datesFromEntity(entity, metadata = {}) {
    if (!entity || entity.missing !== undefined) return null;

    const instanceClaims = entity?.claims?.P31 || [];
    const isHuman = instanceClaims.some((claim) => {
      const id = claim?.mainsnak?.datavalue?.value?.id;
      return typeof id === "string" && id.toUpperCase() === "Q5";
    });
    if (!isHuman) return null;

    const birth = extractWikidataDate(bestClaim(entity?.claims?.P569));
    if (!birth) return null;
    const death = extractWikidataDate(bestClaim(entity?.claims?.P570));
    return {
      birth,
      death: death || null,
      entityId: metadata.entityId || entity.id || null,
      sourceTitle: metadata.sourceTitle || entity?.sitelinks?.enwiki?.title || null,
    };
  }

  function entityHasStrongEnglishNameMatch(entity, name) {
    const requested = normalizeIdentityText(name);
    if (!requested) return false;

    const enwikiTitle = entity?.sitelinks?.enwiki?.title || "";
    if (!enwikiTitle || !wikipediaTitleMatchesName(enwikiTitle, name)) {
      return false;
    }

    const label = entity?.labels?.en?.value || "";
    const aliases = (entity?.aliases?.en || [])
      .map((alias) => alias?.value || "")
      .filter(Boolean);
    const exactNameMatch = [label, ...aliases].some(
      (candidate) => normalizeIdentityText(candidate) === requested
    );

    // An exact English Wikipedia title is strong enough on its own. A
    // disambiguated title such as "Jane Doe (model)" additionally needs the
    // entity label/alias to exactly match the typed name.
    return (
      normalizeIdentityText(enwikiTitle) === requested ||
      exactNameMatch
    );
  }

  function fetchWithTimeout(url, timeoutMs = 5000) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = window.setTimeout(() => controller?.abort(), timeoutMs);

    return fetch(url, {
      credentials: "omit",
      signal: controller?.signal,
    }).finally(() => clearTimeout(timer));
  }

  function mediaWikiJsonp(apiUrl, params, timeoutMs = 7500) {
    return new Promise((resolve, reject) => {
      const callbackName =
        `__rankingTablesAge_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const query = new URLSearchParams({
        ...params,
        format: "json",
        callback: callbackName,
      });
      const script = document.createElement("script");
      let settled = false;

      const cleanup = () => {
        script.remove();
        try {
          delete window[callbackName];
        } catch (err) {
          window[callbackName] = undefined;
        }
      };

      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        fn(value);
      };

      const timer = window.setTimeout(
        () => finish(reject, new Error("Wikimedia lookup timed out.")),
        timeoutMs
      );

      window[callbackName] = (data) => finish(resolve, data);
      script.onerror = () =>
        finish(reject, new Error("Wikimedia JSONP lookup failed."));
      script.src = `${apiUrl}?${query.toString()}`;
      document.head.appendChild(script);
    });
  }

  function firstSuccessful(promises) {
    return new Promise((resolve, reject) => {
      let failures = 0;
      let lastError = null;
      let settled = false;

      promises.forEach((promise) => {
        Promise.resolve(promise).then(
          (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
          },
          (error) => {
            failures += 1;
            lastError = error;
            if (!settled && failures === promises.length) {
              settled = true;
              reject(lastError || new Error("Wikimedia lookup failed."));
            }
          }
        );
      });
    });
  }

  async function mediaWikiRequest(apiUrl, params) {
    const fetchParams = new URLSearchParams({
      ...params,
      format: "json",
      origin: "*",
    });
    const fetchRequest = fetchWithTimeout(
      `${apiUrl}?${fetchParams.toString()}`,
      5000
    ).then((response) => {
      if (!response.ok) throw new Error(`Wikimedia request failed (${response.status}).`);
      return response.json();
    });

    // Run JSONP alongside fetch. It does not depend on CORS/connect-src in the
    // same way as fetch, so static/mobile hosts have a second path to the data.
    const jsonpRequest = mediaWikiJsonp(apiUrl, params, 7500);
    return firstSuccessful([fetchRequest, jsonpRequest]);
  }

  async function getExactWikipediaCandidate(name) {
    const json = await mediaWikiRequest("https://en.wikipedia.org/w/api.php", {
      action: "query",
      titles: name,
      redirects: "1",
      prop: "pageprops",
    });

    const pages = Object.values(json?.query?.pages || {});
    const page = pages.find((entry) => entry && entry.missing === undefined);
    if (!page) {
      return { found: false, id: null, title: null };
    }

    const id = page?.pageprops?.wikibase_item;
    return {
      found: true,
      id: typeof id === "string" && /^Q\d+$/i.test(id) ? id : null,
      title: page?.title || name,
    };
  }

  async function searchWikidataCandidates(name) {
    const json = await mediaWikiRequest("https://www.wikidata.org/w/api.php", {
      action: "wbsearchentities",
      search: name,
      language: "en",
      uselang: "en",
      type: "item",
      limit: "12",
    });

    return (json?.search || [])
      .map((item) => ({
        id: item?.id,
        label: item?.label || "",
        description: item?.description || "",
      }))
      .filter((item) => typeof item.id === "string" && /^Q\d+$/i.test(item.id));
  }

  async function fetchWikidataEntities(ids) {
    if (!ids.length) return {};
    const json = await mediaWikiRequest("https://www.wikidata.org/w/api.php", {
      action: "wbgetentities",
      ids: ids.join("|"),
      props: "claims|labels|aliases|sitelinks",
      languages: "en",
      sitefilter: "enwiki",
    });
    return json?.entities || {};
  }

  async function searchWikipediaCandidates(name) {
    const json = await mediaWikiRequest("https://en.wikipedia.org/w/api.php", {
      action: "query",
      generator: "search",
      gsrsearch: name,
      gsrnamespace: "0",
      gsrlimit: "10",
      prop: "pageprops",
      redirects: "1",
    });

    return Object.values(json?.query?.pages || {})
      .map((page) => ({
        id: page?.pageprops?.wikibase_item,
        title: page?.title || "",
      }))
      .filter(
        (candidate) =>
          typeof candidate.id === "string" &&
          /^Q\d+$/i.test(candidate.id) &&
          wikipediaTitleMatchesName(candidate.title, name)
      );
  }

  function chooseSingleStrongRecord(candidates, entities, name) {
    const records = [];

    candidates.forEach((candidate) => {
      const entity = entities[candidate.id];
      if (!entity || !entityHasStrongEnglishNameMatch(entity, name)) return;
      const record = datesFromEntity(entity, {
        entityId: candidate.id,
        sourceTitle: entity?.sitelinks?.enwiki?.title || candidate.title || null,
      });
      if (record) records.push(record);
    });

    // If more than one distinct person still survives the strict checks, the
    // name is genuinely ambiguous. A blank Age is safer than a confident error.
    return records.length === 1 ? records[0] : null;
  }

  async function lookupPublicPersonDates(name) {
    // First choice: the exact English Wikipedia page for the typed name. This
    // avoids a Wikidata search result for an older namesake outranking the
    // current public figure the user actually meant.
    try {
      const exact = await getExactWikipediaCandidate(name);
      if (exact.found) {
        if (!exact.id) return null;
        const entities = await fetchWikidataEntities([exact.id]);
        const entity = entities[exact.id];
        if (!entity) return null;

        const record = datesFromEntity(entity, {
          entityId: exact.id,
          sourceTitle: exact.title,
        });

        // If an exact page exists but has no usable birthday, stop here rather
        // than silently switching to a different person with the same name.
        return record || null;
      }
    } catch (err) {
      console.warn("Exact Wikipedia age lookup failed for", name, err);
    }

    // Next, allow a single strongly matching English Wikipedia result, such as
    // a disambiguated "Name (model)" page. Multiple surviving people => blank.
    try {
      const wikipediaCandidates = await searchWikipediaCandidates(name);
      if (wikipediaCandidates.length) {
        const ids = wikipediaCandidates.map((candidate) => candidate.id);
        const entities = await fetchWikidataEntities(ids);
        const record = chooseSingleStrongRecord(
          wikipediaCandidates,
          entities,
          name
        );
        if (record) return record;
        if (wikipediaCandidates.length > 1) return null;
      }
    } catch (err) {
      console.warn("Wikipedia age search failed for", name, err);
    }

    // Final fallback: Wikidata search, but only accept an entity whose English
    // Wikipedia sitelink and label/alias strongly match the typed name. Do not
    // take the first human result merely because it has a birthday.
    try {
      const wikidataCandidates = await searchWikidataCandidates(name);
      if (!wikidataCandidates.length) return null;
      const ids = wikidataCandidates.map((candidate) => candidate.id);
      const entities = await fetchWikidataEntities(ids);
      return chooseSingleStrongRecord(wikidataCandidates, entities, name);
    } catch (err) {
      console.warn("Wikidata age fallback failed for", name, err);
      return null;
    }
  }

  async function resolveAgeRecord(rawName) {
    const normalized = normalizePersonName(rawName);
    if (!normalized) return null;

    const localRecord = LOCAL_BIRTHDAY_DB[normalized];
    if (localRecord?.birth) return localRecord;

    const persisted = getPersistedAgeRecord(rawName);
    if (persisted) return persisted;

    if (ageLookupCache.has(normalized)) {
      return await Promise.resolve(ageLookupCache.get(normalized));
    }

    const lookup = lookupPublicPersonDates(rawName)
      .then((record) => {
        if (record?.birth) {
          savePersistedAgeRecord(rawName, record);
          ageLookupCache.set(normalized, record);
        } else {
          ageLookupCache.delete(normalized);
        }
        return record;
      })
      .catch((err) => {
        ageLookupCache.delete(normalized);
        console.warn("Age lookup failed for", rawName, err);
        return null;
      });

    ageLookupCache.set(normalized, lookup);
    return await lookup;
  }

  function ageInWholeYears(birthDateString, referenceDateString) {
    const parse = (value) => {
      const match = /^(-?\d{1,6})-(\d{2})-(\d{2})$/.exec(value || "");
      if (!match) return null;
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (
        !Number.isFinite(year) ||
        !Number.isFinite(month) ||
        !Number.isFinite(day) ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31
      ) {
        return null;
      }
      return { year, month, day };
    };

    const birth = parse(birthDateString);
    if (!birth) return null;

    let reference = referenceDateString ? parse(referenceDateString) : null;
    if (!reference) {
      const today = new Date();
      reference = {
        year: today.getFullYear(),
        month: today.getMonth() + 1,
        day: today.getDate(),
      };
    }

    let age = reference.year - birth.year;
    if (
      reference.month < birth.month ||
      (reference.month === birth.month && reference.day < birth.day)
    ) {
      age -= 1;
    }

    return Number.isFinite(age) && age >= 0 ? age : null;
  }

  function refreshAgeColumns(columns = getColumnDefinitions()) {
    const nameColumnIndex = findColumnIndexByLabel(columns, NAME_LABEL);
    const ageColumnIndices = getAgeColumnIndices(columns);
    if (nameColumnIndex === -1 || !ageColumnIndices.length) return;

    Array.from(tbody.querySelectorAll("tr")).forEach((row) => {
      const nameCell = row.children[nameColumnIndex]?.querySelector(
        ".cell, .name-cell"
      );
      const personName = nameCell?.textContent.trim() || "";

      ageColumnIndices.forEach((ageIndex) => {
        const ageCell = row.children[ageIndex]?.querySelector(
          ".cell, .name-cell"
        );
        if (!ageCell) return;

        const token = Symbol("ageV3");
        ageRequestTokens.set(ageCell, token);

        if (!personName) {
          ageCell.textContent = "";
          applyNumericStyling(ageCell);
          return;
        }

        const localRecord = LOCAL_BIRTHDAY_DB[normalizePersonName(personName)];
        const cachedRecord = localRecord?.birth
          ? localRecord
          : getPersistedAgeRecord(personName);

        if (cachedRecord?.birth) {
          const age = ageInWholeYears(
            cachedRecord.birth,
            cachedRecord.death || undefined
          );
          ageCell.textContent = Number.isFinite(age) ? String(age) : "";
          applyNumericStyling(ageCell);
        } else {
          ageCell.textContent = "…";
          applyNumericStyling(ageCell);
        }

        resolveAgeRecord(personName).then((record) => {
          if (ageRequestTokens.get(ageCell) !== token) return;

          if (!record?.birth) {
            ageCell.textContent = "";
            applyNumericStyling(ageCell);
            return;
          }

          const age = ageInWholeYears(record.birth, record.death || undefined);
          ageCell.textContent = Number.isFinite(age) ? String(age) : "";
          applyNumericStyling(ageCell);
        });
      });
    });
  }

  let refreshTimer = null;
  function queueAgeRefresh(delay = 60) {
    if (refreshTimer !== null) clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      refreshAgeColumns();
    }, delay);
  }

  // Replace only the Age bindings. Existing formula recalculation, imports,
  // desktop reorder, and mobile reorder can continue calling updateAgeColumns.
  birthdayCache.clear();
  updateAgeColumns = refreshAgeColumns;
  resolvePersonDates = resolveAgeRecord;
  computeAgeFromDates = ageInWholeYears;
  fetchBirthdayFromWikidata = lookupPublicPersonDates;

  tbody.addEventListener("input", (event) => {
    const cell = event.target.closest?.(".cell, .name-cell");
    const td = cell?.closest?.("td");
    if (!td) return;
    const columns = getColumnDefinitions();
    const nameIndex = findColumnIndexByLabel(columns, NAME_LABEL);
    if (td.cellIndex === nameIndex) queueAgeRefresh(180);
  });

  const headerObserver = new MutationObserver(() => queueAgeRefresh(40));
  headerObserver.observe(headerRow, { childList: true });

  // New rows can be added without a header mutation. Watch only direct tbody
  // children so changing the Age cell text itself cannot create a refresh loop.
  const rowObserver = new MutationObserver(() => queueAgeRefresh(40));
  rowObserver.observe(tbody, { childList: true });

  document.documentElement.dataset.ageEngine = "v3";
  queueAgeRefresh(0);
})();