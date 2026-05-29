import { Navigate } from 'react-router-dom';

/**
 * Expiring certificates page.
 *
 * Redirects to the inventory page with the `expiresIn=30` filter pre-applied,
 * showing all certificates expiring within the next 30 days.
 *
 * This approach reuses the full InventoryPage with its search, filters,
 * pagination, and sorting — avoiding component duplication.
 */
export default function ExpiringPage() {
  return <Navigate to="/certificates?expiresIn=30" replace />;
}
