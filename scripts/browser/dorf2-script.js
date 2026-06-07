const dorf2Snapshot = (() => {
  /*
   * Convierte valores como "10.720", "−75" o textos con
   * caracteres invisibles en números normales de JavaScript.
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
   * Convierte cualquier formato de tooltip en texto HTML.
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
   * Busca viewData únicamente para identificar la aldea.
   *
   * No devuelve la lista completa de aldeas porque esa
   * información ya existe en el snapshot de /dorf1.php.
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
   * Crea una referencia pequeña para poder unir este snapshot
   * con el resultado correspondiente de /dorf1.php.
   */
  const createVillageRef = (village) => {
    if (!village) return null;

    const villageId = getVillageId(village);

    if (villageId === null) return null;

    return {
      id: villageId,

      name: village.name ?? null,

      x:
        village.x ??
        village.coordinates?.x ??
        village.coordinateX ??
        null,

      y:
        village.y ??
        village.coordinates?.y ??
        village.coordinateY ??
        null,
    };
  };

  const getText = (value) =>
    (value || "").replace(/\s+/g, " ").trim();

  const parseConstructionQueueItem = (item) => {
    const nameNode = item.querySelector(".name");
    const itemText = getText(item.textContent);
    const nameText = getText(nameNode?.textContent || itemText);
    const targetLevel =
      toNumber(
        nameNode?.querySelector(".lvl")?.textContent ||
          itemText.match(/Nivel\s+(\d+)/i)?.[1]
      );
    const remainingTime = getText(
      item.querySelector(".timer")?.textContent
    ) || null;
    const finishTime =
      itemText.match(/Listo a las\s+([0-9]{1,2}:[0-9]{2})/i)?.[1] ||
      null;

    return {
      slot: null,

      kind: null,

      name: nameText.replace(/\s*Nivel\s+\d+\s*$/i, "") || "Construcción",

      currentLevel:
        targetLevel !== null ? Math.max(targetLevel - 1, 0) : null,

      targetLevel,

      remainingTime,

      finishTime,
    };
  };

  /*
   * Busca todos los posibles tooltips dentro de un edificio.
   *
   * Esto es importante para construcciones especiales como
   * la empalizada, que Travian puede dibujar mediante SVG.
   */
  const getTooltipCandidates = (buildingSlot) => {
    const elements = [
      buildingSlot,
      ...buildingSlot.querySelectorAll("*"),
    ];

    const possibleValues = [];

    for (const element of elements) {
      possibleValues.push(
        element.getAttribute?.("title"),
        element.getAttribute?.("data-tippy-content"),
        element.getAttribute?.("data-original-title"),
        element.getAttribute?.("aria-label"),
        element._tippy?.props?.content
      );

      /*
       * En SVG, el contenido útil puede estar dentro
       * del texto de un nodo <title>.
       */
      if (element.tagName?.toLowerCase() === "title") {
        possibleValues.push(element.textContent);
      }
    }

    return [
      ...new Set(
        possibleValues
          .map(normalizeTooltipContent)
          .filter(Boolean)
      ),
    ];
  };

  /*
   * Extrae un número desde un tooltip utilizando
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
   * Analiza un tooltip y recupera los costes y la duración.
   */
  const parseTooltipContent = (tooltipContent) => {
    const container = document.createElement("div");
    container.innerHTML = tooltipContent;

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
   * Calcula cuánta información útil recuperamos de un tooltip.
   *
   * Esto permite elegir el tooltip más completo cuando
   * existen varias capas para el mismo edificio.
   */
  const calculateTooltipScore = (upgradeData) => {
    const recoveredCosts = Object.values(
      upgradeData.nextLevelCosts
    ).filter((value) => value !== null).length;

    const hasDuration = upgradeData.upgradeDuration !== null;

    return recoveredCosts * 10 + (hasDuration ? 1 : 0);
  };

  /*
   * Prueba todos los posibles tooltips de un edificio
   * y conserva el que contenga más información.
   */
  const getBestUpgradeData = (buildingSlot) => {
    const tooltipCandidates = getTooltipCandidates(buildingSlot);

    let bestUpgradeData = {
      nextLevelCosts: {
        wood: null,
        clay: null,
        iron: null,
        crop: null,
      },

      upgradeDuration: null,
    };

    let bestScore = 0;

    for (const tooltipContent of tooltipCandidates) {
      const upgradeData = parseTooltipContent(tooltipContent);

      const score = calculateTooltipScore(upgradeData);

      if (score > bestScore) {
        bestUpgradeData = upgradeData;
        bestScore = score;
      }
    }

    return {
      ...bestUpgradeData,

      tooltipCandidateCount: tooltipCandidates.length,

      tooltipScore: bestScore,
    };
  };

  /*
   * Lee el estado visual exacto indicado por Travian.
   *
   * "notAvailableNow" no presupone automáticamente
   * que el único problema sea la falta de recursos.
   */
  const getUpgradeStatus = (buildingSlot) => {
    const gid = Number(buildingSlot.dataset.gid);

    const levelElement = buildingSlot.querySelector("a.level");

    const classes = levelElement?.classList;

    if (gid === 0) return "empty";

    if (classes?.contains("underConstruction")) return "underConstruction";

    if (classes?.contains("maxLevel")) return "maxLevel";

    if (classes?.contains("good")) return "available";

    if (classes?.contains("notNow")) return "notAvailableNow";

    return "unknown";
  };

  /*
   * Convierte un solar en un objeto limpio.
   */
  const parseBuilding = (buildingSlot) => {
    const gid = Number(buildingSlot.dataset.gid);

    const levelElement = buildingSlot.querySelector("a.level");

    const isEmpty = gid === 0;

    const upgradeStatus = getUpgradeStatus(buildingSlot);

    const upgradeData = getBestUpgradeData(buildingSlot);

    return {
      slot: Number(buildingSlot.dataset.aid),

      buildingId: toNumber(buildingSlot.dataset.buildingId),

      gid,

      name: buildingSlot.dataset.name || "Solar",

      level: toNumber(
        levelElement?.dataset.level ??
          levelElement?.querySelector(".labelLayer")?.textContent
      ),

      isEmpty,

      isMaxLevel: upgradeStatus === "maxLevel",

      canStartUpgradeNow:
        upgradeStatus === "available"
          ? true
          : upgradeStatus === "notAvailableNow" ||
              upgradeStatus === "underConstruction"
            ? false
            : null,

      upgradeStatus,

      nextLevelCosts:
        isEmpty || upgradeStatus === "maxLevel"
          ? null
          : upgradeData.nextLevelCosts,

      upgradeDuration:
        isEmpty || upgradeStatus === "maxLevel"
          ? null
          : upgradeData.upgradeDuration,

      href:
        levelElement?.getAttribute("href") ||
        buildingSlot
          .querySelector("svg path[onclick]")
          ?.getAttribute("onclick")
          ?.match(/window\.location\.href='([^']+)'/)?.[1] ||
        null,

      /*
       * Estos valores internos se utilizan para elegir
       * correctamente entre capas duplicadas.
       */
      _tooltipCandidateCount: upgradeData.tooltipCandidateCount,

      _tooltipScore: upgradeData.tooltipScore,
    };
  };

  /*
   * Evalúa qué representación de un edificio contiene
   * la información más útil.
   */
  const calculateBuildingScore = (building) => {
    const hasBuildingId = building.buildingId !== null;

    const hasLevel = building.level !== null;

    const hasHref = building.href !== null;

    return (
      (hasBuildingId ? 100 : 0) +
      (hasLevel ? 50 : 0) +
      (hasHref ? 10 : 0) +
      building._tooltipScore
    );
  };

  /*
   * Travian puede dibujar un mismo edificio más de una vez.
   *
   * Guardamos todas las variantes por slot y después
   * conservamos automáticamente la más completa.
   */
  const buildingVariantsBySlot = new Map();

  for (const buildingSlot of document.querySelectorAll(
    "#villageContent .buildingSlot[data-aid][data-gid]"
  )) {
    const building = parseBuilding(buildingSlot);

    const variants =
      buildingVariantsBySlot.get(building.slot) ?? [];

    variants.push(building);

    buildingVariantsBySlot.set(building.slot, variants);
  }

  const selectedBuildings = [
    ...buildingVariantsBySlot.entries(),
  ]
    .map(([slot, variants]) => {
      return variants
        .slice()
        .sort(
          (firstBuilding, secondBuilding) =>
            calculateBuildingScore(secondBuilding) -
            calculateBuildingScore(firstBuilding)
        )[0];
    })
    .sort(
      (firstBuilding, secondBuilding) =>
        firstBuilding.slot - secondBuilding.slot
    );

  /*
   * Elimina los campos internos antes de devolver
   * los edificios a la aplicación.
   */
  const buildings = selectedBuildings.map(
    ({
      _tooltipCandidateCount,
      _tooltipScore,
      ...building
    }) => building
  );

  const activeConstructions = buildings
    .filter((building) => building.upgradeStatus === "underConstruction")
    .map((building) => ({
      slot: building.slot,

      kind: "building",

      name: building.name,

      currentLevel: building.level,

      targetLevel:
        building.level !== null ? building.level + 1 : null,

      remainingTime: null,

      finishTime: null,
    }));

  const constructionQueue = [
    ...document.querySelectorAll(".buildingList > ul > li"),
  ].map(parseConstructionQueueItem);

  const viewData = getEmbeddedViewData();

  const currentVillage = resolveCurrentVillage(viewData?.ownPlayer ?? null);

  /*
   * Snapshot complementario.
   *
   * No repite recursos, datos de cuenta, aldeas,
   * monedas ni puntos culturales.
   */
  return {
    schemaVersion: 1,

    source: "dorf2",

    scrapedAt: new Date().toISOString(),

    page: {
      type: "villageCenter",

      path: window.location.pathname,

      url: window.location.href,
    },

    villageRef: createVillageRef(currentVillage),

    villageCenter: {
      summary: {
        totalSlots: buildings.length,

        occupiedSlots: buildings.filter(
          (building) => !building.isEmpty
        ).length,

        emptySlots: buildings.filter(
          (building) => building.isEmpty
        ).length,

        upgradesAvailableNow: buildings.filter(
          (building) => building.canStartUpgradeNow === true
        ).length,

        maxLevelBuildings: buildings.filter(
          (building) => building.isMaxLevel
        ).length,

        activeConstructionSlots: constructionQueue.length,
      },

      emptySlots: buildings
        .filter((building) => building.isEmpty)
        .map((building) => building.slot),

      buildings,

      buildMenuSlots: [],

      activeConstructions: constructionQueue,
    },

    diagnostics: {
      buildingCount: buildings.length,

      duplicatedSlots: [
        ...buildingVariantsBySlot.entries(),
      ]
        .filter(([, variants]) => variants.length > 1)
        .map(([slot, variants]) => ({
          slot,

          variants: variants.length,
        })),

      buildingsWithUnknownLevel: buildings
        .filter(
          (building) =>
            !building.isEmpty &&
            building.level === null
        )
        .map((building) => building.slot),

      buildingsWithMissingCosts: buildings
        .filter(
          (building) =>
            !building.isEmpty &&
            !building.isMaxLevel &&
            Object.values(
              building.nextLevelCosts ?? {}
            ).some((cost) => cost === null)
        )
        .map((building) => building.slot),

      buildingsWithUnknownUpgradeStatus: buildings
        .filter(
          (building) =>
            building.upgradeStatus === "unknown"
        )
        .map((building) => building.slot),

      tooltipDebug: selectedBuildings
        .filter(
          (building) =>
            !building.isEmpty &&
            !building.isMaxLevel &&
            Object.values(
              building.nextLevelCosts ?? {}
            ).some((cost) => cost === null)
        )
        .map((building) => ({
          slot: building.slot,

          name: building.name,

          tooltipCandidateCount:
            building._tooltipCandidateCount,

          tooltipScore: building._tooltipScore,
        })),
    },
  };
})();

console.log("=== DORF2 SNAPSHOT ===");
console.log(dorf2Snapshot);

console.log("=== DORF2 JSON PARA COPIAR ===");
console.log(JSON.stringify(dorf2Snapshot, null, 2));

dorf2Snapshot;
