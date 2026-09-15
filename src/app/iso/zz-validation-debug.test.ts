import { expect, test } from "vitest";

import { getToolcraftControlSectionInvariantErrors } from "../acceptance/control-layout";
import { validateProductAcceptanceCoverage } from "../app-acceptance";
import { defineExportModuleSchemaFixture } from "../app-acceptance.export-test-utils";

test("debug: print blocking acceptance messages", () => {
  const messages = validateProductAcceptanceCoverage();
  console.log(`PRODUCT BLOCKING(${messages.length})\n${messages.join("\n")}`);

  const fixtureSchema = defineExportModuleSchemaFixture({ image: true });
  const settingsTitleMessages = getToolcraftControlSectionInvariantErrors(fixtureSchema, []).filter(
    (message) => message.startsWith("Settings is too generic"),
  );
  console.log(
    `FIXTURE SECTIONS ${JSON.stringify(
      fixtureSchema.panels.controls?.sections.map((section) => [
        section.id,
        section.title,
        Object.values(section.controls).map((control) => control.target),
      ]),
    )}\nFIXTURE SETTINGS-TITLE MESSAGES(${settingsTitleMessages.length})\n${settingsTitleMessages.join("\n")}`,
  );
  expect(Array.isArray(messages)).toBe(true);
});
