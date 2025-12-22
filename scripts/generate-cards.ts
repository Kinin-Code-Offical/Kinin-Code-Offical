import fs from "fs";
import path from "path";

interface MetricsPayload {
    generatedAt: string;
    username: string;
    window: { from: string; to: string };
    counts: { commits: number; pullRequests: number; issues: number; reviews: number };
    streak: { current: number; longest: number; lastActive: string | null };
    languages: { name: string; percent: number; color?: string | null }[];
}

interface Theme {
    primary: string;
    secondary: string;
    accent: string;
    muted: string;
}

const ROOT = path.resolve(__dirname, "..");
const METRICS_JSON = path.join(ROOT, "assets", "generated", "metrics.json");
const CONFIG_PATH = path.join(ROOT, "scripts", "config.json");
const IMPACT_CARD = path.join(ROOT, "assets", "cards", "impact-card.svg");
const FOCUS_CARD = path.join(ROOT, "assets", "cards", "focus-card.svg");

function readMetrics(): MetricsPayload {
    const raw = fs.readFileSync(METRICS_JSON, "utf8");
    return JSON.parse(raw) as MetricsPayload;
}

function readTheme(): Theme {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const json = JSON.parse(raw) as { theme: Theme };
    return json.theme;
}

function impactCard(metrics: MetricsPayload, theme: Theme): string {
    const { commits, pullRequests, issues, reviews } = metrics.counts;
    const range = `${metrics.window.from.slice(0, 10)} → ${metrics.window.to.slice(0, 10)}`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="520" height="200" viewBox="0 0 520 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Impact card">
  <style>
    :root { --bg: #ffffff; --fg: #0d1b2a; --muted: ${theme.muted}; --accent: ${theme.accent}; --primary: ${theme.primary}; }
    @media (prefers-color-scheme: dark) { :root { --bg: #0b1221; --fg: #eef2ff; --muted: #a5b4cc; } }
    text { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; }
  </style>
  <rect width="100%" height="100%" rx="14" fill="var(--bg)" stroke="var(--primary)" stroke-width="1.5" />
  <text x="24" y="40" fill="var(--fg)" font-size="18" font-weight="700">Impact (last 30 days)</text>
  <text x="24" y="62" fill="var(--muted)" font-size="12">${range}</text>

  <g transform="translate(24, 90)" fill="var(--fg)">
    <text y="0" font-size="14">Commits</text>
    <text x="120" y="0" font-size="14" font-weight="700">${commits}</text>
    <rect x="200" y="-12" width="${Math.min(260, commits)}" height="10" fill="var(--primary)" opacity="0.85" rx="4" />
  </g>
  <g transform="translate(24, 120)" fill="var(--fg)">
    <text y="0" font-size="14">Pull Requests</text>
    <text x="120" y="0" font-size="14" font-weight="700">${pullRequests}</text>
    <rect x="200" y="-12" width="${Math.min(260, pullRequests * 4)}" height="10" fill="var(--accent)" opacity="0.9" rx="4" />
  </g>
  <g transform="translate(24, 150)" fill="var(--fg)">
    <text y="0" font-size="14">Issues</text>
    <text x="120" y="0" font-size="14" font-weight="700">${issues}</text>
    <rect x="200" y="-12" width="${Math.min(260, issues * 4)}" height="10" fill="var(--primary)" opacity="0.45" rx="4" />
  </g>
  <g transform="translate(24, 180)" fill="var(--fg)">
    <text y="0" font-size="14">Code Reviews</text>
    <text x="120" y="0" font-size="14" font-weight="700">${reviews}</text>
    <rect x="200" y="-12" width="${Math.min(260, reviews * 6)}" height="10" fill="var(--accent)" opacity="0.6" rx="4" />
  </g>
</svg>`;
}

function focusCard(metrics: MetricsPayload, theme: Theme): string {
    const langs = metrics.languages.length ? metrics.languages : [{ name: "TypeScript", percent: 40, color: theme.primary }, { name: "Python", percent: 30, color: theme.accent }, { name: "Java", percent: 20, color: theme.muted }];
    const streakText = `${metrics.streak.current} day streak · longest ${metrics.streak.longest}`;

    const bars = langs
        .slice(0, 4)
        .map((lang, index) => {
            const width = Math.max(6, Math.min(360, Math.round(lang.percent * 3.6)));
            const y = 90 + index * 28;
            return `<g transform="translate(24, ${y})">\n        <text y="0" fill="var(--fg)" font-size="13" font-weight="600">${lang.name}</text>\n        <text x="380" y="0" fill="var(--muted)" font-size="12" text-anchor="end">${lang.percent}%</text>\n        <rect x="0" y="8" width="${width}" height="10" fill="${lang.color || theme.primary}" rx="5" opacity="0.85" />\n        <rect x="${width}" y="8" width="${Math.max(0, 360 - width)}" height="10" fill="var(--muted)" opacity="0.15" rx="5" />\n      </g>`;
        })
        .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="520" height="210" viewBox="0 0 520 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Focus card">
  <style>
    :root { --bg: #ffffff; --fg: #0d1b2a; --muted: ${theme.muted}; --accent: ${theme.accent}; --primary: ${theme.primary}; }
    @media (prefers-color-scheme: dark) { :root { --bg: #0b1221; --fg: #eef2ff; --muted: #a5b4cc; } }
    text { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; }
  </style>
  <rect width="100%" height="100%" rx="14" fill="var(--bg)" stroke="var(--primary)" stroke-width="1.5" />
  <text x="24" y="40" fill="var(--fg)" font-size="18" font-weight="700">Focus</text>
  <text x="24" y="62" fill="var(--muted)" font-size="12">Recent language mix and streak</text>
  ${bars}
  <g transform="translate(24, 190)">
    <text y="0" fill="var(--fg)" font-size="13" font-weight="700">${streakText}</text>
    <text x="360" y="0" fill="var(--muted)" font-size="12" text-anchor="end">Last active: ${metrics.streak.lastActive ?? "n/a"}</text>
  </g>
</svg>`;
}

function ensureMetrics(): void {
    if (!fs.existsSync(METRICS_JSON)) {
        throw new Error("metrics.json not found. Run generate:metrics first.");
    }
}

function main() {
    ensureMetrics();
    const metrics = readMetrics();
    const theme = readTheme();
    fs.writeFileSync(IMPACT_CARD, impactCard(metrics, theme));
    fs.writeFileSync(FOCUS_CARD, focusCard(metrics, theme));
    console.log("cards generated");
}

main();
