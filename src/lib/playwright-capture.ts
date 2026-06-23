import { chromium, type Browser, type Page } from "playwright";
import { db, ensureDatabase } from "@/lib/db";
import { normalizeAutoApplyError } from "@/lib/auto-apply-errors";
import {
  getCredentialSecret,
  getCredentialSecretForAccount,
  linkCredentialProfileToAccount,
} from "@/lib/credentials";
import {
  clearSavedSessionState,
  hasSavedSessionState,
  persistSessionState,
  getSessionStatePath,
} from "@/lib/playwright-session";
import { loadBuildMenuScript, loadDorf1Script, loadDorf2Script } from "@/lib/scripts";
import { importVillageCapture } from "@/lib/snapshot-service";
import { dorf1Schema } from "@/lib/travian-schemas";
import type { Dorf2Snapshot } from "@/lib/travian-types";

const buildVillageUrl = (serverUrl: string, path: string, villageId: number) => {
  const url = new URL(path, serverUrl);
  url.searchParams.set("newdid", String(villageId));
  return url.toString();
};

const dorf1Url = (serverUrl: string) => new URL("/dorf1.php", serverUrl).toString();
const loginUrl = (serverUrl: string) => new URL("/login.php", serverUrl).toString();
const villageHopDelayMs = 350;

const waitForGentlePacing = (page: Page, timeoutMs = villageHopDelayMs) =>
  page.waitForTimeout(timeoutMs);

const createCaptureContext = async (browser: Browser, profileId: string) => {
  if (!(await hasSavedSessionState(profileId))) {
    return browser.newContext();
  }

  try {
    return await browser.newContext({
      storageState: getSessionStatePath(profileId),
    });
  } catch {
    await clearSavedSessionState(profileId);
    return browser.newContext();
  }
};

const gotoTravianPage = async (page: Page, url: string) => {
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (!message.includes("net::ERR_ABORTED")) {
      throw error;
    }
  }

  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
};

const isNavigationTimingError = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";

  return (
    message.includes("Execution context was destroyed") ||
    message.includes("Cannot find context with specified id")
  );
};

const getLoginPageMessage = async (page: Page) =>
  page
    .locator(".error, .errorMessage, .message, .messages, .notice, .warning, .alert")
    .evaluateAll((elements) =>
      elements
        .map((element) => element.textContent?.trim().replace(/\s+/g, " "))
        .filter(Boolean)
        .slice(0, 3)
        .join(" "),
    )
    .catch(() => "");

const isCaptchaVisible = async (page: Page) => {
  const captchaSelectors = [
    'iframe[src*="captcha" i]',
    '[class*="captcha" i]',
    '[id*="captcha" i]',
    'input[name*="captcha" i]',
    'textarea[name="g-recaptcha-response"]',
  ].join(", ");

  const countVisibleCaptchas = () =>
    page.locator(captchaSelectors).evaluateAll((elements) =>
      elements.filter((element) => {
        const style = window.getComputedStyle(element);
        const box = element.getBoundingClientRect();
        const hasVisibleBox = box.width > 0 && box.height > 0;

        return (
          hasVisibleBox &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0"
        );
      }).length,
    );

  let visibleCaptchaCount: number;

  try {
    visibleCaptchaCount = await countVisibleCaptchas();
  } catch (error) {
    if (!isNavigationTimingError(error)) {
      throw error;
    }

    await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => undefined);
    visibleCaptchaCount = await countVisibleCaptchas();
  }

  return visibleCaptchaCount > 0;
};

const getPageDiagnostic = async (page: Page) => {
  const title = await page.title().catch(() => "");
  const loginVisible = await isLoginPageVisible(page);
  const captchaVisible = await isCaptchaVisible(page);
  const loginMessage = await getLoginPageMessage(page);

  return [
    `URL: ${page.url()}`,
    title ? `Titulo: ${title}` : null,
    loginVisible ? "Formulario de login visible." : null,
    captchaVisible ? "Captcha o proteccion anti-bot visible." : null,
    loginMessage ? `Mensaje de la pagina: ${loginMessage}` : null,
  ]
    .filter(Boolean)
    .join(" ");
};

