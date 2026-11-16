import unzipper from "unzipper";

/** Test helper: reads back the export's own .xlsx output (inline strings and numbers). */
export type Row = Record<string, string | number>;

const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

/** Minimal reader for the writer's own output: inline strings and numbers. */
function parseSheet(xml: string): Row[] {
  const rows: Array<Record<string, string | number>> = [];
  for (const m of xml.matchAll(/<row r="(\d+)">(.*?)<\/row>/g)) {
    const cells: Record<string, string | number> = {};
    for (const c of m[2]!.matchAll(
      /<c r="([A-Z]+)\d+"(?: s="\d+")?( t="inlineStr")?>(?:<v>(.*?)<\/v>|<is><t xml:space="preserve">(.*?)<\/t><\/is>)<\/c>/g,
    )) {
      cells[c[1]!] = c[2] ? unescapeXml(c[4] ?? "") : Number(c[3]);
    }
    rows.push(cells);
  }
  const [header, ...data] = rows;
  return data.map((r) => {
    const out: Row = {};
    for (const [colRef, name] of Object.entries(header ?? {})) {
      if (r[colRef] !== undefined) out[String(name)] = r[colRef]!;
    }
    return out;
  });
}

export async function readWorkbook(buf: Buffer) {
  const dir = await unzipper.Open.buffer(buf);
  const text = async (p: string) => (await dir.files.find((f) => f.path === p)!.buffer()).toString("utf8");
  const workbook = await text("xl/workbook.xml");
  const names = [...workbook.matchAll(/<sheet name="([^"]+)"/g)].map((m) => unescapeXml(m[1]!));
  const sheets: Record<string, Row[]> = {};
  for (let i = 0; i < names.length; i++) {
    sheets[names[i]!] = parseSheet(await text(`xl/worksheets/sheet${i + 1}.xml`));
  }
  return { names, sheets };
}
