// Default equipment lists per document type — used when creating new documents.
// Once stored on a Document, they become independent from these defaults.

export const DEFAULT_WORK_PERMIT_EQUIPMENT: string[] = [
  'ชุดไขควง',
  'มีดคัตเตอร์',
  'เลื่อยเหล็ก',
  'กรรไกรตัดสาย',
  'บันไดอลูมิเนียม',
  'พัดเทป น้ำสาย',
  'เครื่องทดสอบสาย U',
  'สายแลน',
  'เพล๊กเหล็ก 2 ม้วน',
  'เทปพันสายไฟ',
  'ไฟฉาย',
  'ชุดสว่านไร้สาย พร้อมแบตเตอรี่',
  'ชุดสว่านเจาะยึด',
  'กล้องนับคน',
];

export const DEFAULT_INSTALL_CONFIRM_EQUIPMENT: string[] = [];

export function defaultEquipmentFor(docType: string): string[] {
  switch (docType) {
    case 'WORK_PERMIT':
      return [...DEFAULT_WORK_PERMIT_EQUIPMENT];
    case 'INSTALLATION_CONFIRM':
      return [...DEFAULT_INSTALL_CONFIRM_EQUIPMENT];
    default:
      return [];
  }
}


export const DEFAULT_PRE_INSTALL_CHECKLIST: string[] = [
  'ตรวจสอบจุดติดตั้งกล้องตามแบบที่กำหนด',
  'ติดตั้งกล้องในตำแหน่งเหมาะสม (ความสูง มุมมอง)',
  'เดินสายไฟและสายเครือข่ายเรียบร้อย',
  'เชื่อมต่อกล้องเข้าระบบเครือข่ายสำเร็จ',
];

export const DEFAULT_WORKING_CHECKLIST: string[] = [
  'ทดสอบการนับคนเข้า-ออก ทำงานถูกต้อง',
  'ตั้งค่า Zone การนับและ Sensitivity ที่เหมาะสม',
  'ตรวจสอบภาพจากกล้องชัดเจน ไม่มีสิ่งกีดขวาง',
  'ตรวจสอบการส่งข้อมูลไปยัง Server/Dashboard',
];

export const DEFAULT_HANDOVER_CHECKLIST: string[] = [
  'แจ้งช่องทางติดต่อฝ่ายสนับสนุน',
  'ทำความสะอาดพื้นที่ติดตั้งเรียบร้อย',
];

export function defaultPreInstallChecklist(): string[] { return [...DEFAULT_PRE_INSTALL_CHECKLIST]; }
export function defaultWorkingChecklist(): string[] { return [...DEFAULT_WORKING_CHECKLIST]; }
export function defaultHandoverChecklist(): string[] { return [...DEFAULT_HANDOVER_CHECKLIST]; }
