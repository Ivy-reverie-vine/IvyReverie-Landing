import { describe, it, expect } from 'vitest'
import { render, within } from '@testing-library/react'
import App from './App'

describe('App — Landing at /', () => {
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
    expect(getByText(/night dream/i)).toBeInTheDocument()
  })

  it('renders the header chrome: Start Dream, Home, placeholders', () => {
    const { getByText, getByRole } = render(<App />)
    expect(getByText('Start Dream')).toBeInTheDocument()
    expect(getByRole('button', { name: 'Home' })).toBeInTheDocument()
    expect(getByText('占位1')).toBeInTheDocument()
    expect(getByText('占位2')).toBeInTheDocument()
  })

  it('links Start Dream to /dreammusic (DM-01)', () => {
    const { getByRole } = render(<App />)
    const link = getByRole('link', { name: /Start Dream/i })
    expect(link).toHaveAttribute('href', '/dreammusic')
  })

  it('renders the footer links and description line', () => {
    const { getByTestId } = render(<App />)
    const footer = getByTestId('footer')
    for (const label of ['ST', 'Ivy2API', 'Guide', 'GitHub', 'Status']) {
      expect(within(footer).getByText(label)).toBeInTheDocument()
    }
    expect(within(footer).getByText('NightDream.append(you)')).toBeInTheDocument()
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
