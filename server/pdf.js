import PDFDocument from 'pdfkit';

const PAGE_MARGIN = 46;
const PAGE_WIDTH = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const INK = '#111827';
const MUTED = '#6B7280';
const ACCENT = '#4F46E5';
const LIGHT = '#F3F4F6';
const BORDER = '#E5E7EB';

const COLUMNS = [
  { label: '#', x: 46, width: 22 },
  { label: 'VIDEO / PROJECT', x: 70, width: 148 },
  { label: 'LENGTH', x: 220, width: 56 },
  { label: 'TYPE', x: 278, width: 78 },
  { label: 'RATE', x: 358, width: 62, align: 'right' },
  { label: 'QTY', x: 424, width: 36, align: 'right' },
  { label: 'AMOUNT', x: 466, width: 83, align: 'right' },
];

function money(amount, currency) {
  const formatted = Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${formatted}`;
}

function logoBuffer(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = /^data:image\/(png|jpeg);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  try {
    return Buffer.from(match[2], 'base64');
  } catch {
    return null;
  }
}

function drawHeader(doc, invoice, settings) {
  doc.rect(0, 0, PAGE_WIDTH, 122).fill(INK);

  const logo = logoBuffer(settings.logo_data);
  let textX = PAGE_MARGIN;
  if (logo) {
    try {
      doc.image(logo, PAGE_MARGIN, 30, { fit: [64, 52], align: 'left', valign: 'center' });
      textX = PAGE_MARGIN + 76;
    } catch {
      textX = PAGE_MARGIN;
    }
  }

  doc.font('Helvetica-Bold').fontSize(18).fillColor('#FFFFFF')
    .text(settings.business_name || 'Your Business Name', textX, 30, {
      width: 290,
      ellipsis: true,
    });

  const contact = [
    settings.owner_name,
    settings.email,
    settings.phone,
    settings.address,
    settings.tax_id ? `Tax ID: ${settings.tax_id}` : '',
  ].filter(Boolean).join('  |  ');

  if (contact) {
    doc.font('Helvetica').fontSize(8).fillColor('#D1D5DB')
      .text(contact, textX, 58, { width: 290, height: 46, lineGap: 2 });
  }

  doc.font('Helvetica-Bold').fontSize(24).fillColor('#FFFFFF')
    .text('INVOICE', PAGE_WIDTH - 210, 28, { width: 164, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor('#A5B4FC')
    .text(invoice.invoice_number, PAGE_WIDTH - 210, 60, { width: 164, align: 'right' });
}

function drawMeta(doc, invoice, settings) {
  let y = 148;

  doc.font('Helvetica-Bold').fontSize(8).fillColor(ACCENT).text('BILL TO', PAGE_MARGIN, y);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(INK)
    .text(invoice.client_name, PAGE_MARGIN, y + 16, { width: 250, ellipsis: true });
  doc.font('Helvetica').fontSize(9).fillColor(MUTED)
    .text(`Invoice date: ${formatDate(invoice.invoice_date)}`, PAGE_MARGIN, y + 38);

  const rightX = 330;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(ACCENT).text('INVOICE DETAILS', rightX, y);

  const details = [
    ['Invoice number', invoice.invoice_number],
    ['Currency', settings.currency_code || 'USD'],
    ['Status', capitalize(invoice.status)],
  ];
  details.forEach(([label, value], index) => {
    const rowY = y + 16 + index * 17;
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(label, rightX, rowY, { width: 100 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(value, rightX + 100, rowY, { width: 110 });
  });

  return y + 76;
}

function drawTableHeader(doc, y) {
  doc.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, 22, 3).fill(LIGHT);
  COLUMNS.forEach((column) => {
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED).text(
      column.label,
      column.x + (column.align === 'right' ? 0 : 4),
      y + 7,
      { width: column.width - 4, align: column.align || 'left' },
    );
  });
  return y + 22;
}

function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value || '-';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function capitalize(value) {
  const text = String(value || '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function buildInvoicePdf(invoice, settings) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE_MARGIN,
    bufferPages: true,
    info: {
      Title: `Invoice ${invoice.invoice_number}`,
      Author: settings.business_name || 'Invoice Studio',
      Subject: `Invoice for ${invoice.client_name}`,
    },
  });

  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const currency = settings.currency_code || 'USD';

  drawHeader(doc, invoice, settings);
  let y = drawMeta(doc, invoice, settings) + 16;
  y = drawTableHeader(doc, y);

  invoice.items.forEach((item, index) => {
    const description = String(item.description || '').trim();
    doc.font('Helvetica').fontSize(8);
    const descriptionHeight = description
      ? doc.heightOfString(description, { width: 144, lineGap: 1 })
      : 0;
    const rowHeight = Math.max(34, 20 + descriptionHeight);

    if (y + rowHeight > 700) {
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
        .text(`Invoice ${invoice.invoice_number} (continued)`, PAGE_MARGIN, 46);
      y = drawTableHeader(doc, 68);
    }

    doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, rowHeight).fill(index % 2 === 0 ? '#FFFFFF' : '#FAFAFA');
    doc.moveTo(PAGE_MARGIN, y + rowHeight).lineTo(PAGE_WIDTH - PAGE_MARGIN, y + rowHeight)
      .strokeColor(BORDER).lineWidth(0.5).stroke();

    const rowY = y + 11;
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(String(index + 1), COLUMNS[0].x + 4, rowY);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
      .text(item.title, COLUMNS[1].x + 4, rowY, { width: 144, ellipsis: true });
    if (description) {
      doc.font('Helvetica').fontSize(8).fillColor(MUTED)
        .text(description, COLUMNS[1].x + 4, rowY + 15, { width: 144, height: descriptionHeight + 2 });
    }
    doc.font('Helvetica').fontSize(9).fillColor(INK)
      .text(item.duration || '-', COLUMNS[2].x + 4, rowY, { width: 52, ellipsis: true });
    doc.font('Helvetica').fontSize(9).fillColor(INK)
      .text(item.editing_type || '-', COLUMNS[3].x + 4, rowY, { width: 74, ellipsis: true });
    doc.font('Helvetica').fontSize(9).fillColor(INK)
      .text(money(item.rate, currency), COLUMNS[4].x, rowY, { width: COLUMNS[4].width - 4, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor(INK)
      .text(String(item.quantity), COLUMNS[5].x, rowY, { width: COLUMNS[5].width - 4, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
      .text(money(item.rate * item.quantity, currency), COLUMNS[6].x, rowY, {
        width: COLUMNS[6].width - 4,
        align: 'right',
      });

    y += rowHeight;
  });

  y += 18;
  const totalsX = 350;
  const totalsWidth = CONTENT_WIDTH + PAGE_MARGIN - totalsX;

  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Subtotal', totalsX, y, { width: 110 });
  doc.font('Helvetica').fontSize(9).fillColor(INK)
    .text(money(invoice.subtotal, currency), totalsX + 110, y, { width: totalsWidth - 110, align: 'right' });
  y += 18;

  if (invoice.discount > 0) {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Discount', totalsX, y, { width: 110 });
    doc.font('Helvetica').fontSize(9).fillColor(INK)
      .text(`- ${money(invoice.discount, currency)}`, totalsX + 110, y, {
        width: totalsWidth - 110,
        align: 'right',
      });
    y += 18;
  }

  doc.moveTo(totalsX, y + 2).lineTo(totalsX + totalsWidth, y + 2).strokeColor(BORDER).lineWidth(1).stroke();
  y += 12;
  doc.roundedRect(totalsX, y, totalsWidth, 36, 4).fill(INK);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF').text('TOTAL', totalsX + 12, y + 12);
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#FFFFFF')
    .text(money(invoice.total, currency), totalsX + 90, y + 10, {
      width: totalsWidth - 102,
      align: 'right',
    });
  y += 52;

  if (invoice.notes) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(ACCENT).text('NOTES', PAGE_MARGIN, y);
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
      .text(invoice.notes, PAGE_MARGIN, y + 15, { width: CONTENT_WIDTH, lineGap: 2 });
  }

  const pageRange = doc.bufferedPageRange();
  for (let index = 0; index < pageRange.count; index += 1) {
    doc.switchToPage(pageRange.start + index);
    doc.moveTo(PAGE_MARGIN, 800).lineTo(PAGE_WIDTH - PAGE_MARGIN, 800).strokeColor(BORDER).lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text('Generated with Invoice Studio', PAGE_MARGIN, 808, { width: 300 });
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text(`Page ${index + 1} of ${pageRange.count}`, PAGE_WIDTH - 246, 808, { width: 200, align: 'right' });
  }

  doc.end();
  return finished;
}
