import fs from "fs";
import path from "path";

interface Config {
    username: string;
    theme: { primary: string; secondary: string; accent: string; muted: string };
}

interface ContributionDay {
    date: string;
    color: string;
    contributionCount: number;
}

interface LanguageEdge {
    size: number;
    node: { name: string; color?: string | null };
}

interface MetricsPayload {
    generatedAt: string;
    username: string;
    window: { from: string; to: string };
    counts: {
        commits: number;
        pullRequests: number;
        issues: number;
        reviews: number;
    };
    streak: {
        current: number;
        longest: number;
        lastActive: string | null;
    };
    languages: { name: string; percent: number; color?: string | null }[];
}

const ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "scripts", "config.json");
const METRICS_JSON = path.join(ROOT, "assets", "generated", "metrics.json");
const PACMAN_LIGHT = path.join(ROOT, "assets", "cards", "pacman-light.svg");
const PACMAN_DARK = path.join(ROOT, "assets", "cards", "pacman-dark.svg");
const GITHUB_API = "https://api.github.com/graphql";

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

function readConfig(): Config {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    return JSON.parse(raw) as Config;
}

async function fetchGraphQL<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await fetch(GITHUB_API, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
        throw new Error(`GitHub API error ${res.status}: ${res.statusText}`);
    }

    const json = (await res.json()) as { data?: T; errors?: unknown };
    if (!json.data) {
        throw new Error(`GitHub API responded without data: ${JSON.stringify(json.errors)}`);
    }
    return json.data;
}

function flattenDays(weeks: { contributionDays: ContributionDay[] }[]): ContributionDay[] {
    return weeks.flatMap((w) => w.contributionDays).sort((a, b) => a.date.localeCompare(b.date));
}

function computeStreak(days: ContributionDay[]): { current: number; longest: number; lastActive: string | null } {
    let current = 0;
    let longest = 0;
    let lastActive: string | null = null;

    for (let i = days.length - 1; i >= 0; i -= 1) {
        const day = days[i];
        if (day.contributionCount > 0) {
            lastActive = lastActive || day.date;
            current += 1;
            longest = Math.max(longest, current);
        } else if (current > 0) {
            longest = Math.max(longest, current);
            current = 0;
        }
    }

    // longest could be zero if no contributions; ensure it mirrors current streak
    longest = Math.max(longest, current);
    return { current, longest, lastActive };
}

function aggregateLanguages(edges: LanguageEdge[]): { name: string; percent: number; color?: string | null }[] {
    const totals = edges.reduce((acc, edge) => acc + edge.size, 0);
    if (totals === 0) return [];
    return edges
        .reduce<{ name: string; size: number; color?: string | null }[]>((acc, edge) => {
            const existing = acc.find((item) => item.name === edge.node.name);
            if (existing) {
                existing.size += edge.size;
            } else {
                acc.push({ name: edge.node.name, size: edge.size, color: edge.node.color });
            }
            return acc;
        }, [])
        .map((item) => ({ name: item.name, percent: Math.round((item.size / totals) * 1000) / 10, color: item.color }))
        .sort((a, b) => b.percent - a.percent)
        .slice(0, 5);
}

