import fs from "fs";
import path from "path";
import Ajv from "ajv";

const ROOT = path.resolve(__dirname, "..");
const METRICS_JSON = path.join(ROOT, "assets", "generated", "metrics.json");
const FEATURED_JSON = path.join(ROOT, "assets", "generated", "featured-projects.json");
const SVGS = [
    path.join(ROOT, "assets", "cards", "impact-card.svg"),
    path.join(ROOT, "assets", "cards", "focus-card.svg"),
    path.join(ROOT, "assets", "cards", "pacman-light.svg"),
    path.join(ROOT, "assets", "cards", "pacman-dark.svg"),
];

function assertExists(filePath: string) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`missing file: ${filePath}`);
    }
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size === 0) {
        throw new Error(`file empty or not a file: ${filePath}`);
    }
}

function validateJson(filePath: string, schema: Record<string, unknown>) {
    assertExists(filePath);
    const raw = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(raw);
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schema);
    const valid = validate(json);
    if (!valid) {
        throw new Error(`schema validation failed for ${filePath}: ${ajv.errorsText(validate.errors)}`);
    }
}

function validateSvgs() {
    SVGS.forEach(assertExists);
}

function main() {
    validateJson(METRICS_JSON, {
        type: "object",
        required: ["generatedAt", "username", "window", "counts", "streak", "languages"],
        properties: {
            generatedAt: { type: "string" },
            username: { type: "string" },
            window: {
                type: "object",
                required: ["from", "to"],
                properties: { from: { type: "string" }, to: { type: "string" } },
            },
            counts: {
                type: "object",
                required: ["commits", "pullRequests", "issues", "reviews"],
                properties: {
                    commits: { type: "number" },
                    pullRequests: { type: "number" },
                    issues: { type: "number" },
                    reviews: { type: "number" },
                },
            },
            streak: {
                type: "object",
                required: ["current", "longest", "lastActive"],
                properties: {
                    current: { type: "number" },
                    longest: { type: "number" },
                    lastActive: { type: ["string", "null"] },
                },
            },
            languages: {
                type: "array",
                items: {
                    type: "object",
                    required: ["name", "percent"],
                    properties: {
                        name: { type: "string" },
                        percent: { type: "number" },
                        color: { type: ["string", "null"] },
                    },
                },
            },
        },
    });

    validateJson(FEATURED_JSON, {
        type: "object",
        required: ["generatedAt", "repos"],
        properties: {
            generatedAt: { type: "string" },
            repos: {
                type: "array",
                items: {
                    type: "object",
                    required: ["nameWithOwner", "url", "stargazerCount", "forkCount", "updatedAt", "reason"],
                    properties: {
                        nameWithOwner: { type: "string" },
                        description: { type: ["string", "null"] },
                        url: { type: "string" },
                        stargazerCount: { type: "number" },
                        forkCount: { type: "number" },
                        updatedAt: { type: "string" },
                        reason: { type: "string" },
                        primaryLanguage: {
                            type: ["object", "null"],
                            properties: {
                                name: { type: "string" },
                                color: { type: ["string", "null"] },
                            },
                        },
                    },
                },
            },
        },
    });

    validateSvgs();
    console.log("asset validation passed");
}

main();
