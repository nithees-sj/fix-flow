import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import type { Database } from '@fixflow/db';
import { ACTIVE_STATUSES, type AttachmentDto, type AttachmentKind } from '@fixflow/shared';
import type { Actor } from '../../common/auth/actor.js';
import { AppError, forbidden, notFound } from '../../common/errors.js';
import { AuditService } from '../../infra/audit.service.js';
import { StorageService } from '../../infra/storage.service.js';
import { DATABASE } from '../../infra/tokens.js';
import { workOrderVisibility } from './access.js';
import { loadPolicy } from './policy.js';
import { toAttachmentDto } from './work-order-query.service.js';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_TYPES = new Set([...IMAGE_TYPES, 'application/pdf']);
const ACTIVE = new Set<string>(ACTIVE_STATUSES);

interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

/**
 * Upload pipeline:
 *  1. authorize against the work order (visibility + role/assignee rules)
 *  2. detect the real type from magic bytes (the client-declared MIME type is ignored)
 *  3. re-encode images with sharp — strips EXIF/GPS metadata, normalizes orientation,
 *     bounds dimensions and defeats polyglot files — and generate a thumbnail
 *  4. store privately under org/{organizationId}/… and record the row; on DB failure the
 *     stored objects are deleted again (compensation)
 */
@Injectable()
export class AttachmentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async upload(actor: Actor, workOrderId: string, file: UploadedFile | undefined, requestedKind: AttachmentKind): Promise<AttachmentDto> {
    // Authorize first: the response must never depend on the payload for records you cannot access.
    const wo = await this.db.tx(actor.ctx, async (tx) => {
      const policy = await loadPolicy(tx, actor.organizationId);
      const w = await tx.workOrder.findFirst({
        where: { id: workOrderId, organizationId: actor.organizationId, ...workOrderVisibility(actor, policy) },
        select: { id: true, status: true, assigneeId: true, requesterId: true },
      });
      if (!w) throw notFound('Work order');
      return w;
    });
    const isManager = actor.role === 'MANAGER' || actor.role === 'ORG_ADMIN';
    const isAssignee = wo.assigneeId === actor.userId;
    const isRequester = wo.requesterId === actor.userId;
    if (!ACTIVE.has(wo.status)) throw forbidden('Attachments can only be added to active work orders');
    if (!isManager && !isAssignee && !isRequester) throw forbidden('You cannot add files to this work order');
    const kind: AttachmentKind = isAssignee || isManager ? (requestedKind === 'REPORT' ? 'PROGRESS' : requestedKind) : 'REPORT';
    if (!file?.buffer?.length) throw new AppError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Choose a file to upload');
    if (file.size > MAX_UPLOAD_BYTES) throw new AppError(HttpStatus.PAYLOAD_TOO_LARGE, 'PAYLOAD_TOO_LARGE', 'Files must be 10 MB or smaller');

    const detected = await fileTypeFromBuffer(file.buffer);
    if (!detected || !ALLOWED_TYPES.has(detected.mime)) {
      throw new AppError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'UNSUPPORTED_MEDIA_TYPE', 'Only JPEG, PNG, WebP images and PDF documents are accepted');
    }

    let body = file.buffer;
    let contentType = detected.mime;
    let ext = detected.ext;
    let width: number | null = null;
    let height: number | null = null;
    let thumb: Buffer | null = null;
    if (IMAGE_TYPES.has(detected.mime)) {
      try {
        const pipeline = sharp(file.buffer, { failOn: 'error', limitInputPixels: 50_000_000 }).rotate();
        const out = await pipeline
          .clone()
          .resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 82, mozjpeg: true })
          .toBuffer({ resolveWithObject: true });
        body = out.data;
        width = out.info.width;
        height = out.info.height;
        contentType = 'image/jpeg';
        ext = 'jpg';
        thumb = await pipeline.clone().resize({ width: 480, height: 480, fit: 'cover' }).webp({ quality: 72 }).toBuffer();
      } catch {
        throw new AppError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'UNSUPPORTED_MEDIA_TYPE', 'The image could not be processed');
      }
    }

    const id = randomUUID();
    const base = `org/${actor.organizationId}/work-orders/${workOrderId}/${id}`;
    const storageKey = `${base}.${ext}`;
    const thumbnailKey = thumb ? `${base}.thumb.webp` : null;
    const fileName = sanitizeFileName(file.originalname, ext);

    await this.storage.put(storageKey, body, contentType);
    if (thumb && thumbnailKey) await this.storage.put(thumbnailKey, thumb, 'image/webp');
    try {
      const row = await this.db.tx(actor.ctx, async (tx) => {
        const a = await tx.attachment.create({
          data: {
            id,
            organizationId: actor.organizationId,
            workOrderId,
            uploadedById: actor.userId,
            kind,
            storageKey,
            thumbnailKey,
            fileName,
            contentType,
            sizeBytes: body.length,
            width,
            height,
          },
          include: { uploadedBy: { select: { id: true, name: true } } },
        });
        await this.audit.record(tx, actor, {
          action: 'workOrder.attachmentAdded',
          entityType: 'WorkOrder',
          entityId: workOrderId,
          metadata: { attachmentId: id, fileName, kind, sizeBytes: body.length },
        });
        return a;
      });
      return toAttachmentDto(row);
    } catch (err) {
      await Promise.allSettled([this.storage.delete(storageKey), thumbnailKey ? this.storage.delete(thumbnailKey) : Promise.resolve()]);
      throw err;
    }
  }

  /** Streams a file only if the work order is visible to the actor. */
  async open(actor: Actor, attachmentId: string, variant: 'original' | 'thumb') {
    const a = await this.db.tx(actor.ctx, async (tx) => {
      const policy = await loadPolicy(tx, actor.organizationId);
      return tx.attachment.findFirst({
        where: {
          id: attachmentId,
          organizationId: actor.organizationId,
          workOrder: workOrderVisibility(actor, policy),
        },
        select: { storageKey: true, thumbnailKey: true, fileName: true, contentType: true },
      });
    });
    if (!a) throw notFound('Attachment');
    const key = variant === 'thumb' && a.thumbnailKey ? a.thumbnailKey : a.storageKey;
    const obj = await this.storage.get(key);
    return {
      stream: obj.body as Readable,
      contentType: variant === 'thumb' && a.thumbnailKey ? 'image/webp' : a.contentType,
      contentLength: obj.contentLength,
      fileName: a.fileName,
    };
  }
}

function sanitizeFileName(name: string, ext: string): string {
  const stem = name.replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '').trim().slice(0, 80) || 'file';
  return `${stem}.${ext}`;
}

