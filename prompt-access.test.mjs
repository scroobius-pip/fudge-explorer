import assert from "node:assert/strict";
import test from "node:test";

const {
  FUDGE_BILLING_CHECKOUT_URL,
  FUDGE_BILLING_PLANS_URL,
  FUDGE_BILLING_STATUS_URL,
  FUDGE_PIN_START_URL,
  FUDGE_PIN_VERIFY_URL,
  aiProviderUrl,
  classifyPromptAccess,
  createFudgeCheckout,
  fudgeCheckoutLabel,
  fudgeLoginUrl,
  performPromptUse,
  readFudgePlans,
  readPromptAccess,
  startFudgeEmailLogin,
  verifyFudgeEmailLogin,
} = await import("./src/lib/fudge/prompt-access.ts");

const status = (overrides = {}) => ({
  authenticated: true,
  plan: "none",
  subscribed: false,
  entitlements: { promptCopy: false, chat: false, mcp: false },
  ...overrides,
});

test("signed-out billing status stays unauthenticated", () => {
  const access = classifyPromptAccess(
    status({
      authenticated: false,
      entitlements: { promptCopy: false, chat: false, mcp: false },
    }),
  );
  assert.deepEqual(access, { kind: "signed_out" });

  const login = new URL(fudgeLoginUrl());
  assert.equal(login.origin, "https://api.withfudge.com");
  assert.equal(login.pathname, "/auth/google");
  assert.equal(
    login.searchParams.get("from"),
    "https://explorer.withfudge.com/?fudge-auth=complete",
  );
});

test("a signed-in user without a plan requires checkout", () => {
  const access = classifyPromptAccess(status());
  assert.deepEqual(access, { kind: "checkout" });
});

test("Explorer promptCopy entitlement authorizes prompt use without Chat or MCP", () => {
  const billing = status({
    plan: "explorer",
    subscribed: true,
    entitlements: { promptCopy: true, chat: false, mcp: false },
  });
  assert.deepEqual(classifyPromptAccess(billing), { kind: "authorized" });
  assert.equal(billing.entitlements.chat, false);
  assert.equal(billing.entitlements.mcp, false);
});

test("Chat standard promptCopy entitlement authorizes prompt use without MCP", () => {
  const billing = status({
    plan: "standard",
    subscribed: true,
    entitlements: { promptCopy: true, chat: true, mcp: false },
  });
  assert.deepEqual(classifyPromptAccess(billing), { kind: "authorized" });
  assert.equal(billing.entitlements.mcp, false);
});

test("Pro promptCopy entitlement authorizes prompt use", () => {
  assert.deepEqual(
    classifyPromptAccess(
      status({
        plan: "pro",
        subscribed: true,
        entitlements: { promptCopy: true, chat: true, mcp: true },
      }),
    ),
    { kind: "authorized" },
  );
});

test("Studio promptCopy entitlement authorizes prompt use", () => {
  assert.deepEqual(
    classifyPromptAccess(
      status({
        plan: "studio",
        subscribed: true,
        entitlements: { promptCopy: true, chat: true, mcp: true },
      }),
    ),
    { kind: "authorized" },
  );
});

test("authorization ignores subscribed and plan fields", () => {
  assert.deepEqual(
    classifyPromptAccess(
      status({
        plan: "studio",
        subscribed: true,
        entitlements: { promptCopy: false, chat: true, mcp: true },
      }),
    ),
    { kind: "checkout" },
  );
  assert.deepEqual(
    classifyPromptAccess(
      status({
        plan: "none",
        subscribed: false,
        entitlements: { promptCopy: true, chat: false, mcp: false },
      }),
    ),
    { kind: "authorized" },
  );
});

test("malformed billing status denies prompt access", () => {
  const malformed = [
    null,
    [],
    {},
    { authenticated: true },
    { authenticated: "true", entitlements: { promptCopy: true } },
    { authenticated: true, entitlements: {} },
    { authenticated: true, entitlements: { promptCopy: "true" } },
    { authenticated: false, entitlements: { promptCopy: true } },
  ];
  for (const value of malformed) {
    assert.deepEqual(classifyPromptAccess(value), { kind: "denied" });
  }
});