function renderPacmanSvg(days: ContributionDay[], mode: "light" | "dark", theme: Config["theme"]): string {
    const cell = 12;
    const padding = 14;
    const weeks = Math.ceil(days.length / 7);
    const width = weeks * cell + padding * 2;
    const height = 7 * cell + padding * 2;
    const palette = mode === "dark"
        ? { bg: "#0b1221", grid: "#1c2a4a", pacman: theme.accent, eye: "#0b1221" }
        : { bg: "#f7fbff", grid: "#e1e8f5", pacman: "#ffca3a", eye: "#0b1221" };

    const cells: string[] = [];
    days.forEach((day, index) => {
        const row = index % 7;
        const col = Math.floor(index / 7);
        const x = padding + col * cell;
        const y = padding + row * cell;
        const color = day.contributionCount > 0 ? day.color : palette.grid;
        cells.push(`<rect x="${x}" y="${y}" width="${cell - 2}" height="${cell - 2}" rx="2" ry="2" fill="${color}" opacity="0.95"/>`);
    });

    const pacmanPath = `M ${padding} ${height / 2} L ${width - padding} ${height / 2}`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Pacman contribution graph" xmlns="http://www.w3.org/2000/svg">
  <title>Pacman contribution graph (${mode})</title>
  <rect width="100%" height="100%" fill="${palette.bg}" rx="12"/>
  <g>${cells.join("")}</g>
  <g>
    <path id="pac-path" d="${pacmanPath}" fill="none" />
    <circle r="7" fill="${palette.pacman}">
      <animateMotion dur="6s" repeatCount="indefinite" rotate="auto">
        <mpath href="#pac-path" />
      </animateMotion>
    </circle>
    <circle r="1.5" fill="${palette.eye}" cx="3" cy="-2">
      <animateMotion dur="6s" repeatCount="indefinite" rotate="auto">
        <mpath href="#pac-path" />
      </animateMotion>
    </circle>
  </g>
  <style>
    @media (prefers-reduced-motion: reduce) {
      animateMotion { display: none; }
      circle { cx: ${padding}; cy: ${height / 2}; }
    }
  </style>
</svg>`;
}

async function main() {
    const config = readConfig();
    const now = new Date();
    const from = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30);

    const query = `query($login: String!, $from: DateTime!, $to: DateTime!, $repoCount: Int!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        totalCommitContributions
        totalIssueContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
        contributionCalendar {
          weeks {
            contributionDays { date color contributionCount }
          }
        }
      }
      repositories(first: $repoCount, orderBy: {field: PUSHED_AT, direction: DESC}, privacy: PUBLIC, ownerAffiliations: OWNER) {
        nodes {
          languages(first: 4, orderBy: {field: SIZE, direction: DESC}) {
            edges { size node { name color } }
            totalSize
          }
        }
      }
    }
  }`;

    let payload: MetricsPayload = {
        generatedAt: now.toISOString(),
        username: config.username,
        window: { from: from.toISOString(), to: now.toISOString() },
        counts: { commits: 0, pullRequests: 0, issues: 0, reviews: 0 },
        streak: { current: 0, longest: 0, lastActive: null },
        languages: [],
    };

    try {
        const data = await fetchGraphQL<{
            user: {
                contributionsCollection: {
                    totalCommitContributions: number;
                    totalIssueContributions: number;
                    totalPullRequestContributions: number;
                    totalPullRequestReviewContributions: number;
                    contributionCalendar: { weeks: { contributionDays: ContributionDay[] }[] };
                };
                repositories: { nodes: { languages: { edges: LanguageEdge[] } }[] };
            };
        }>(query, { login: config.username, from: from.toISOString(), to: now.toISOString(), repoCount: 12 });

        const collection = data.user.contributionsCollection;
        const days = flattenDays(collection.contributionCalendar.weeks);
        const streak = computeStreak(days);
        const languageEdges = data.user.repositories.nodes.flatMap((repo) => repo.languages.edges);

        payload = {
            generatedAt: now.toISOString(),
            username: config.username,
            window: { from: from.toISOString(), to: now.toISOString() },
            counts: {
                commits: collection.totalCommitContributions,
                pullRequests: collection.totalPullRequestContributions,
                issues: collection.totalIssueContributions,
                reviews: collection.totalPullRequestReviewContributions,
            },
            streak,
            languages: aggregateLanguages(languageEdges),
        };

        fs.writeFileSync(PACMAN_LIGHT, renderPacmanSvg(days, "light", config.theme));
        fs.writeFileSync(PACMAN_DARK, renderPacmanSvg(days, "dark", config.theme));
    } catch (error) {
        console.warn("metrics fetch failed, writing placeholder data", error);
        const placeholderDays: ContributionDay[] = Array.from({ length: 7 * 10 }).map((_, idx) => ({
            date: new Date(now.getTime() - idx * 86400000).toISOString().slice(0, 10),
            color: "#d0d7de",
            contributionCount: idx % 5 === 0 ? 2 : 0,
        }));
        fs.writeFileSync(PACMAN_LIGHT, renderPacmanSvg(placeholderDays, "light", config.theme));
        fs.writeFileSync(PACMAN_DARK, renderPacmanSvg(placeholderDays, "dark", config.theme));
    }

    fs.writeFileSync(METRICS_JSON, JSON.stringify(payload, null, 2));
    console.log("metrics and pacman graphs generated");
}

main().catch((error) => {
    console.error("generate-metrics failed", error);
    process.exitCode = 1;
});
