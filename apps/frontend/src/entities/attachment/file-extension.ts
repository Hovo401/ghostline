/** `report.final.pdf` → `PDF`, falling back to the mime subtype
 * (`application/pdf` → `PDF`) when the name has no extension — the file
 * chip's icon-box label, DESIGN-BRIEF.md §7.2 (`m.ext`). */
export function fileExtension(name: string | null, mime: string): string {
  const fromName = name?.split(".").pop();
  if (fromName && fromName !== name) return fromName.slice(0, 4).toUpperCase();

  const subtype = mime.split("/").pop();
  return subtype ? subtype.slice(0, 4).toUpperCase() : "FILE";
}
