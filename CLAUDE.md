# CLAUDE.md - Cipher mTLS Control Plane

**Project**: Centralized mTLS Certificate Inventory & Management  
**Stack**: React (Frontend), Node.js/TypeScript (Backend, TBD)  
**Status**: Greenfield / Initial Architecture Definition  

---

## Project Overview

Cipher is a centralized certificate management control plane for mTLS infrastructure. It provides:
- Single source of truth for all organizational mTLS certificates
- Real-time expiration monitoring and alerting
- Certificate CRUD operations (manual upload + bulk import)
- Comprehensive audit logging
- Advanced search, filtering, and tagging

**Target Users**: PKI admins, platform engineers, security teams  
**Scale**: 10k+ certificates per organization  

---

## Tech Stack

### Frontend
- **Framework**: React 18+
- **Build**: Vite (fast HMR, optimized production bundles)
- **Styling**: CSS-in-JS (CSS Modules or styled-components, TBD) + custom design tokens
- **State Management**: Zustand (lightweight, no boilerplate)
- **Data Fetching**: TanStack Query (React Query) for async data and caching
- **Tables**: TanStack Table (headless, pagination/filtering built-in)
- **Forms**: React Hook Form + Zod for validation
- **HTTP Client**: Axios with interceptors for auth + retry

### Backend (Structure)
- **Runtime**: Node.js 20+
- **Framework**: Express or Fastify (TBD) 
- **Language**: TypeScript
- **Database**: PostgreSQL (schema versioning with migrations)
- **Auth**: JWT + RBAC (roles: pki-admin, pki-user, viewer)
- **Logging**: Structured JSON logs (Winston or Pino)
- **Testing**: Jest + Supertest (API) + React Testing Library (UI)

### Deployment
- **Docker**: Multi-stage builds for both frontend and backend
- **CI/CD**: GitHub Actions (lint, test, build)
- **Environment**: Multi-environment support (dev, hml, prd)

---

## Architecture

### Folder Structure

```
├── docs/
│   └── features/
│       └── crud-certificado/
│           ├── prd.md                    # Product requirement document
│           ├── acceptance-criteria.md    # Gherkin acceptance tests
│           ├── prototype.html            # Self-contained prototype
│           └── prototypes/               # Source HTML files
│               └── prototipo-clm-mvp.html
├── src/
│   ├── components/                       # Reusable React components
│   │   ├── Sidebar/
│   │   ├── Toolbar/
│   │   ├── Table/
│   │   ├── Badge/
│   │   └── ...
│   ├── pages/                            # Page-level components
│   │   ├── Dashboard/
│   │   ├── Inventory/
│   │   ├── CertificateDetail/
│   │   ├── IssueCertificate/
│   │   └── ...
│   ├── hooks/                            # Custom React hooks
│   │   ├── useCertificates.ts
│   │   ├── useFilters.ts
│   │   └── ...
│   ├── services/                         # API integration layer
│   │   ├── certificateApi.ts
│   │   ├── authApi.ts
│   │   └── ...
│   ├── store/                            # Zustand stores
│   │   ├── certificateStore.ts
│   │   ├── uiStore.ts
│   │   └── ...
│   ├── types/                            # TypeScript interfaces
│   │   ├── certificate.ts
│   │   ├── user.ts
│   │   └── ...
│   ├── utils/                            # Utilities
│   │   ├── dateUtils.ts
│   │   ├── cryptoUtils.ts
│   │   └── ...
│   ├── styles/                           # Global styles + design tokens
│   │   ├── tokens.css
│   │   ├── reset.css
│   │   └── ...
│   └── App.tsx
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── CLAUDE.md                              # This file
├── README.md
└── package.json
```

---

## Design Tokens & Styling

All styling follows the design system defined in the approved prototype. No hardcoded colors.

### Color Palette
```
--bg:        #0a0e14   (primary background)
--bg-2:      #11161f   (secondary background)
--surface:   #161c27   (card background)
--surface-2: #1d2533   (nested surface)
--border:    #232b3a   (default border)
--border-2:  #2d3748   (raised border)
--text:      #e8ecf1   (primary text)
--text-dim:  #8b95a7   (secondary text)
--text-mute: #5a6478   (muted text)
--accent:    #5eead4   (cert-cyan, primary action)
--accent-2:  #38bdf8   (secondary accent)
--ok:        #4ade80   (success / valid)
--warn:      #fbbf24   (warning / expiring soon)
--crit:      #f87171   (critical / expired)
--rev:       #a78bfa   (revoked)
```

### Typography
```
--serif:     'Instrument Serif', Georgia, serif
--sans:      'IBM Plex Sans', sans-serif
--mono:      'IBM Plex Mono', monospace
```

---

## Key Conventions

