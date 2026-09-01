import type { FudgeComposer } from "./components/fudge-composer.ts";
import {
  bindComposerToChat,
  bindPeriodControls,
  bindSite,
  pricingHref,
  rememberPlan,
  takePlan,
  type Plan,
} from "./site.ts";

function layoutFloats(root: ParentNode) {
  const field = root.querySelector<HTMLElement>(".home-float");
  if (!field) return;

  const place = () => {
    const bounds = field.getBoundingClientRect();
    const cards = [...field.querySelectorAll<HTMLElement>(".home-float-card")];
    if (bounds.width < 860 || !cards.length) {
      cards.forEach((card) => {
        card.style.left = "";
        card.style.top = "";
      });
      return;
    }
    const gutter = Math.max(24, bounds.width * 0.024);
    const centerLeft = bounds.width * 0.32;
    const centerRight = bounds.width * 0.68;
    const verticalGutter = Math.max(28, bounds.height * 0.04);
    const minimumGap = 40;

    (["left", "right"] as const).forEach((side) => {
      const measured = cards
        .filter((card) => card.dataset.side === side)
        .map((card) => {
          const rect = card.getBoundingClientRect();
          return { card, width: rect.width, height: rect.height };
        });
      if (measured.some(({ width, height }) => !width || !height)) return;
      const targets = [0.07, 0.42, 0.74].map((fraction) => bounds.height * fraction);
      const tops = measured.map(({ height }, index) =>
        Math.max(
          verticalGutter,
          Math.min(targets[index] ?? verticalGutter, bounds.height - verticalGutter - height),
        ),
      );
      for (let index = 1; index < tops.length; index += 1) {
        tops[index] = Math.max(
          tops[index],
          tops[index - 1] + measured[index - 1].height + minimumGap,
        );
      }
      const last = measured.at(-1);
      const overflow =
        last ? tops.at(-1)! + last.height + verticalGutter - bounds.height : 0;
      if (overflow > 0) {
        for (let index = 0; index < tops.length; index += 1) tops[index] -= overflow;
      }
      for (let index = tops.length - 2; index >= 0; index -= 1) {
        tops[index] = Math.min(
          tops[index],
          tops[index + 1] - measured[index].height - minimumGap,
        );
      }
      measured.forEach(({ card, width }, index) => {
        const offset = Number(card.dataset.offset || 0.04);
        card.style.left =
          side === "left"
            ? `${Math.min(Math.max(gutter, bounds.width * offset), centerLeft - width - gutter)}px`
            : `${Math.max(centerRight + gutter, Math.min(bounds.width - width - gutter, bounds.width * (1 - offset) - width))}px`;
        card.style.top = `${tops[index]}px`;
      });
    });
  };

  place();
  requestAnimationFrame(place);
  new ResizeObserver(place).observe(field);

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const onMove = (event: PointerEvent) => {
    const x = (event.clientX / window.innerWidth - 0.5) * 2;
    const y = (event.clientY / window.innerHeight - 0.5) * 2;
    field.querySelectorAll<HTMLElement>(".home-float-card").forEach((card) => {
      const depth = Number(card.dataset.depth || 10);
      card.style.translate = `${x * depth}px ${y * depth}px`;
    });
  };
  const reset = () => {
    field.querySelectorAll<HTMLElement>(".home-float-card").forEach((card) => {
      card.style.translate = "0 0";
    });
  };
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("blur", reset);
}

export function bindHome(root: ParentNode) {
  bindSite(root);
  const composer = root.querySelector<FudgeComposer>("fudge-composer");
  bindComposerToChat(composer);
  root.addEventListener("click", (event) => {
    const example = (event.target as HTMLElement).closest("[data-example]");
    if (example instanceof HTMLElement && example.dataset.example) {
      composer?.setPrompt(example.dataset.example);
    }
  });
  bindPeriodControls(root);
  root.addEventListener("click", (event) => {
    const planButton = (event.target as HTMLElement).closest("[data-plan]");
    if (!(planButton instanceof HTMLElement)) return;
    const plan = planButton.dataset.plan;
    if (plan !== "pro" && plan !== "studio") return;
    const period = takePlan().period;
    rememberPlan(plan as Plan, period);
    location.assign(pricingHref(plan as Plan, period));
  });
  layoutFloats(root);
}
