import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { McpLink } from "@/components/mcp-link";
import { SoundControl } from "@/components/sound-control";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (
        event instanceof PointerEvent &&
        rootRef.current?.contains(event.target as Node)
      ) {
        return;
      }
      setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="mobile-menu">
      <button
        type="button"
        className={cn("mobile-menu-launch", open && "is-open")}
        aria-label={open ? "Close Explorer menu" : "Open Explorer menu"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          haptics.selection();
          setOpen((value) => !value);
        }}
      >
        {open ? (
          <X className="size-4" strokeWidth={1.8} />
        ) : (
          <Menu className="size-4" strokeWidth={1.8} />
        )}
      </button>
      {open && (
        <div
          className="mobile-menu-panel"
          role="dialog"
          aria-label="Explorer menu"
        >
          <SoundControl embedded />
          <McpLink embedded onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
