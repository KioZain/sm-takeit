import * as React from "react";

import { Input } from "@/toolcraft/ui";

/** Text field that commits on Enter or blur and reverts on Escape. */
export function CommitInput({
  "aria-label": ariaLabel,
  id,
  inputMode,
  onCommit,
  onStep,
  value,
}: Readonly<{
  "aria-label"?: string;
  id: string;
  inputMode?: "decimal" | "text";
  onCommit: (value: string) => void;
  onStep?: (direction: 1 | -1, large: boolean) => void;
  value: string;
}>): React.JSX.Element {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  return (
    <Input
      aria-label={ariaLabel}
      id={id}
      inputMode={inputMode}
      onBlur={() => onCommit(draft)}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit(draft);
        } else if (event.key === "Escape") {
          setDraft(value);
        } else if (onStep && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
          event.preventDefault();
          onStep(event.key === "ArrowUp" ? 1 : -1, event.shiftKey);
        }
      }}
      value={draft}
    />
  );
}
