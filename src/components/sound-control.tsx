import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { SOUND_THEMES, sfx, type SoundThemeId } from "@/lib/sfx";
import { cn } from "@/lib/utils";

export function SoundControl() {
  const [theme, setTheme] = useState<SoundThemeId>(() => sfx.getTheme());
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => sfx.subscribeTheme(setTheme), []);

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

  const choose = (next: SoundThemeId) => {
    sfx.setTheme(next);
    if (next !== "off") window.requestAnimationFrame(() => sfx.preview());
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="sound-control">
      <button
        type="button"
        className={cn("sound-launch", open && "is-open")}
        aria-label={theme === "off" ? "Enable interface sound" : "Sound theme"}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {theme === "off" ? (
          <VolumeX className="size-4" strokeWidth={1.7} />
        ) : (
          <Volume2 className="size-4" strokeWidth={1.7} />
        )}
        <span>{SOUND_THEMES.find((item) => item.id === theme)?.label}</span>
      </button>
      {open && (
        <div className="sound-menu" role="menu" aria-label="Sound theme">
          {SOUND_THEMES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitemradio"
              aria-checked={item.id === theme}
              className={cn(item.id === theme && "is-active")}
              onClick={() => choose(item.id)}
            >
              <span>{item.label}</span>
              <small>{item.description}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
