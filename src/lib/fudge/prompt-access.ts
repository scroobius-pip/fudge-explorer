export const FUDGE_BILLING_STATUS_URL =
  "https://api.withfudge.com/billing/status";
export const FUDGE_BILLING_CHECKOUT_URL =
  "https://api.withfudge.com/billing/checkout";
export const FUDGE_BILLING_PLANS_URL =
  "https://api.withfudge.com/billing/plans";
export const FUDGE_PIN_START_URL = "https://api.withfudge.com/auth/pin/start";
export const FUDGE_PIN_VERIFY_URL = "https://api.withfudge.com/auth/pin/verify";

export type AiProvider = "fudge" | "chatgpt" | "claude" | "gemini";

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  fudge: "Fudge Chat",
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
};

export function aiProviderUrl(provider: AiProvider, prompt: string) {
  const destination = new URL(
    provider === "fudge"
      ? "https://design.withfudge.com/"
      : provider === "chatgpt"
        ? "https://chatgpt.com/"
      : provider === "claude"
        ? "https://claude.ai/new"
        : "https://gemini.google.com/app",
  );
  destination.searchParams.set(provider === "fudge" ? "prompt" : "q", prompt);
  return destination.href;
}

const FUDGE_LOGIN_URL = "https://api.withfudge.com/auth/google";
const FUDGE_LOGIN_RETURN_URL =
  "https://explorer.withfudge.com/?fudge-auth=complete";

export type ExplorerBillingPeriod = "monthly" | "quarterly" | "yearly";

export type FudgePlanId = "pro" | "studio";

export type FudgePlanDetails = {
  id: FudgePlanId;
  name: string;
  monthlyPrice: string;
  quarterlyPrice: string;
  yearlyPrice: string;
  trialDays: Record<ExplorerBillingPeriod, number>;
  note: string;
  configured: boolean;
};

const FUDGE_PLAN_IDS: readonly FudgePlanId[] = [
  "pro",
  "studio",
];

export type PromptAccess =
  | { kind: "signed_out" }
  | { kind: "checkout" }
  | { kind: "authorized" }
  | { kind: "denied" };

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type PromptUseDependencies = {
  readAccess: () => Promise<PromptAccess>;
  buildPrompt: () => string;
  copyPrompt: (prompt: string) => Promise<void>;
  onCopied: () => void;
  openProvider?: (prompt: string) => void;
};

export type PromptUseResult =
  | { kind: "blocked"; access: PromptAccess }
  | { kind: "copy_failed"; access: PromptAccess }
  | { kind: "copied"; access: PromptAccess };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function classifyPromptAccess(value: unknown): PromptAccess {
  if (!isRecord(value) || typeof value.authenticated !== "boolean") {
    return { kind: "denied" };
  }

  const entitlements = value.entitlements;
  if (!isRecord(entitlements) || typeof entitlements.promptCopy !== "boolean") {
    return { kind: "denied" };
  }

  if (!value.authenticated) {
    return entitlements.promptCopy
      ? { kind: "denied" }
      : { kind: "signed_out" };
  }

  return entitlements.promptCopy
    ? { kind: "authorized" }
    : { kind: "checkout" };
}

export async function readPromptAccess(
  fetcher: Fetcher = globalThis.fetch,
): Promise<PromptAccess> {
  try {
    const response = await fetcher(FUDGE_BILLING_STATUS_URL, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return { kind: "denied" };
    return classifyPromptAccess(await response.json());
  } catch {
    return { kind: "denied" };
  }
}

export function fudgeLoginUrl() {
  const url = new URL(FUDGE_LOGIN_URL);
  url.searchParams.set("from", FUDGE_LOGIN_RETURN_URL);
  return url.href;
}

export async function startFudgeEmailLogin(
  email: string,
  fetcher: Fetcher = globalThis.fetch,
) {
  const normalizedEmail = email.trim().toLocaleLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("Enter a valid email address");
  }
  const response = await fetcher(FUDGE_PIN_START_URL, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: normalizedEmail }),
  });
  if (!response.ok) throw new Error("Unable to send a sign-in code");
}