const assertNoCaptcha = async (page: Page, contextLabel: string) => {
  if (!(await isCaptchaVisible(page))) {
    return;
  }

  throw new Error(
    [
      `${contextLabel}: Travian muestra captcha o proteccion anti-bot.`,
      "La captura se detuvo porque la app no intenta resolver captchas.",
      await getPageDiagnostic(page),
    ].join(" "),
  );
};

const assertVillagePageLoaded = async (page: Page, contextLabel: string) => {
  await assertNoCaptcha(page, contextLabel);

  const currentUrl = new URL(page.url());

  if (await isLoginPageVisible(page)) {
    throw new Error(
      [
        `${contextLabel}: Playwright sigue en la pantalla de login.`,
        "El inicio de sesion no se completo o Travian rechazo las credenciales.",
        await getPageDiagnostic(page),
      ].join(" "),
    );
  }

  if (!/\/dorf1\.php$/i.test(currentUrl.pathname) && !/\/dorf2\.php$/i.test(currentUrl.pathname)) {
    throw new Error(
      [
        `${contextLabel}: Travian no cargo una pagina de aldea despues de iniciar sesion.`,
        "Esto suele indicar una redireccion a portada, sesion no autenticada o proteccion intermedia.",
        await getPageDiagnostic(page),
      ].join(" "),
    );
  }
};

const canReuseAuthenticatedSession = async (page: Page, serverUrl: string) => {
  await gotoTravianPage(page, dorf1Url(serverUrl));

  if (await isLoginPageVisible(page)) {
    return false;
  }

  try {
    await assertVillagePageLoaded(page, "Validacion de sesion persistida");
    return true;
  } catch {
    return false;
  }
};

const loginIfNeeded = async (
  page: Page,
  credentials: { serverUrl: string; username: string; password: string },
) => {
  await assertNoCaptcha(page, "Login");

  if (!(await isLoginPageVisible(page))) {
    const canReuseSession = await canReuseAuthenticatedSession(page, credentials.serverUrl);

    if (canReuseSession) {
      return;
    }
  }

  await gotoTravianPage(page, loginUrl(credentials.serverUrl));
  await assertNoCaptcha(page, "Login");

  const usernameField = page.locator('input[name="name"]').first();
  const passwordField = page.locator('input[name="password"]').first();

  if ((await usernameField.count()) === 0 || (await passwordField.count()) === 0) {
    const canReuseSession = await canReuseAuthenticatedSession(page, credentials.serverUrl);

    if (canReuseSession) {
      return;
    }

    throw new Error(
      [
        "Login: Travian no mostro el formulario esperado y tampoco habia una sesion valida reutilizable.",
        await getPageDiagnostic(page),
      ].join(" "),
    );
  }

  await usernameField.fill(credentials.username);
  await passwordField.fill(credentials.password);

  const submitButton = page.locator('button[type="submit"], input[type="submit"]').first();

  if ((await submitButton.count()) > 0) {
    await Promise.all([
      page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined),
      submitButton.click(),
    ]);
  } else {
    await passwordField.press("Enter");
    await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined);
  }

  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);

  await gotoTravianPage(page, dorf1Url(credentials.serverUrl));
  await assertVillagePageLoaded(page, "Validacion posterior al login");
};

const evaluateBrowserScript = async <T>(page: Page, script: string) =>
  page.evaluate((source) => {
    return eval(source) as T;
  }, script);

const getBuildMenuTargets = (dorf2Snapshot: Dorf2Snapshot) => {
  const emptySlots = dorf2Snapshot.villageCenter.buildings
    .filter((building) => building.isEmpty)
    .map((building) => building.slot);
  const firstNormalSlot = emptySlots.find((slot) => slot >= 19 && slot <= 38) ?? null;
  const targets: Array<{ slot: number; categories: number[] }> = [];

  if (firstNormalSlot !== null) {
    targets.push({ slot: firstNormalSlot, categories: [1, 2] });
  }

  if (emptySlots.includes(39)) {
    targets.push({ slot: 39, categories: [2] });
  }

  if (emptySlots.includes(40)) {
    targets.push({ slot: 40, categories: [2] });
  }

  return targets;
};

