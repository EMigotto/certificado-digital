/**
 * C6 — Trilha de Auditoria: Testes QA dos componentes AuditRow, AuditTable, AuditFilters
 *
 * Mapeia cenários dos critérios de aceite:
 *   - F9.1: Renderizar tabela de eventos (colunas, linhas, formatação)
 *   - F9.7: Abrir detalhes de evento (exibição de campos)
 *   - F9.10: Indicadores visuais de sucesso/falha (classes CSS)
 *   - F1.5: Metadados completos exibidos
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuditRow } from '@/pages/AuditLog/components/AuditRow';
import { AuditTable } from '@/pages/AuditLog/components/AuditTable';
import { AuditFilters, type AuditFilterState } from '@/pages/AuditLog/components/AuditFilters';

// Tipo compatível com o componente AuditRow (usa AuditLogEntry do shared)
interface MockAuditEntry {
  id: string;
  certId: string | null;
  certCn: string;
  action: string;
  actor: string;
  result: string;
  detail: string | null;
  batchId: string | null;
  timestamp: string;
}

function makeEntry(overrides: Partial<MockAuditEntry> = {}): MockAuditEntry {
  return {
    id: 'audit-1',
    certId: 'cert-1',
    certCn: 'api-payments.bank.internal',
    action: 'CREATE',
    actor: 'Rafael Costa',
    result: 'SUCCESS',
    detail: 'Imported via PEM upload',
    batchId: null,
    timestamp: '2025-05-20T14:32:08Z',
    ...overrides,
  };
}

// ─── F9.1: AuditRow — renderização de linha ─────────────────────────────────

describe('C6-F9.1: AuditRow — renderização', () => {
  it('deve renderizar linha com data-testid="audit-row"', () => {
    render(<AuditRow entry={makeEntry() as never} />);
    expect(screen.getByTestId('audit-row')).toBeInTheDocument();
  });

  it('C6-F1.5: deve exibir o timestamp formatado', () => {
    render(<AuditRow entry={makeEntry() as never} />);
    const row = screen.getByTestId('audit-row');
    // Contém ano
    expect(row.textContent).toContain('2025');
  });

  it('deve exibir o nome do ator', () => {
    render(<AuditRow entry={makeEntry() as never} />);
    expect(screen.getByText('Rafael Costa')).toBeInTheDocument();
  });

  it('deve exibir as iniciais do ator no avatar', () => {
    render(<AuditRow entry={makeEntry() as never} />);
    expect(screen.getByText('RC')).toBeInTheDocument();
  });

  it('deve exibir a ação (action verb)', () => {
    render(<AuditRow entry={makeEntry() as never} />);
    expect(screen.getByText('CREATE')).toBeInTheDocument();
  });

  it('deve exibir o Common Name do certificado como alvo', () => {
    render(<AuditRow entry={makeEntry() as never} />);
    expect(screen.getByText('api-payments.bank.internal')).toBeInTheDocument();
  });

  it('C6-F9.10: deve exibir SUCCESS com classe de sucesso', () => {
    render(<AuditRow entry={makeEntry({ result: 'SUCCESS' }) as never} />);
    const resultEl = screen.getByText('SUCCESS');
    expect(resultEl).toBeInTheDocument();
    expect(resultEl.className).toContain('success');
  });

  it('C6-F9.10: deve exibir FAILURE com classe de falha', () => {
    render(<AuditRow entry={makeEntry({ result: 'FAILURE' }) as never} />);
    const resultEl = screen.getByText('FAILURE');
    expect(resultEl).toBeInTheDocument();
    expect(resultEl.className).toContain('fail');
  });

  it('deve exibir indicador "batch" quando batchId presente', () => {
    render(<AuditRow entry={makeEntry({ batchId: 'batch-abc-123' }) as never} />);
    expect(screen.getByText('batch')).toBeInTheDocument();
  });

  it('não deve exibir indicador "batch" quando batchId é null', () => {
    render(<AuditRow entry={makeEntry({ batchId: null }) as never} />);
    expect(screen.queryByText('batch')).toBeNull();
  });

  it('deve calcular iniciais corretamente para ator "system"', () => {
    render(<AuditRow entry={makeEntry({ actor: 'system' }) as never} />);
    expect(screen.getByText('S')).toBeInTheDocument();
  });

  it('deve calcular iniciais para ator com underscore "admin_user"', () => {
    render(<AuditRow entry={makeEntry({ actor: 'admin_user' }) as never} />);
    expect(screen.getByText('AU')).toBeInTheDocument();
  });
});

// ─── F9.1: AuditTable — renderização da tabela ─────────────────────────────

describe('C6-F9.1: AuditTable — renderização da tabela', () => {
  it('deve exibir cabeçalhos: Timestamp, Ator, Evento, Resultado', () => {
    render(<AuditTable entries={[]} />);
    expect(screen.getByText('Timestamp')).toBeInTheDocument();
    expect(screen.getByText('Ator')).toBeInTheDocument();
    expect(screen.getByText('Evento')).toBeInTheDocument();
    expect(screen.getByText('Resultado')).toBeInTheDocument();
  });

  it('deve renderizar uma linha para cada entrada', () => {
    const entries = [
      makeEntry({ id: 'a-1' }),
      makeEntry({ id: 'a-2', action: 'DELETE' }),
      makeEntry({ id: 'a-3', action: 'REVOKE', result: 'FAILURE' }),
    ];

    render(<AuditTable entries={entries as never[]} />);

    const rows = screen.getAllByTestId('audit-row');
    expect(rows).toHaveLength(3);
  });

  it('deve renderizar tabela vazia sem linhas', () => {
    render(<AuditTable entries={[]} />);
    expect(screen.queryByTestId('audit-row')).toBeNull();
  });
});

// ─── F9.2–F9.5: AuditFilters — componente de filtros ────────────────────────

describe('C6-F9: AuditFilters — filtros', () => {
  const emptyFilters: AuditFilterState = {
    action: '',
    actor: '',
    certCn: '',
    dateFrom: '',
    dateTo: '',
    result: '',
  };

  it('deve renderizar campo de busca por CN', () => {
    render(<AuditFilters filters={emptyFilters} onChange={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByLabelText('Buscar por Common Name')).toBeInTheDocument();
  });

  it('deve renderizar campo de busca por ator', () => {
    render(<AuditFilters filters={emptyFilters} onChange={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByLabelText('Buscar por ator')).toBeInTheDocument();
  });

  it('deve renderizar dropdown de ação', () => {
    render(<AuditFilters filters={emptyFilters} onChange={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByLabelText('Filtrar por ação')).toBeInTheDocument();
  });

  it('deve renderizar dropdown de resultado', () => {
    render(<AuditFilters filters={emptyFilters} onChange={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByLabelText('Filtrar por resultado')).toBeInTheDocument();
  });

  it('deve renderizar campos de data início e fim', () => {
    render(<AuditFilters filters={emptyFilters} onChange={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByLabelText('Data início')).toBeInTheDocument();
    expect(screen.getByLabelText('Data fim')).toBeInTheDocument();
  });

  it('deve chamar onChange quando CN é alterado', () => {
    const onChange = vi.fn();
    render(<AuditFilters filters={emptyFilters} onChange={onChange} onClear={vi.fn()} />);

    const cnInput = screen.getByLabelText('Buscar por Common Name');
    fireEvent.change(cnInput, { target: { value: 'test.com' } });

    expect(onChange).toHaveBeenCalledWith({ certCn: 'test.com' });
  });

  it('deve chamar onChange quando ator é alterado', () => {
    const onChange = vi.fn();
    render(<AuditFilters filters={emptyFilters} onChange={onChange} onClear={vi.fn()} />);

    const actorInput = screen.getByLabelText('Buscar por ator');
    fireEvent.change(actorInput, { target: { value: 'admin' } });

    expect(onChange).toHaveBeenCalledWith({ actor: 'admin' });
  });

  it('deve chamar onChange quando ação é alterada', () => {
    const onChange = vi.fn();
    render(<AuditFilters filters={emptyFilters} onChange={onChange} onClear={vi.fn()} />);

    const select = screen.getByLabelText('Filtrar por ação');
    fireEvent.change(select, { target: { value: 'DELETE' } });

    expect(onChange).toHaveBeenCalledWith({ action: 'DELETE' });
  });

  it('deve chamar onChange quando resultado é alterado', () => {
    const onChange = vi.fn();
    render(<AuditFilters filters={emptyFilters} onChange={onChange} onClear={vi.fn()} />);

    const select = screen.getByLabelText('Filtrar por resultado');
    fireEvent.change(select, { target: { value: 'FAILURE' } });

    expect(onChange).toHaveBeenCalledWith({ result: 'FAILURE' });
  });

  it('deve chamar onChange quando data início é alterada', () => {
    const onChange = vi.fn();
    render(<AuditFilters filters={emptyFilters} onChange={onChange} onClear={vi.fn()} />);

    const dateInput = screen.getByLabelText('Data início');
    fireEvent.change(dateInput, { target: { value: '2025-01-01' } });

    expect(onChange).toHaveBeenCalledWith({ dateFrom: '2025-01-01' });
  });

  it('deve chamar onChange quando data fim é alterada', () => {
    const onChange = vi.fn();
    render(<AuditFilters filters={emptyFilters} onChange={onChange} onClear={vi.fn()} />);

    const dateInput = screen.getByLabelText('Data fim');
    fireEvent.change(dateInput, { target: { value: '2025-12-31' } });

    expect(onChange).toHaveBeenCalledWith({ dateTo: '2025-12-31' });
  });

  it('não deve exibir botão "limpar filtros" quando todos os filtros estão vazios', () => {
    render(<AuditFilters filters={emptyFilters} onChange={vi.fn()} onClear={vi.fn()} />);
    expect(screen.queryByText(/limpar filtros/)).toBeNull();
  });

  it('deve exibir botão "limpar filtros" quando há filtro ativo', () => {
    const activeFilters: AuditFilterState = {
      ...emptyFilters,
      action: 'DELETE',
    };
    render(<AuditFilters filters={activeFilters} onChange={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText(/limpar filtros/)).toBeInTheDocument();
  });

  it('deve chamar onClear ao clicar "limpar filtros"', () => {
    const onClear = vi.fn();
    const activeFilters: AuditFilterState = {
      ...emptyFilters,
      actor: 'admin',
    };
    render(<AuditFilters filters={activeFilters} onChange={vi.fn()} onClear={onClear} />);

    fireEvent.click(screen.getByText(/limpar filtros/));

    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
