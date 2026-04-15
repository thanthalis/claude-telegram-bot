import { homedir } from "os";
import { dirname } from "path";

const HOME = homedir();
const REPO_ROOT = dirname(import.meta.path);

export const MCP_SERVERS: Record
  string,
  | { command: string; args?: string[]; env?: Record<string, string> }
  | { type: "http"; url: string; headers?: Record<string, string> }
> = {

  "ask-user": {
    command: "bun",
    args: ["run", `${REPO_ROOT}/ask_user_mcp/server.ts`],
  },

  "send-file": {
    command: "bun",
    args: ["run", `${REPO_ROOT}/send_file_mcp/server.ts`],
  },

  "notion": {
    type: "http",
    url: "https://mcp.notion.com/mcp",
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY || ""}`,
    },
  },

};
