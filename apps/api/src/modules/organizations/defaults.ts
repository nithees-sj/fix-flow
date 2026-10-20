import type { CategoryColor, CategoryIcon } from '@fixflow/shared';

/** Starter catalog created with every organization; fully editable during onboarding and later. */
export const DEFAULT_CATEGORIES: { name: string; description: string; color: CategoryColor; icon: CategoryIcon; checklist?: string }[] = [
  { name: 'HVAC', description: 'Heating, ventilation and air conditioning', color: 'cyan', icon: 'wind', checklist: 'HVAC service' },
  { name: 'Electrical', description: 'Power, lighting, sockets and panels', color: 'amber', icon: 'zap', checklist: 'Electrical safety' },
  { name: 'Plumbing', description: 'Leaks, drains, fixtures and water supply', color: 'blue', icon: 'droplets', checklist: 'Plumbing repair' },
  { name: 'Carpentry', description: 'Doors, furniture, fittings and fixtures', color: 'orange', icon: 'hammer' },
  { name: 'Cleaning', description: 'Spills, sanitation and housekeeping', color: 'teal', icon: 'sparkles' },
  { name: 'IT & AV', description: 'Network, projectors, displays and devices', color: 'violet', icon: 'monitor' },
  { name: 'Safety', description: 'Fire, security and hazard reports', color: 'red', icon: 'shield-alert', checklist: 'Safety inspection' },
  { name: 'Grounds', description: 'Landscaping, parking and exterior', color: 'green', icon: 'trees' },
];

export const DEFAULT_CHECKLISTS: Record<string, { description: string; items: { label: string; required: boolean }[] }> = {
  'HVAC service': {
    description: 'Standard inspection for air-conditioning and ventilation units',
    items: [
      { label: 'Isolate power to the unit before opening panels', required: true },
      { label: 'Inspect and clean or replace air filters', required: true },
      { label: 'Check refrigerant lines and connections for leaks', required: true },
      { label: 'Verify thermostat reading against measured air temperature', required: true },
      { label: 'Clean condensate drain and tray', required: false },
      { label: 'Restore power and confirm normal operation', required: true },
    ],
  },
  'Electrical safety': {
    description: 'Lock-out/tag-out and verification steps for electrical work',
    items: [
      { label: 'Apply lock-out/tag-out to the affected circuit', required: true },
      { label: 'Verify the circuit is de-energized with a tester', required: true },
      { label: 'Repair or replace the faulty component', required: true },
      { label: 'Test the circuit and connected devices after re-energizing', required: true },
      { label: 'Remove lock-out/tag-out and inform occupants', required: true },
    ],
  },
  'Plumbing repair': {
    description: 'Leak and blockage repair checklist',
    items: [
      { label: 'Shut off water supply to the fixture', required: true },
      { label: 'Identify and repair the leak or blockage', required: true },
      { label: 'Restore supply and check for leaks for five minutes', required: true },
      { label: 'Dry and clean the work area', required: false },
    ],
  },
  'Safety inspection': {
    description: 'Hazard assessment and make-safe procedure',
    items: [
      { label: 'Cordon off the hazard and place signage', required: true },
      { label: 'Assess the hazard and document findings', required: true },
      { label: 'Make safe or escalate to the responsible authority', required: true },
      { label: 'Confirm the area is safe before reopening', required: true },
    ],
  },
};

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'organization'
  );
}
