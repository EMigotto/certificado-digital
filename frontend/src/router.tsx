import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from '@/components/Layout/Layout';

/* Lazy-loaded pages for code splitting */
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const InventoryPage = lazy(() => import('@/pages/InventoryPage'));
const CertificateDetailPage = lazy(() => import('@/pages/CertificateDetailPage'));
const UploadPage = lazy(() => import('@/pages/UploadPage'));
const BulkImportPage = lazy(() => import('@/pages/BulkImportPage'));
const AuditLogPage = lazy(() => import('@/pages/AuditLogPage'));

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      {
        index: true,
        element: <Navigate to="/certificates" replace />,
      },
      {
        path: 'dashboard',
        element: <DashboardPage />,
      },
      {
        path: 'certificates',
        element: <InventoryPage />,
      },
      {
        path: 'certificates/:id',
        element: <CertificateDetailPage />,
      },
      {
        path: 'certificates/upload',
        element: <UploadPage />,
      },
      {
        path: 'certificates/import',
        element: <BulkImportPage />,
      },
      {
        path: 'audit',
        element: <AuditLogPage />,
      },
    ],
  },
]);
