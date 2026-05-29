/**
 * Policy service — manages expiration alert policies and webhooks.
 *
 * Handles CRUD for ExpirationPolicy + ExpirationWebhook,
 * enforces business rules (single-default-per-zone, validation),
 * and provides webhook testing capability.
 */

import type {
  ExpirationPolicyDetail,
  ExpirationWebhook as ApiWebhook,
  ThresholdsMap,
  PolicyCreateWithWebhooks,
  PolicyUpdate,
  WebhookTestResult,
  PaginatedResponse,
} from '@certificado-digital/shared';
import type { ExpirationWebhook as PrismaWebhook } from '@prisma/client';
import {
  PolicyRepository,
  type PolicyWithWebhooks,
  type CreateWebhookData,
} from '../repositories/policyRepo.js';
import { parsePaginationParams, buildPaginatedResponse } from '../utils/pagination.js';

// ─── Query param types ──────────────────────────────────────────────────────

export interface ListPoliciesQuery {
  page?: string;
  pageSize?: string;
}

// ─── Default thresholds ─────────────────────────────────────────────────────

const DEFAULT_THRESHOLDS: ThresholdsMap = {
  days_90: { enabled: true, channels: ['email'] },
  days_30: { enabled: true, channels: ['email', 'webhook'] },
  days_7: { enabled: true, channels: ['email', 'webhook'] },
  days_1: { enabled: true, channels: ['email', 'webhook'] },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse thresholds from the TEXT column (JSON-encoded string) to ThresholdsMap.
 */
function parseThresholds(raw: string): ThresholdsMap {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // Validate it has the expected structure
      const result: ThresholdsMap = { ...DEFAULT_THRESHOLDS };
      for (const key of ['days_90', 'days_30', 'days_7', 'days_1'] as const) {
        if (parsed[key] && typeof parsed[key] === 'object') {
          result[key] = {
            enabled: typeof parsed[key].enabled === 'boolean' ? parsed[key].enabled : true,
            channels: Array.isArray(parsed[key].channels)
              ? parsed[key].channels
              : DEFAULT_THRESHOLDS[key].channels,
          };
        }
      }
      return result;
    }
  } catch {
    // invalid JSON, return default
  }
  return DEFAULT_THRESHOLDS;
}

/**
 * Map a Prisma ExpirationWebhook to the shared API type (ISO strings).
 */
function mapToApiWebhook(wh: PrismaWebhook): ApiWebhook {
  return {
    id: wh.id,
    policyId: wh.policyId,
    url: wh.url,
    headers: (wh.headers ?? {}) as Record<string, string>,
    retryStrategy: wh.retryStrategy,
    maxRetries: wh.maxRetries,
    timeoutSeconds: wh.timeoutSeconds,
    isActive: wh.isActive,
    testResult: wh.testResult,
    lastTestAt: wh.lastTestAt?.toISOString() ?? null,
    createdAt: wh.createdAt.toISOString(),
    updatedAt: wh.updatedAt.toISOString(),
  };
}

/**
 * Map a Prisma ExpirationPolicy (with webhooks) to the shared API type.
 */
function mapToApiPolicyDetail(policy: PolicyWithWebhooks): ExpirationPolicyDetail {
  return {
    id: policy.id,
    name: policy.name,
    description: policy.description,
    zoneId: policy.zoneId,
    isDefault: policy.isDefault,
    thresholds: parseThresholds(policy.thresholds),
    emailEnabled: policy.emailEnabled,
    emailRecipientsAdditional: policy.emailRecipientsAdditional,
    emailSubjectPrefix: policy.emailSubjectPrefix,
    createdBy: policy.createdBy,
    updatedBy: policy.updatedBy,
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
    webhooks: policy.webhooks.map(mapToApiWebhook),
  };
}

/**
 * Validate thresholds map structure.
 */
function validateThresholds(thresholds: ThresholdsMap): string | null {
  if (!thresholds || typeof thresholds !== 'object') {
    return 'thresholds must be a ThresholdsMap object';
  }

  const requiredKeys = ['days_90', 'days_30', 'days_7', 'days_1'] as const;
  for (const key of requiredKeys) {
    const tier = thresholds[key];
    if (!tier || typeof tier !== 'object') {
      return `thresholds.${key} is required and must be an object`;
    }
    if (typeof tier.enabled !== 'boolean') {
      return `thresholds.${key}.enabled must be a boolean`;
    }
    if (!Array.isArray(tier.channels)) {
      return `thresholds.${key}.channels must be an array`;
    }
    for (const ch of tier.channels) {
      if (ch !== 'email' && ch !== 'webhook') {
        return `thresholds.${key}.channels contains invalid channel "${ch}". Must be "email" or "webhook"`;
      }
    }
  }

  return null;
}

/**
 * Validate policy name: non-empty, reasonable length.
 */
function validateName(name: string): string | null {
  if (!name || name.trim().length === 0) {
    return 'Policy name is required';
  }
  if (name.trim().length > 200) {
    return 'Policy name must be at most 200 characters';
  }
  return null;
}

// ─── Service class ──────────────────────────────────────────────────────────

export class PolicyService {
  constructor(private readonly repo: PolicyRepository) {}

  /**
   * List all policies with pagination.
   */
  async listPolicies(
    query: ListPoliciesQuery = {},
  ): Promise<PaginatedResponse<ExpirationPolicyDetail>> {
    const pagination = parsePaginationParams({
      page: query.page,
      pageSize: query.pageSize,
    });

    const allPolicies = await this.repo.findAll();
    const total = allPolicies.length;

    // Apply pagination (in-memory since policies are a small dataset)
    const paginatedData = allPolicies.slice(pagination.skip, pagination.skip + pagination.take);
    const mapped = paginatedData.map(mapToApiPolicyDetail);

    return buildPaginatedResponse(mapped, total, pagination.page, pagination.pageSize);
  }

