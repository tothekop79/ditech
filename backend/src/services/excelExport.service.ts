import * as XLSX from 'xlsx';

export function buildReportWorkbook(report: any): Buffer {
  const wb = XLSX.utils.book_new();

  const summaryData = [
    { Metric: 'Period', Value: `${report.range.from.toISOString().split('T')[0]} to ${report.range.to.toISOString().split('T')[0]}` },
    { Metric: 'Total plans', Value: report.stats.total },
    { Metric: 'Completed', Value: report.stats.completed },
    { Metric: 'Completion rate', Value: `${report.stats.completionRate}%` },
    { Metric: 'Ready (not yet completed)', Value: report.stats.ready },
    { Metric: 'Not ready', Value: report.stats.notReady },
    { Metric: 'Sensors installed', Value: report.stats.completedSensors },
    { Metric: 'Sensors total', Value: report.stats.totalSensors },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Summary');

  const planRows = report.plans.map((p: any) => ({
    Date: p.scheduledDate?.toISOString().split('T')[0] || '',
    Customer: p.customer.customerCode,
    Department: p.department.departmentName,
    Store: p.storeName,
    Province: p.province || '',
    Region: p.storeRegion,
    Sensors: p.sensorCount,
    Team: p.team?.name || '',
    Readiness: p.readiness,
    Status: p.planStatus,
    Detail: p.detail || '',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(planRows), 'Schedule');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(report.byCustomer.map((b: any) => ({
    Customer: b.code, Name: b.name, Total: b.total, Completed: b.completed, Sensors: b.sensors,
    'Completion %': b.total ? Math.round((b.completed / b.total) * 100) : 0,
  }))), 'By Customer');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(report.byTeam.map((b: any) => ({
    Team: b.name, Region: b.region, Total: b.total, Completed: b.completed, Sensors: b.sensors,
    'Completion %': b.total ? Math.round((b.completed / b.total) * 100) : 0,
  }))), 'By Team');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
