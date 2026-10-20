/**
 * Fictional demo organizations. All names, people and places are invented for local demos.
 */
import type { Industry, LocationType, Role } from '../generated/prisma/enums.js';

export interface PersonSpec {
  name: string;
  email: string;
  role: Role;
  jobTitle?: string;
  skills?: [category: string, level: number][];
  available?: boolean;
}

export interface LocationSpec {
  name: string;
  type: LocationType;
  code?: string;
  children?: LocationSpec[];
}

export interface AssetSpec {
  name: string;
  tag: string;
  category: string;
  location: string; // location name (unique within the blueprint)
  manufacturer?: string;
  model?: string;
  status?: 'OPERATIONAL' | 'NEEDS_ATTENTION' | 'UNDER_MAINTENANCE' | 'OUT_OF_SERVICE';
}

export interface IssueTemplate {
  title: string;
  category: string;
  description: string;
  assetCategory?: string;
}

export interface ScheduleSpec {
  title: string;
  category: string;
  asset?: string; // asset tag
  location?: string;
  unit: 'DAY' | 'WEEK' | 'MONTH';
  interval: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  checklist?: string;
}

export interface OrgBlueprint {
  slug: string;
  name: string;
  industry: Industry;
  timezone: string;
  seed: number;
  workOrders: number;
  people: PersonSpec[];
  locations: LocationSpec[];
  assets: AssetSpec[];
  issues: IssueTemplate[];
  schedules: ScheduleSpec[];
  policy?: Partial<{ technicianSelfAssign: boolean; requesterSeesAllOrgRequests: boolean; qrReportingMode: 'AUTHENTICATED' | 'PUBLIC'; autoAssignMode: 'OFF' | 'SUGGEST' | 'AUTO' }>;
}

const room = (name: string, code?: string): LocationSpec => ({ name, type: 'ROOM', code });

export const SHARED_PERSON = { name: 'Jordan Blake', email: 'jordan.blake@fixflow.demo' };

