import puppeteer from 'puppeteer-core';

export async function generateReportPdf(report: any): Promise<Buffer> {
  const html = renderReportHtml(report);

  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4', printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

function renderReportHtml(report: any): string {
  const fromStr = report.range.from.toISOString().split('T')[0];
  const toStr = report.range.to.toISOString().split('T')[0];

  const planRows = report.plans.map((p: any) => `
    <tr>
      <td>${p.scheduledDate?.toISOString().split('T')[0] || '-'}</td>
      <td>${p.customer.customerCode}</td>
      <td>${escape(p.storeName)}</td>
      <td>${escape(p.province || '-')}</td>
      <td style="text-align:center">${p.sensorCount}</td>
      <td>${escape(p.team?.name || '-')}</td>
      <td>${p.planStatus}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: Arial, sans-serif; color: #2C2C2A; padding: 0; margin: 0; font-size: 11px; }
    h1 { color: #185FA5; margin: 0 0 4px; font-size: 22px; }
    .header { border-bottom: 2px solid #185FA5; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; }
    .logo { background: #185FA5; color: white; padding: 6px 14px; font-weight: 500; letter-spacing: 1.5px; display: inline-block; }
    .stats { display: flex; gap: 8px; margin: 16px 0; }
    .stat { background: #F1EFE8; padding: 8px 12px; border-radius: 4px; flex: 1; }
    .stat-label { font-size: 10px; color: #5F5E5A; }
    .stat-value { font-size: 16px; font-weight: 500; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { background: #F1EFE8; padding: 6px 8px; text-align: left; border: 0.5px solid #D3D1C7; }
    td { padding: 6px 8px; border: 0.5px solid #D3D1C7; }
    h2 { font-size: 14px; margin: 20px 0 8px; }
    .footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid #D3D1C7; font-size: 9px; color: #888; text-align: center; }
  </style></head><body>
    <div class="header">
      <div>
        <div class="logo">DITECH</div>
        <h1>${report.type === 'weekly' ? 'Weekly' : 'Monthly'} report</h1>
        <div style="color: #5F5E5A;">${fromStr} to ${toStr}</div>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><div class="stat-label">Plans</div><div class="stat-value">${report.stats.total}</div></div>
      <div class="stat"><div class="stat-label">Completed</div><div class="stat-value">${report.stats.completed} (${report.stats.completionRate}%)</div></div>
      <div class="stat"><div class="stat-label">Sensors</div><div class="stat-value">${report.stats.completedSensors} / ${report.stats.totalSensors}</div></div>
      <div class="stat"><div class="stat-label">Not ready</div><div class="stat-value">${report.stats.notReady}</div></div>
    </div>
    <h2>By customer</h2>
    <table><thead><tr><th>Customer</th><th>Total</th><th>Completed</th><th>%</th><th>Sensors</th></tr></thead><tbody>
      ${report.byCustomer.map((b: any) => `<tr><td>${b.code}</td><td>${b.total}</td><td>${b.completed}</td><td>${b.total ? Math.round(b.completed/b.total*100) : 0}%</td><td>${b.sensors}</td></tr>`).join('')}
    </tbody></table>
    <h2>All plans</h2>
    <table><thead><tr><th>Date</th><th>Customer</th><th>Store</th><th>Province</th><th>#</th><th>Team</th><th>Status</th></tr></thead><tbody>${planRows}</tbody></table>
    <div class="footer">DITECH Co., Ltd. · Generated ${new Date().toISOString()}</div>
  </body></html>`;
}

function escape(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as any)[c]);
}
