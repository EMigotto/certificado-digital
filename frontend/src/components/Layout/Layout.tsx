import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar/Sidebar';
import { ToastContainer } from '@/components/Toast/Toast';
import { useUiStore } from '@/store/uiStore';
import styles from './Layout.module.css';

function LoadingFallback() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '200px',
        fontFamily: 'var(--mono)',
        fontSize: '13px',
        color: 'var(--text-mute)',
      }}
    >
      Carregando…
    </div>
  );
}

export function Layout() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <div className={styles.app}>
      <button
        className={styles.menuToggle}
        onClick={toggleSidebar}
        aria-label="Alternar menu"
      >
        <svg width="18" height="18" viewBox="0 0 24 24">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {sidebarOpen && (
        <div className={styles.mobileOverlay} onClick={toggleSidebar} />
      )}

      <Sidebar />

      <main className={styles.main}>
        <Suspense fallback={<LoadingFallback />}>
          <Outlet />
        </Suspense>
      </main>

      <ToastContainer />
    </div>
  );
}
