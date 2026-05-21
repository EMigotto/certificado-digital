/**
 * Hash-based SPA router.
 * Routes: #/dashboard, #/certificates, #/certificates/:id, #/import, #/audit
 */

export interface Route {
  pattern: RegExp;
  name: string;
  handler: (params: Record<string, string>) => void | Promise<void>;
}

export interface Router {
  register(name: string, pattern: string, handler: Route['handler']): void;
  navigate(hash: string): void;
  start(): void;
  currentRoute(): string;
}

export function createRouter(): Router {
  const routes: Route[] = [];
  let current = '';

  function pathToRegex(path: string): RegExp {
    const pattern = path
      .replace(/:[a-zA-Z_]+/g, '([^/]+)')
      .replace(/\//g, '\\/');
    return new RegExp(`^${pattern}$`);
  }

  function extractParams(pattern: string, match: RegExpMatchArray): Record<string, string> {
    const keys = [...pattern.matchAll(/:([a-zA-Z_]+)/g)].map(m => m[1]);
    const params: Record<string, string> = {};
    keys.forEach((key, i) => {
      params[key] = decodeURIComponent(match[i + 1]);
    });
    return params;
  }

  function resolve(hash: string): void {
    const path = hash.replace(/^#/, '') || '/dashboard';
    // Strip query params for matching
    const [pathPart, queryPart] = path.split('?');
    current = pathPart;

    for (const route of routes) {
      const match = pathPart.match(route.pattern);
      if (match) {
        const params = extractParams(route.name, match);
        // Parse query string
        if (queryPart) {
          const qs = new URLSearchParams(queryPart);
          qs.forEach((v, k) => { params[`_${k}`] = v; });
        }
        // Update active nav
        updateActiveNav(route.name, pathPart);
        route.handler(params);
        return;
      }
    }

    // Default: go to dashboard
    window.location.hash = '#/dashboard';
  }

  function updateActiveNav(routeName: string, path: string): void {
    const navItems = document.querySelectorAll('#sidebar-nav .nav-item');
    navItems.forEach(item => {
      item.classList.remove('active');
      const href = item.getAttribute('href') || '';
      const route = item.getAttribute('data-route') || '';
      if (path === '/dashboard' && route === 'dashboard') {
        item.classList.add('active');
      } else if (path === '/certificates' && route === 'certificates') {
        item.classList.add('active');
      } else if (path.startsWith('/certificates') && path.includes('?status=expiring') && route === 'expiring') {
        item.classList.add('active');
      } else if (path === '/import' && route === 'import') {
        item.classList.add('active');
      } else if (path === '/audit' && route === 'audit') {
        item.classList.add('active');
      }
    });
  }

  return {
    register(name: string, pattern: string, handler: Route['handler']): void {
      routes.push({ pattern: pathToRegex(pattern), name: pattern, handler });
    },

    navigate(hash: string): void {
      window.location.hash = hash;
    },

    start(): void {
      window.addEventListener('hashchange', () => resolve(window.location.hash));
      // Initial route
      resolve(window.location.hash || '#/dashboard');
    },

    currentRoute(): string {
      return current;
    },
  };
}
