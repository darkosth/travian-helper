const dorf1Snapshot = (() => {
  /*
   * Convierte valores como:
   * "10.720", "−75" o textos con caracteres invisibles
   * en números normales de JavaScript.
   */
  const toNumber = (value) => {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const cleaned = String(value)
      .replace(/[\u202d\u202c\u200e\u200f\s.]/g, "")
      .replace(/−/g, "-");

    const match = cleaned.match(/-?\d+/);

    return match ? Number(match[0]) : null;
  };

  /*
   * Lee un número directamente desde un selector del DOM.
   */
  const readNumber = (selector) =>
    toNumber(document.querySelector(selector)?.textContent);

  /*
   * Decodifica entidades HTML.
   *
   * Ejemplo:
   * "&lt;span&gt;" -> "<span>"
   */
  const decodeHtml = (value) => {
    if (!value) return "";

    const textarea = document.createElement("textarea");

    textarea.innerHTML = String(value);

    return textarea.value;
  };

  /*
   * Normaliza cualquier formato posible de tooltip.
   */
  const normalizeTooltipContent = (content) => {
    if (!content) return "";

    if (typeof content === "string") {
      return decodeHtml(content);
    }

    if (content instanceof HTMLElement || content instanceof SVGElement) {
      return decodeHtml(content.outerHTML);
    }

    return decodeHtml(String(content));
  };

  /*
   * Busca el contenido del tooltip aunque Travian o Tippy
   * lo hayan movido a otro atributo después de cargar la página.
   */
  const getTooltipContent = (element) => {
    if (!element) return "";

    const possibleValues = [
      element.getAttribute("title"),

      element.getAttribute("data-tippy-content"),

      element.getAttribute("data-original-title"),

      element.getAttribute("aria-label"),

      element._tippy?.props?.content,
    ];

    const tooltip = possibleValues.find((value) => Boolean(value));

    return normalizeTooltipContent(tooltip);
  };

  /*
   * Extrae un objeto JSON completo que aparezca después
   * de un marcador dentro de un script embebido.
   */
  const extractJsonObjectAfterMarker = (text, marker) => {
    const markerIndex = text.indexOf(marker);

    if (markerIndex === -1) return null;

    const objectStart = text.indexOf("{", markerIndex + marker.length);

    if (objectStart === -1) return null;

    let depth = 0;
    let insideString = false;
    let escaped = false;

    for (let index = objectStart; index < text.length; index += 1) {
      const character = text[index];

      if (escaped) {
        escaped = false;

        continue;
      }

      if (character === "\\") {
        escaped = true;

        continue;
      }

      if (character === '"') {
        insideString = !insideString;

        continue;
      }

      if (insideString) continue;

      if (character === "{") {
        depth += 1;
      }

      if (character === "}") {
        depth -= 1;

        if (depth === 0) {
          try {
            return JSON.parse(text.slice(objectStart, index + 1));
          } catch {
            return null;
          }
        }
      }
    }

    return null;
  };

  /*
   * Busca el objeto viewData embebido por Travian.
   *
   * Contiene la aldea seleccionada, la lista de aldeas,
   * los datos del jugador y los puntos culturales.
   */
  const getEmbeddedViewData = () => {
    for (const script of [...document.scripts]) {
      const text = script.textContent ?? "";

      if (!text.includes("viewData")) continue;

      const parsed = extractJsonObjectAfterMarker(text, "viewData:");

      if (parsed) return parsed;
    }

    return null;
  };

  /*
   * Travian no siempre rellena ownPlayer.village.
   *
   * En esos casos intentamos reconstruir la aldea actual
   * desde el query param newdid, la lista de aldeas o
   * el elemento activo del selector lateral.
   */
  const getVillageIdFromUrl = () => {
    const currentUrl = new URL(window.location.href);

    return (
      toNumber(currentUrl.searchParams.get("newdid")) ??
      toNumber(currentUrl.searchParams.get("did")) ??
      toNumber(currentUrl.searchParams.get("villageId"))
    );
  };

  const getActiveVillageIdFromDom = () => {
    const selectors = [
      '[href*="newdid="].active',
      '.active [href*="newdid="]',
      '.listEntry.active[href*="newdid="]',
      '.listEntry.active a[href*="newdid="]',
      '#sidebarBoxVillagelist a[href*="newdid="].active',
      '#sidebarBoxVillagelist .active a[href*="newdid="]',
      '.villageList a[href*="newdid="].active',
      '.villageList .active a[href*="newdid="]',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const href =
        element?.getAttribute?.("href") ??
        element?.closest?.("a")?.getAttribute?.("href") ??
        null;

      if (!href) continue;

      const resolvedUrl = new URL(href, window.location.href);
      const villageId = toNumber(resolvedUrl.searchParams.get("newdid"));

      if (villageId !== null) {
        return villageId;
      }
    }

    return null;
  };

  const getVillageId = (village) => {
    if (!village) return null;

    return (
      village.id ??
      village.did ??
      village.villageId ??
      village.villageID ??
      null
    );
  };

  const resolveCurrentVillage = (player) => {
    if (player?.village) {
      return player.village;
    }

    const selectedVillageId =
      getVillageIdFromUrl() ?? getActiveVillageIdFromDom();

    if (selectedVillageId !== null && Array.isArray(player?.villageList)) {
      const matchedVillage = player.villageList.find(
        (candidate) => getVillageId(candidate) === selectedVillageId
      );

      if (matchedVillage) {
        return matchedVillage;
      }
    }

    if (Array.isArray(player?.villageList) && player.villageList.length > 0) {
      return player.villageList[0];
    }

    return null;
  };

  /*
   * Conserva únicamente los datos útiles de la aldea actual.
   *
   * Excluimos quickLinks porque es un objeto grande y
   * los edificios reales ya se leen desde /dorf2.php.
   */
  const createCurrentVillageSummary = (village) => {
    if (!village) return null;

    const villageId = getVillageId(village);

    if (villageId === null) return null;

    return {
      id: villageId,

      tribeId: village.tribeId ?? null,

      name: village.name ?? null,

      sortIndex: village.sortIndex ?? null,

      population: village.population ?? null,

      loyalty: village.loyalty ?? null,

      x: village.x ?? null,

      y: village.y ?? null,
    };
  };

  /*
   * Extrae un coste desde el tooltip utilizando
   * la clase del icono correspondiente al recurso.
   */
  const readTooltipValue = (container, resourceClass) => {
    const icon = container.querySelector(`i.${resourceClass}`);

    if (!icon) return null;

    return toNumber(
      icon.closest(".inlineIcon")?.querySelector(".value")?.textContent ??
        icon.nextElementSibling?.textContent ??
        icon.parentElement?.textContent
    );
  };

  /*
   * Extrae los costes y la duración del próximo nivel
   * de un campo exterior.
   */
  const parseFieldTooltip = (field) => {
    const container = document.createElement("div");

    container.innerHTML = getTooltipContent(field);

    const clockIcon = container.querySelector("i.clock_medium");

    const upgradeDuration =
      clockIcon
        ?.closest(".inlineIcon")
        ?.querySelector(".value")
        ?.textContent.trim() ??
      clockIcon?.nextElementSibling?.textContent.trim() ??
      null;

    return {
      nextLevelCosts: {
        wood: readTooltipValue(container, "r1Big"),

        clay: readTooltipValue(container, "r2Big"),

        iron: readTooltipValue(container, "r3Big"),

        crop: readTooltipValue(container, "r4Big"),
      },

      upgradeDuration,
    };
  };

  /*
   * Lee el estado visual que Travian representa
   * mediante las clases CSS del campo.
   *
   * "notAvailableNow" no supone automáticamente
   * que falten recursos, porque podría existir otra condición.
   */
  const getFieldUpgradeStatus = (field) => {
    const classes = field.classList;

    if (classes.contains("maxLevel")) return "maxLevel";

    if (classes.contains("good")) return "available";

    if (classes.contains("notNow")) return "notAvailableNow";

    return "unknown";
  };

  /*
   * Obtiene los recursos que Travian expone
   * directamente dentro de window.resources.
   */
  const resourceData =
    window.resources ??
    (typeof resources !== "undefined" ? resources : null);

  const resourcesSnapshot = {
    wood: {
      amount: resourceData?.storage?.l1 ?? null,

      productionPerHour: resourceData?.production?.l1 ?? null,

      capacity: resourceData?.maxStorage?.l1 ?? null,
    },

    clay: {
      amount: resourceData?.storage?.l2 ?? null,

      productionPerHour: resourceData?.production?.l2 ?? null,

      capacity: resourceData?.maxStorage?.l2 ?? null,
    },

    iron: {
      amount: resourceData?.storage?.l3 ?? null,

      productionPerHour: resourceData?.production?.l3 ?? null,

      capacity: resourceData?.maxStorage?.l3 ?? null,
    },

    crop: {
      amount: resourceData?.storage?.l4 ?? null,

      productionPerHour: resourceData?.production?.l4 ?? null,

      capacity: resourceData?.maxStorage?.l4 ?? null,
    },

    freeCrop: resourceData?.production?.l5 ?? null,
  };

  /*
   * Comprueba matemáticamente si la aldea dispone
   * de todos los recursos necesarios para una mejora.
   *
   * Este cálculo no depende únicamente de las clases CSS.
   */
  const canAffordUpgrade = (costs) => {
    const resourceKeys = ["wood", "clay", "iron", "crop"];

    const hasCompleteCosts = resourceKeys.every(
      (resourceKey) => costs[resourceKey] !== null
    );

    if (!hasCompleteCosts) return null;

    return resourceKeys.every(
      (resourceKey) =>
        resourcesSnapshot[resourceKey].amount !== null &&
        resourcesSnapshot[resourceKey].amount >= costs[resourceKey]
    );
  };

  const fieldTypes = {
    1: "wood",

    2: "clay",

    3: "iron",

    4: "crop",
  };

  const fieldNames = {
    1: "Leñador",

    2: "Barrera",

    3: "Mina de hierro",

    4: "Granja",
  };

  /*
   * Convierte los 18 campos exteriores en objetos limpios.
   */
  const resourceFields = [
    ...document.querySelectorAll(
      "#resourceFieldContainer a.resourceField[data-aid][data-gid]"
    ),
  ].map((field) => {
    const gid = Number(field.dataset.gid);

    const upgradeStatus = getFieldUpgradeStatus(field);

    const upgradeData = parseFieldTooltip(field);

    return {
      slot: Number(field.dataset.aid),

      gid,

      type: fieldTypes[gid] ?? "unknown",

      name: fieldNames[gid] ?? "Desconocido",

      /*
       * Usamos toNumber en lugar de Number(null).
       *
       * Así un fallo de lectura devuelve null y no un
       * falso nivel 0.
       */
      level: toNumber(field.className.match(/\blevel(\d+)\b/)?.[1]),

      isMaxLevel: upgradeStatus === "maxLevel",

      upgradeStatus,

      canAffordUpgrade:
        upgradeStatus === "maxLevel"
          ? null
          : canAffordUpgrade(upgradeData.nextLevelCosts),

      nextLevelCosts:
        upgradeStatus === "maxLevel"
          ? null
          : upgradeData.nextLevelCosts,

      upgradeDuration:
        upgradeStatus === "maxLevel"
          ? null
          : upgradeData.upgradeDuration,
    };
  });

  /*
   * Extrae las tropas visibles en la tabla de la aldea.
   */
  const troops = [...document.querySelectorAll("#troops tbody tr")]
    .map((row) => {
      const unitImage = row.querySelector("img.unit");

      const unitCode = [...(unitImage?.classList ?? [])].find((className) =>
        /^u\d+$/.test(className)
      );

      return {
        unit: row.querySelector("td.un")?.textContent.trim() ?? null,

        amount: toNumber(row.querySelector("td.num")?.textContent),

        code: unitCode ?? null,
      };
    })
    .filter((troop) => troop.unit || troop.amount !== null);

  const viewData = getEmbeddedViewData();

  const player = viewData?.ownPlayer ?? null;
  const currentVillage = resolveCurrentVillage(player);

  /*
   * Snapshot principal de la aldea.
   *
   * La información global de la cuenta vive únicamente aquí.
   * El script de /dorf2.php devuelve solamente el complemento
   * con los edificios del centro.
   */
  return {
    schemaVersion: 1,

    source: "dorf1",

    scrapedAt: new Date().toISOString(),

    page: {
      type: "resourceFields",

      path: window.location.pathname,

      url: window.location.href,
    },

    server: {
      timestamp: window.Travian?.Game?.timestamp ?? null,

      language: window.Travian?.Game?.language ?? null,

      timeZone: window.Travian?.Game?.timeZone ?? null,

      timezoneOffsetToUTC:
        window.Travian?.Game?.timezoneOffsetToUTC ?? null,
    },

    account: {
      currency: {
        gold: readNumber(".ajaxReplaceableGoldAmount"),

        silver: readNumber(".ajaxReplaceableSilverAmount"),
      },

      player: player
        ? {
            name: player.name ?? null,

            tribeId: player.tribeId ?? null,

            isSitter: player.isSitter ?? null,

            goldFeatures: player.goldFeatures ?? null,
          }
        : null,

      villages: player?.villageList ?? [],

      culturalPoints: player?.culturalPointsOverview ?? null,
    },

    village: {
      current: createCurrentVillageSummary(currentVillage),

      resources: resourcesSnapshot,

      troops,

      resourceFields,
    },

    diagnostics: {
      resourceFieldCount: resourceFields.length,

      troopTypeCount: troops.length,

      fieldsWithUnknownLevel: resourceFields
        .filter((field) => field.level === null)
        .map((field) => field.slot),

      fieldsWithMissingCosts: resourceFields
        .filter(
          (field) =>
            !field.isMaxLevel &&
            Object.values(field.nextLevelCosts ?? {}).some(
              (cost) => cost === null
            )
        )
        .map((field) => field.slot),

      fieldsWithUnknownUpgradeStatus: resourceFields
        .filter((field) => field.upgradeStatus === "unknown")
        .map((field) => field.slot),
    },
  };
})();

console.log("=== DORF1 SNAPSHOT ===");

console.log(dorf1Snapshot);

console.log("=== DORF1 JSON PARA COPIAR ===");

console.log(JSON.stringify(dorf1Snapshot, null, 2));

dorf1Snapshot;
