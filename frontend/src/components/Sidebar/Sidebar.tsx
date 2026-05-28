import { useLocation, useNavigate } from 'react-router-dom';
import { useUiStore } from '@/store/uiStore';
import styles from './Sidebar.module.css';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  badge?: string;
  badgeWarn?: boolean;
}

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Operação',
    items: [
      {
        label: 'Dashboard',
        path: '/dashboard',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
        ),
      },
      {
        label: 'Certificados',
        path: '/certificates',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
        ),
        badge: '2.847',
      },
      {
        label: 'Expirando',
        path: '/expiring',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        ),
        badge: '23',
        badgeWarn: true,
      },
      {
        label: 'Requisições',
        path: '/requests',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Governança',
    items: [
      {
        label: 'Zonas',
        path: '/zones',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path d="M20 7l-8-4-8 4m16 0v10l-8 4m8-14L12 11M4 7v10l8 4M4 7l8 4m0 0v10" />
          </svg>
        ),
      },
      {
        label: 'CAs',
        path: '/cas',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        ),
      },
      {
        label: 'Audit Log',
        path: '/audit',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Sistema',
    items: [
      {
        label: 'API & CLI',
        path: '/api',
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        ),
      },
    ],
  },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);

  const isActive = (path: string) => {
    if (path === '/certificates') {
      return location.pathname.startsWith('/certificates');
    }
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <aside
      className={`${styles.sidebar} ${sidebarOpen ? styles.open : ''}`}
      role="navigation"
      aria-label="Navegação principal"
    >
      <div className={styles.brand}>
        <div className={styles.brandMark}>
          <span className={styles.dot} />
          <span>cipher</span>
        </div>
        <div className={styles.brandSub}>mTLS Control Plane</div>
      </div>

      <nav className={styles.nav}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <div className={styles.navLabel}>{section.label}</div>
            {section.items.map((item) => (
              <button
                key={item.path}
                className={`${styles.navItem} ${isActive(item.path) ? styles.active : ''}`}
                onClick={() => navigate(item.path)}
                aria-current={isActive(item.path) ? 'page' : undefined}
                aria-label={item.label}
              >
                {item.icon}
                {item.label}
                {item.badge && (
                  <span
                    className={`${styles.navBadge} ${item.badgeWarn ? styles.navBadgeWarn : ''}`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className={styles.userCard}>
        <div className={styles.userRow}>
          <div className={styles.avatar}>RC</div>
          <div>
            <div className={styles.userName}>Rafael Costa</div>
            <div className={styles.userRole}>pki-admin · zone:bank</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
