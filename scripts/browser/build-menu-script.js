const buildMenuSnapshot = (() => {
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

  const getText = (value) => (value || "").replace(/\s+/g, " ").trim();

  const currentUrl = new URL(window.location.href);
  const slot = toNumber(currentUrl.searchParams.get("id"));
  const category = toNumber(currentUrl.searchParams.get("category"));

  const parseActionHref = (element) => {
    if (!element) return null;

    const href = element.getAttribute("href");

    if (href) return href;

    const onclick = element.getAttribute("onclick") ?? "";
    const match = onclick.match(
      /window\.location\.href\s*=\s*['"]([^'"]+)['"]/i
    );

    return match?.[1] ?? null;
  };

  const parseCosts = (wrapper) => {
    const values = { wood: null, clay: null, iron: null, crop: null };

    for (const resourceNode of wrapper.querySelectorAll(
      ".resourceWrapper .inlineIcon.resource"
    )) {
      const iconClass =
        resourceNode.querySelector("i")?.className ?? "";
      const value = toNumber(
        resourceNode.querySelector(".value")?.textContent
      );

      if (iconClass.includes("r1")) values.wood = value;
      if (iconClass.includes("r2")) values.clay = value;
      if (iconClass.includes("r3")) values.iron = value;
      if (iconClass.includes("r4")) values.crop = value;
    }

    return values;
  };

  const parseOption = (wrapper) => {
    const gid =
      toNumber(wrapper.id?.match(/contract_building(\d+)/)?.[1]) ??
      toNumber(
        wrapper.querySelector(".build_logo")?.className?.match(/\bg(\d+)\b/)?.[1]
      );

    if (gid === null) return null;

    const buildAction = [
      ...wrapper.querySelectorAll("button, a"),
    ]
      .map((element) => ({
        element,
        href: parseActionHref(element),
      }))
      .find(
        (candidate) =>
          candidate.href &&
          candidate.href.includes("action=build") &&
          !candidate.href.includes("buildmaster")
      );

    const duration =
      getText(
        wrapper.querySelector(
          ".upgradeButtonsContainer .section1 .duration .value"
        )?.textContent
      ) || null;

    const blockedReason =
      getText(
        wrapper.querySelector(".upgradeBlocked .errorMessage")
          ?.textContent
      ) ||
      getText(
        wrapper.querySelector(".contractLink .errorMessage")
          ?.textContent
      ) ||
      null;

    return {
      gid,
      name:
        getText(wrapper.querySelector("h2")?.textContent) ||
        `Building ${gid}`,
      category,
      availableNow: Boolean(buildAction),
      blockedReason,
      nextLevelCosts: parseCosts(wrapper),
      duration,
      actionHref: buildAction?.href ?? null,
    };
  };

  const activeTab =
    getText(document.querySelector(".contentNavi .tabItem.active")?.textContent) ||
    null;

  return {
    slot,
    category,
    activeTab,
    options: [
      ...document.querySelectorAll(".buildingWrapper"),
    ]
      .map(parseOption)
      .filter(Boolean),
  };
})();

buildMenuSnapshot;
