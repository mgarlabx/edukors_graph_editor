import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { RULE_CODES, ruleTemplate } from "../../src/validate/rules";
it("dump", () => {
  writeFileSync("/private/tmp/claude-501/-Users-macstudiomgar-Library-CloudStorage-Dropbox-EDUKORS-edukors-graph-editor/1f4b05ac-edce-4dd7-a0eb-5190d316871d/scratchpad/rules_en.json", JSON.stringify(Object.fromEntries(RULE_CODES.map((c) => [c, ruleTemplate(c)])), null, 1));
});
