/**
 * Embarque SKILL.md et examples.md dans lib/concierge/skill/text.ts.
 * La source à éditer reste les deux fichiers markdown.
 * Relancer : npm run skill:build (aussi appelé par npm run build).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const skillDir = join(process.cwd(), "lib/concierge/skill");
const skill = readFileSync(join(skillDir, "SKILL.md"), "utf8");
const examples = readFileSync(join(skillDir, "examples.md"), "utf8");
const version = skill.match(/^version:\s*(\S+)/m)?.[1] || "";

if (!version) {
  console.error("[concierge-skill] version manquante dans SKILL.md");
  process.exit(1);
}
if (!/^Client :/m.test(examples)) {
  console.error("[concierge-skill] examples.md ne contient aucun échange");
  process.exit(1);
}

const out = `// Généré par scripts/build-concierge-skill.mjs. Ne pas éditer.
// Source : lib/concierge/skill/SKILL.md et examples.md.
// Après une modification : npm run skill:build

export const CONCIERGE_SKILL_VERSION = ${JSON.stringify(version)};

export const CONCIERGE_SKILL_MD = ${JSON.stringify(skill)};

export const CONCIERGE_EXAMPLES_MD = ${JSON.stringify(examples)};
`;

writeFileSync(join(skillDir, "text.ts"), out);
console.log(`[concierge-skill] version ${version}`);