test("billing status GET includes credentials and accepts only a valid response", async () => {
  const calls = [];
  const access = await readPromptAccess(async (url, init) => {
    calls.push({ url, init });
    return Response.json(
      status({ entitlements: { promptCopy: true, chat: false, mcp: false } }),
    );
  });
  assert.deepEqual(access, { kind: "authorized" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, FUDGE_BILLING_STATUS_URL);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.credentials, "include");
});

test("billing API failure denies prompt access", async () => {
  assert.deepEqual(
    await readPromptAccess(async () => {
      throw new Error("offline");
    }),
    { kind: "denied" },
  );
  assert.deepEqual(
    await readPromptAccess(
      async () => new Response("unavailable", { status: 503 }),
    ),
    { kind: "denied" },
  );
  assert.deepEqual(
    await readPromptAccess(async () => new Response("not-json")),
    { kind: "denied" },
  );
});

test("email sign-in start uses the existing Fudge PIN endpoint", async () => {
  const calls = [];
  await startFudgeEmailLogin("  Person@Example.COM ", async (url, init) => {
    calls.push({ url, init });
    return Response.json({ ok: true });
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, FUDGE_PIN_START_URL);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.credentials, "include");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    email: "person@example.com",
  });
});

test("email sign-in verification uses the existing Fudge PIN endpoint", async () => {
  const calls = [];
  await verifyFudgeEmailLogin(
    "Person@Example.COM",
    "123456",
    async (url, init) => {
      calls.push({ url, init });
      return Response.json({ user: { id: "user-1" } });
    },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, FUDGE_PIN_VERIFY_URL);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.credentials, "include");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    email: "person@example.com",
    pin: "123456",
  });
});

test("invalid email and PIN values never reach the authentication API", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return Response.json({ ok: true });
  };
  await assert.rejects(
    startFudgeEmailLogin("not-an-email", fetcher),
    /valid email/i,
  );
  await assert.rejects(
    verifyFudgeEmailLogin("person@example.com", "123", fetcher),
    /six-digit/i,
  );
  assert.equal(calls, 0);
});

const PLAN_FIXTURES = [
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: "$49/mo",
    quarterlyPrice: "$117/qtr",
    yearlyPrice: "$390/yr",
    trialDays: { monthly: 0, quarterly: 3, yearly: 3 },
    note: "Full access for individual projects.",
    configured: true,
  },
  {
    id: "studio",
    name: "Studio",
    monthlyPrice: "$119/mo",
    quarterlyPrice: "$297/qtr",
    yearlyPrice: "$990/yr",
    trialDays: { monthly: 0, quarterly: 3, yearly: 3 },
    note: "Full access for teams and client work.",
    configured: true,
  },
];

test("all Fudge plans load from the deployed plan catalog", async () => {
  const calls = [];
  const plans = await readFudgePlans(async (url, init) => {
    calls.push({ url, init });
    return Response.json({
      plans: PLAN_FIXTURES.map((plan) => ({
        ...plan,
        features: ["Feature"],
      })),
    });
  });
  assert.deepEqual(plans, PLAN_FIXTURES);
  assert.equal(calls[0].url, FUDGE_BILLING_PLANS_URL);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.credentials, "include");
});

test("missing, malformed, and failed Fudge pricing returns no plans", async () => {
  for (const fields of [
    { monthlyPrice: undefined },
    { trialDays: undefined },
    { trialDays: { quarterly: 3, yearly: 3 } },
    { trialDays: { monthly: "0", quarterly: 3, yearly: 3 } },
    { trialDays: { monthly: -1, quarterly: 3, yearly: 3 } },
  ]) {
    assert.equal(await readFudgePlans(async () => Response.json({
      plans: PLAN_FIXTURES.map((plan) => ({ ...plan, ...fields })),
    })), null);
  }
  assert.equal(
    await readFudgePlans(async () =>
      Response.json({ plans: PLAN_FIXTURES.slice(0, 1) }),
    ),
    null,
  );
  assert.equal(
    await readFudgePlans(async () =>
      Response.json({
        plans: PLAN_FIXTURES.map((plan) =>
          plan.id === "pro" ? { ...plan, quarterlyPrice: 117 } : plan,
        ),
      }),
    ),
    null,
  );
  assert.equal(
    await readFudgePlans(
      async () => new Response("unavailable", { status: 503 }),
    ),
    null,
  );
  assert.equal(
    await readFudgePlans(async () => {
      throw new Error("offline");
    }),
    null,
  );
});

