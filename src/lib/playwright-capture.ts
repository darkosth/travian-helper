import { chromium, type Browser, type Page } from "playwright";
import "server-only";
import { db, ensureDatabase } from "@/lib/db";
import { getCredentialSecret } from "@/lib/credentials";
import {
  clearSavedSessionState,
  hasSavedSessionState,
  persistSessionState,
  getSessionStatePath,
} from "@/lib/playwright-session";
import { loadDorf1Script, loadDorf2Script } from "@/lib/scripts";
import { importVillageCapture } from "@/lib/snapshot-service";
import { dorf1Schema } from "@/lib/travian-schemas";

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

const createCaptureContext = async (browser: Browser) => {
  if (!(await hasSavedSessionState())) {
    return browser.newContext();
  }

  try {
    return await browser.newContext({
      storageState: getSessionStatePath(),
    });
  } catch {
    await clearSavedSessionState();
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

    await Promise.all([
      page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined),
      field.click(),
    ]);

    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    return;
  }

  await gotoTravianPage(page, buildVillageUrl(input.serverUrl, "/dorf2.php", input.villageExternalId));
  await assertVillagePageLoaded(page, "Abrir edificio");

  const building = page
    .locator(`#villageContent .buildingSlot[data-aid="${input.slot}"] a.level`)
    .first();

  if ((await building.count()) === 0) {
    throw new Error(`Building slot ${input.slot} was not found.`);
  }

  await Promise.all([
    page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined),
    building.click(),
  ]);

  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
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

export const runManualCapture = async () => {
  await ensureDatabase();
  const credentials = await getCredentialSecret();

  if (!credentials) {
    throw new Error("Missing saved credentials.");
  }

  const captureRun = await db.captureRun.create({
    data: {
      status: "running",
    },
  });

  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const context = await createCaptureContext(browser);
    const page = await context.newPage();
    const dorf1Script = await loadDorf1Script();
    const dorf2Script = await loadDorf2Script();

    await gotoTravianPage(page, credentials.serverUrl);

    await loginIfNeeded(page, credentials);
    await persistSessionState(context);

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

        const dorf2Payload = await evaluateBrowserScript<unknown>(page, dorf2Script);

        const result = await importVillageCapture({
          captureRunId: captureRun.id,
          dorf1Payload,
          dorf2Payload,
        });

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
    const message = error instanceof Error ? error.message : "Unknown capture failure";

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

    throw error;
  } finally {
    await browser.close();
  }
};

export const executeApprovedProposal = async (proposalId: string) => {
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

  const candidate = proposal.candidates[0];

  if (!candidate) {
    throw new Error("Proposal has no candidate to execute.");
  }

  if (!candidate.affordableNow) {
    throw new Error("Only immediately affordable proposals can be applied.");
  }

  const credentials = await getCredentialSecret();

  if (!credentials) {
    throw new Error("Missing saved credentials.");
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
    const context = await createCaptureContext(browser);
    const page = await context.newPage();

    await gotoTravianPage(page, credentials.serverUrl);
    await loginIfNeeded(page, credentials);
    await persistSessionState(context);

    await openUpgradeTarget(page, {
      kind: candidate.kind as "resourceField" | "building",
      slot: candidate.slot,
      villageExternalId: proposal.village.externalId,
      serverUrl: credentials.serverUrl,
    });

    await clickUpgradeAction(page);

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
