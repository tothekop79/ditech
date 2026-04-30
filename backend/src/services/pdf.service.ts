import puppeteer from 'puppeteer-core';
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';

// Helper registrations
Handlebars.registerHelper('or', function (...args: any[]) {
  args.pop(); // remove handlebars options
  for (const a of args) if (a !== undefined && a !== null && a !== '') return a;
  return '—';
});
Handlebars.registerHelper('formatDate', (d: any) => {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
});
Handlebars.registerHelper('formatScope', (s: string) => {
  const map: Record<string, string> = {
    INSTALL_CAMERA: 'Install Camera',
    INSTALL_LAN: 'Install LAN Cabling',
    INSTALL_POE: 'Install POE Switch',
    CALIBRATION: 'Sensor Calibration',
    TESTING: 'System Testing',
    CLOUD_SETUP: 'Cloud Setup',
    MAINTENANCE: 'Maintenance',
  };
  return map[s] || s;
});


Handlebars.registerHelper('thaiDate', (d: any) => {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    const day = String(dt.getDate()).padStart(2, '0');
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const year = dt.getFullYear() + 543; // Buddhist Era
    return `${day}/${month}/${year}`;
  } catch { return '—'; }
});
Handlebars.registerHelper('thaiDateLong', (d: any) => {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    return `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear() + 543}`;
  } catch { return '—'; }
});
Handlebars.registerHelper('fallback', function (...args: any[]) {
  args.pop(); // remove handlebars options
  for (const a of args) {
    if (a !== undefined && a !== null && a !== '') return a;
  }
  return '';
});
Handlebars.registerHelper('inc', (val: any) => Number(val) + 1);
Handlebars.registerHelper('eq', (a: any, b: any) => a === b);
Handlebars.registerHelper('mod', (a: any, b: any) => Number(a) % Number(b));

const TEMPLATE_DIR = path.join(__dirname, '..', 'templates');
const templateCache: Record<string, HandlebarsTemplateDelegate> = {};

function loadTemplate(name: string): HandlebarsTemplateDelegate {
  if (!templateCache[name]) {
    const file = path.join(TEMPLATE_DIR, `${name}.html`);
    const src = fs.readFileSync(file, 'utf-8');
    templateCache[name] = Handlebars.compile(src);
  }
  return templateCache[name];
}

export async function renderHtml(templateName: string, data: any): Promise<string> {
  const tpl = loadTemplate(templateName);
  return tpl(data);
}

export async function renderPdf(html: string, opts?: { footerText?: string }): Promise<Buffer> {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.evaluate(async () => {
      if ((document as any).fonts && (document as any).fonts.ready) {
        await (document as any).fonts.ready;
      }
    });

    const useFooter = !!opts?.footerText;
    const footerHtml = useFooter
      ? `<div style="font-size:8pt; color:#6b7280; width:100%; text-align:center; padding:0 14mm; font-family: 'Sarabun', 'TH Sarabun New', Arial, sans-serif; border-top: 0.5pt solid #cbd5e1; padding-top: 4pt;">${opts.footerText} &nbsp;·&nbsp; หน้า <span class="pageNumber"></span> / <span class="totalPages"></span></div>`
      : `<span></span>`;

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: useFooter,
      headerTemplate: '<span></span>',
      footerTemplate: footerHtml,
      margin: useFooter
        ? { top: '12mm', bottom: '18mm', left: '12mm', right: '12mm' }
        : { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
