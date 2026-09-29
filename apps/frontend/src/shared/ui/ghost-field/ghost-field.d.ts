import type { DetailedHTMLProps, HTMLAttributes } from "react";

// Lets JSX render the `<ghost-field>` custom element with its own
// attributes — see ghost-field-element.ts. Ambient `.d.ts` module
// augmentation, exempt from `@typescript-eslint/no-namespace`
// (allowDefinitionFiles).
declare global {
  namespace React.JSX {
    interface IntrinsicElements {
      "ghost-field": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        layout?: "center" | "right" | "wall";
        count?: number | string;
        morph?: number | string;
      };
    }
  }
}

export {};
