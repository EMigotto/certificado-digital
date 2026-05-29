import type { PrismaClient, ExpirationPolicy, ExpirationWebhook } from '@prisma/client';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CreatePolicyData {
  name: string;
  description?: string | null;
  zoneId?: string | null;
  isDefault?: boolean;
  thresholds: string; // JSON-encoded ThresholdsMap stored as TEXT
  emailEnabled?: boolean;
  emailRecipientsAdditional?: string | null;
  emailSubjectPrefix?: string | null;
  createdBy: string;
  webhooks?: CreateWebhookData[];
}

export interface UpdatePolicyData {
  name?: string;
  description?: string | null;
  zoneId?: string | null;
  isDefault?: boolean;
  thresholds?: string;
  emailEnabled?: boolean;
  emailRecipientsAdditional?: string | null;
  emailSubjectPrefix?: string | null;
  updatedBy: string;
}

export interface CreateWebhookData {
  url: string;
  headers?: Record<string, string>;
  retryStrategy?: string | null;
  maxRetries?: number;
  timeoutSeconds?: number;
  isActive?: boolean;
}

export interface UpdateWebhookData {
  url?: string;
  headers?: Record<string, string>;
  retryStrategy?: string | null;
  maxRetries?: number;
  timeoutSeconds?: number;
  isActive?: boolean;
}

export type PolicyWithWebhooks = ExpirationPolicy & {
  webhooks: ExpirationWebhook[];
};

// ─── Repository class ───────────────────────────────────────────────────────