export async function verifyFudgeEmailLogin(
  email: string,
  pin: string,
  fetcher: Fetcher = globalThis.fetch,
) {
  const normalizedEmail = email.trim().toLocaleLowerCase();
  const normalizedPin = pin.trim();
  if (!/^\d{6}$/.test(normalizedPin)) {
    throw new Error("Enter the six-digit code");
  }
  const response = await fetcher(FUDGE_PIN_VERIFY_URL, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: normalizedEmail, pin: normalizedPin }),
  });
  if (!response.ok) throw new Error("That code could not be verified");
}

export async function readFudgePlans(
  fetcher: Fetcher = globalThis.fetch,
): Promise<FudgePlanDetails[] | null> {
  try {
    const response = await fetcher(FUDGE_BILLING_PLANS_URL, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.plans)) return null;

    const plans: FudgePlanDetails[] = [];
    for (const id of FUDGE_PLAN_IDS) {
      const plan = payload.plans.find(
        (candidate) => isRecord(candidate) && candidate.id === id,
      );
      const trialDays = isRecord(plan) && isRecord(plan.trialDays) ? plan.trialDays : null;
      if (
        !isRecord(plan) ||
        typeof plan.name !== "string" ||
        typeof plan.monthlyPrice !== "string" ||
        typeof plan.quarterlyPrice !== "string" ||
        typeof plan.yearlyPrice !== "string" ||
        !trialDays ||
        !["monthly", "quarterly", "yearly"].every((period) =>
          typeof trialDays[period] === "number" &&
          Number.isInteger(trialDays[period]) &&
          trialDays[period] >= 0
        ) ||
        typeof plan.note !== "string" ||
        typeof plan.configured !== "boolean"
      ) {
        return null;
      }
      plans.push({
        id,
        name: plan.name,
        monthlyPrice: plan.monthlyPrice,
        quarterlyPrice: plan.quarterlyPrice,
        yearlyPrice: plan.yearlyPrice,
        trialDays: trialDays as FudgePlanDetails["trialDays"],
        note: plan.note,
        configured: plan.configured,
      });
    }
    return plans;
  } catch {
    return null;
  }
}

export function fudgeCheckoutLabel(
  plan: FudgePlanDetails,
  period: ExplorerBillingPeriod,
) {
  if (!plan.configured) return "Unavailable";
  const days = plan.trialDays[period];
  return days > 0 ? `Start ${days}-day free trial` : `Choose ${plan.name}`;
}

export async function createFudgeCheckout(
  plan: FudgePlanId,
  period: ExplorerBillingPeriod,
  fetcher: Fetcher = globalThis.fetch,
) {
  const response = await fetcher(FUDGE_BILLING_CHECKOUT_URL, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ plan, period }),
  });
  if (!response.ok) throw new Error("Fudge checkout is unavailable");

  const payload: unknown = await response.json();
  if (!isRecord(payload) || typeof payload.url !== "string") {
    throw new Error("Fudge checkout returned an invalid response");
  }

  const destination = new URL(payload.url);
  if (destination.protocol !== "https:") {
    throw new Error("Fudge checkout returned an invalid URL");
  }
  return destination.href;
}

export async function performPromptUse({
  readAccess,
  buildPrompt,
  copyPrompt,
  onCopied,
  openProvider,
}: PromptUseDependencies): Promise<PromptUseResult> {
  const access = await readAccess();
  if (access.kind !== "authorized") {
    return { kind: "blocked", access };
  }

  const prompt = buildPrompt();
  try {
    await copyPrompt(prompt);
  } catch {
    return { kind: "copy_failed", access };
  }

  onCopied();
  openProvider?.(prompt);
  return { kind: "copied", access };
}
