import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  Mail,
  X,
} from "lucide-react";
import {
  fudgeLoginUrl,
  readFudgePlans,
  readPromptAccess,
  startFudgeEmailLogin,
  verifyFudgeEmailLogin,
  type ExplorerBillingPeriod,
  type FudgePlanId,
  type PromptAccess,
} from "@/lib/fudge/prompt-access";

const FULL_PRICING_URL = "https://design.withfudge.com/pricing";
const GOOGLE_POLL_INTERVAL_MS = 1_000;
const GOOGLE_CLOSE_GRACE_MS = 8_000;
const EXPLORER_AUTH_COMPLETE_MESSAGE = "fudge:explorer-auth-complete";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path
        fill="#4285f4"
        d="M30.363 16.337c0-.987-.088-1.925-.238-2.837H16v5.637h8.087c-.362 1.85-1.424 3.413-3 4.476v3.75h4.826c2.825-2.613 4.45-6.463 4.45-11.026Z"
      />
      <path
        fill="#34a853"
        d="M16 31c4.05 0 7.438-1.35 9.913-3.637l-4.826-3.75c-1.35.9-3.062 1.45-5.087 1.45-3.912 0-7.225-2.638-8.413-6.2H2.612v3.862C5.075 27.625 10.137 31 16 31Z"
      />
      <path
        fill="#fbbc05"
        d="M7.588 18.863A8.704 8.704 0 0 1 7.112 16c0-1 .175-1.963.476-2.863V9.275H2.612a14.826 14.826 0 0 0 0 13.45l4.976-3.863Z"
      />
      <path
        fill="#ea4335"
        d="M16 6.938c2.212 0 4.188.762 5.75 2.25l4.275-4.276C23.438 2.487 20.05 1 16 1 10.137 1 5.075 4.375 2.612 9.275l4.975 3.862c1.188-3.562 4.5-6.2 8.413-6.2Z"
      />
    </svg>
  );
}

function FudgeLogo() {
  return (
    <svg
      className="prompt-modal-logo"
      role="img"
      aria-label="Fudge"
      viewBox="49.354 164.332 293.006 328.011"
    >
      <path d="M314.788 336.851 L201.515 336.851 Q190.515 336.851 190.515 347.851 L190.515 464.771 Q190.515 474.771 180.515 474.771 L76.926 474.771 Q66.926 474.771 69.241 465.043 L88.417 384.453 Q90.732 374.725 99.212 369.425 L146.983 339.569 Q156.311 333.739 146.555 328.657 L113.001 311.179 Q104.132 306.559 99.636 297.627 L77.371 253.4 Q72.875 244.468 71.928 234.513 L67.879 191.955 Q66.932 182 76.932 182 L180.515 182 Q190.515 182 190.593 192 L191.153 263.294 Q191.239 274.294 196.721 264.758 L221.979 220.824 Q226.963 212.155 236.159 208.227 L283.997 187.793 Q293.193 183.865 303.174 183.246 L314.807 182.523 Q324.788 181.904 324.788 191.904 L324.788 326.851 Q324.788 336.851 314.788 336.851 Z" />
    </svg>
  );
}

