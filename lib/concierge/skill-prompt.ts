import "server-only";
import { CONCIERGE_EXAMPLES_MD, CONCIERGE_SKILL_MD, CONCIERGE_SKILL_VERSION } from "./skill/text";

/** Version lue dans le frontmatter de SKILL.md, figée au build. */
export function conciergeSkillVersion() {
  return CONCIERGE_SKILL_VERSION;
}

/** Style et exemples embarqués. Éditer les .md, puis npm run skill:build. */
export function conciergeSkillPrompt() {
  return `${CONCIERGE_SKILL_MD.trim()}\n\n${CONCIERGE_EXAMPLES_MD.trim()}`;
}
