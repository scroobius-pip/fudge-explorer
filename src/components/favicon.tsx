import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function Favicon({
  origin,
  className,
}: {
  origin: string;
  className?: string;
}) {
  const host = (() => {
    try {
      return new URL(origin).host.replace(/^www\./, "");
    } catch {
      return origin.replace(/^https?:\/\//, "").split("/")[0] ?? origin;
    }
  })();
  const initial = host.match(/[a-z0-9]/i)?.[0]?.toUpperCase() ?? "•";
  const google = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
  let direct = "";
  try {
    direct = new URL("/favicon.ico", origin).href;
  } catch {
    direct = "";
  }
  const [src, setSrc] = useState(direct || google);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(direct || google);
    setFailed(false);
  }, [direct, google]);

  return (
    <span
      className={cn("favicon", className)}
      aria-hidden="true"
    >
      <span className="favicon-fallback">{initial}</span>
      {!failed && (
        <img
          key={src}
          alt=""
          src={src}
          referrerPolicy="no-referrer"
          decoding="async"
          onLoad={(event) => event.currentTarget.classList.add("loaded")}
          onError={() => {
            if (src !== google) setSrc(google);
            else setFailed(true);
          }}
        />
      )}
    </span>
  );
}
