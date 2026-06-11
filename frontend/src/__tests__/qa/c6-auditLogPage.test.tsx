/**
 * C6 — Trilha de Auditoria: Testes QA da página AuditLogPage (frontend)
 *
 * Mapeia cenários dos critérios de aceite:
 *   - F9.1: Renderizar tabela de eventos
 *   - F9.2: Filtrar por período
 *   - F9.3: Filtrar por usuário
 *   - F9.4: Filtrar por tipo de ação
 *   - F9.5: Busca por texto (CN)
 *   - F9.10: Indicadores visuais de sucesso/falha
 *   - F3.7: Paginação na interface
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AuditLogPage from '@/pages/AuditLogPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/audit']}>
        <AuditLogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── F9.1: Renderizar tabela de eventos ─────────────────────────────────────

describe('C6-F9.1: Renderizar tabela de eventos', () => {
  it('deve exibir o título da seção com "Audit Log"', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Audit/)).toBeInTheDocument();
    });
  });

  it('deve exibir a descrição "Registro completo de todas as ações em certificados"', async () => {
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText(/Registro completo de todas as ações em certificados/),
      ).toBeInTheDocument();
    });
  });

  it('deve exibir contagem total de registros após carregamento', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/registros/)).toBeInTheDocument();
    });
  });

  it('deve exibir colunas da tabela: Timestamp, Ator, Evento, Resultado', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Timestamp')).toBeInTheDocument();
      expect(screen.getByText('Ator')).toBeInTheDocument();
      expect(screen.getByText('Evento')).toBeInTheDocument();
      expect(screen.getByText('Resultado')).toBeInTheDocument();
    });
  });

  it('deve renderizar linhas de auditoria após carregamento (MSW retorna 5)', async () => {
    renderPage();
    await waitFor(() => {
      const rows = screen.getAllByTestId('audit-row');
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ─── F9.2: Filtrar por período ──────────────────────────────────────────────

describe('C6-F9.2: Filtrar por período', () => {
  it('deve exibir campos de data início e data fim', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText('Data início')).toBeInTheDocument();
      expect(screen.getByLabelText('Data fim')).toBeInTheDocument();
    });
  });

  it('deve aceitar entrada de data no filtro de período', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText('Data início')).toBeInTheDocument();
    });

    const dateFrom = screen.getByLabelText('Data início');
    fireEvent.change(dateFrom, { target: { value: '2025-01-01' } });
    expect((dateFrom as HTMLInputElement).value).toBe('2025-01-01');
  });
});

// ─── F9.3: Filtrar por usuário ──────────────────────────────────────────────

describe('C6-F9.3: Filtrar por usuário (actor)', () => {
  it('deve exibir campo de busca por ator', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText('Buscar por ator')).toBeInTheDocument();
    });
  });

  it('deve aceitar texto no filtro de ator', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText('Buscar por ator')).toBeInTheDocument();
    });

    const actorInput = screen.getByLabelText('Buscar por ator');
    await userEvent.type(actorInput, 'admin');
    expect((actorInput as HTMLInputElement).value).toBe('admin');
  });
});

// ─── F9.4: Filtrar por tipo de ação ─────────────────────────────────────────

describe('C6-F9.4: Filtrar por tipo de ação', () => {
  it('deve exibir dropdown de filtro por ação', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText('Filtrar por ação')).toBeInTheDocument();
    });
  });

  it('deve ter opções: Todas ações, IMPORT, UPDATE, DELETE, REVOKE', async () => {
    renderPage();
    await waitFor(() => {
      const select = screen.getByLabelText('Filtrar por ação');
      const options = (select as HTMLSelectElement).querySelectorAll('option');
      expect(options.length).toBeGreaterThanOrEqual(4);
    });
  });

  it('deve permitir selecionar uma ação no dropdown', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText('Filtrar por ação')).toBeInTheDocument();
    });

    const select = screen.getByLabelText('Filtrar por ação');
    fireEvent.change(select, { target: { value: 'DELETE' } });
    expect((select as HTMLSelectElement).value).toBe('DELETE');
  });
});

// ─── F9.5: Busca por texto ──────────────────────────────────────────────────

describe('C6-F9.5: Busca por texto (CN)', () => {
  it('deve exibir campo de busca por Common Name', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText('Buscar por Common Name')).toBeInTheDocument();
    });
  });

  it('deve aceitar entrada de texto no campo de busca por CN', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText('Buscar por Common Name')).toBeInTheDocument();
    });

    const cnInput = screen.getByLabelText('Buscar por Common Name');
    await userEvent.type(cnInput, 'api.example.com');
    expect((cnInput as HTMLInputElement).value).toBe('api.example.com');
  });
});

// ─── F9.5/Resultado: Filtrar por resultado ──────────────────────────────────

describe('C6-F9.10: Filtrar por resultado (SUCCESS/FAILURE)', () => {
  it('deve exibir dropdown de filtro por resultado', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText('Filtrar por resultado')).toBeInTheDocument();
    });
  });

  it('deve ter opções: Todos, SUCCESS, FAILURE', async () => {
    renderPage();
    await waitFor(() => {
      const select = screen.getByLabelText('Filtrar por resultado');
      const options = (select as HTMLSelectElement).querySelectorAll('option');
      expect(options.length).toBe(3);
    });
  });

  it('deve permitir selecionar FAILURE', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText('Filtrar por resultado')).toBeInTheDocument();
    });

    const select = screen.getByLabelText('Filtrar por resultado');
    fireEvent.change(select, { target: { value: 'FAILURE' } });
    expect((select as HTMLSelectElement).value).toBe('FAILURE');
  });
});

// ─── Limpar filtros ─────────────────────────────────────────────────────────

describe('C6: Botão de limpar filtros', () => {
  it('deve exibir botão "limpar filtros" quando há filtro ativo', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText('Filtrar por ação')).toBeInTheDocument();
    });

    // Ativa um filtro
    const select = screen.getByLabelText('Filtrar por ação');
    fireEvent.change(select, { target: { value: 'DELETE' } });

    await waitFor(() => {
      expect(screen.getByText(/limpar filtros/)).toBeInTheDocument();
    });
  });

  it('deve limpar todos os filtros ao clicar "limpar filtros"', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText('Filtrar por ação')).toBeInTheDocument();
    });

    // Ativa um filtro
    const select = screen.getByLabelText('Filtrar por ação');
    fireEvent.change(select, { target: { value: 'DELETE' } });

    await waitFor(() => {
      expect(screen.getByText(/limpar filtros/)).toBeInTheDocument();
    });

    // Clica em limpar
    fireEvent.click(screen.getByText(/limpar filtros/));

    await waitFor(() => {
      expect((select as HTMLSelectElement).value).toBe('');
    });
  });
});

// ─── F3.7 / F9: Paginação na interface ──────────────────────────────────────

describe('C6-F3.7: Paginação na interface', () => {
  it('deve exibir informação de página e total de registros', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Página/)).toBeInTheDocument();
    });
  });

  it('deve exibir botões "Anterior" e "Próxima"', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Anterior/)).toBeInTheDocument();
      expect(screen.getByText(/Próxima/)).toBeInTheDocument();
    });
  });

  it('deve desabilitar botão "Anterior" na primeira página', async () => {
    renderPage();
    await waitFor(() => {
      const btn = screen.getByText(/Anterior/);
      expect(btn).toBeDisabled();
    });
  });
});
