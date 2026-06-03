/**
 * Prisma seed script — generates realistic certificate inventory data.
 *
 * Usage:
 *   npx prisma db seed                     # default: 100 certificates
 *   SEED_COUNT=10000 npx prisma db seed    # stress-test: 10 000 certificates
 */

import {
  PrismaClient,
  CertStatus,
  Environment,
  ImportSource,
  AuditAction,
  AuditResult,
} from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SEED_COUNT = parseInt(process.env.SEED_COUNT ?? '100', 10);
const BATCH_SIZE = 500; // insert in batches for large counts

// ---------------------------------------------------------------------------
// Randomness helpers
// ---------------------------------------------------------------------------

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: readonly T[], min: number, max: number): T[] {
  const count = min + Math.floor(Math.random() * (max - min + 1));
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randomDate(from: Date, to: Date): Date {
  return new Date(from.getTime() + Math.random() * (to.getTime() - from.getTime()));
}

function randomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex');
}

function sha256Fingerprint(): string {
  const hex = crypto.randomBytes(32).toString('hex').toUpperCase();
  return hex.match(/.{2}/g)!.join(':');
}

function sha1Fingerprint(): string {
  const hex = crypto.randomBytes(20).toString('hex').toUpperCase();
  return hex.match(/.{2}/g)!.join(':');
}

// ---------------------------------------------------------------------------
// Realistic domain data pools
// ---------------------------------------------------------------------------

const CN_PATTERNS = [
  '*.bank.internal',
  '*.api.bank.internal',
  '*.payments.bank.internal',
  'gateway.bank.internal',
  'auth.bank.internal',
  'portal.bank.internal',
  'vault.bank.internal',
  '*.services.corp.net',
  'kafka-broker-{n}.infra.corp.net',
  'redis-cluster-{n}.infra.corp.net',
  'db-primary-{n}.data.corp.net',
  'db-replica-{n}.data.corp.net',
  'monitoring.ops.corp.net',
  'grafana.ops.corp.net',
  '*.microservices.fintech.io',
  'api-gw.fintech.io',
  'cdn.fintech.io',
  'mail.fintech.io',
  'vpn.fintech.io',
  'ldap.corp.net',
] as const;

const ISSUERS = [
  'CN=DigiCert Global G2 TLS RSA SHA256 2020 CA1, O=DigiCert Inc, C=US',
  'CN=GlobalSign RSA OV SSL CA 2018, O=GlobalSign nv-sa, C=BE',
  'CN=Sectigo RSA Domain Validation Secure Server CA, O=Sectigo Limited, L=Salford, C=GB',
  'CN=Internal Root CA, O=Corp Banking, C=BR',
  'CN=Internal Intermediate CA G2, O=Corp Banking, C=BR',
  "CN=Let's Encrypt Authority X3, O=Let's Encrypt, C=US",
] as const;

const CA_NAMES = [
  'DigiCert',
  'GlobalSign',
  'Sectigo',
  'Internal CA',
  "Let's Encrypt",
] as const;

const CA_PROVIDERS = [
  'DigiCert CertCentral',
  'GlobalSign Atlas',
  'Sectigo SCM',
  'Internal PKI',
  'ACME / Certbot',
] as const;

const ALGORITHMS = [
  'SHA256withRSA',
  'SHA384withRSA',
  'SHA256withECDSA',
  'SHA384withECDSA',
  'SHA512withRSA',
] as const;

const OWNERS = [
  'platform-team',
  'infra-team',
  'security-team',
  'payments-team',
  'frontend-team',
  'data-team',
  'devops',
  'sre-team',
  'api-team',
  'mobile-team',
] as const;

const TEAMS = [
  'Platform Engineering',
  'Infrastructure',
  'Security Operations',
  'Payments',
  'Frontend Platform',
  'Data Engineering',
  'DevOps',
  'SRE',
  'API Gateway',
  'Mobile',
] as const;

const APPLICATIONS = [
  'payment-gateway',
  'user-auth',
  'api-gateway',
  'kafka-cluster',
  'redis-cache',
  'postgres-primary',
  'monitoring-stack',
  'web-portal',
  'mobile-bff',
  'notification-service',
  'report-engine',
  'etl-pipeline',
  'vault-server',
  'service-mesh',
  'cdn-origin',
] as const;

