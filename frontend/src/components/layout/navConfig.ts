/**
 * Top bar navigation map.
 *
 * Mirrors exactly what the pre-restyle Layout exposed — same routes, same order.
 * The only change is placement: Command / Wall / Settings moved from the bar into
 * the "More" dropdown. Nothing was added or removed.
 */

export interface NavItem {
  to: string;
  label: string;
  /** small grey hint shown on the right inside dropdowns */
  hint?: string;
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

/** Always visible in the bar (>= lg). */
export const PRIMARY_NAV: NavItem[] = [
  { to: '/calendar', label: 'Calendar' },
  { to: '/plans', label: 'Plans' },
  { to: '/events', label: 'Events' },
  { to: '/designs', label: 'Designs' },
  { to: '/gantt', label: 'Gantt' },
  { to: '/map', label: 'Map' },
  { to: '/reports', label: 'Reports' },
  { to: '/monitor', label: 'Camera Monitor' },
];

/** Behind "More ▾" — the two consoles plus every former Settings entry. */
export const MORE_NAV: NavGroup[] = [
  { group: 'เครื่องมือ', items: [
    { to: '/command-center', label: 'Command', hint: 'ops console' },
    { to: '/command-wall', label: 'Wall', hint: 'จอ war-room' },
  ]},
  { group: 'Operations', items: [
    { to: '/capacity', label: 'Capacity' },
    { to: '/alerts', label: 'Alerts' },
    { to: '/monitor/alerts', label: 'Camera alerts' },
    { to: '/notify', label: 'Notification rules' },
  ]},
  { group: 'People', items: [
    { to: '/users', label: 'Users' },
    { to: '/teams', label: 'Teams' },
  ]},
  { group: 'Master data', items: [
    { to: '/customers', label: 'Customers' },
    { to: '/departments', label: 'Departments' },
    { to: '/provinces', label: 'Provinces' },
  ]},
  { group: 'Data', items: [
    { to: '/import', label: 'Import / Export' },
  ]},
];

export const MORE_ITEMS: NavItem[] = MORE_NAV.flatMap((g) => g.items);
