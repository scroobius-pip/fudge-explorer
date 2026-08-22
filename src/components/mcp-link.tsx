import { Plug } from "lucide-react";
import { haptics } from "@/lib/haptics";
import { sfx } from "@/lib/sfx";
import { cn } from "@/lib/utils";

export function McpLink({
  embedded = false,
  onNavigate,
}: {
  embedded?: boolean;
  onNavigate?: () => void;
} = {}) {
  return (
    <a
      className={cn(
        "mcp-launch pointer-events-auto [backdrop-filter:blur(36px)_saturate(1.08)]",
        embedded && "is-embedded",
      )}
      href="https://design.withfudge.com/"
      target="_blank"
      rel="noreferrer"
      onPointerEnter={() => sfx.contact("paper")}
      onPointerDown={() => sfx.press("paper")}
      onClick={() => {
        haptics.selection();
        onNavigate?.();
      }}
    >
      <Plug className="size-4" strokeWidth={1.7} />
      Install MCP
    </a>
  );
}
