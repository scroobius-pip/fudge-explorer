import { useEffect, useRef, useState } from "react";
import { onImpulse, slideOf, type Impulse } from "@/lib/impulse";

export function Juice() {
  const [ripple, setRipple] = useState<{ x: number; y: number; on: boolean }>({
    x: 0,
    y: 0,
    on: false,
  });
  const timer = useRef(0);

  useEffect(() => {
    return onImpulse((impulse: Impulse) => {
      const [dx, dy] = slideOf(impulse.axis, impulse.inbound).split(",");
      document.documentElement.style.setProperty("--dx", dx.trim());
      document.documentElement.style.setProperty("--dy", dy.trim());
      setRipple({ x: impulse.x, y: impulse.y, on: true });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(
        () => setRipple((value) => ({ ...value, on: false })),
        380,
      );
    });
  }, []);

  return (
    <div
      className={ripple.on ? "juice-ripple is-on" : "juice-ripple"}
      style={{ left: ripple.x, top: ripple.y }}
    />
  );
}
