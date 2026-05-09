import { type EventStatus, type EventReportStatus, STATUS_LABEL, STATUS_COLOR, REPORT_STATUS_COLOR } from '../../api/events';

export function EventStatusBadge({ status }: { status: EventStatus }) {
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${STATUS_COLOR[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ReportStatusBadge({ status }: { status: EventReportStatus }) {
  const cls = REPORT_STATUS_COLOR[status];
  return (
    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${cls}`}>
      {status}
    </span>
  );
}