const buildBuildMenuUrl = (serverUrl: string, slot: number, category: number | null = null) => {
  const url = new URL("/build.php", serverUrl);
  url.searchParams.set("id", String(slot));

  if (category !== null) {
    url.searchParams.set("category", String(category));
  }

  return url.toString();
};

const isDirectBuildActionHref = (targetHref: string | null | undefined, serverUrl: string) => {
  if (!targetHref) {
    return false;
  }

  try {
    const url = new URL(targetHref, serverUrl);
    return url.searchParams.get("action") === "build";
  } catch {
    return false;
  }
};

const upgradeSelectors = [
  'button.green.build',
  'a.green.build',
  'button.build',
  'a.build',
  '.upgradeBuilding .button-content',
  '.upgradeBuilding a',
  '.contractLink button',
  '.contractLink a',
];

const clickUpgradeAction = async (page: Page) => {
  for (const selector of upgradeSelectors) {
    const locator = page.locator(selector).first();

    if ((await locator.count()) === 0) {
      continue;
    }

    await locator.click();
    await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    return;
  }

  throw new Error("No upgrade action button was found on the target page.");
};

const openUpgradeTarget = async (
  page: Page,
  input: {
    kind: "resourceField" | "building";
    slot: number;
    villageExternalId: number;
    serverUrl: string;
    buildAction?: "upgrade" | "construct";
    targetGid?: number | null;
    targetHref?: string | null;
  },
) => {
  if (input.kind === "resourceField") {
    await gotoTravianPage(page, buildVillageUrl(input.serverUrl, "/dorf1.php", input.villageExternalId));
    await assertVillagePageLoaded(page, "Abrir campo");

    const field = page.locator(
      `#resourceFieldContainer a.resourceField[data-aid="${input.slot}"]`,
    ).first();

    if ((await field.count()) === 0) {
      throw new Error(`Resource field slot ${input.slot} was not found.`);
    }

    // Abrimos el href directamente para evitar problemas con capas visuales
    // que puedan interceptar el click físico sobre el mapa de recursos.
    const fieldHref = await field.getAttribute("href");

    await gotoTravianPage(
      page,
      fieldHref
        ? new URL(fieldHref, input.serverUrl).toString()
        : buildBuildMenuUrl(input.serverUrl, input.slot),
    );
    await assertNoCaptcha(page, "Abrir campo");
    return;
  }

  if (input.buildAction === "construct") {
    // Para una construcción nueva no reutilizamos targetHref.
    // Ese href incluye checksum y puede expirar o quedar ligado a otra sesión.
    // Abrimos el menú otra vez y hacemos clic en el botón recién generado.
    await gotoTravianPage(
      page,
      buildVillageUrl(input.serverUrl, "/dorf2.php", input.villageExternalId),
    );
    await assertVillagePageLoaded(page, "Cambiar a aldea objetivo");

    if (input.targetGid === null || input.targetGid === undefined) {
      throw new Error(`Missing target gid for construct action in slot ${input.slot}.`);
    }

    const categoriesToTry: Array<number | null> = [null, 1, 2];
    const diagnostics: string[] = [];

    for (const category of categoriesToTry) {
      await gotoTravianPage(
        page,
        buildBuildMenuUrl(input.serverUrl, input.slot, category),
      );
      await assertNoCaptcha(page, "Abrir menu de construccion");

      if (await isLoginPageVisible(page)) {
        throw new Error(
          [
            "Construct action redirected back to login while opening the fresh build menu.",
            await getPageDiagnostic(page),
          ].join(" "),
        );
      }

      const wrapper = page.locator(`#contract_building${input.targetGid}`).first();

      if ((await wrapper.count()) === 0) {
        diagnostics.push(
          `category=${category ?? "default"}: wrapper contract_building${input.targetGid} no encontrado`,
        );
        continue;
      }

      const directBuildAction = wrapper
        .locator(
          [
            'a[href*="action=build"]:not([href*="buildmaster"])',
            'button[onclick*="action=build"]:not([onclick*="buildmaster"])',
          ].join(", "),
        )
        .first();

      if ((await directBuildAction.count()) === 0) {
        const wrapperText = await wrapper
          .innerText()
          .then((value) => value.replace(/\s+/g, " ").trim().slice(0, 500))
          .catch(() => "");

        diagnostics.push(
          `category=${category ?? "default"}: edificio encontrado sin boton directo. Texto: ${wrapperText}`,
        );
        continue;
      }

      await Promise.all([
        page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined),
        directBuildAction.click(),
      ]);

      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
      await assertNoCaptcha(page, "Ejecutar construccion desde menu fresco");
      return;
    }

    throw new Error(
      [
        `No se encontró un botón directo para construir gid ${input.targetGid} en el slot ${input.slot}.`,
        ...diagnostics,
        await getPageDiagnostic(page),
      ].join(" "),
    );
  }

  await gotoTravianPage(page, buildVillageUrl(input.serverUrl, "/dorf2.php", input.villageExternalId));
  await assertVillagePageLoaded(page, "Abrir edificio");

  const building = page
    .locator(`#villageContent .buildingSlot[data-aid="${input.slot}"] a.level`)
    .first();

  if ((await building.count()) === 0) {
    throw new Error(`Building slot ${input.slot} was not found.`);
  }

  // No hacemos click físico sobre el enlace visual del edificio.
  // En algunas aldeas Travian coloca un SVG encima del enlace y Playwright
  // queda esperando porque ese SVG intercepta los eventos del mouse.
  // En su lugar leemos la URL real del onclick del mapa y navegamos directo.
  const targetHref = await page.evaluate((slot) => {
    const expectedSlot = String(slot);
    const clickableElements = Array.from(document.querySelectorAll<HTMLElement>("[onclick]"));

    for (const element of clickableElements) {
      const onclick = element.getAttribute("onclick") ?? "";
      const match = onclick.match(/['"]([^'"]*\/build\.php\?[^'"]+)['"]/i);

      if (!match?.[1]) {
        continue;
      }

      const url = new URL(match[1], window.location.origin);

      if (url.pathname === "/build.php" && url.searchParams.get("id") === expectedSlot) {
        return url.toString();
      }
    }

    return null;
  }, input.slot);

  await gotoTravianPage(
    page,
    targetHref ?? buildBuildMenuUrl(input.serverUrl, input.slot),
  );
  await assertNoCaptcha(page, "Abrir edificio");
};