function PromptModal({
  children,
  description,
  onClose,
  size = "compact",
  title,
}: {
  children: ReactNode;
  description: string;
  onClose: () => void;
  size?: "compact" | "pricing";
  title: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      (
        dialog?.querySelector<HTMLElement>("[data-autofocus]") ??
        dialog?.querySelector<HTMLElement>(
          "button:not(:disabled), a[href], input:not(:disabled)",
        )
      )?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          "button:not(:disabled), a[href], input:not(:disabled)",
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return createPortal(
    <div
      className="prompt-modal-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`prompt-modal is-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <button
          type="button"
          className="prompt-modal-close"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="size-4" strokeWidth={1.7} />
        </button>
        <div className="prompt-modal-heading">
          <FudgeLogo />
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function PromptSignInModal({
  onAuthenticated,
  onClose,
}: {
  onAuthenticated: (access: PromptAccess) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"email" | "pin">("email");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState<"google" | "email" | "pin" | null>(null);
  const [error, setError] = useState("");
  const googleTimerRef = useRef<number | null>(null);
  const googlePopupRef = useRef<Window | null>(null);
  const googleClosedAtRef = useRef<number | null>(null);
  const googleCompleteRef = useRef(false);

  const stopGooglePolling = () => {
    if (googleTimerRef.current !== null) {
      window.clearInterval(googleTimerRef.current);
      googleTimerRef.current = null;
    }
  };

  useEffect(
    () => () => {
      stopGooglePolling();
      if (googlePopupRef.current && !googlePopupRef.current.closed) {
        googlePopupRef.current.close();
      }
    },
    [],
  );

  const completeIfAuthenticated = async () => {
    if (googleCompleteRef.current) return true;
    const access = await readPromptAccess();
    if (access.kind !== "authorized" && access.kind !== "checkout") {
      return false;
    }
    googleCompleteRef.current = true;
    stopGooglePolling();
    if (googlePopupRef.current && !googlePopupRef.current.closed) {
      googlePopupRef.current.close();
    }
    setBusy(null);
    onAuthenticated(access);
    return true;
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.data?.type !== EXPLORER_AUTH_COMPLETE_MESSAGE
      ) {
        return;
      }
      void completeIfAuthenticated();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  });

  const startGoogle = () => {
    setError("");
    const popup = window.open(
      fudgeLoginUrl(),
      "fudge-explorer-sign-in",
      "popup,width=520,height=720",
    );
    if (!popup) {
      setError("Allow pop-ups to continue with Google.");
      return;
    }
    googlePopupRef.current = popup;
    googleClosedAtRef.current = null;
    googleCompleteRef.current = false;
    setBusy("google");
    let checking = false;
    googleTimerRef.current = window.setInterval(() => {
      if (checking) return;
      checking = true;
      void completeIfAuthenticated().then((complete) => {
        checking = false;
        if (complete) return;
        if (popup.closed) {
          const now = Date.now();
          googleClosedAtRef.current ??= now;
          if (now - googleClosedAtRef.current >= GOOGLE_CLOSE_GRACE_MS) {
            stopGooglePolling();
            setBusy(null);
            setError("Sign-in did not reach the Explorer. Try again.");
          }
        } else {
          googleClosedAtRef.current = null;
        }
      });
    }, GOOGLE_POLL_INTERVAL_MS);
  };

  const submitEmail = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy("email");
    try {
      await startFudgeEmailLogin(email);
      setStep("pin");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to send a sign-in code.",
      );
    } finally {
      setBusy(null);
    }
  };

  const submitPin = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy("pin");
    try {
      await verifyFudgeEmailLogin(email, pin);
      if (!(await completeIfAuthenticated())) {
        throw new Error("Sign-in completed, but access could not be verified.");
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to verify that code.",
      );
      setBusy(null);
    }
  };

  return (
    <PromptModal
      title="Sign in to continue"
      description="Sign in to your Fudge account to continue to checkout."
      onClose={onClose}
    >
      <button
        type="button"
        className="prompt-auth-google"
        data-autofocus
        disabled={busy !== null}
        onClick={startGoogle}
      >
        {busy === "google" ? (
          <LoaderCircle className="size-5 prompt-modal-spinner" />
        ) : (
          <span className="prompt-auth-google-icon">
            <GoogleIcon />
          </span>
        )}
        <span>Continue with Google</span>
      </button>

      <div className="prompt-auth-divider" aria-hidden="true">
        <span>or</span>
      </div>

      {step === "email" ? (
        <form className="prompt-auth-form" onSubmit={submitEmail}>
          <label htmlFor="prompt-auth-email">Email address</label>
          <div className="prompt-auth-input-wrap">
            <Mail className="size-4" strokeWidth={1.6} aria-hidden="true" />
            <input
              id="prompt-auth-email"
              type="email"
              autoComplete="email"
              value={email}
              disabled={busy !== null}
              required
              placeholder="you@example.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <button type="submit" disabled={busy !== null || !email.trim()}>
            {busy === "email" ? (
              <LoaderCircle className="size-4 prompt-modal-spinner" />
            ) : null}
            <span>Email me a sign-in code</span>
            {busy !== "email" ? (
              <ChevronRight className="size-4" strokeWidth={1.6} />
            ) : null}
          </button>
        </form>
      ) : (
        <form className="prompt-auth-form" onSubmit={submitPin}>
          <button
            type="button"
            className="prompt-auth-back"
            disabled={busy !== null}
            onClick={() => {
              setStep("email");
              setPin("");
              setError("");
            }}
          >
            <ArrowLeft className="size-3.5" strokeWidth={1.6} />
            Change email
          </button>
          <label htmlFor="prompt-auth-pin">
            Six-digit code sent to {email}
          </label>
          <input
            id="prompt-auth-pin"
            className="prompt-auth-pin"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={pin}
            disabled={busy !== null}
            required
            placeholder="000000"
            onChange={(event) =>
              setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
          />
          <button type="submit" disabled={busy !== null || pin.length !== 6}>
            {busy === "pin" ? (
              <LoaderCircle className="size-4 prompt-modal-spinner" />
            ) : null}
            <span>Verify and continue</span>
            {busy !== "pin" ? (
              <ChevronRight className="size-4" strokeWidth={1.6} />
            ) : null}
          </button>
        </form>
      )}

      {error ? (
        <p className="prompt-modal-error" role="alert">
          {error}
        </p>
      ) : null}
    </PromptModal>
  );
}

