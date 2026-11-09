import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  PageNumber,
  Footer,
  HeadingLevel,
} from "docx";
import {
  normalizeProject,
  SECTIONS,
} from "./supabase/functions/_shared/project-rules.js";
const paragraph = (text, options = {}) =>
  new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 120, line: 240 },
    children: [
      new TextRun({
        text: String(text),
        font: "Times New Roman",
        size: 24,
        color: "000000",
      }),
    ],
    ...options,
  });
const paragraphs = (text) =>
  String(text || "[Öğrenci tarafından doldurulacak.]")
    .split(/\r?\n/)
    .map((line) => paragraph(line));
const heading = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({
        text,
        font: "Times New Roman",
        size: 24,
        bold: true,
        color: "000000",
      }),
    ],
  });
const cell = (text, bold = false) =>
  new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: String(text || "Belirlenecek"),
            font: "Times New Roman",
            size: 24,
            bold,
            color: "000000",
          }),
        ],
      }),
    ],
  });
export async function buildProjectDocument(value) {
  const p = normalizeProject(value),
    children = [];
  children.push(
    paragraph(`Proje Ana Alanı: ${p.main_area || "Belirlenecek"}`),
    paragraph(`Proje Tematik Alanı: ${p.theme || "Belirlenecek"}`),
    paragraph(`Proje Adı (Başlığı): ${p.title || "Proje taslağı"}`, {
      alignment: AlignmentType.CENTER,
    }),
  );
  if (p.stage !== "completed")
    children.push(
      paragraph("ÇALIŞMA TASLAĞI — Araştırma henüz tamamlanmamıştır."),
    );
  for (const [key, label] of SECTIONS) {
    if (key === "findings") {
      children.push(heading("Proje İş-Zaman Çizelgesi"));
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                cell("İşin tanımı", true),
                cell("Başlangıç", true),
                cell("Bitiş", true),
              ],
            }),
            ...p.timeline.map(
              (t) =>
                new TableRow({
                  children: [cell(t.task), cell(t.start), cell(t.end)],
                }),
            ),
          ],
        }),
      );
    }
    const h = heading(label);
    // Explicit page-break paragraphs are supported consistently by Word and LibreOffice.
    if (key === "appendices") {
      children.push(new Paragraph({ pageBreakBefore: true, children: [] }));
      children.push(h);
      const blocks = String(
        p.appendices || "[Öğrenci tarafından doldurulacak.]",
      )
        .split(/(?=^Ek\s*\d+[. :])/im)
        .filter((t) => t.trim());
      blocks.forEach((block, i) => {
        if (i > 0)
          children.push(new Paragraph({ pageBreakBefore: true, children: [] }));
        children.push(...paragraphs(block));
      });
    } else children.push(h, ...paragraphs(p[key]));
    if (key === "abstract")
      children.push(
        paragraph(`Anahtar kelimeler: ${p.keywords || "Belirlenecek"}`),
      );
    if (key === "introduction")
      for (const [label, content] of [
        ["Problem", p.problem],
        ["Araştırma sorusu", p.question],
        ["Hipotez", p.hypothesis],
      ])
        if (content) children.push(paragraph(`${label}: ${content}`));
    if (key === "method" && p.permissions)
      children.push(paragraph(`İzin ve onam durumu: ${p.permissions}`));
  }
  const doc = new Document({
    creator: "Öğretmen Defteri",
    title: p.title || "TÜBİTAK proje taslağı",
    description:
      "2027 2204-A rehberi ve sağlanan proje şablonu esas alınmıştır.",
    styles: {
      default: {
        document: {
          run: { font: "Times New Roman", size: 24, color: "000000" },
          paragraph: { spacing: { line: 240 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1417, bottom: 1417, left: 1417, right: 1417 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: "Times New Roman",
                    size: 24,
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toArrayBuffer(doc);
}
