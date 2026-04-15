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

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parent: { database_id: NOTION_DB_ID },
      properties: {
        Name: { title: [{ text: { content: content.notion_title } }] },
        Status: { select: { name: "Draft" } },
        Pijler: { select: { name: content.pillar } },
        Format: { select: { name: content.format } },
      },
      children,
    }),
  });

  if (!res.ok) throw new Error(`Notion error: ${res.status}`);
  const page = await res.json();
  return page.url;
}

// ─── Claude content generatie ─────────────────────────────────────────────────

async function generateContent(input: string, recentPosts: any[]) {
  const recentSummary = recentPosts.length > 0
    ? recentPosts.map((p) => `- ${p.format} | ${p.pillar} | ${p.status}`).join("\n")
    : "Geen recente posts.";

  const msg = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `Je bent de content strategist van Joemen.

Joemen merkidentiteit:
- Tone: direct, oprecht, geen trucjes, strategie-gericht
- Tagline: "Menselijke marketing als fundament voor groei"
- Doelgroep: ondernemers die authentiek willen groeien
- 4 content pijlers: PROOF (resultaten), VALUE (tips/kennis), CONNECTION (persoonlijk), ENGAGEMENT (interactie)

Recente posts:
${recentSummary}

Input van Jelle:
"${input}"

Bepaal de beste pijler op basis van wat ontbreekt en maak de content.

Return ENKEL een JSON object, niets anders:
{
  "pillar": "PROOF | VALUE | CONNECTION | ENGAGEMENT",
  "format": "reel | carrousel | caption-only",
  "reel_script": {
    "hook": "...",
    "body": ["stap 1", "stap 2", "stap 3"],
    "cta": "..."
  },
  "caption": "volledige caption met hashtags",
  "carousel_slides": ["slide 1", "slide 2"],
  "notion_title": "korte titel max 60 tekens"
}

carousel_slides: alleen bij carrousel, anders [].
reel_script: alleen bij reel, anders null.`,
    }],
  });

  const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

// ─── Bot handlers ─────────────────────────────────────────────────────────────

bot.command("start", (ctx) => {
  if (!ALLOWED_USERS.includes(ctx.from?.id || 0)) return;
  ctx.reply("👋 *Joemen Content Agent actief.*\n\nStuur een idee en ik maak er een content draft van in Notion.\n\n*Pijlers:* PROOF · VALUE · CONNECTION · ENGAGEMENT", { parse_mode: "Markdown" });
});

bot.command("id", (ctx) => {
  ctx.reply(`Jouw user ID: \`${ctx.from?.id}\``, { parse_mode: "Markdown" });
});

bot.on("message:text", async (ctx) => {
  if (!ALLOWED_USERS.includes(ctx.from?.id || 0)) return;
  if (ctx.message.text.startsWith("/")) return;

  const statusMsg = await ctx.reply("✍️ Bezig...");

  try {
    const recentPosts = await getRecentPosts();
    const content = await generateContent(ctx.message.text, recentPosts);
    const notionUrl = await saveToNotion(content, ctx.message.text);

    const pillarEmoji: Record<string, string> = { PROOF: "🏆", VALUE: "💡", CONNECTION: "❤️", ENGAGEMENT: "💬" };
    const formatLabel: Record<string, string> = { reel: "🎬 Reel", carrousel: "🖼️ Carrousel", "caption-only": "✍️ Caption" };

    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `✅ *Draft aangemaakt*\n\n${pillarEmoji[content.pillar] || "📌"} *Pijler:* ${content.pillar}\n${formatLabel[content.format] || content.format}\n📌 *Titel:* ${content.notion_title}\n\n🔗 [Open in Notion](${notionUrl})`,
      { parse_mode: "Markdown" }
    );
  } catch (err: any) {
    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `❌ Fout: ${err.message}`);
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

console.log("Joemen Content Agent starting...");
const botInfo = await bot.api.getMe();
console.log(`Bot started: @${botInfo.username}`);
bot.start();