type PlanFeatureValue = boolean | string;

const PLAN_FEATURE_ROWS: Array<{
  label: string;
  values: Record<FudgePlanId, PlanFeatureValue>;
}> = [
  {
    label: "Usage limits",
    values: {
      explorer: "Prompt copying",
      chat: "1×",
      pro: "10×",
      studio: "50×",
    },
  },
  {
    label: "Copy prompts for ChatGPT / Claude",
    values: { explorer: true, chat: true, pro: true, studio: true },
  },
  {
    label: "Website review",
    values: { explorer: false, chat: true, pro: true, studio: true },
  },
  {
    label: "Competitor search & inspect",
    values: { explorer: false, chat: true, pro: true, studio: true },
  },
  {
    label: "Font alternatives (free & paid)",
    values: { explorer: false, chat: true, pro: true, studio: true },
  },
  {
    label: "Color palettes & accessibility",
    values: { explorer: false, chat: true, pro: true, studio: true },
  },
  {
    label: "Chrome extension",
    values: { explorer: true, chat: true, pro: true, studio: true },
  },
  {
    label: "Bookmarks",
    values: { explorer: true, chat: true, pro: true, studio: true },
  },
  {
    label: "Site design guide",
    values: {
      explorer: "Included",
      chat: "Generate from your site",
      pro: "Generate from your site",
      studio: "Generate from your site",
    },
  },
  {
    label: "Fudge chat agent",
    values: { explorer: false, chat: true, pro: true, studio: true },
  },
  {
    label: "In Cursor / Claude / Codex / any MCP client",
    values: { explorer: false, chat: false, pro: true, studio: true },
  },
];

function PlanFeature({
  label,
  plan,
  value,
}: {
  label: string;
  plan: FudgePlanId;
  value: PlanFeatureValue;
}) {
  const highlighted = plan === "studio";
  if (typeof value === "string") {
    return (
      <span
        className={`prompt-pricing-feature-copy${highlighted ? " is-highlighted" : ""}`}
      >
        {value}
      </span>
    );
  }
  return (
    <span
      className={`prompt-pricing-feature-mark${value ? " is-included" : ""}${highlighted ? " is-highlighted" : ""}`}
      aria-label={`${label} ${value ? "included" : "not included"}`}
    >
      {value ? (
        <Check className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
      ) : (
        <X className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
      )}
    </span>
  );
}

function PlanPrice({
  monthlyPrice,
  period,
  yearlyPrice,
}: {
  monthlyPrice: string;
  period: ExplorerBillingPeriod;
  yearlyPrice: string;
}) {
  const selected = period === "monthly" ? monthlyPrice : yearlyPrice;
  return (
    <span className="prompt-pricing-price">
      <b>{selected.split("/")[0]}</b>
      <small>{period}</small>
    </span>
  );
}