const isLoginPageVisible = async (page: Page) => {
  const usernameSelector = [
    'input[name="name"]',
    'input[name="username"]',
    'input[type="text"]',
    'input[type="email"]',
  ].join(", ");

  const passwordSelector = 'input[type="password"]';

  const usernameCount = await page.locator(usernameSelector).count();
  const passwordCount = await page.locator(passwordSelector).count();

  return usernameCount > 0 && passwordCount > 0;
};

const assertSnapshotHasCurrentVillage = async (
  page: Page,
  payload: unknown,
  contextLabel: string,
) => {
  const parsed = dorf1Schema.safeParse(payload);

  if (parsed.success) {
    return parsed.data;
  }

  const currentVillage = (payload as { village?: { current?: unknown } } | null)?.village?.current;

    if (currentVillage === null || currentVillage === undefined) {
    const loginVisible = await isLoginPageVisible(page);
    const captchaVisible = await isCaptchaVisible(page);

    throw new Error(
      [
        `${contextLabel}: no se pudo detectar la aldea actual en dorf1.`,
        captchaVisible
          ? "Travian muestra captcha o proteccion anti-bot; la captura se detuvo."
          : loginVisible
          ? "Playwright probablemente sigue en la pantalla de login o el inicio de sesion no se completo."
          : "La pagina cargo, pero el scraper no encontro la aldea actual en el payload de Travian.",
        await getPageDiagnostic(page),
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  throw parsed.error;
};

export const runManualCapture = async (profileId?: string) => {
  await ensureDatabase();
  const credentials = await getCredentialSecret(profileId);

  if (!credentials) {
    throw normalizeAutoApplyError(new Error("Missing saved credentials."));
  }

  const captureRun = await db.captureRun.create({
    data: {
      status: "running",
      credentialProfileId: credentials.profileId,
    },
  });

  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const context = await createCaptureContext(browser, credentials.profileId);
    const page = await context.newPage();
    const dorf1Script = await loadDorf1Script();
    const dorf2Script = await loadDorf2Script();
    const buildMenuScript = await loadBuildMenuScript();

    await gotoTravianPage(page, credentials.serverUrl);

    await loginIfNeeded(page, credentials);
    await persistSessionState(context, credentials.profileId);

    await gotoTravianPage(page, dorf1Url(credentials.serverUrl));
    await assertVillagePageLoaded(page, "Primer barrido");

    const firstSnapshot = await assertSnapshotHasCurrentVillage(
      page,
      await evaluateBrowserScript<unknown>(page, dorf1Script),
      "Primer barrido",
    );

    const villages = firstSnapshot.account.villages
      .map((village) => {
        const id =
          typeof village.id === "number"
            ? village.id
            : typeof village.did === "number"
              ? village.did
              : null;

        if (!id) {
          return null;
        }

        return {
          id,
          name:
            typeof village.name === "string" && village.name.length > 0
              ? village.name
              : `Village ${id}`,
        };
      })
      .filter((village): village is { id: number; name: string } => Boolean(village));

    for (const village of villages) {
      await db.captureRunVillage.upsert({
        where: {
          captureRunId_villageExternalId: {
            captureRunId: captureRun.id,
            villageExternalId: village.id,
          },
        },
        update: {
          status: "running",
          villageName: village.name,
          errorMessage: null,
        },
        create: {
          captureRunId: captureRun.id,
          villageExternalId: village.id,
          villageName: village.name,
          status: "running",
        },
      });

      try {
        await waitForGentlePacing(page);
        await gotoTravianPage(page, buildVillageUrl(credentials.serverUrl, "/dorf1.php", village.id));

        const dorf1Payload = await evaluateBrowserScript<unknown>(page, dorf1Script);

        await waitForGentlePacing(page);
        await gotoTravianPage(page, buildVillageUrl(credentials.serverUrl, "/dorf2.php", village.id));

        const dorf2Payload = await evaluateBrowserScript<Dorf2Snapshot>(page, dorf2Script);
        const buildMenuSlots: Dorf2Snapshot["villageCenter"]["buildMenuSlots"] = [];

        for (const target of getBuildMenuTargets(dorf2Payload)) {
          for (const category of target.categories) {
            await waitForGentlePacing(page);
            await gotoTravianPage(
              page,
              buildBuildMenuUrl(credentials.serverUrl, target.slot, category),
            );
            await assertNoCaptcha(page, "Leer menu de construccion");

            const buildMenuPayload = await evaluateBrowserScript<{
              slot: number | null;
              category: number | null;
              activeTab: string | null;
              options: Dorf2Snapshot["villageCenter"]["buildMenuSlots"][number]["options"];
            }>(page, buildMenuScript);

            buildMenuSlots.push(buildMenuPayload);
          }
        }

        dorf2Payload.villageCenter.buildMenuSlots = buildMenuSlots;

        const result = await importVillageCapture({
          captureRunId: captureRun.id,
          dorf1Payload,
          dorf2Payload,
        });

        await linkCredentialProfileToAccount(credentials.profileId, result.accountId);

        await db.captureRun.update({
          where: {
            id: captureRun.id,
          },
          data: {
            accountId: result.accountId,
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown village capture failure";

        await db.captureRunVillage.update({
          where: {
            captureRunId_villageExternalId: {
              captureRunId: captureRun.id,
              villageExternalId: village.id,
            },
          },
          data: {
            status: "failed",
            errorMessage: message,
            completedAt: new Date(),
          },
        });
      }
    }

    const villageRuns = await db.captureRunVillage.findMany({
      where: {
        captureRunId: captureRun.id,
      },
    });

    const hasFailure = villageRuns.some((villageRun) => villageRun.status === "failed");
    const hasSuccess = villageRuns.some((villageRun) => villageRun.status === "success");

    const finalStatus = hasFailure ? (hasSuccess ? "partial" : "failed") : "complete";

    await db.captureRun.update({
      where: {
        id: captureRun.id,
      },
      data: {
        status: finalStatus,
        completedAt: new Date(),
      },
    });

    return captureRun.id;
  } catch (error) {
    const normalized = normalizeAutoApplyError(error, "AUTO_APPLY_CAPTURE_FAILED");
    const message = normalized.message;

    await db.captureRun.update({
      where: {
        id: captureRun.id,
      },
      data: {
        status: "failed",
        errorMessage: message,
        completedAt: new Date(),
      },
    });

    throw normalized;
  } finally {
    await browser.close();
  }
};

const readVillageCenterSnapshot = async (
  page: Page,
  input: {
    serverUrl: string;
    villageExternalId: number;
    dorf2Script: string;
    contextLabel: string;
  },
) => {
  await gotoTravianPage(
    page,
    buildVillageUrl(input.serverUrl, "/dorf2.php", input.villageExternalId),
  );
  await assertVillagePageLoaded(page, input.contextLabel);

  return evaluateBrowserScript<Dorf2Snapshot>(page, input.dorf2Script);
};

const didConstructionStateChange = (
  beforeSnapshot: Dorf2Snapshot,
  afterSnapshot: Dorf2Snapshot,
  targetSlot: number,
) => {
  const beforeTarget =
    beforeSnapshot.villageCenter.buildings.find((building) => building.slot === targetSlot) ?? null;
  const afterTarget =
    afterSnapshot.villageCenter.buildings.find((building) => building.slot === targetSlot) ?? null;

  const beforeQueue = beforeSnapshot.villageCenter.activeConstructions;
  const afterQueue = afterSnapshot.villageCenter.activeConstructions;

  const queueIncreased = afterQueue.length > beforeQueue.length;
  const targetEnteredQueue =
    !beforeQueue.some((construction) => construction.slot === targetSlot) &&
    afterQueue.some((construction) => construction.slot === targetSlot);

  const targetChanged = Boolean(
    beforeTarget &&
      afterTarget &&
      (beforeTarget.isEmpty !== afterTarget.isEmpty ||
        beforeTarget.gid !== afterTarget.gid ||
        beforeTarget.level !== afterTarget.level),
  );

  return queueIncreased || targetEnteredQueue || targetChanged;
};

const confirmBuildStarted = async (
  page: Page,
  input: {
    serverUrl: string;
    villageExternalId: number;
    dorf2Script: string;
    targetSlot: number;
    beforeSnapshot: Dorf2Snapshot;
  },
) => {
  // Travian puede tardar un momento en reflejar la nueva cola.
  // Reintentamos antes de decidir que la acción realmente falló.
  for (const waitMs of [750, 1_500, 2_500]) {
    await waitForGentlePacing(page, waitMs);

    const afterSnapshot = await readVillageCenterSnapshot(page, {
      serverUrl: input.serverUrl,
      villageExternalId: input.villageExternalId,
      dorf2Script: input.dorf2Script,
      contextLabel: "Validar construccion posterior",
    });

    if (didConstructionStateChange(input.beforeSnapshot, afterSnapshot, input.targetSlot)) {
      return;
    }
  }

  throw new Error(
    `Travian no confirmó el inicio de la construcción en el slot ${input.targetSlot}: ` +
      "el edificio y la cola permanecieron sin cambios.",
  );
};

export const executeApprovedProposal = async (
  proposalId: string,
  profileId?: string,
) => {
  await ensureDatabase();

  const proposal = await db.agentProposal.findUnique({
    where: {
      id: proposalId,
    },
    include: {
      village: true,
      candidates: {
        orderBy: {
          rank: "asc",
        },
      },
      execution: true,
    },
  });

  if (!proposal) {
    throw new Error("Proposal not found.");
  }

  if (proposal.status !== "approved") {
    throw new Error("Proposal must be approved before execution.");
  }

  if (proposal.execution?.status === "success") {
    return proposal.execution.id;
  }

  const candidate =
    proposal.selectedCandidateId
      ? proposal.candidates.find((entry) => entry.id === proposal.selectedCandidateId) ?? null
      : proposal.candidates[0] ?? null;

  if (!candidate) {
    throw new Error("Proposal has no candidate to execute.");
  }

  if (!candidate.affordableNow) {
    throw new Error("Only immediately affordable proposals can be applied.");
  }

  const credentials = profileId
    ? await getCredentialSecret(profileId)
    : await getCredentialSecretForAccount(proposal.village.accountId);
  let candidateFeatures:
    | {
        buildAction?: "upgrade" | "construct";
        targetGid?: number | null;
        targetHref?: string | null;
      }
    | null = null;

  try {
    candidateFeatures =
      candidate.featuresJson.length > 0
        ? (JSON.parse(candidate.featuresJson) as {
            buildAction?: "upgrade" | "construct";
            targetGid?: number | null;
            targetHref?: string | null;
          })
        : null;
  } catch {
    candidateFeatures = null;
  }

  if (!credentials) {
    throw new Error("Missing saved credentials for the proposal account.");
  }

  if (!credentials.accountId || credentials.accountId !== proposal.village.accountId) {
    throw new Error(
      "Credential profile is not linked to the Travian account that owns this proposal.",
    );
  }

  const execution =
    proposal.execution ??
    (await db.agentExecution.create({
      data: {
        proposalId: proposal.id,
        candidateId: candidate.id,
        status: "running",
      },
    }));

  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const context = await createCaptureContext(browser, credentials.profileId);
    const page = await context.newPage();

    await gotoTravianPage(page, credentials.serverUrl);
    await loginIfNeeded(page, credentials);
    await persistSessionState(context, credentials.profileId);

    const dorf2Script = await loadDorf2Script();
    const beforeSnapshot = await readVillageCenterSnapshot(page, {
      serverUrl: credentials.serverUrl,
      villageExternalId: proposal.village.externalId,
      dorf2Script,
      contextLabel: "Captura previa a construccion",
    });

    await openUpgradeTarget(page, {
      kind: candidate.kind as "resourceField" | "building",
      slot: candidate.slot,
      villageExternalId: proposal.village.externalId,
      serverUrl: credentials.serverUrl,
      buildAction: candidateFeatures?.buildAction,
      targetGid: candidateFeatures?.targetGid ?? null,
      targetHref: candidateFeatures?.targetHref ?? null,
    });

    const isDirectBuildAction =
      candidateFeatures?.buildAction === "construct" &&
      isDirectBuildActionHref(candidateFeatures?.targetHref, credentials.serverUrl);

    if (!isDirectBuildAction) {
      await clickUpgradeAction(page);
    } else {
      await assertNoCaptcha(page, "Construccion directa");

      if (await isLoginPageVisible(page)) {
        throw new Error(
          [
            "Construct action redirected back to login before the build could be confirmed.",
            await getPageDiagnostic(page),
          ].join(" "),
        );
      }
    }

    await confirmBuildStarted(page, {
      serverUrl: credentials.serverUrl,
      villageExternalId: proposal.village.externalId,
      dorf2Script,
      targetSlot: candidate.slot,
      beforeSnapshot,
    });
    await persistSessionState(context, credentials.profileId);

    await db.agentExecution.update({
      where: {
        id: execution.id,
      },
      data: {
        status: "success",
        executedAt: new Date(),
        completedAt: new Date(),
      },
    });

    await db.agentProposal.update({
      where: {
        id: proposal.id,
      },
      data: {
        status: "executed",
      },
    });

    return execution.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown execution failure";

    await db.agentExecution.update({
      where: {
        id: execution.id,
      },
      data: {
        status: "failed",
        errorMessage: message,
        completedAt: new Date(),
      },
    });

    await db.agentProposal.update({
      where: {
        id: proposal.id,
      },
      data: {
        status: "failed",
      },
    });

    throw error;
  } finally {
    await browser.close();
  }
};