### 1. Component Naming
- Page components: PascalCase (e.g., `CertificateDetail.tsx`)
- UI components: PascalCase (e.g., `Badge.tsx`, `Toolbar.tsx`)
- Hooks: camelCase with `use` prefix (e.g., `useCertificates.ts`)
- Services: camelCase (e.g., `certificateApi.ts`)

### 2. File Naming
- TypeScript files: `.ts` or `.tsx`
- Style files: `.module.css` (if CSS Modules) or co-located within component folder
- Test files: `.test.ts` or `.test.tsx` (co-located with source)

### 3. Imports
- Absolute imports using path aliases (configure in `vite.config.ts`):
  ```ts
  import { useCertificates } from '@/hooks'
  import { CertificateApi } from '@/services'
  import { Badge } from '@/components'
  ```

### 4. Type Safety
- All props must be typed (no `any`)
- Use `interface` for component props, `type` for unions/utilities
- Enums for fixed sets (Status, Environment, etc.)

### 5. Error Handling
- Use consistent error boundaries at page level
- API errors logged with context (user action, endpoint, payload)
- User-facing errors shown via toast/modal

### 6. Accessibility (a11y)
- All interactive elements must have semantic HTML (button, input, etc.)
- Color alone never conveys information (use icons + text)
- ARIA labels for complex widgets (tables, filters)

---

## Commands

### Development
```bash
npm install
npm run dev                    # Start Vite dev server (http://localhost:5173)
npm run lint                   # ESLint + Prettier
npm run type-check            # TypeScript type checking
```

### Testing
```bash
npm run test                   # Jest unit + integration tests
npm run test:watch            # Watch mode
npm run test:coverage         # Coverage report
```

### Building
```bash
npm run build                  # Production build
npm run preview               # Preview production build locally
```

### Linting & Formatting
```bash
npm run lint:fix              # Auto-fix eslint + prettier
npm run lint:types            # tsc --noEmit
```

---

## Feature Branches & Workflow

**Single-branch workflow**: All work is committed directly to the `Homologacao` branch.

### Commit Convention
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`  
**Scope**: Feature slug (e.g., `crud-certificado`, `monitoring`)  
**Subject**: Imperative mood, lowercase, no period

**Example**:
```
feat(crud-certificado): add certificate list with pagination

- Implement table component with TanStack Table
- Add search and filter controls
- Integrate with certificateApi.listCertificates()
- Tests for pagination and filter logic
```

---

## Feature Specifications & PRDs

All features follow this structure:
```
docs/features/<slug>/
├── prd.md                    # Product requirement doc
├── acceptance-criteria.md    # Gherkin scenarios (1+ positive, 1+ negative per req)
├── prototype.html            # Self-contained HTML prototype
└── prototypes/               # Source prototype files (if any)
```

**PRD Sections**:
1. Problem Statement
2. Users & Jobs to Be Done (JTBD)
3. Functional Scope (numbered requirements)
4. Out of Scope
5. Risks & Assumptions

**Acceptance Criteria**: Gherkin format (Scenario, Given/When/Then)

---

## Key Decisions (ADRs)

1. **State Management**: Zustand chosen over Redux for simplicity in a greenfield project. Can be migrated if complexity grows.
2. **React Query**: Centralized async state and caching for certificates + filters. Simplifies pagination + refetch logic.
3. **CSS-in-JS**: TBD based on team preference. CSS Modules recommended for zero-runtime overhead.
4. **TypeScript**: Strict mode enabled. All `.tsx` files must pass type-checking.
5. **Monorepo**: Single repo (frontend + docs) for now. Backend is separate.

---

## Performance Targets (MVP Acceptance)

From the requirements:
- List 10k+ certificates with pagination: **must complete**
- Filter by "expira em 30 dias": **must return in < 2s**

**Implementation strategy**:
- Virtualization for large tables (React Window)
- Backend pagination (cursor-based preferred)
- Indexed database queries (expires_at, status)
- Frontend caching with React Query staleTime

---

## Testing Strategy

- **Unit**: Component logic, utilities, hooks
- **Integration**: API calls with mock server (MSW - Mock Service Worker)
- **E2E**: Critical user flows (search, filter, export)
- **Coverage Target**: 80% for features in scope

---

## Documentation

- **README.md**: Quick start, local dev setup
- **CLAUDE.md**: This file - architecture & conventions
- **PRDs**: In `docs/features/<slug>/` for each card
- **Inline Comments**: Only for non-obvious logic
- **API Docs**: OpenAPI/Swagger (TBD backend)

---

## Future Phases

- **C2**: Certificate Detail & Metadata Management
- **C3**: Monitoring & Expiration Alerts (Dashboard)
- **C4**: Certificate Issuance Workflow
- **C5**: Audit Logging & Compliance
- **API & CLI**: Programmatic access + bulk operations

---

## Contact & Questions

- **PM**: [To be assigned]
- **Tech Lead**: [To be assigned]
- **Slack Channel**: [To be assigned]

---

**Last Updated**: 2026-05-27  
**Version**: 0.1.0 (Initial)
