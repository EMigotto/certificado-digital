-- Full-text search index (raw SQL — not managed by Prisma schema)
-- Enables fast search across certificate text fields using PostgreSQL tsvector/GIN.

-- Create a GIN index for full-text search on key certificate fields
CREATE INDEX idx_cert_fulltext ON certificates USING GIN (
  to_tsvector(
    'english',
    coalesce(common_name, '') || ' ' ||
    coalesce(subject_dn, '') || ' ' ||
    coalesce(issuer_dn, '') || ' ' ||
    coalesce(owner, '') || ' ' ||
    coalesce(application, '') || ' ' ||
    coalesce(ca_name, '') || ' ' ||
    coalesce(description, '')
  )
);
