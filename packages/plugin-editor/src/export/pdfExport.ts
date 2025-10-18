import type { Viewer } from '@embedpdf/viewer';
import type { EditorDoc, ImageOp, TextOp } from '../types';

const encoder = new TextEncoder();

type StreamObject = {
  dict: string;
  data: Uint8Array;
};

type PdfObject = {
  id: number;
  body: Uint8Array;
};

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
}

function escapePdfString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\r?\n/g, '\\n');
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = dataUrl;
  });
}

function streamToObject(stream: StreamObject): Uint8Array {
  const header = encoder.encode(`${stream.dict}\nstream\n`);
  const footer = encoder.encode(`\nendstream`);
  return concat([header, stream.data, footer]);
}

function buildPdf(
  pages: Array<{
    width: number;
    height: number;
    imageData: Uint8Array;
    imageWidth: number;
    imageHeight: number;
    texts: Array<{ x: number; y: number; fontSize: number; fontKey: string; content: string }>;
  }>,
): Uint8Array {
  const objects: PdfObject[] = [];
  let nextId = 1;

  const fontCache = new Map<string, number>();
  const ensureFont = (fontKey: string) => {
    if (fontCache.has(fontKey)) {
      return fontCache.get(fontKey)!;
    }
    const baseFont =
      fontKey === 'bold-italic'
        ? 'Helvetica-BoldOblique'
        : fontKey === 'bold'
        ? 'Helvetica-Bold'
        : fontKey === 'italic'
        ? 'Helvetica-Oblique'
        : 'Helvetica';
    const body = encoder.encode(`<< /Type /Font /Subtype /Type1 /BaseFont /${baseFont} >>`);
    const id = nextId++;
    objects.push({ id, body: concat([encoder.encode(`${id} 0 obj\n`), body, encoder.encode('\nendobj\n')]) });
    fontCache.set(fontKey, id);
    return id;
  };

  const pageObjects: number[] = [];
  const imageObjects: number[] = [];
  const contentObjects: number[] = [];

  pages.forEach((page, index) => {
    const imageId = nextId++;
    const imageDict = `<< /Type /XObject /Subtype /Image /Width ${page.imageWidth} /Height ${page.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.imageData.length} >>`;
    const imageBody = streamToObject({ dict: imageDict, data: page.imageData });
    objects.push({
      id: imageId,
      body: concat([encoder.encode(`${imageId} 0 obj\n`), imageBody, encoder.encode('\nendobj\n')]),
    });
    imageObjects.push(imageId);

    let content = `q\n${page.width} 0 0 ${page.height} 0 0 cm\n/Im${index} Do\nQ\n`;
    page.texts.forEach((text) => {
      const fontId = ensureFont(text.fontKey);
      content += `BT /F${fontId} ${text.fontSize.toFixed(2)} Tf ${text.x.toFixed(2)} ${text.y.toFixed(2)} Td (${escapePdfString(
        text.content,
      )}) Tj ET\n`;
    });
    const contentBytes = encoder.encode(content);
    const contentId = nextId++;
    const contentBody = streamToObject({ dict: `<< /Length ${contentBytes.length} >>`, data: contentBytes });
    objects.push({
      id: contentId,
      body: concat([encoder.encode(`${contentId} 0 obj\n`), contentBody, encoder.encode('\nendobj\n')]),
    });
    contentObjects.push(contentId);

    const resourcesParts = [`/Font <<`];
    fontCache.forEach((fontObjId, key) => {
      resourcesParts.push(`/F${fontObjId} ${fontObjId} 0 R`);
    });
    resourcesParts.push(`>> /XObject << /Im${index} ${imageId} 0 R >>`);
    const resources = resourcesParts.join(' ');

    const pageId = nextId++;
    const pageDict = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources ${resources} /Contents ${contentId} 0 R >>`;
    objects.push({
      id: pageId,
      body: concat([encoder.encode(`${pageId} 0 obj\n${pageDict}\nendobj\n`)]),
    });
    pageObjects.push(pageId);
  });

  const pagesId = nextId++;
  const kids = pageObjects.map((id) => `${id} 0 R`).join(' ');
  const pagesDict = `<< /Type /Pages /Kids [${kids}] /Count ${pageObjects.length} >>`;
  objects.push({
    id: pagesId,
    body: encoder.encode(`${pagesId} 0 obj\n${pagesDict}\nendobj\n`),
  });

  const catalogId = nextId++;
  const catalogDict = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects.push({
    id: catalogId,
    body: encoder.encode(`${catalogId} 0 obj\n${catalogDict}\nendobj\n`),
  });

  // Sort objects by id to ensure proper ordering
  objects.sort((a, b) => a.id - b.id);

  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let offset = 0;

  const write = (chunk: Uint8Array) => {
    parts.push(chunk);
    offset += chunk.length;
  };

  write(encoder.encode('%PDF-1.4\n'));
  offset = parts.reduce((sum, chunk) => sum + chunk.length, 0);

  objects.forEach((obj) => {
    offsets[obj.id] = offset;
    write(obj.body);
    offset += obj.body.length;
  });

  const xrefOffset = offset;
  const xrefLines: string[] = [];
  xrefLines.push(`xref\n0 ${nextId}\n`);
  xrefLines.push('0000000000 65535 f \n');
  for (let i = 1; i < nextId; i += 1) {
    const pos = offsets[i] ?? 0;
    const line = `${pos.toString().padStart(10, '0')} 00000 n \n`;
    xrefLines.push(line);
  }
  write(encoder.encode(xrefLines.join('')));

  const trailer = `trailer\n<< /Size ${nextId} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  write(encoder.encode(trailer));

  return concat(parts);
}

export async function exportFlattenedPdf(viewer: Viewer, doc: EditorDoc): Promise<Blob> {
  const pageCount = viewer.document?.pageCount ?? doc.ops.reduce((max, op) => Math.max(max, op.pageIndex + 1), 0);
  const pages: Array<{
    width: number;
    height: number;
    imageData: Uint8Array;
    imageWidth: number;
    imageHeight: number;
    texts: Array<{ x: number; y: number; fontSize: number; fontKey: string; content: string }>;
  }> = [];

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const viewport = viewer.pages.getViewport(pageIndex);
    if (!viewport) continue;
    const pageWidth = viewport.width;
    const pageHeight = viewport.height;

    const bitmap = await viewer.pages.renderBitmap(pageIndex, { scale: 2, format: 'png' });
    const imageElement = await loadImage(bitmap.dataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to obtain canvas context for export');
    }
    ctx.drawImage(imageElement, 0, 0);

    const scaleX = canvas.width / pageWidth;
    const scaleY = canvas.height / pageHeight;

    const imageOps = doc.ops.filter((op): op is ImageOp => op.type === 'image' && op.pageIndex === pageIndex);
    imageOps.forEach((op) => {
      if (!op.sourceBox) return;
      const sx = op.sourceBox.x * scaleX;
      const sy = op.sourceBox.y * scaleY;
      const sw = op.sourceBox.w * scaleX;
      const sh = op.sourceBox.h * scaleY;
      const dx = op.box.x * scaleX;
      const dy = op.box.y * scaleY;
      const dw = op.box.w * scaleX;
      const dh = op.box.h * scaleY;

      const temp = document.createElement('canvas');
      temp.width = sw;
      temp.height = sh;
      const tempCtx = temp.getContext('2d');
      if (!tempCtx) return;
      tempCtx.drawImage(imageElement, sx, sy, sw, sh, 0, 0, sw, sh);
      ctx.clearRect(sx, sy, sw, sh);
      ctx.drawImage(temp, dx, dy, dw, dh);
    });

    const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const response = await fetch(jpegDataUrl);
    const imageBytes = new Uint8Array(await response.arrayBuffer());

    const textOps = doc.ops.filter((op): op is TextOp => op.type === 'text' && op.pageIndex === pageIndex);
    const texts = textOps.map((op) => {
      const weightKey = op.style.fontWeight === 'bold' ? 'bold' : 'normal';
      const italicKey = op.style.fontStyle === 'italic' ? 'italic' : 'normal';
      const fontKey =
        weightKey === 'bold' && italicKey === 'italic'
          ? 'bold-italic'
          : weightKey === 'bold'
          ? 'bold'
          : italicKey === 'italic'
          ? 'italic'
          : 'normal';
      const baseline = pageHeight - op.box.y - op.box.h + op.style.fontSize;
      return {
        x: op.box.x,
        y: baseline,
        fontSize: op.style.fontSize,
        fontKey,
        content: op.content,
      };
    });

    pages.push({
      width: pageWidth,
      height: pageHeight,
      imageData: imageBytes,
      imageWidth: canvas.width,
      imageHeight: canvas.height,
      texts,
    });
  }

  const pdfBytes = buildPdf(pages);
  const copy = new Uint8Array(pdfBytes.length);
  copy.set(pdfBytes);
  return new Blob([copy.buffer], { type: 'application/pdf' });
}