test("prompt content is not constructed before authorization", async () => {
  for (const access of [
    { kind: "signed_out" },
    { kind: "checkout" },
    { kind: "denied" },
  ]) {
    let builds = 0;
    let copies = 0;
    const result = await performPromptUse({
      readAccess: async () => access,
      buildPrompt: () => {
        builds += 1;
        return "secret prompt";
      },
      copyPrompt: async () => {
        copies += 1;
      },
      onCopied: () => assert.fail("copy confirmation must stay hidden"),
      openProvider: () => assert.fail("provider must not open"),
    });
    assert.equal(result.kind, "blocked");
    assert.equal(builds, 0);
    assert.equal(copies, 0);
  }
});

test("authorized provider use copies and confirms before opening", async () => {
  const events = [];
  const result = await performPromptUse({
    readAccess: async () => {
      events.push("verify");
      return { kind: "authorized" };
    },
    buildPrompt: () => {
      events.push("build");
      return "capture prompt";
    },
    copyPrompt: async (prompt) => {
      events.push(`copy:${prompt}`);
    },
    onCopied: () => events.push("Prompt copied."),
    openProvider: (prompt) => events.push(`open:${prompt}`),
  });
  assert.equal(result.kind, "copied");
  assert.deepEqual(events, [
    "verify",
    "build",
    "copy:capture prompt",
    "Prompt copied.",
    "open:capture prompt",
  ]);
});

test("clipboard rejection prevents confirmation and provider opening", async () => {
  const events = [];
  const result = await performPromptUse({
    readAccess: async () => ({ kind: "authorized" }),
    buildPrompt: () => {
      events.push("build");
      return "capture prompt";
    },
    copyPrompt: async () => {
      events.push("copy");
      throw new Error("denied");
    },
    onCopied: () => events.push("confirmed"),
    openProvider: (prompt) => events.push(`open:${prompt}`),
  });
  assert.equal(result.kind, "copy_failed");
  assert.deepEqual(events, ["build", "copy"]);
});

for (const plan of ["pro", "studio"]) {
  for (const period of ["monthly", "quarterly", "yearly"]) {
    test(`${period} ${plan} checkout sends the exact billing request`, async () => {
      const calls = [];
      const destination = await createFudgeCheckout(
        plan,
        period,
        async (url, init) => {
          calls.push({ url, init });
          return Response.json({
            url: `https://checkout.example/${plan}/${period}`,
          });
        },
      );
      assert.equal(destination, `https://checkout.example/${plan}/${period}`);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, FUDGE_BILLING_CHECKOUT_URL);
      assert.equal(calls[0].init.method, "POST");
      assert.equal(calls[0].init.credentials, "include");
      assert.equal(calls[0].init.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(calls[0].init.body), { plan, period });
    });
  }
}

test("checkout labels use the catalog trial rules for both plans", () => {
  for (const plan of PLAN_FIXTURES) {
    assert.equal(fudgeCheckoutLabel(plan, "monthly"), `Choose ${plan.name}`);
    assert.equal(fudgeCheckoutLabel(plan, "quarterly"), "Start 3-day free trial");
    assert.equal(fudgeCheckoutLabel(plan, "yearly"), "Start 3-day free trial");
    assert.equal(fudgeCheckoutLabel({ ...plan, configured: false }, "monthly"), "Unavailable");
  }
});

test("provider destinations prefill the copied prompt", () => {
  const prompt = "Review this capture:\nhttps://pin.fontofweb.com/10087";
  const expected = {
    fudge: ["https://design.withfudge.com", "/", "prompt"],
    chatgpt: ["https://chatgpt.com", "/"],
    claude: ["https://claude.ai", "/new"],
    gemini: ["https://gemini.google.com", "/app"],
  };
  for (const provider of ["fudge", "chatgpt", "claude", "gemini"]) {
    const destination = new URL(aiProviderUrl(provider, prompt));
    assert.equal(destination.origin, expected[provider][0]);
    assert.equal(destination.pathname, expected[provider][1]);
    assert.equal(
      destination.searchParams.get(expected[provider][2] ?? "q"),
      prompt,
    );
    assert.equal(destination.hash, "");
  }
});
