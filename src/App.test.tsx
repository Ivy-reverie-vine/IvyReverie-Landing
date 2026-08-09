import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import App from './App'

describe('App — Issue 01 tracer bullet', () => {
  it('renders the five region placeholders', () => {
    const { getByTestId } = render(<App />)
    expect(getByTestId('particle-background')).toBeInTheDocument()
    expect(getByTestId('header')).toBeInTheDocument()
    expect(getByTestId('hero')).toBeInTheDocument()
    expect(getByTestId('language-button')).toBeInTheDocument()
    expect(getByTestId('footer')).toBeInTheDocument()
  })

  it('hides the decorative background layer from assistive tech', () => {
    const { getByTestId } = render(<App />)
    expect(getByTestId('particle-background')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })

  it('marks the particle background with a reduced-motion flag', () => {
    const { getByTestId } = render(<App />)
    expect(getByTestId('particle-background')).toHaveAttribute(
      'data-reduced-motion',
    )
  })

  it('renders the IvyReverie logo and night dream subtitle', () => {
    const { getByRole, getByText } = render(<App />)
    expect(
      getByRole('heading', { name: /IvyReverie/i }),
    ).toBeInTheDocument()
    expect(getByText('night dream')).toBeInTheDocument()
  })

  it('renders the header chrome: start dream, Bird, placeholders', () => {
    const { getByText, getByRole } = render(<App />)
    expect(getByText('start dream')).toBeInTheDocument()
    expect(getByRole('button', { name: 'Bird' })).toBeInTheDocument()
    expect(getByText('占位1')).toBeInTheDocument()
    expect(getByText('占位2')).toBeInTheDocument()
    expect(getByText('占位3')).toBeInTheDocument()
  })

  it('renders the footer links and description line', () => {
    const { getByText } = render(<App />)
    for (const label of ['ST', 'Ivy2API', 'Guide', 'GitHub', 'Status']) {
      expect(getByText(label)).toBeInTheDocument()
    }
    expect(
      getByText("I can see u and I can't see u"),
    ).toBeInTheDocument()
  })

  it('renders the language floating button', () => {
    const { getByRole } = render(<App />)
    expect(
      getByRole('button', { name: '切换语言' }),
    ).toBeInTheDocument()
  })

  it('uses semantic landmark elements (header/nav/main/footer/h1)', () => {
    const { getByRole, getAllByRole } = render(<App />)
    expect(getByRole('banner')).toBeInTheDocument() // <header>
    expect(getAllByRole('navigation').length).toBeGreaterThanOrEqual(1) // <nav>
    expect(getByRole('main')).toBeInTheDocument() // <main>
    expect(getByRole('contentinfo')).toBeInTheDocument() // <footer>
    expect(getByRole('heading', { level: 1 })).toBeInTheDocument() // <h1>
  })
})
