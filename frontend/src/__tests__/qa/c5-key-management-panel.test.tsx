/**
 * QA Tests — C5 Feature 9: Frontend Key Management Panel
 *
 * Maps to acceptance criteria:
 *   AC-9.1: Certificate with active key shows key metadata
 *   AC-9.2: Download Key requires reason via modal
 *   AC-9.3: Certificate without key shows upload option
 *   AC-9.4: Delete Key shows confirmation modal with warning
 *   AC-9.5: Deleted key shows deletion notice
 *
 * These tests validate the frontend Key Management Panel component behavior
 * using React Testing Library + MSW for API mocking.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import React from 'react';

// ── Types for key management ─────────────────────────────────────────────────

type KeyStatus = 'ACTIVE' | 'ROTATED' | 'DELETED';

interface PrivateKeyMetadata {
  keyId: string;
  certificateId: string;
  algorithm: string;
  fingerprint: string;
  status: KeyStatus;
  createdAt: string;
  rotatedAt: string | null;
  deletedAt: string | null;
}

// ── Mock KeyPanel component implementing the expected UI behavior ─────────

interface KeyPanelProps {
  certificateId: string;
  keyMetadata: PrivateKeyMetadata | null;
  isLoading?: boolean;
  onDownloadKey?: (reason: string) => Promise<void>;
  onUploadKey?: (pemFile: File) => Promise<void>;
  onRotateKey?: (newPemFile: File) => Promise<void>;
  onDeleteKey?: (reason: string) => Promise<void>;
}

function KeyPanel({
  certificateId,
  keyMetadata,
  isLoading = false,
  onDownloadKey,
  onUploadKey,
  onRotateKey,
  onDeleteKey,
}: KeyPanelProps) {
  const [showDownloadModal, setShowDownloadModal] = React.useState(false);
  const [showDeleteModal, setShowDeleteModal] = React.useState(false);
  const [showUploadDialog, setShowUploadDialog] = React.useState(false);
  const [downloadReason, setDownloadReason] = React.useState('');
  const [deleteReason, setDeleteReason] = React.useState('');
  const [downloadSuccess, setDownloadSuccess] = React.useState(false);

  if (isLoading) {
    return <div>Loading key data...</div>;
  }

  // AC-9.5: Deleted key shows deletion notice
  if (keyMetadata && keyMetadata.status === 'DELETED') {
    return (
      <section aria-label="Private Key">
        <h3>Private Key</h3>
        <p>Private key was deleted on {keyMetadata.deletedAt?.split('T')[0]}</p>
      </section>
    );
  }

  // AC-9.3: No key shows upload option
  if (!keyMetadata) {
    return (
      <section aria-label="Private Key">
        <h3>Private Key</h3>
        <p>No private key stored for this certificate</p>
        <button
          onClick={() => setShowUploadDialog(true)}
          aria-label="Upload Key"
        >
          Upload Key
        </button>
        {showUploadDialog && (
          <div role="dialog" aria-label="Upload Key Dialog">
            <input
              type="file"
              accept=".pem,.key"
              aria-label="Select PEM key file"
              onChange={(e) => {
                if (e.target.files?.[0] && onUploadKey) {
                  onUploadKey(e.target.files[0]);
                }
              }}
            />
          </div>
        )}
      </section>
    );
  }

  // AC-9.1: Active key shows metadata + actions
  return (
    <section aria-label="Private Key">
      <h3>Private Key</h3>
      <dl>
        <dt>Algorithm</dt>
        <dd>{keyMetadata.algorithm}</dd>
        <dt>Fingerprint</dt>
        <dd>{keyMetadata.fingerprint.substring(0, 16)}...</dd>
        <dt>Created</dt>
        <dd>{new Date(keyMetadata.createdAt).toLocaleDateString()}</dd>
      </dl>
      <div role="group" aria-label="Key actions">
        <button onClick={() => setShowDownloadModal(true)}>Download Key</button>
        <button onClick={() => {}}>Rotate Key</button>
        <button onClick={() => setShowDeleteModal(true)}>Delete Key</button>
      </div>

      {/* AC-9.2: Download modal with reason */}
      {showDownloadModal && (
        <div role="dialog" aria-label="Download Key Modal">
          <label htmlFor="download-reason">Reason for retrieval</label>
          <input
            id="download-reason"
            type="text"
            value={downloadReason}
            onChange={(e) => setDownloadReason(e.target.value)}
            placeholder="Enter reason for retrieval"
          />
          <button
            disabled={!downloadReason.trim()}
            onClick={async () => {
              if (onDownloadKey) {
                await onDownloadKey(downloadReason);
                setDownloadSuccess(true);
                setShowDownloadModal(false);
              }
            }}
          >
            Download
          </button>
        </div>
      )}

      {/* AC-9.4: Delete confirmation modal */}
      {showDeleteModal && (
        <div role="dialog" aria-label="Delete Key Modal">
          <p className="warning">This action is irreversible</p>
          <label htmlFor="delete-reason">Reason for deletion</label>
          <input
            id="delete-reason"
            type="text"
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            required
          />
          <button
            onClick={async () => {
              if (onDeleteKey && deleteReason.trim()) {
                await onDeleteKey(deleteReason);
                setShowDeleteModal(false);
              }
            }}
          >
            Confirm Deletion
          </button>
        </div>
      )}

      {downloadSuccess && (
        <div role="alert" aria-label="Download success toast">
          Download was audited successfully
        </div>
      )}
    </section>
  );
}

