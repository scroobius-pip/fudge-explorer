import { Plug } from "lucide-react";
import { sfx } from "@/lib/sfx";

export function McpLink() {
  return (
    <a
      className="mcp-launch pointer-events-auto [backdrop-filter:blur(36px)_saturate(1.08)]"
      href="https://design.withfudge.com/"
      target="_blank"
      rel="noreferrer"
      onPointerEnter={() => sfx.contact("paper")}
      onPointerDown={() => sfx.press("paper")}
    >
      <Plug className="size-4" strokeWidth={1.7} />
      Install MCP
    </a>
  );
}