const ZONES = ['dmz', 'internal', 'restricted', 'public', null] as const;

const ENVIRONMENTS: Environment[] = [Environment.DEV, Environment.HML, Environment.PRD];

const IMPORT_SOURCES: ImportSource[] = [
  ImportSource.MANUAL,
  ImportSource.CSV_IMPORT,
  ImportSource.API_SYNC,
  ImportSource.CERTIFICATE_FILE,
];

const TAG_KEYS = ['cost-center', 'compliance', 'criticality', 'project', 'region'] as const;

const TAG_VALUES: Record<string, readonly string[]> = {
  'cost-center': ['CC-100', 'CC-200', 'CC-300', 'CC-400'],
  compliance: ['PCI-DSS', 'SOX', 'LGPD', 'ISO27001'],
  criticality: ['critical', 'high', 'medium', 'low'],
  project: ['atlas', 'phoenix', 'titan', 'mercury'],
  region: ['sa-east-1', 'us-east-1', 'eu-west-1'],
};

// ---------------------------------------------------------------------------
// Certificate generator
// ---------------------------------------------------------------------------

interface SeedCertificate {
  commonName: string;
  subjectDn: string;
  issuerDn: string;
  sans: string[];
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
  status: CertStatus;
  signatureAlgorithm: string;
  keySize: number;
  fingerprintSha256: string;
  fingerprintSha1: string;
  owner: string;
  team: string;
  application: string;
  environment: Environment;
  zone: string | null;
  caName: string;
  caProvider: string;
  importSource: ImportSource;
  revoked: boolean;
  revokedAt: Date | null;
  revocationReason: string | null;
  tags: Record<string, string>;
  customFields: Record<string, string>;
  description: string;
}