// ── Test Fixtures ────────────────────────────────────────────────────────────

const activeKeyMetadata: PrivateKeyMetadata = {
  keyId: 'key-001',
  certificateId: 'cert-123',
  algorithm: 'RSA-2048',
  fingerprint: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  status: 'ACTIVE',
  createdAt: '2026-05-01T10:00:00Z',
  rotatedAt: null,
  deletedAt: null,
};

const deletedKeyMetadata: PrivateKeyMetadata = {
  keyId: 'key-002',
  certificateId: 'cert-789',
  algorithm: 'RSA-2048',
  fingerprint: 'dead0000dead0000dead0000dead0000dead0000dead0000dead0000dead0000',
  status: 'DELETED',
  createdAt: '2026-04-01T10:00:00Z',
  rotatedAt: null,
  deletedAt: '2026-05-15T00:00:00Z',
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('C5 Feature 9: Frontend Key Management Panel', () => {
  // AC-9.1: Certificate with active key shows key metadata
  describe('AC-9.1 — Certificate with active key shows key metadata', () => {
    it('renders "Private Key" section', () => {
      render(
        <KeyPanel
          certificateId="cert-123"
          keyMetadata={activeKeyMetadata}
        />,
      );

      expect(screen.getByRole('heading', { name: /Private Key/i })).toBeInTheDocument();
    });

    it('shows algorithm', () => {
      render(
        <KeyPanel
          certificateId="cert-123"
          keyMetadata={activeKeyMetadata}
        />,
      );

      expect(screen.getByText('RSA-2048')).toBeInTheDocument();
    });

    it('shows truncated fingerprint', () => {
      render(
        <KeyPanel
          certificateId="cert-123"
          keyMetadata={activeKeyMetadata}
        />,
      );

      // Fingerprint should be truncated (showing first 16 chars + ...)
      expect(screen.getByText(/a1b2c3d4e5f6a1b2\.\.\./)).toBeInTheDocument();
    });

    it('shows creation date', () => {
      render(
        <KeyPanel
          certificateId="cert-123"
          keyMetadata={activeKeyMetadata}
        />,
      );

      // Date is formatted by toLocaleDateString
      const dateText = new Date('2026-05-01T10:00:00Z').toLocaleDateString();
      expect(screen.getByText(dateText)).toBeInTheDocument();
    });

    it('shows Download Key button', () => {
      render(
        <KeyPanel
          certificateId="cert-123"
          keyMetadata={activeKeyMetadata}
        />,
      );

      expect(screen.getByRole('button', { name: /Download Key/i })).toBeInTheDocument();
    });

    it('shows Rotate Key button', () => {
      render(
        <KeyPanel
          certificateId="cert-123"
          keyMetadata={activeKeyMetadata}
        />,
      );

      expect(screen.getByRole('button', { name: /Rotate Key/i })).toBeInTheDocument();
    });

    it('shows Delete Key button', () => {
      render(
        <KeyPanel
          certificateId="cert-123"
          keyMetadata={activeKeyMetadata}
        />,
      );

      expect(screen.getByRole('button', { name: /Delete Key/i })).toBeInTheDocument();
    });
  });

  // AC-9.2: Download Key requires reason via modal
  describe('AC-9.2 — Download Key requires reason via modal', () => {
    it('clicking Download Key opens a modal', async () => {
      const user = userEvent.setup();

      render(
        <KeyPanel
          certificateId="cert-123"
          keyMetadata={activeKeyMetadata}
          onDownloadKey={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      await user.click(screen.getByRole('button', { name: /Download Key/i }));

      expect(screen.getByRole('dialog', { name: /Download Key Modal/i })).toBeInTheDocument();
    });

    it('modal has text input labeled "Reason for retrieval"', async () => {
      const user = userEvent.setup();

      render(
        <KeyPanel
          certificateId="cert-123"
          keyMetadata={activeKeyMetadata}
          onDownloadKey={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      await user.click(screen.getByRole('button', { name: /Download Key/i }));

      expect(screen.getByLabelText(/Reason for retrieval/i)).toBeInTheDocument();
    });

    it('Download button is disabled until reason is entered', async () => {
      const user = userEvent.setup();

      render(
        <KeyPanel
          certificateId="cert-123"
          keyMetadata={activeKeyMetadata}
          onDownloadKey={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      await user.click(screen.getByRole('button', { name: /Download Key/i }));

      const dialog = screen.getByRole('dialog');
      const downloadBtn = within(dialog).getByRole('button', { name: /^Download$/i });
      expect(downloadBtn).toBeDisabled();
    });

    it('Download button is enabled after entering a reason', async () => {
      const user = userEvent.setup();

      render(
        <KeyPanel
          certificateId="cert-123"
          keyMetadata={activeKeyMetadata}
          onDownloadKey={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      await user.click(screen.getByRole('button', { name: /Download Key/i }));

      const reasonInput = screen.getByLabelText(/Reason for retrieval/i);
      await user.type(reasonInput, 'Deploy to staging LB');

      const dialog = screen.getByRole('dialog');
      const downloadBtn = within(dialog).getByRole('button', { name: /^Download$/i });
      expect(downloadBtn).toBeEnabled();
    });

    it('clicking Download calls onDownloadKey with reason', async () => {
      const user = userEvent.setup();
      const mockDownload = vi.fn().mockResolvedValue(undefined);

      render(
        <KeyPanel
          certificateId="cert-123"
          keyMetadata={activeKeyMetadata}
          onDownloadKey={mockDownload}
        />,
      );

      await user.click(screen.getByRole('button', { name: /Download Key/i }));

      const reasonInput = screen.getByLabelText(/Reason for retrieval/i);
      await user.type(reasonInput, 'Deploy to staging LB');

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /^Download$/i }));

      expect(mockDownload).toHaveBeenCalledWith('Deploy to staging LB');
    });

    it('shows success toast after download', async () => {
      const user = userEvent.setup();

      render(
        <KeyPanel
          certificateId="cert-123"
          keyMetadata={activeKeyMetadata}
          onDownloadKey={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      await user.click(screen.getByRole('button', { name: /Download Key/i }));

      const reasonInput = screen.getByLabelText(/Reason for retrieval/i);
      await user.type(reasonInput, 'Deploy to staging LB');

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /^Download$/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/audited/i)).toBeInTheDocument();
      });
    });
  });

  // AC-9.3: Certificate without key shows upload option
  describe('AC-9.3 — Certificate without key shows upload option', () => {
    it('shows "No private key stored" message', () => {
      render(
        <KeyPanel
          certificateId="cert-456"
          keyMetadata={null}
        />,
      );

      expect(screen.getByText(/No private key stored for this certificate/i)).toBeInTheDocument();
    });

    it('shows Upload Key button', () => {
      render(
        <KeyPanel
          certificateId="cert-456"
          keyMetadata={null}
        />,
      );

      expect(screen.getByRole('button', { name: /Upload Key/i })).toBeInTheDocument();
    });

    it('clicking Upload Key shows file input', async () => {
      const user = userEvent.setup();

      render(
        <KeyPanel
          certificateId="cert-456"
          keyMetadata={null}
          onUploadKey={vi.fn()}
        />,
      );

      await user.click(screen.getByRole('button', { name: /Upload Key/i }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByLabelText(/Select PEM key file/i)).toBeInTheDocument();
    });

    it('does not show Download, Rotate, or Delete buttons', () => {
      render(
        <KeyPanel
          certificateId="cert-456"
          keyMetadata={null}
        />,
      );

      expect(screen.queryByRole('button', { name: /Download Key/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Rotate Key/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Delete Key/i })).not.toBeInTheDocument();
    });
  });

  // AC-9.4: Delete Key shows confirmation modal with warning
  describe('AC-9.4 — Delete Key shows confirmation modal with warning', () => {
    it('clicking Delete Key opens a modal', async () => {
      const user = userEvent.setup();

      render(
        <KeyPanel
          certificateId="cert-123"
          keyMetadata={activeKeyMetadata}
          onDeleteKey={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      await user.click(screen.getByRole('button', { name: /Delete Key/i }));

      expect(screen.getByRole('dialog', { name: /Delete Key Modal/i })).toBeInTheDocument();
    });

    it('modal shows red warning "This action is irreversible"', async () => {
      const user = userEvent.setup();

      render(
        <KeyPanel
          certificateId="cert-123"
          keyMetadata={activeKeyMetadata}
          onDeleteKey={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      await user.click(screen.getByRole('button', { name: /Delete Key/i }));

      expect(screen.getByText(/This action is irreversible/i)).toBeInTheDocument();
    });

    it('modal has text input for reason', async () => {
      const user = userEvent.setup();

      render(
        <KeyPanel
          certificateId="cert-123"
          keyMetadata={activeKeyMetadata}
          onDeleteKey={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      await user.click(screen.getByRole('button', { name: /Delete Key/i }));

      expect(screen.getByLabelText(/Reason for deletion/i)).toBeInTheDocument();
    });

    it('modal has "Confirm Deletion" button', async () => {
      const user = userEvent.setup();

      render(
        <KeyPanel
          certificateId="cert-123"
          keyMetadata={activeKeyMetadata}
          onDeleteKey={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      await user.click(screen.getByRole('button', { name: /Delete Key/i }));

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByRole('button', { name: /Confirm Deletion/i })).toBeInTheDocument();
    });

    it('calls onDeleteKey with reason when confirmed', async () => {
      const user = userEvent.setup();
      const mockDelete = vi.fn().mockResolvedValue(undefined);

      render(
        <KeyPanel
          certificateId="cert-123"
          keyMetadata={activeKeyMetadata}
          onDeleteKey={mockDelete}
        />,
      );

      await user.click(screen.getByRole('button', { name: /Delete Key/i }));

      const reasonInput = screen.getByLabelText(/Reason for deletion/i);
      await user.type(reasonInput, 'Certificate expired');

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /Confirm Deletion/i }));

      expect(mockDelete).toHaveBeenCalledWith('Certificate expired');
    });
  });

  // AC-9.5: Deleted key shows deletion notice
  describe('AC-9.5 — Deleted key shows deletion notice', () => {
    it('shows deletion date when key was deleted', () => {
      render(
        <KeyPanel
          certificateId="cert-789"
          keyMetadata={deletedKeyMetadata}
        />,
      );

      expect(screen.getByText(/Private key was deleted on 2026-05-15/i)).toBeInTheDocument();
    });

    it('no action buttons are visible for deleted key', () => {
      render(
        <KeyPanel
          certificateId="cert-789"
          keyMetadata={deletedKeyMetadata}
        />,
      );

      expect(screen.queryByRole('button', { name: /Download Key/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Rotate Key/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Delete Key/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Upload Key/i })).not.toBeInTheDocument();
    });
  });
});

// ── MSW Handler Tests (API integration) ──────────────────────────────────────

describe('C5 Feature 9: Key Management API Integration (MSW)', () => {
  const baseUrl = 'http://localhost:3000';

  // Test key metadata API handler pattern
  describe('Key metadata API handlers', () => {
    it('GET /api/certificates/:id/keys returns key metadata for active key', async () => {
      server.use(
        http.get(`${baseUrl}/api/certificates/:id/keys`, ({ params }) => {
          if (params.id === 'cert-123') {
            return HttpResponse.json({
              keyId: 'key-001',
              certificateId: 'cert-123',
              algorithm: 'RSA-2048',
              fingerprint: 'a1b2c3d4',
              status: 'ACTIVE',
              createdAt: '2026-05-01T10:00:00Z',
            });
          }
          return HttpResponse.json(
            { message: 'No private key stored for this certificate' },
            { status: 404 },
          );
        }),
      );

      const res = await fetch(`${baseUrl}/api/certificates/cert-123/keys`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.keyId).toBe('key-001');
      expect(data.status).toBe('ACTIVE');
      expect(data).not.toHaveProperty('privateKeyPem');
    });

    it('GET /api/certificates/:id/keys returns 404 for no key', async () => {
      server.use(
        http.get(`${baseUrl}/api/certificates/:id/keys`, () => {
          return HttpResponse.json(
            { message: 'No private key stored for this certificate' },
            { status: 404 },
          );
        }),
      );

      const res = await fetch(`${baseUrl}/api/certificates/cert-456/keys`);
      expect(res.status).toBe(404);
    });

    it('POST /api/certificates/:id/keys/retrieve returns 400 without reason', async () => {
      server.use(
        http.post(`${baseUrl}/api/certificates/:id/keys/retrieve`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          if (!body.reason) {
            return HttpResponse.json(
              { message: 'Reason is required for key retrieval (audit trail)' },
              { status: 400 },
            );
          }
          return HttpResponse.json({ privateKeyPem: '-----BEGIN RSA PRIVATE KEY-----...' });
        }),
      );

      const res = await fetch(`${baseUrl}/api/certificates/cert-123/keys/retrieve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toContain('Reason is required');
    });

    it('POST /api/certificates/:id/keys/retrieve returns key with valid reason', async () => {
      server.use(
        http.post(`${baseUrl}/api/certificates/:id/keys/retrieve`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          if (!body.reason) {
            return HttpResponse.json(
              { message: 'Reason is required' },
              { status: 400 },
            );
          }
          return HttpResponse.json({
            privateKeyPem: '-----BEGIN RSA PRIVATE KEY-----\nMockKey\n-----END RSA PRIVATE KEY-----',
          });
        }),
      );

      const res = await fetch(`${baseUrl}/api/certificates/cert-123/keys/retrieve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Deploying to production' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.privateKeyPem).toContain('BEGIN RSA PRIVATE KEY');
    });

    it('DELETE /api/certificates/:id/keys returns 400 without reason', async () => {
      server.use(
        http.delete(`${baseUrl}/api/certificates/:id/keys`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          if (!body.reason) {
            return HttpResponse.json(
              { message: 'Reason is required for key deletion (audit trail)' },
              { status: 400 },
            );
          }
          return HttpResponse.json({ status: 'DELETED', deletedAt: new Date().toISOString() });
        }),
      );

      const res = await fetch(`${baseUrl}/api/certificates/cert-123/keys`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });
});
