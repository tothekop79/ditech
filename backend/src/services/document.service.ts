import { PrismaClient, DocType, DocStatus } from '@prisma/client';
import { renderHtml, renderPdf } from './pdf.service';
import { defaultEquipmentFor, defaultPreInstallChecklist, defaultWorkingChecklist, defaultHandoverChecklist } from './document-defaults';

const prisma = new PrismaClient();

/**
 * Generate document number DT-YYYYMMDD-NNNN with atomic sequence.
 * Uses a per-day counter table to avoid collisions across concurrent creates.
 */
export async function nextDocNumber(): Promise<string> {
  const now = new Date();
  const dateKey =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');

  const seq = await prisma.$transaction(async (tx) => {
    const row = await tx.documentSequence.upsert({
      where: { date: dateKey },
      update: { lastSeq: { increment: 1 } },
      create: { date: dateKey, lastSeq: 1 },
    });
    return row.lastSeq;
  });

  const seqStr = String(seq).padStart(4, '0');
  return `DT-${dateKey}-${seqStr}`;
}

/**
 * Build the complete payload for a document, hydrating from the plan.
 * Missing fields are returned as null/empty so templates can fall back gracefully.
 */
async function hydratePlanPayload(planId: string) {
  const plan = await prisma.installationPlan.findUnique({
    where: { id: planId },
    include: {
      customer: { select: { id: true, customerCode: true, customerName: true } },
      department: { select: { id: true, departmentCode: true, departmentName: true } },
      team: {
        select: {
          id: true,
          name: true,
          members: {
            select: {
              role: true,
              user: {
                select: {
                  id: true,
                  fullName: true,
                  position: true,
                  idCard: true,
                  idCardPhotoUrl: true,
                  phone: true,
                  phoneForDoc: true,
                  email: true,
                },
              },
            },
            orderBy: { role: 'asc' },
          },
        },
      },
    },
  });
  if (!plan) throw new Error('Plan not found');
  return plan;
}

const TEMPLATE_BY_DOC_TYPE: Record<DocType, string> = {
  WORK_PERMIT: 'work-permit',
  INSTALLATION_CONFIRM: 'installation-confirm',
};

export const documentService = {
  async create(args: {
    planId: string;
    docType: DocType;
    payload?: any;
    createdById?: string | null;
  }) {
    const docNumber = await nextDocNumber();
    const plan = await hydratePlanPayload(args.planId);
    const payload = {
      ...args.payload,
      plan,
      issuedAt: new Date().toISOString(),
    };
    return prisma.document.create({
      data: {
        planId: args.planId,
        docType: args.docType,
        docNumber,
        payload: payload as any,
        equipmentList: defaultEquipmentFor(args.docType) as any,
        preInstallChecklist: args.docType === 'INSTALLATION_CONFIRM' ? defaultPreInstallChecklist() as any : undefined,
        workingChecklist: args.docType === 'INSTALLATION_CONFIRM' ? defaultWorkingChecklist() as any : undefined,
        handoverChecklist: args.docType === 'INSTALLATION_CONFIRM' ? defaultHandoverChecklist() as any : undefined,
        createdById: args.createdById ?? null,
      },
      include: {
        createdBy: { select: { id: true, fullName: true } },
      },
    });
  },

  async list(planId?: string, docType?: DocType) {
    return prisma.document.findMany({
      where: {
        ...(planId ? { planId } : {}),
        ...(docType ? { docType } : {}),
      },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        plan: {
          select: {
            id: true, storeName: true,
            customer: { select: { customerCode: true } },
            department: { select: { departmentName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async get(id: string) {
    const doc = await prisma.document.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        plan: {
          select: {
            id: true,
            storeName: true,
            storeRegion: true,
            province: true,
            address: true,
            scheduledDate: true,
            durationDays: true,
            sensorCount: true,
            customer: { select: { customerCode: true, customerName: true } },
            department: { select: { departmentName: true } },
          },
        },
      },
    });
    if (!doc) throw new Error('Document not found');
    return doc;
  },

  async update(id: string, data: { payload?: any; status?: DocStatus; signedByName?: string; pdfUrl?: string; workStartTime?: string | null; workEndTime?: string | null; notes?: string | null; poeCount?: number | null; equipmentList?: string[] | null; preInstallChecklist?: string[] | null; workingChecklist?: string[] | null; handoverChecklist?: string[] | null }) {
    return prisma.document.update({
      where: { id },
      data: {
        ...(data.payload !== undefined ? { payload: data.payload as any } : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.signedByName !== undefined ? { signedByName: data.signedByName } : {}),
        ...(data.pdfUrl !== undefined ? { pdfUrl: data.pdfUrl } : {}),
        ...(data.workStartTime !== undefined ? { workStartTime: data.workStartTime } : {}),
        ...(data.workEndTime !== undefined ? { workEndTime: data.workEndTime } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.poeCount !== undefined ? { poeCount: data.poeCount } : {}),
        ...(data.equipmentList !== undefined ? { equipmentList: data.equipmentList as any } : {}),
        ...(data.preInstallChecklist !== undefined ? { preInstallChecklist: data.preInstallChecklist as any } : {}),
        ...(data.workingChecklist !== undefined ? { workingChecklist: data.workingChecklist as any } : {}),
        ...(data.handoverChecklist !== undefined ? { handoverChecklist: data.handoverChecklist as any } : {}),
        ...(data.status === 'FINALIZED' ? { finalizedAt: new Date() } : {}),
        ...(data.status === 'SIGNED' ? { signedAt: new Date() } : {}),
      },
    });
  },

  async delete(id: string) {
    return prisma.document.delete({ where: { id } });
  },

  /**
   * Render a document as HTML using its stored payload.
   * Used for in-app preview (iframe).
   */
  async renderHtml(id: string): Promise<string> {
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) throw new Error('Document not found');
    const templateName = TEMPLATE_BY_DOC_TYPE[doc.docType];
    if (!templateName) throw new Error(`No template for docType ${doc.docType}`);
    const data = {
      docNumber: doc.docNumber,
      issuedAt: (doc.payload as any)?.issuedAt || doc.createdAt,
      signedByName: doc.signedByName,
      workStartTime: doc.workStartTime,
      workEndTime: doc.workEndTime,
      notes: doc.notes,
      poeCount: doc.poeCount,
      equipmentList: (doc.equipmentList as any) || defaultEquipmentFor(doc.docType),
      preInstallChecklist: (doc.preInstallChecklist as any) || defaultPreInstallChecklist(),
      workingChecklist: (doc.workingChecklist as any) || defaultWorkingChecklist(),
      handoverChecklist: (doc.handoverChecklist as any) || defaultHandoverChecklist(),
      ...((doc.payload as any) || {}),
    };
    return await renderHtml(templateName, data);
  },

  /**
   * Render a document as PDF binary buffer.
   */
  async renderPdf(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const html = await this.renderHtml(id);
    const doc = await prisma.document.findUnique({ where: { id } });
    const footerText = `เอกสารฉบับนี้ออกโดย DITECH Installation Planner · ${doc?.docNumber || ''}`;
    const buffer = await renderPdf(html, { footerText });
    const filename = `${doc?.docNumber || 'document'}.pdf`;
    return { buffer, filename };
  },
};