function generateCertificate(index: number): SeedCertificate {
  const now = new Date();

  // Pick a CN pattern and optionally replace {n} with an index-based number
  let cn = pick(CN_PATTERNS).replace('{n}', String(randomInt(1, 5)));

  // Make wildcard certs occasionally specific
  if (cn.startsWith('*.') && Math.random() > 0.6) {
    const prefix = pick(['app', 'svc', 'gw', 'web', 'api']);
    cn = cn.replace('*', `${prefix}${index}`);
  }

  // Determine validity window and derive status
  let notBefore: Date;
  let notAfter: Date;
  let status: CertStatus;
  let revoked = false;
  let revokedAt: Date | null = null;
  let revocationReason: string | null = null;

  const roll = Math.random();
  if (roll < 0.5) {
    // VALID: expires 60+ days from now
    notBefore = randomDate(
      new Date(now.getFullYear() - 1, 0, 1),
      new Date(now.getTime() - 86400000),
    );
    notAfter = randomDate(
      new Date(now.getTime() + 60 * 86400000),
      new Date(now.getFullYear() + 2, 11, 31),
    );
    status = CertStatus.VALID;
  } else if (roll < 0.75) {
    // EXPIRING_SOON: expires within 1–60 days
    notBefore = randomDate(
      new Date(now.getFullYear() - 1, 0, 1),
      new Date(now.getTime() - 86400000),
    );
    notAfter = randomDate(
      new Date(now.getTime() + 86400000),
      new Date(now.getTime() + 60 * 86400000),
    );
    status = CertStatus.EXPIRING_SOON;
  } else if (roll < 0.9) {
    // EXPIRED: already past notAfter
    notBefore = randomDate(
      new Date(now.getFullYear() - 3, 0, 1),
      new Date(now.getFullYear() - 1, 0, 1),
    );
    notAfter = randomDate(
      new Date(now.getFullYear() - 1, 0, 2),
      new Date(now.getTime() - 86400000),
    );
    status = CertStatus.EXPIRED;
  } else {
    // REVOKED
    notBefore = randomDate(
      new Date(now.getFullYear() - 2, 0, 1),
      new Date(now.getTime() - 86400000),
    );
    notAfter = randomDate(
      new Date(now.getTime() + 86400000),
      new Date(now.getFullYear() + 1, 11, 31),
    );
    status = CertStatus.REVOKED;
    revoked = true;
    revokedAt = randomDate(notBefore, now);
    revocationReason = pick([
      'Key compromise',
      'CA compromise',
      'Affiliation changed',
      'Superseded',
      'Cessation of operation',
    ]);
  }

  // Pick a CA (keep name and provider aligned)
  const caIndex = randomInt(0, CA_NAMES.length - 1);
  const caName = CA_NAMES[caIndex];
  const caProvider = CA_PROVIDERS[caIndex];
  const issuerDn = ISSUERS[caIndex % ISSUERS.length];

  // Pick algorithm + key size (align EC with smaller sizes)
  const algo = pick(ALGORITHMS);
  const keySize = algo.includes('ECDSA') ? pick([256, 384]) : pick([2048, 3072, 4096]);

  // Generate SANs from the CN
  const baseDomain = cn.replace('*.', '');
  const sans = [cn];
  if (cn.startsWith('*.')) {
    sans.push(baseDomain);
  }
  if (Math.random() > 0.5) {
    sans.push(`alt-${randomInt(1, 99)}.${baseDomain}`);
  }

  // Tags
  const selectedTagKeys = pickN(TAG_KEYS, 1, 3);
  const tags: Record<string, string> = {};
  for (const key of selectedTagKeys) {
    tags[key] = pick(TAG_VALUES[key]);
  }

  const owner = pick(OWNERS);
  const team = pick(TEAMS);

  return {
    commonName: cn,
    subjectDn: `CN=${cn}, O=Corp Banking, C=BR`,
    issuerDn,
    sans,
    serialNumber: randomHex(16).toUpperCase(),
    notBefore,
    notAfter,
    status,
    signatureAlgorithm: algo,
    keySize,
    fingerprintSha256: sha256Fingerprint(),
    fingerprintSha1: sha1Fingerprint(),
    owner,
    team,
    application: pick(APPLICATIONS),
    environment: pick(ENVIRONMENTS),
    zone: pick(ZONES),
    caName,
    caProvider,
    importSource: pick(IMPORT_SOURCES),
    revoked,
    revokedAt,
    revocationReason,
    tags,
    customFields: {},
    description: `Certificate for ${cn} managed by ${team}`,
  };
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// C7 seed data — certificate policies and zones
// ---------------------------------------------------------------------------

const SEED_POLICIES = [
  {
    name: 'dev-relaxed',
    description: 'Relaxed policy for development environments — permits smaller keys and longer validity.',
    environment: Environment.DEV,
    minKeySize: 2048,
    maxValidityDays: 730,
    allowedKeyTypes: ['RSA-2048', 'RSA-4096', 'ECDSA-P256', 'ECDSA-P384'],
    allowedOrgNames: ['Corp Banking', 'Corp Dev'],
    requiredFields: ['owner', 'application'],
    rules: {},
  },
  {
    name: 'hml-standard',
    description: 'Standard policy for homologation — mirrors production constraints with relaxed validity.',
    environment: Environment.HML,
    minKeySize: 2048,
    maxValidityDays: 365,
    allowedKeyTypes: ['RSA-2048', 'RSA-4096', 'ECDSA-P256', 'ECDSA-P384'],
    allowedOrgNames: ['Corp Banking'],
    requiredFields: ['owner', 'team', 'application'],
    rules: { requireApproval: false },
  },
  {
    name: 'prd-strict',
    description: 'Strict production policy — enforces strong keys, short validity, and mandatory metadata.',
    environment: Environment.PRD,
    minKeySize: 4096,
    maxValidityDays: 90,
    allowedKeyTypes: ['RSA-4096', 'ECDSA-P384'],
    allowedOrgNames: ['Corp Banking'],
    requiredFields: ['owner', 'team', 'application', 'zone'],
    rules: { requireApproval: true, requireSecurityReview: true },
  },
] as const;

const SEED_ZONES = [
  {
    name: 'dmz',
    description: 'Demilitarized zone — internet-facing services and reverse proxies.',
    region: 'sa-east-1',
    metadata: { networkCidr: '10.0.1.0/24', firewallProfile: 'strict' },
  },
  {
    name: 'internal',
    description: 'Internal corporate network — backend services and databases.',
    region: 'sa-east-1',
    metadata: { networkCidr: '10.0.2.0/24', firewallProfile: 'standard' },
  },
  {
    name: 'restricted',
    description: 'Restricted zone — PCI-DSS and compliance-sensitive workloads.',
    region: 'sa-east-1',
    metadata: { networkCidr: '10.0.3.0/24', firewallProfile: 'pci-dss', compliance: ['PCI-DSS', 'SOX'] },
  },
  {
    name: 'public',
    description: 'Public-facing zone — CDN origins and public API endpoints.',
    region: 'us-east-1',
    metadata: { networkCidr: '10.1.0.0/24', firewallProfile: 'cdn-optimized' },
  },
  {
    name: 'dr-site',
    description: 'Disaster recovery site — standby replicas and failover endpoints.',
    region: 'eu-west-1',
    metadata: { networkCidr: '10.2.0.0/24', firewallProfile: 'standard', isPrimary: false },
  },
] as const;

async function main(): Promise<void> {
  console.log(`🌱 Seeding ${SEED_COUNT} certificates …`);

  // Clear existing data (order matters for FK constraints)
  await prisma.auditEntry.deleteMany();
  await prisma.certificate.deleteMany();
  await prisma.certificatePolicy.deleteMany();
  await prisma.zone.deleteMany();

  // Generate and insert certificates in batches
  const certIds: string[] = [];
  for (let i = 0; i < SEED_COUNT; i += BATCH_SIZE) {
    const batchSize = Math.min(BATCH_SIZE, SEED_COUNT - i);
    const batch = Array.from({ length: batchSize }, (_, j) => generateCertificate(i + j));

    const created = await prisma.certificate.createManyAndReturn({
      data: batch,
      select: { id: true, commonName: true },
    });

    certIds.push(...created.map((c) => c.id));

    // Create audit entries for each certificate in this batch
    const auditEntries = created.map((cert) => ({
      certificateId: cert.id,
      certCn: cert.commonName,
      action: AuditAction.CREATE,
      actor: 'seed-script',
      result: AuditResult.SUCCESS,
      detail: 'Created by database seed',
    }));

    await prisma.auditEntry.createMany({ data: auditEntries });

    const progress = Math.min(i + batchSize, SEED_COUNT);
    console.log(`  ✔ ${progress}/${SEED_COUNT} certificates created`);
  }

  // Add a few extra audit entries to simulate real usage
  const sampleIds = certIds.slice(0, Math.min(10, certIds.length));
  for (const certId of sampleIds) {
    const cert = await prisma.certificate.findUnique({
      where: { id: certId },
      select: { commonName: true },
    });
    if (!cert) continue;

    await prisma.auditEntry.create({
      data: {
        certificateId: certId,
        certCn: cert.commonName,
        action: AuditAction.UPDATE,
        actor: pick(['admin@corp.net', 'ci-bot', 'security-scanner']),
        result: AuditResult.SUCCESS,
        detail: 'Updated owner assignment',
        changes: [{ field: 'owner', oldValue: 'unassigned', newValue: pick([...OWNERS]) }],
      },
    });
  }

  // Seed C7 certificate policies
  console.log('\n🏛️  Seeding certificate policies …');
  for (const policy of SEED_POLICIES) {
    await prisma.certificatePolicy.create({ data: { ...policy, rules: policy.rules as Record<string, unknown> } });
  }
  const totalPolicies = await prisma.certificatePolicy.count();
  console.log(`  ✔ ${totalPolicies} certificate policies created`);

  // Seed C7 zones
  console.log('\n🗺️  Seeding zones …');
  for (const zone of SEED_ZONES) {
    await prisma.zone.create({ data: { ...zone, metadata: zone.metadata as Record<string, unknown> } });
  }
  const totalZones = await prisma.zone.count();
  console.log(`  ✔ ${totalZones} zones created`);

  const totalCerts = await prisma.certificate.count();
  const totalAudit = await prisma.auditEntry.count();
  console.log(
    `\n✅ Seed complete: ${totalCerts} certificates, ${totalAudit} audit entries, ${totalPolicies} policies, ${totalZones} zones`,
  );
}

main()
  .catch((e: unknown) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
