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
    id: "explorer",
    name: "Explorer",
    monthlyPrice: "$9/mo",
    yearlyPrice: "$90/yr",
    note: "Use captured prompts.",
    configured: true,
  },
  {
    id: "chat",
    name: "Chat",
    monthlyPrice: "$19/mo",
    yearlyPrice: "$190/yr",
    note: "Work in Fudge Chat.",
    configured: true,
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: "$29/mo",
    yearlyPrice: "$290/yr",
    note: "Use hosted MCP.",
    configured: true,
  },
  {
    id: "studio",
    name: "Studio",
    monthlyPrice: "$99/mo",
    yearlyPrice: "$990/yr",
    note: "Run high-volume work.",
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
  assert.equal(
    await readFudgePlans(async () =>
      Response.json({ plans: PLAN_FIXTURES.slice(0, 3) }),
    ),
    null,
  );
  assert.equal(
    await readFudgePlans(async () =>
      Response.json({
        plans: PLAN_FIXTURES.map((plan) =>
          plan.id === "explorer" ? { ...plan, monthlyPrice: 9 } : plan,
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

for (const plan of ["explorer", "chat", "pro", "studio"]) {
  for (const period of ["monthly", "yearly"]) {
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

test("provider destinations prefill the copied prompt", () => {
  const prompt = "Review this capture:\nhttps://pin.fontofweb.com/10087";
  const expected = {
    chatgpt: ["https://chatgpt.com", "/"],
    claude: ["https://claude.ai", "/new"],
    gemini: ["https://gemini.google.com", "/app"],
  };
  for (const provider of ["chatgpt", "claude", "gemini"]) {
    const destination = new URL(aiProviderUrl(provider, prompt));
    assert.equal(destination.origin, expected[provider][0]);
    assert.equal(destination.pathname, expected[provider][1]);
    assert.equal(destination.searchParams.get("q"), prompt);
    assert.equal(destination.hash, "");
  }
});