  /**
   * Get a single policy by ID with its webhooks.
   */
  async getPolicy(id: string): Promise<ExpirationPolicyDetail | null> {
    const policy = await this.repo.findById(id);
    if (!policy) return null;
    return mapToApiPolicyDetail(policy);
  }

  /**
   * Create a new expiration policy.
   * Validates input, enforces uniqueness rules.
   */
  async createPolicy(
    input: PolicyCreateWithWebhooks,
  ): Promise<{ data: ExpirationPolicyDetail } | { error: string }> {
    // Validate name
    const nameError = validateName(input.name);
    if (nameError) return { error: nameError };

    // Validate thresholds
    const thresholdError = validateThresholds(input.thresholds);
    if (thresholdError) return { error: thresholdError };

    // Validate webhook URLs if provided
    if (input.webhooks) {
      for (const wh of input.webhooks) {
        if (!wh.url || wh.url.trim().length === 0) {
          return { error: 'Webhook URL is required' };
        }
        try {
          new URL(wh.url);
        } catch {
          return { error: `Invalid webhook URL: ${wh.url}` };
        }
      }
    }

    const webhooks: CreateWebhookData[] | undefined = input.webhooks?.map((wh) => ({
      url: wh.url,
      headers: wh.headers,
      retryStrategy: wh.retryStrategy,
      maxRetries: wh.maxRetries,
      timeoutSeconds: wh.timeoutSeconds,
      isActive: wh.isActive,
    }));

    const policy = await this.repo.create({
      name: input.name.trim(),
      description: input.description ?? null,
      zoneId: input.zoneId ?? null,
      isDefault: input.isDefault ?? false,
      thresholds: JSON.stringify(input.thresholds),
      emailEnabled: input.emailEnabled ?? true,
      emailRecipientsAdditional: input.emailRecipientsAdditional ?? null,
      emailSubjectPrefix: input.emailSubjectPrefix ?? null,
      createdBy: input.createdBy,
      webhooks,
    });

    return { data: mapToApiPolicyDetail(policy) };
  }

  /**
   * Update an existing policy.
   * Validates input, enforces uniqueness rules.
   */
  async updatePolicy(
    id: string,
    input: PolicyUpdate,
  ): Promise<{ data: ExpirationPolicyDetail } | { error: string; statusCode?: number }> {
    // Validate name if provided
    if (input.name !== undefined) {
      const nameError = validateName(input.name);
      if (nameError) return { error: nameError };
    }

    // Validate thresholds if provided
    if (input.thresholds !== undefined) {
      const thresholdError = validateThresholds(input.thresholds);
      if (thresholdError) return { error: thresholdError };
    }

    const updated = await this.repo.update(id, {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.zoneId !== undefined && { zoneId: input.zoneId }),
      ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
      ...(input.thresholds !== undefined && { thresholds: JSON.stringify(input.thresholds) }),
      ...(input.emailEnabled !== undefined && { emailEnabled: input.emailEnabled }),
      ...(input.emailRecipientsAdditional !== undefined && {
        emailRecipientsAdditional: input.emailRecipientsAdditional,
      }),
      ...(input.emailSubjectPrefix !== undefined && {
        emailSubjectPrefix: input.emailSubjectPrefix,
      }),
      updatedBy: input.updatedBy,
    });

    if (!updated) {
      return { error: `Policy with id "${id}" not found`, statusCode: 404 };
    }

    return { data: mapToApiPolicyDetail(updated) };
  }

  /**
   * Soft-delete a policy.
   * Sets the policy as non-default so certificates fall back to global default.
   */
  async deletePolicy(id: string): Promise<ExpirationPolicyDetail | null> {
    const deleted = await this.repo.softDelete(id);
    if (!deleted) return null;
    return mapToApiPolicyDetail(deleted);
  }

  /**
   * Get the effective policy for a zone.
   * Returns zone-specific policy if exists, otherwise global default.
   */
  async getZonePolicy(zoneId: string): Promise<ExpirationPolicyDetail | null> {
    const policy = await this.repo.findEffectivePolicy(zoneId);
    if (!policy) return null;
    return mapToApiPolicyDetail(policy);
  }

  /**
   * Test a webhook by sending a test POST request.
   * Updates the webhook's testResult and lastTestAt fields.
   */
  async testWebhook(webhookId: string): Promise<WebhookTestResult | null> {
    const webhook = await this.repo.findWebhookById(webhookId);
    if (!webhook) return null;

    const startTime = Date.now();
    let success = false;
    let statusCode: number | null = null;
    let errorMessage: string | null = null;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...((webhook.headers as Record<string, string>) ?? {}),
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), webhook.timeoutSeconds * 1000);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'test',
          message: 'Webhook connectivity test from Certificado Digital',
          timestamp: new Date().toISOString(),
          webhookId: webhook.id,
          policyId: webhook.policyId,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      statusCode = response.status;
      success = response.ok;

      if (!response.ok) {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
    } catch (err) {
      errorMessage =
        err instanceof Error ? err.message : 'Unknown error during webhook test';
    }

    const responseTime = Date.now() - startTime;
    const testedAt = new Date();
    const testResult = success ? 'SUCCESS' : `FAILED: ${errorMessage}`;

    // Persist test result
    await this.repo.updateWebhookTestResult(webhookId, testResult, testedAt);

    return {
      webhookId,
      success,
      statusCode,
      responseTime,
      errorMessage,
      testedAt: testedAt.toISOString(),
    };
  }
}
