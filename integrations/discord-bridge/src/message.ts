const discordMessageLimit = 2_000;

export function splitDiscordMessage(content: string, limit = 1_900): string[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  if (limit < 100 || limit > discordMessageLimit) {
    throw new Error("Discord message split limit must be between 100 and 2000");
  }

  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > limit) {
    let boundary = remaining.lastIndexOf("\n", limit);
    if (boundary < Math.floor(limit * 0.55)) {
      boundary = remaining.lastIndexOf(" ", limit);
    }
    if (boundary < Math.floor(limit * 0.55)) {
      boundary = limit;
    }
    chunks.push(remaining.slice(0, boundary).trimEnd());
    remaining = remaining.slice(boundary).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

export function formatOutbound(author: string, content: string): string {
  const cleanAuthor = author.trim() || "Sandora";
  return `**${cleanAuthor}**\n${content.trim()}`;
}
