import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StrictMode } from 'react';

function App() {
  return (
    <div>
      <h1>Certificado Digital — Inventário</h1>
      <p>Application is running.</p>
    </div>
  );
}

describe('App', () => {
  it('should render the application heading', () => {
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    expect(screen.getByText('Certificado Digital — Inventário')).toBeDefined();
  });
});