export class PolicyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * List all policies with their webhooks.
   */
  async findAll(): Promise<PolicyWithWebhooks[]> {
    return this.prisma.expirationPolicy.findMany({
      include: { webhooks: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a single policy by ID with its webhooks.
   */
  async findById(id: string): Promise<PolicyWithWebhooks | null> {
    return this.prisma.expirationPolicy.findUnique({
      where: { id },
      include: { webhooks: true },
    });
  }

  /**
   * Find policy for a specific zone.
   */
  async findByZoneId(zoneId: string): Promise<PolicyWithWebhooks | null> {
    return this.prisma.expirationPolicy.findFirst({
      where: { zoneId },
      include: { webhooks: true },
    });
  }

  /**
   * Find the global default policy (zoneId = null, isDefault = true).
   */
  async findDefault(): Promise<PolicyWithWebhooks | null> {
    return this.prisma.expirationPolicy.findFirst({
      where: { zoneId: null, isDefault: true },
      include: { webhooks: true },
    });
  }

  /**
   * Find the effective policy for a zone:
   * 1) zone-specific policy, or
   * 2) fallback to global default.
   */
  async findEffectivePolicy(zoneId: string): Promise<PolicyWithWebhooks | null> {
    const zonePolicy = await this.findByZoneId(zoneId);
    if (zonePolicy) return zonePolicy;
    return this.findDefault();
  }

  /**
   * Create a policy, optionally with embedded webhooks.
   * Enforces single-default-per-zone rule within a transaction.
   */
  async create(data: CreatePolicyData): Promise<PolicyWithWebhooks> {
    const { webhooks: webhookInputs, ...policyData } = data;

    return this.prisma.$transaction(async (tx) => {
      // If this policy is set as default, unset any existing default for the same zone
      if (policyData.isDefault) {
        await tx.expirationPolicy.updateMany({
          where: {
            zoneId: policyData.zoneId ?? null,
            isDefault: true,
          },
          data: { isDefault: false },
        });
      }

      // Create the policy
      const policy = await tx.expirationPolicy.create({
        data: {
          name: policyData.name,
          description: policyData.description ?? null,
          zoneId: policyData.zoneId ?? null,
          isDefault: policyData.isDefault ?? false,
          thresholds: policyData.thresholds,
          emailEnabled: policyData.emailEnabled ?? true,
          emailRecipientsAdditional: policyData.emailRecipientsAdditional ?? null,
          emailSubjectPrefix: policyData.emailSubjectPrefix ?? null,
          createdBy: policyData.createdBy,
        },
      });

      // Create associated webhooks if provided
      if (webhookInputs && webhookInputs.length > 0) {
        await tx.expirationWebhook.createMany({
          data: webhookInputs.map((wh) => ({
            policyId: policy.id,
            url: wh.url,
            headers: wh.headers ?? {},
            retryStrategy: wh.retryStrategy ?? null,
            maxRetries: wh.maxRetries ?? 3,
            timeoutSeconds: wh.timeoutSeconds ?? 30,
            isActive: wh.isActive ?? true,
          })),
        });
      }

      // Return full policy with webhooks
      const result = await tx.expirationPolicy.findUnique({
        where: { id: policy.id },
        include: { webhooks: true },
      });

      // result should never be null here since we just created it
      return result as PolicyWithWebhooks;
    });
  }

  /**
   * Update a policy. Enforces single-default-per-zone rule.
   */
  async update(id: string, data: UpdatePolicyData): Promise<PolicyWithWebhooks | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.expirationPolicy.findUnique({ where: { id } });
      if (!existing) return null;

      // If setting isDefault=true, unset other defaults in the same zone
      if (data.isDefault === true) {
        const targetZone = data.zoneId !== undefined ? data.zoneId : existing.zoneId;
        await tx.expirationPolicy.updateMany({
          where: {
            zoneId: targetZone,
            isDefault: true,
            NOT: { id },
          },
          data: { isDefault: false },
        });
      }

      await tx.expirationPolicy.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.zoneId !== undefined && { zoneId: data.zoneId }),
          ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
          ...(data.thresholds !== undefined && { thresholds: data.thresholds }),
          ...(data.emailEnabled !== undefined && { emailEnabled: data.emailEnabled }),
          ...(data.emailRecipientsAdditional !== undefined && {
            emailRecipientsAdditional: data.emailRecipientsAdditional,
          }),
          ...(data.emailSubjectPrefix !== undefined && {
            emailSubjectPrefix: data.emailSubjectPrefix,
          }),
          updatedBy: data.updatedBy,
        },
      });

      return tx.expirationPolicy.findUnique({
        where: { id },
        include: { webhooks: true },
      });
    });
  }

  /**
   * Soft-delete a policy by setting it inactive (isDefault = false).
   * Certificates associated with this zone fall back to global default.
   */
  async softDelete(id: string): Promise<PolicyWithWebhooks | null> {
    const existing = await this.prisma.expirationPolicy.findUnique({ where: { id } });
    if (!existing) return null;

    return this.prisma.$transaction(async (tx) => {
      // Deactivate all webhooks for this policy
      await tx.expirationWebhook.updateMany({
        where: { policyId: id },
        data: { isActive: false },
      });

      // Remove default status so certificates fall back to global default
      const updated = await tx.expirationPolicy.update({
        where: { id },
        data: { isDefault: false },
      });

      return {
        ...updated,
        webhooks: await tx.expirationWebhook.findMany({ where: { policyId: id } }),
      };
    });
  }

  /**
   * Add a webhook to an existing policy.
   */
  async createWebhook(
    policyId: string,
    data: CreateWebhookData,
  ): Promise<ExpirationWebhook | null> {
    // Verify policy exists
    const policy = await this.prisma.expirationPolicy.findUnique({
      where: { id: policyId },
    });
    if (!policy) return null;

    return this.prisma.expirationWebhook.create({
      data: {
        policyId,
        url: data.url,
        headers: data.headers ?? {},
        retryStrategy: data.retryStrategy ?? null,
        maxRetries: data.maxRetries ?? 3,
        timeoutSeconds: data.timeoutSeconds ?? 30,
        isActive: data.isActive ?? true,
      },
    });
  }

  /**
   * Update a webhook configuration.
   */
  async updateWebhook(id: string, data: UpdateWebhookData): Promise<ExpirationWebhook | null> {
    const existing = await this.prisma.expirationWebhook.findUnique({ where: { id } });
    if (!existing) return null;

    return this.prisma.expirationWebhook.update({
      where: { id },
      data: {
        ...(data.url !== undefined && { url: data.url }),
        ...(data.headers !== undefined && { headers: data.headers }),
        ...(data.retryStrategy !== undefined && { retryStrategy: data.retryStrategy }),
        ...(data.maxRetries !== undefined && { maxRetries: data.maxRetries }),
        ...(data.timeoutSeconds !== undefined && { timeoutSeconds: data.timeoutSeconds }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  /**
   * Delete a webhook by ID.
   */
  async deleteWebhook(id: string): Promise<ExpirationWebhook | null> {
    const existing = await this.prisma.expirationWebhook.findUnique({ where: { id } });
    if (!existing) return null;

    return this.prisma.expirationWebhook.delete({ where: { id } });
  }

  /**
   * Find a webhook by ID.
   */
  async findWebhookById(id: string): Promise<ExpirationWebhook | null> {
    return this.prisma.expirationWebhook.findUnique({ where: { id } });
  }

  /**
   * Update webhook test result fields.
   */
  async updateWebhookTestResult(
    id: string,
    testResult: string,
    lastTestAt: Date,
  ): Promise<ExpirationWebhook | null> {
    const existing = await this.prisma.expirationWebhook.findUnique({ where: { id } });
    if (!existing) return null;

    return this.prisma.expirationWebhook.update({
      where: { id },
      data: { testResult, lastTestAt },
    });
  }
}