export function ExplorerPricingModal({
  onCheckout,
  onClose,
}: {
  onCheckout: (
    plan: FudgePlanId,
    period: ExplorerBillingPeriod,
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [period, setPeriod] = useState<ExplorerBillingPeriod>("monthly");
  const [plans, setPlans] =
    useState<Awaited<ReturnType<typeof readFudgePlans>>>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutBusy, setCheckoutBusy] = useState<FudgePlanId | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void readFudgePlans().then((next) => {
      if (!active) return;
      setPlans(next);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const checkout = async (plan: FudgePlanId) => {
    setCheckoutBusy(plan);
    setError("");
    try {
      await onCheckout(plan, period);
    } catch {
      setCheckoutBusy(null);
      setError(
        "Checkout is unavailable right now. Try again or open the full pricing page.",
      );
    }
  };

  return (
    <PromptModal
      title="Choose a Fudge plan"
      description="Explorer lets you use captured website prompts in ChatGPT or Claude. Chat adds the Fudge chat agent, and Pro and Studio add hosted MCP."
      onClose={onClose}
      size="pricing"
    >
      <div
        className="prompt-pricing-period"
        role="radiogroup"
        aria-label="Billing period"
      >
        <button
          type="button"
          role="radio"
          aria-checked={period === "monthly"}
          data-autofocus
          className={period === "monthly" ? "is-selected" : ""}
          onClick={() => setPeriod("monthly")}
        >
          Monthly
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={period === "yearly"}
          className={period === "yearly" ? "is-selected" : ""}
          onClick={() => setPeriod("yearly")}
        >
          Yearly
          <span>Save 17%</span>
        </button>
      </div>

      {loading ? (
        <div
          className="prompt-pricing-loading"
          aria-label="Loading Fudge pricing"
        >
          <span />
          <span />
          <span />
          <span />
        </div>
      ) : plans ? (
        <>
          <div className="prompt-pricing-table-wrap">
            <table className="prompt-pricing-table">
              <caption>Fudge plan and feature comparison</caption>
              <thead>
                <tr>
                  <th scope="col" className="prompt-pricing-table-lead">
                    <span>Plans</span>
                    <strong>Choose your plan</strong>
                  </th>
                  {plans.map((plan) => (
                    <th key={plan.id} scope="col">
                      <div
                        className={`prompt-pricing-tier-heading is-${plan.id}`}
                      >
                        <div>
                          <strong>{plan.name}</strong>
                          <PlanPrice
                            monthlyPrice={plan.monthlyPrice}
                            period={period}
                            yearlyPrice={plan.yearlyPrice}
                          />
                        </div>
                        <p>{plan.note}</p>
                        <button
                          type="button"
                          disabled={checkoutBusy !== null || !plan.configured}
                          onClick={() => void checkout(plan.id)}
                        >
                          {checkoutBusy === plan.id ? (
                            <LoaderCircle className="size-4 prompt-modal-spinner" />
                          ) : null}
                          <span>
                            {plan.configured
                              ? `Choose ${plan.name}`
                              : "Unavailable"}
                          </span>
                          {plan.id === "studio" &&
                          checkoutBusy !== plan.id &&
                          plan.configured ? (
                            <span className="prompt-pricing-popular">
                              Most Popular
                            </span>
                          ) : null}
                          {checkoutBusy !== plan.id &&
                          plan.configured &&
                          plan.id !== "studio" ? (
                            <ChevronRight
                              className="size-4"
                              strokeWidth={1.7}
                            />
                          ) : null}
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="prompt-pricing-table-section">
                  <th colSpan={plans.length + 1}>What’s included</th>
                </tr>
                {PLAN_FEATURE_ROWS.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {plans.map((plan) => (
                      <td key={plan.id}>
                        <PlanFeature
                          label={`${row.label} in ${plan.name}`}
                          plan={plan.id}
                          value={row.values[plan.id]}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="prompt-pricing-mobile-plans">
            {plans.map((plan) => (
              <section
                key={plan.id}
                className={`prompt-pricing-mobile-plan is-${plan.id}`}
                aria-label={`${plan.name} plan`}
              >
                <div className="prompt-pricing-mobile-plan-heading">
                  <div>
                    <strong>{plan.name}</strong>
                    <PlanPrice
                      monthlyPrice={plan.monthlyPrice}
                      period={period}
                      yearlyPrice={plan.yearlyPrice}
                    />
                  </div>
                  <p>{plan.note}</p>
                </div>
                <dl>
                  {PLAN_FEATURE_ROWS.map((row) => (
                    <div key={row.label}>
                      <dt>{row.label}</dt>
                      <dd>
                        <PlanFeature
                          label={`${row.label} in ${plan.name}`}
                          plan={plan.id}
                          value={row.values[plan.id]}
                        />
                      </dd>
                    </div>
                  ))}
                </dl>
                <button
                  type="button"
                  className="prompt-pricing-mobile-checkout"
                  disabled={checkoutBusy !== null || !plan.configured}
                  onClick={() => void checkout(plan.id)}
                >
                  {checkoutBusy === plan.id ? (
                    <LoaderCircle className="size-4 prompt-modal-spinner" />
                  ) : null}
                  <span>
                    {plan.configured ? `Choose ${plan.name}` : "Unavailable"}
                  </span>
                  {plan.id === "studio" &&
                  checkoutBusy !== plan.id &&
                  plan.configured ? (
                    <span className="prompt-pricing-popular">Most Popular</span>
                  ) : null}
                  {checkoutBusy !== plan.id &&
                  plan.configured &&
                  plan.id !== "studio" ? (
                    <ChevronRight className="size-4" strokeWidth={1.7} />
                  ) : null}
                </button>
              </section>
            ))}
          </div>
        </>
      ) : (
        <div className="prompt-pricing-unavailable" role="status">
          Pricing could not be loaded here. Open the full pricing page for
          current plan details.
        </div>
      )}

      {error ? (
        <p className="prompt-modal-error" role="alert">
          {error}
        </p>
      ) : null}

      <a
        className="prompt-pricing-details"
        href={FULL_PRICING_URL}
        target="_blank"
        rel="noreferrer"
      >
        <span>Open the full pricing page</span>
        <ExternalLink className="size-3.5" strokeWidth={1.6} />
      </a>
    </PromptModal>
  );
}
