import fs from "fs";
import path from "path";

interface Config {
    displayName: string;
    username: string;
    featuredOverrides: string[];
}

interface Repo {
    nameWithOwner: string;
    description: string | null;
    url: string;
    stargazerCount: number;
    forkCount: number;
    primaryLanguage?: { name: string; color?: string | null } | null;
    updatedAt: string;
    reason: string;
}

const ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "scripts", "config.json");
const OUTPUT_JSON = path.join(ROOT, "assets", "generated", "featured-projects.json");
const OUTPUT_MD = path.join(ROOT, "assets", "generated", "featured-projects.md");
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

async function fetchOverrideRepo(fullName: string): Promise<Repo | null> {
    const [owner, name] = fullName.split("/");
    if (!owner || !name) return null;

    const query = `query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      nameWithOwner
      description
      url
      stargazerCount
      forkCount
      primaryLanguage { name color }
      updatedAt
    }
  }`;

    try {
        const data = await fetchGraphQL<{ repository: Repo | null }>(query, { owner, name });
        if (!data.repository) return null;
        return { ...data.repository, reason: "manual" };
    } catch (error) {
        console.warn(`override fetch failed for ${fullName}:`, error);
        return null;
    }
}

async function fetchCandidateRepos(username: string): Promise<Repo[]> {
    const query = `query($login: String!) {
    user(login: $login) {
      pinnedItems(first: 6, types: REPOSITORY) {
        nodes {
          ... on Repository {
            nameWithOwner
            description
            url
            stargazerCount
            forkCount
            primaryLanguage { name color }
            updatedAt
          }
        }
      }
      repositories(first: 30, orderBy: {field: STARGAZERS, direction: DESC}, privacy: PUBLIC, ownerAffiliations: OWNER) {
        nodes {
          nameWithOwner
          description
          url
          stargazerCount
          forkCount
          primaryLanguage { name color }
          updatedAt
        }
      }
    }
  }`;

    const data = await fetchGraphQL<{ user: { pinnedItems: { nodes: Repo[] }; repositories: { nodes: Repo[] } } }>(query, {
        login: username,
    });

    const pinned = (data.user?.pinnedItems?.nodes || []).map((repo) => ({ ...repo, reason: "pinned" }));
    const starred = (data.user?.repositories?.nodes || []).map((repo) => ({ ...repo, reason: "top-star" }));
    return [...pinned, ...starred];
}

function dedupeRepos(repos: (Repo | null)[]): Repo[] {
    const seen = new Set<string>();
    const results: Repo[] = [];
    for (const repo of repos) {
        if (!repo) continue;
        if (seen.has(repo.nameWithOwner)) continue;
        seen.add(repo.nameWithOwner);
        results.push(repo);
    }
    return results;
}

function selectFeatured(overrides: Repo[], candidates: Repo[]): Repo[] {
    const limit = 6;
    const sorted = candidates.sort((a, b) => {
        if (a.stargazerCount === b.stargazerCount) {
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        }
        return b.stargazerCount - a.stargazerCount;
    });

    const picked: Repo[] = [];
    for (const repo of overrides) {
        if (picked.length >= limit) break;
        picked.push({ ...repo, reason: repo.reason || "manual" });
    }

    for (const repo of sorted) {
        if (picked.length >= limit) break;
        if (picked.find((r) => r.nameWithOwner === repo.nameWithOwner)) continue;
        picked.push(repo);
    }

    return picked.slice(0, limit);
}

function writeJson(repos: Repo[]): void {
    const payload = {
        generatedAt: new Date().toISOString(),
        repos: repos.map((repo) => ({
            nameWithOwner: repo.nameWithOwner,
            description: repo.description,
            url: repo.url,
            stargazerCount: repo.stargazerCount,
            forkCount: repo.forkCount,
            primaryLanguage: repo.primaryLanguage,
            updatedAt: repo.updatedAt,
            reason: repo.reason,
        })),
    };
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(payload, null, 2));
}

function writeMarkdown(repos: Repo[]): void {
    const lines: string[] = [];
    lines.push("<!-- generated: featured projects -->");
    lines.push("<!-- do not edit manually; update scripts/config.json and rerun build -->");
    lines.push("");
    for (const repo of repos) {
        const lang = repo.primaryLanguage?.name ? ` · ${repo.primaryLanguage.name}` : "";
        const stars = `★ ${repo.stargazerCount}`;
        const reason = repo.reason === "manual" ? "(curated)" : repo.reason === "pinned" ? "(pinned)" : "";
        lines.push(`- [${repo.nameWithOwner}](${repo.url}) — ${repo.description ?? "No description yet."} ${lang} · ${stars} ${reason}`.trim());
    }
    fs.writeFileSync(OUTPUT_MD, lines.join("\n"));
}

async function main() {
    const config = readConfig();
    const overrides = await Promise.all(config.featuredOverrides.map((full) => fetchOverrideRepo(full)));
    let candidates: Repo[] = [];

    try {
        candidates = await fetchCandidateRepos(config.username);
    } catch (error) {
        console.warn("candidate fetch failed, falling back to overrides only", error);
    }

    const featured = selectFeatured(dedupeRepos(overrides), dedupeRepos(candidates));
    writeJson(featured);
    writeMarkdown(featured);
    console.log(`featured projects ready: ${featured.length} items`);
}

main().catch((error) => {
    console.error("generate-featured-projects failed", error);
    process.exitCode = 1;
});
