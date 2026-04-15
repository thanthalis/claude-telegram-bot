/**
 * Joemen Content Agent
 * Telegram bot → Claude API → Notion
 * Geen Claude Code nodig, puur Anthropic API
 */

import { Bot } from "grammy";
import Anthropic from "@anthropic-ai/sdk";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ALLOWED_USERS = (process.env.TELEGRAM_ALLOWED_USERS || "")
  .split(",")
  .map((x) => parseInt(x.trim()))
  .filter((x) => !isNaN(x));

const NOTION_API_KEY = process.env.NOTION_API_KEY || "";
const NOTION_DB_ID = "48ebbe08f78d4d45a5e8db672d83677d";

// ─── Notion helpers ───────────────────────────────────────────────────────────

async function getRecentPosts() {
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        page_size: 10,
        sorts: [{ property: "Created", direction: "descending" }],
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results.map((page: any) => ({
      pillar: page.properties.Pijler?.select?.name || "",
      format: page.properties.Format?.select?.name || "",
      status: page.properties.Status?.select?.name || "",
    }));
  } catch {
    return [];
  }
}

async function saveToNotion(content: any, input: string): Promise<string> {
  const children: any[] = [
    {
      object: "block",
      type: "callout",
      callout: {
        rich_text: [{ type: "text", text: { content: `🎙️ "${input}"` } }],
        icon: { emoji: "🎤" },
        color: "gray_background",
      },
    },
    { object: "block", type: "divider", divider: {} },
  ];

  if (content.reel_script) {
    children.push(
      { object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: "🎬 Reel Script" } }] } },
      { object: "block", type: "heading_3", heading_3: { rich_text: [{ type: "text", text: { content: "Hook" } }] } },
      { object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: content.reel_script.hook } }] } },
      { object: "block", type: "heading_3", heading_3: { rich_text: [{ type: "text", text: { content: "Body" } }] } },
      ...content.reel_script.body.map((step: string) => ({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ type: "text", text: { content: step } }] },
      })),
      { object: "block", type: "heading_3", heading_3: { rich_text: [{ type: "text", text: { content: "CTA" } }] } },
      { object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: content.reel_script.cta } }] } }
    );
  }

  if (content.carousel_slides?.length > 0) {
    children.push(
      { object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: "🖼️ Carrousel Slides" } }] } },
      ...content.carousel_slides.map((slide: string) => ({
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: { rich_text: [{ type: "text", text: { content: slide } }] },
      }))
    );
  }

  children.push(
    { object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: "✍️ Caption" } }] } },
    { object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: content.caption } }] } }
  );

  const res = await fet