export const BLUEPRINTS: OrgBlueprint[] = [
  {
    slug: 'northbridge-institute',
    name: 'Northbridge Institute of Technology',
    industry: 'EDUCATION',
    timezone: 'Asia/Kolkata',
    seed: 1042,
    workOrders: 230,
    policy: { qrReportingMode: 'PUBLIC' },
    people: [
      { name: 'Dr. Meera Nair', email: 'admin@northbridge.demo', role: 'ORG_ADMIN', jobTitle: 'Director of Estates' },
      { name: 'Priya Raman', email: 'priya.raman@northbridge.demo', role: 'MANAGER', jobTitle: 'Facilities Manager' },
      { name: 'Rahul Kapoor', email: 'rahul.kapoor@northbridge.demo', role: 'MANAGER', jobTitle: 'Campus Operations Lead' },
      { name: SHARED_PERSON.name, email: SHARED_PERSON.email, role: 'MANAGER', jobTitle: 'Operations Consultant' },
      { name: 'Arjun Menon', email: 'arjun.menon@northbridge.demo', role: 'TECHNICIAN', jobTitle: 'HVAC Technician', skills: [['HVAC', 3], ['Electrical', 2]] },
      { name: 'Sunita Rao', email: 'sunita.rao@northbridge.demo', role: 'TECHNICIAN', jobTitle: 'Plumbing Technician', skills: [['Plumbing', 3], ['Grounds', 1]] },
      { name: 'Vikram Singh', email: 'vikram.singh@northbridge.demo', role: 'TECHNICIAN', jobTitle: 'Electrician', skills: [['Electrical', 3], ['Safety', 2]] },
      { name: 'Deepak Joshi', email: 'deepak.joshi@northbridge.demo', role: 'TECHNICIAN', jobTitle: 'Maintenance Carpenter', skills: [['Carpentry', 3], ['Cleaning', 1]] },
      { name: 'Farhan Ali', email: 'farhan.ali@northbridge.demo', role: 'TECHNICIAN', jobTitle: 'AV & IT Support', skills: [['IT & AV', 3], ['Electrical', 1]] },
      { name: 'Lakshmi Pillai', email: 'lakshmi.pillai@northbridge.demo', role: 'TECHNICIAN', jobTitle: 'General Maintenance', skills: [['Cleaning', 2], ['Grounds', 3], ['Carpentry', 1]], available: false },
      { name: 'Kavya Iyer', email: 'kavya.iyer@northbridge.demo', role: 'REQUESTER', jobTitle: 'Student Council' },
      { name: 'Prof. Rohan Das', email: 'rohan.das@northbridge.demo', role: 'REQUESTER', jobTitle: 'Physics Faculty' },
      { name: 'Ananya Bose', email: 'ananya.bose@northbridge.demo', role: 'REQUESTER', jobTitle: 'Library Coordinator' },
      { name: 'Siddharth Rao', email: 'siddharth.rao@northbridge.demo', role: 'REQUESTER', jobTitle: 'Hostel Warden' },
      { name: 'Neha Kulkarni', email: 'neha.kulkarni@northbridge.demo', role: 'REQUESTER', jobTitle: 'Chemistry Lab Manager' },
      { name: 'Aditya Verma', email: 'aditya.verma@northbridge.demo', role: 'REQUESTER', jobTitle: 'Sports Officer' },
      { name: 'Ishita Ghosh', email: 'ishita.ghosh@northbridge.demo', role: 'REQUESTER', jobTitle: 'Admissions Office' },
      { name: 'Manoj Pandey', email: 'manoj.pandey@northbridge.demo', role: 'REQUESTER', jobTitle: 'Security Supervisor' },
    ],
    locations: [
      {
        name: 'North Campus',
        type: 'SITE',
        children: [
          {
            name: 'Science Block',
            type: 'BUILDING',
            code: 'SB',
            children: [
              { name: 'Science Block · Ground Floor', type: 'FLOOR', code: 'SB-G', children: [room('Lecture Hall 101', 'SB-101'), room('Physics Lab', 'SB-104'), room('Server Room', 'SB-110')] },
              { name: 'Science Block · First Floor', type: 'FLOOR', code: 'SB-1', children: [room('Chemistry Lab', 'SB-201'), room('Lecture Hall 204', 'SB-204'), room('Faculty Lounge', 'SB-210')] },
            ],
          },
          {
            name: 'Central Library',
            type: 'BUILDING',
            code: 'LIB',
            children: [
              { name: 'Library · Ground Floor', type: 'FLOOR', code: 'LIB-G', children: [room('Reading Room', 'LIB-G01'), room('Circulation Desk', 'LIB-G02')] },
              { name: 'Library · First Floor', type: 'FLOOR', code: 'LIB-1', children: [room('Archive Stacks', 'LIB-101'), room('Group Study Rooms', 'LIB-110')] },
            ],
          },
          {
            name: 'Administration Block',
            type: 'BUILDING',
            code: 'ADM',
            children: [{ name: 'Admin · Ground Floor', type: 'FLOOR', code: 'ADM-G', children: [room('Admissions Office', 'ADM-G05'), room('Main Reception', 'ADM-G01'), room('Boardroom', 'ADM-G10')] }],
          },
        ],
      },
      {
        name: 'South Campus',
        type: 'SITE',
        children: [
          {
            name: 'Hostel A',
            type: 'BUILDING',
            code: 'HA',
            children: [
              { name: 'Hostel A · First Floor', type: 'FLOOR', code: 'HA-1', children: [room('Room 101', 'HA-101'), room('Room 102', 'HA-102'), room('Common Kitchen', 'HA-1K')] },
              { name: 'Hostel A · Second Floor', type: 'FLOOR', code: 'HA-2', children: [room('Room 201', 'HA-201'), room('Laundry', 'HA-2L')] },
            ],
          },
          {
            name: 'Sports Complex',
            type: 'BUILDING',
            code: 'SPC',
            children: [{ name: 'Sports · Ground Floor', type: 'FLOOR', code: 'SPC-G', children: [room('Indoor Courts', 'SPC-G01'), room('Gym', 'SPC-G02'), room('Changing Rooms', 'SPC-G03')] }],
          },
          { name: 'Main Parking Lot', type: 'AREA', code: 'PARK-1' },
        ],
      },
    ],
    assets: [
      { name: 'Split AC unit', tag: 'HVAC-101', category: 'HVAC', location: 'Lecture Hall 101', manufacturer: 'Daikin', model: 'FTKF50' },
      { name: 'Split AC unit', tag: 'HVAC-204', category: 'HVAC', location: 'Lecture Hall 204', manufacturer: 'Daikin', model: 'FTKF60' },
      { name: 'Precision cooling unit', tag: 'HVAC-SRV', category: 'HVAC', location: 'Server Room', manufacturer: 'Vertiv', model: 'Liebert PDX' },
      { name: 'Fume hood exhaust fan', tag: 'HVAC-CHEM', category: 'HVAC', location: 'Chemistry Lab', manufacturer: 'Systemair', model: 'KBT 250' },
      { name: 'Rooftop chiller', tag: 'HVAC-CH1', category: 'HVAC', location: 'Science Block', manufacturer: 'Carrier', model: 'AquaSnap 30RB' },
      { name: 'Library AHU', tag: 'HVAC-LIB', category: 'HVAC', location: 'Central Library', manufacturer: 'Trane', model: 'CLCH' },
      { name: 'Distribution board DB-1', tag: 'ELE-SB-DB1', category: 'Electrical', location: 'Science Block · Ground Floor', manufacturer: 'Schneider', model: 'Acti9' },
      { name: 'Backup generator', tag: 'ELE-GEN-1', category: 'Electrical', location: 'North Campus', manufacturer: 'Cummins', model: 'C250D5' },
      { name: 'UPS system', tag: 'ELE-UPS-SRV', category: 'Electrical', location: 'Server Room', manufacturer: 'APC', model: 'Symmetra PX' },
      { name: 'Hostel water heater', tag: 'PLB-HA-WH1', category: 'Plumbing', location: 'Common Kitchen', manufacturer: 'A. O. Smith', model: 'HSE-VAS' },
      { name: 'Booster pump', tag: 'PLB-PUMP-1', category: 'Plumbing', location: 'South Campus', manufacturer: 'Grundfos', model: 'Hydro MPC' },
      { name: 'Lab emergency shower', tag: 'SAF-CHEM-SH', category: 'Safety', location: 'Chemistry Lab', manufacturer: 'Haws', model: '8300' },
      { name: 'Fire alarm panel', tag: 'SAF-FAP-SB', category: 'Safety', location: 'Science Block', manufacturer: 'Honeywell', model: 'Notifier NFS2' },
      { name: 'Fire alarm panel', tag: 'SAF-FAP-LIB', category: 'Safety', location: 'Central Library', manufacturer: 'Honeywell', model: 'Notifier NFS2' },
      { name: 'Laser projector', tag: 'AV-LH101', category: 'IT & AV', location: 'Lecture Hall 101', manufacturer: 'Epson', model: 'EB-L630U' },
      { name: 'Laser projector', tag: 'AV-LH204', category: 'IT & AV', location: 'Lecture Hall 204', manufacturer: 'Epson', model: 'EB-L630U' },
      { name: 'Boardroom display', tag: 'AV-BRD', category: 'IT & AV', location: 'Boardroom', manufacturer: 'Samsung', model: 'QM85C' },
      { name: 'Wi-Fi access point cluster', tag: 'IT-AP-LIB', category: 'IT & AV', location: 'Reading Room', manufacturer: 'Aruba', model: 'AP-635' },
      { name: 'Passenger lift', tag: 'ELE-LIFT-LIB', category: 'Electrical', location: 'Central Library', manufacturer: 'KONE', model: 'MonoSpace 500' },
      { name: 'Treadmill bank', tag: 'GEN-GYM-TM', category: 'Carpentry', location: 'Gym', manufacturer: 'Life Fitness', model: 'Integrity' },
      { name: 'Court lighting', tag: 'ELE-SPC-LT', category: 'Electrical', location: 'Indoor Courts', manufacturer: 'Philips', model: 'ArenaVision' },
      { name: 'Laundry washers', tag: 'PLB-HA-LDY', category: 'Plumbing', location: 'Laundry', manufacturer: 'Electrolux', model: 'WH6' },
      { name: 'Automatic entrance doors', tag: 'CAR-ADM-DOOR', category: 'Carpentry', location: 'Main Reception', manufacturer: 'dormakaba', model: 'ED100' },
      { name: 'Parking barrier', tag: 'GRD-PARK-BAR', category: 'Grounds', location: 'Main Parking Lot', manufacturer: 'FAAC', model: 'B680H', status: 'OUT_OF_SERVICE' },
    ],
    issues: [
      { title: 'AC not cooling during lectures', category: 'HVAC', assetCategory: 'HVAC', description: 'Room temperature stays above 30°C even on the lowest setting.' },
      { title: 'AC unit leaking water onto desks', category: 'HVAC', assetCategory: 'HVAC', description: 'Water dripping from the indoor unit near the window row.' },
      { title: 'Loud rattling noise from ventilation', category: 'HVAC', assetCategory: 'HVAC', description: 'Rattling noise from the vent every few minutes; distracting during exams.' },
      { title: 'Server room temperature alarm', category: 'HVAC', assetCategory: 'HVAC', description: 'Environmental monitor shows 29°C and rising.' },
      { title: 'Projector image flickering', category: 'IT & AV', assetCategory: 'IT & AV', description: 'Image flickers and drops out every few seconds over HDMI.' },
      { title: 'No sound from lecture hall speakers', category: 'IT & AV', assetCategory: 'IT & AV', description: 'Audio works on the laptop but not through the room system.' },
      { title: 'Wi-Fi keeps disconnecting', category: 'IT & AV', assetCategory: 'IT & AV', description: 'Students report drops every 10–15 minutes in the reading room.' },
      { title: 'Lights flickering in corridor', category: 'Electrical', description: 'Two tube lights flicker constantly near the stairwell.' },
      { title: 'Power socket sparking', category: 'Electrical', description: 'Socket near the lab bench sparked when a charger was plugged in.' },
      { title: 'Lift stuck between floors', category: 'Electrical', assetCategory: 'Electrical', description: 'Lift stopped between ground and first floor; nobody trapped, doors closed.' },
      { title: 'Tripped breaker — half the room without power', category: 'Electrical', assetCategory: 'Electrical', description: 'Breaker trips again within minutes of resetting.' },
      { title: 'Leaking tap in washroom', category: 'Plumbing', description: 'Tap does not close fully; constant drip.' },
      { title: 'Blocked drain in common kitchen', category: 'Plumbing', description: 'Sink drains very slowly and smells.' },
      { title: 'No hot water in hostel showers', category: 'Plumbing', assetCategory: 'Plumbing', description: 'Water stays cold for over 10 minutes.' },
      { title: 'Low water pressure on upper floors', category: 'Plumbing', assetCategory: 'Plumbing', description: 'Pressure drops significantly in the mornings.' },
      { title: 'Door hinge broken', category: 'Carpentry', description: 'Door drags on the floor and does not latch.' },
      { title: 'Broken chair in lecture hall', category: 'Carpentry', description: 'Seat in row 6 is detached from the frame.' },
      { title: 'Window latch not closing', category: 'Carpentry', description: 'Window cannot be secured; rain gets in.' },
      { title: 'Spill cleanup needed in corridor', category: 'Cleaning', description: 'Large liquid spill near the entrance; slip hazard.' },
      { title: 'Restroom needs deep cleaning', category: 'Cleaning', description: 'Requested ahead of the open day event.' },
      { title: 'Fire exit sign not illuminated', category: 'Safety', description: 'Emergency exit sign above the rear door is dark.' },
      { title: 'Fire alarm panel showing fault', category: 'Safety', assetCategory: 'Safety', description: 'Panel shows a zone fault light and beeps intermittently.' },
      { title: 'Emergency shower low flow', category: 'Safety', assetCategory: 'Safety', description: 'Weekly test showed weak flow.' },
      { title: 'Fallen branch blocking path', category: 'Grounds', description: 'Large branch across the footpath after last night’s storm.' },
      { title: 'Parking barrier not lifting', category: 'Grounds', assetCategory: 'Grounds', description: 'Barrier stays down for permit holders.' },
    ],
    schedules: [
      { title: 'Monthly AC filter service — Lecture Hall 204', category: 'HVAC', asset: 'HVAC-204', unit: 'MONTH', interval: 1, priority: 'MEDIUM', checklist: 'HVAC service' },
      { title: 'Server room cooling inspection', category: 'HVAC', asset: 'HVAC-SRV', unit: 'WEEK', interval: 2, priority: 'HIGH', checklist: 'HVAC service' },
      { title: 'Generator load test', category: 'Electrical', asset: 'ELE-GEN-1', unit: 'MONTH', interval: 1, priority: 'HIGH', checklist: 'Electrical safety' },
      { title: 'Fire alarm panel quarterly test', category: 'Safety', asset: 'SAF-FAP-SB', unit: 'MONTH', interval: 3, priority: 'HIGH', checklist: 'Safety inspection' },
      { title: 'Emergency shower weekly flush', category: 'Safety', asset: 'SAF-CHEM-SH', unit: 'WEEK', interval: 1, priority: 'MEDIUM' },
      { title: 'Hostel water heater descaling', category: 'Plumbing', asset: 'PLB-HA-WH1', unit: 'MONTH', interval: 6, priority: 'LOW', checklist: 'Plumbing repair' },
    ],
  },
  {
    slug: 'st-aurelia-hospital',
    name: 'St. Aurelia General Hospital',
    industry: 'HEALTHCARE',
    timezone: 'Europe/London',
    seed: 2077,
    workOrders: 110,
    policy: { requesterSeesAllOrgRequests: false, autoAssignMode: 'SUGGEST' },
    people: [
      { name: 'Helen Carter', email: 'admin@staurelia.demo', role: 'ORG_ADMIN', jobTitle: 'Head of Estates & Facilities' },
      { name: 'Marcus Webb', email: 'marcus.webb@staurelia.demo', role: 'MANAGER', jobTitle: 'Facilities Manager' },
      { name: 'Olivia Hart', email: 'olivia.hart@staurelia.demo', role: 'TECHNICIAN', jobTitle: 'Biomedical Engineer', skills: [['Electrical', 3], ['Safety', 2]] },
      { name: 'Samuel Okafor', email: 'samuel.okafor@staurelia.demo', role: 'TECHNICIAN', jobTitle: 'HVAC Engineer', skills: [['HVAC', 3]] },
      { name: 'Grace Lin', email: 'grace.lin@staurelia.demo', role: 'TECHNICIAN', jobTitle: 'Plumbing & Water Safety', skills: [['Plumbing', 3], ['Safety', 2]] },
      { name: 'Tom Fletcher', email: 'tom.fletcher@staurelia.demo', role: 'TECHNICIAN', jobTitle: 'Estates Technician', skills: [['Carpentry', 2], ['Electrical', 1], ['Grounds', 2]] },
      { name: 'Sister Amara Nwosu', email: 'amara.nwosu@staurelia.demo', role: 'REQUESTER', jobTitle: 'Ward Sister, Ward B' },
      { name: 'Dr. James Patel', email: 'james.patel@staurelia.demo', role: 'REQUESTER', jobTitle: 'Consultant Radiologist' },
      { name: 'Chloe Edwards', email: 'chloe.edwards@staurelia.demo', role: 'REQUESTER', jobTitle: 'Outpatients Coordinator' },
      { name: 'Ben Hughes', email: 'ben.hughes@staurelia.demo', role: 'REQUESTER', jobTitle: 'ICU Charge Nurse' },
    ],
    locations: [
      {
        name: 'Main Hospital',
        type: 'BUILDING',
        code: 'MH',
        children: [
          { name: 'Main Hospital · Level 1', type: 'FLOOR', code: 'MH-1', children: [room('Emergency Department', 'ED'), room('Radiology', 'RAD'), room('Main Entrance', 'MH-ENT')] },
          { name: 'Main Hospital · Level 2', type: 'FLOOR', code: 'MH-2', children: [room('Ward A', 'W-A'), room('Ward B', 'W-B'), room('Intensive Care Unit', 'ICU')] },
          { name: 'Main Hospital · Level 3', type: 'FLOOR', code: 'MH-3', children: [room('Operating Theatre 1', 'OT-1'), room('Operating Theatre 2', 'OT-2'), room('Sterile Services', 'SSD')] },
        ],
      },
      { name: 'Outpatient Clinic', type: 'BUILDING', code: 'OPC', children: [{ name: 'Clinic · Ground Floor', type: 'FLOOR', children: [room('Waiting Area', 'OPC-W'), room('Consulting Rooms', 'OPC-C')] }] },
    ],
    assets: [
      { name: 'Theatre air handling unit', tag: 'HVAC-OT1', category: 'HVAC', location: 'Operating Theatre 1', manufacturer: 'Swegon', model: 'GOLD RX' },
      { name: 'ICU ventilation unit', tag: 'HVAC-ICU', category: 'HVAC', location: 'Intensive Care Unit', manufacturer: 'Swegon', model: 'GOLD RX' },
      { name: 'MRI chiller', tag: 'HVAC-MRI', category: 'HVAC', location: 'Radiology', manufacturer: 'Carrier', model: '30RBP' },
      { name: 'Medical gas alarm panel', tag: 'SAF-MGAS-2', category: 'Safety', location: 'Main Hospital · Level 2', manufacturer: 'BeaconMedaes', model: 'TotalAlert' },
      { name: 'Standby generator', tag: 'ELE-GEN-MH', category: 'Electrical', location: 'Main Hospital', manufacturer: 'Caterpillar', model: 'C32' },
      { name: 'Bed lift', tag: 'ELE-LIFT-B1', category: 'Electrical', location: 'Main Hospital · Level 1', manufacturer: 'Otis', model: 'Gen2 Stream' },
      { name: 'Thermostatic mixing valves', tag: 'PLB-TMV-WB', category: 'Plumbing', location: 'Ward B', manufacturer: 'Horne', model: 'Optitherm' },
      { name: 'Autoclave', tag: 'SAF-AUTO-1', category: 'Safety', location: 'Sterile Services', manufacturer: 'Steris', model: 'AMSCO 600' },
      { name: 'Nurse call system', tag: 'IT-NC-WA', category: 'IT & AV', location: 'Ward A', manufacturer: 'Ascom', model: 'Telligence' },
      { name: 'Automatic entrance doors', tag: 'CAR-ENT-1', category: 'Carpentry', location: 'Main Entrance', manufacturer: 'Stanley', model: 'Dura-Glide' },
    ],
    issues: [
      { title: 'Theatre temperature outside range', category: 'HVAC', assetCategory: 'HVAC', description: 'Theatre reading 24.5°C; required 18–22°C before next list.' },
      { title: 'ICU room pressure alarm', category: 'HVAC', assetCategory: 'HVAC', description: 'Isolation room negative pressure alarm activated.' },
      { title: 'Nurse call bell not working — Bay 3', category: 'IT & AV', assetCategory: 'IT & AV', description: 'Patient call button in bay 3 does not register at the station.' },
      { title: 'Shower water too hot', category: 'Plumbing', assetCategory: 'Plumbing', description: 'TMV appears to have failed; scald risk.' },
      { title: 'Blocked sluice', category: 'Plumbing', description: 'Sluice room drain blocked.' },
      { title: 'Lift out of service', category: 'Electrical', assetCategory: 'Electrical', description: 'Bed lift showing fault code and not responding.' },
      { title: 'Overhead light failed in consulting room', category: 'Electrical', description: 'Examination light not switching on.' },
      { title: 'Entrance door stuck open', category: 'Carpentry', assetCategory: 'Carpentry', description: 'Automatic door stays open; draught and security concern.' },
      { title: 'Medical gas alarm sounding', category: 'Safety', assetCategory: 'Safety', description: 'Oxygen low-pressure alarm on level 2 panel.' },
      { title: 'Autoclave cycle failing', category: 'Safety', assetCategory: 'Safety', description: 'Cycle aborts at drying stage.' },
    ],
    schedules: [
      { title: 'Theatre AHU monthly service', category: 'HVAC', asset: 'HVAC-OT1', unit: 'MONTH', interval: 1, priority: 'HIGH', checklist: 'HVAC service' },
      { title: 'Generator monthly run', category: 'Electrical', asset: 'ELE-GEN-MH', unit: 'MONTH', interval: 1, priority: 'HIGH', checklist: 'Electrical safety' },
      { title: 'TMV quarterly temperature check', category: 'Plumbing', asset: 'PLB-TMV-WB', unit: 'MONTH', interval: 3, priority: 'MEDIUM', checklist: 'Plumbing repair' },
    ],
  },
  {
    slug: 'cedar-grove-residences',
    name: 'Cedar Grove Residences',
    industry: 'RESIDENTIAL',
    timezone: 'America/New_York',
    seed: 3301,
    workOrders: 75,
    policy: { technicianSelfAssign: true, autoAssignMode: 'AUTO' },
    people: [
      { name: SHARED_PERSON.name, email: SHARED_PERSON.email, role: 'ORG_ADMIN', jobTitle: 'Property Operations Director' },
      { name: 'Dana Whitfield', email: 'dana.whitfield@cedargrove.demo', role: 'MANAGER', jobTitle: 'Building Manager' },
      { name: 'Luis Ortega', email: 'luis.ortega@cedargrove.demo', role: 'TECHNICIAN', jobTitle: 'Maintenance Supervisor', skills: [['Plumbing', 3], ['HVAC', 2], ['Carpentry', 2]] },
      { name: 'Keisha Brown', email: 'keisha.brown@cedargrove.demo', role: 'TECHNICIAN', jobTitle: 'Maintenance Technician', skills: [['Electrical', 3], ['HVAC', 1]] },
      { name: 'Ethan Park', email: 'ethan.park@cedargrove.demo', role: 'TECHNICIAN', jobTitle: 'Porter & Grounds', skills: [['Cleaning', 3], ['Grounds', 3]] },
      { name: 'Maria Gonzalez', email: 'maria.gonzalez@cedargrove.demo', role: 'REQUESTER', jobTitle: 'Resident, Tower A 12B' },
      { name: 'Kevin Murphy', email: 'kevin.murphy@cedargrove.demo', role: 'REQUESTER', jobTitle: 'Resident, Tower B 4C' },
      { name: 'Aisha Rahman', email: 'aisha.rahman@cedargrove.demo', role: 'REQUESTER', jobTitle: 'Front Desk Concierge' },
    ],
    locations: [
      { name: 'Tower A', type: 'BUILDING', code: 'TA', children: [{ name: 'Tower A · Floor 12', type: 'FLOOR', children: [room('Apartment 12B', 'TA-12B'), room('Apartment 12C', 'TA-12C')] }, { name: 'Tower A · Lobby level', type: 'FLOOR', children: [room('Lobby', 'TA-LOB'), room('Mail Room', 'TA-MAIL')] }] },
      { name: 'Tower B', type: 'BUILDING', code: 'TB', children: [{ name: 'Tower B · Floor 4', type: 'FLOOR', children: [room('Apartment 4C', 'TB-4C'), room('Apartment 4D', 'TB-4D')] }, { name: 'Tower B · Amenity level', type: 'FLOOR', children: [room('Fitness Center', 'TB-GYM'), room('Residents Lounge', 'TB-LNG')] }] },
      { name: 'Parking Garage', type: 'AREA', code: 'GAR' },
      { name: 'Pool Deck', type: 'AREA', code: 'POOL' },
    ],
    assets: [
      { name: 'Tower A passenger elevator', tag: 'ELV-TA-1', category: 'Electrical', location: 'Tower A', manufacturer: 'Schindler', model: '3300' },
      { name: 'Rooftop boiler', tag: 'HVAC-BLR-TA', category: 'HVAC', location: 'Tower A', manufacturer: 'Lochinvar', model: 'Crest' },
      { name: 'Garage exhaust fans', tag: 'HVAC-GAR', category: 'HVAC', location: 'Parking Garage', manufacturer: 'Greenheck', model: 'SQ' },
      { name: 'Pool filtration pump', tag: 'PLB-POOL', category: 'Plumbing', location: 'Pool Deck', manufacturer: 'Pentair', model: 'IntelliFlo' },
      { name: 'Gym treadmills', tag: 'GEN-GYM', category: 'Carpentry', location: 'Fitness Center', manufacturer: 'Technogym', model: 'Run 600' },
      { name: 'Garage gate', tag: 'GRD-GATE', category: 'Grounds', location: 'Parking Garage', manufacturer: 'LiftMaster', model: 'CSW24UL' },
    ],
    issues: [
      { title: 'No heat in apartment', category: 'HVAC', assetCategory: 'HVAC', description: 'Radiators are cold; thermostat set to 72°F.' },
      { title: 'Garbage disposal jammed', category: 'Plumbing', description: 'Disposal hums but does not spin.' },
      { title: 'Leak under kitchen sink', category: 'Plumbing', description: 'Cabinet floor is wet each morning.' },
      { title: 'Elevator making grinding noise', category: 'Electrical', assetCategory: 'Electrical', description: 'Noise between floors 8 and 10.' },
      { title: 'Hallway light out', category: 'Electrical', description: 'Light outside unit is out.' },
      { title: 'Garage gate stuck', category: 'Grounds', assetCategory: 'Grounds', description: 'Gate opens only halfway.' },
      { title: 'Treadmill belt slipping', category: 'Carpentry', assetCategory: 'Carpentry', description: 'Belt slips at higher speeds.' },
      { title: 'Lobby carpet stain', category: 'Cleaning', description: 'Large coffee stain near the entrance.' },
    ],
    schedules: [
      { title: 'Elevator monthly inspection', category: 'Electrical', asset: 'ELV-TA-1', unit: 'MONTH', interval: 1, priority: 'HIGH', checklist: 'Electrical safety' },
      { title: 'Pool pump weekly check', category: 'Plumbing', asset: 'PLB-POOL', unit: 'WEEK', interval: 1, priority: 'LOW' },
    ],
  },
];

export const DEMO_PASSWORD = 'FixFlow-Demo-2026';
