import { useEffect, useState } from 'react'
import ParticleBackground from './components/ParticleBackground'
import Header from './components/Header'
import Hero from './components/Hero'
import LanguageFloatingButton from './components/LanguageFloatingButton'
import Footer from './components/Footer'
import './App.css'

export default function App() {
  // Logo 逐笔书写动画（~3s）完成后才让粒子显现
  const [logoReady, setLogoReady] = useState(false)

  // 兜底：若 onAnimationEnd 未触发（如标签页后台），3.5s 后强制就绪
  useEffect(() => {
    const t = setTimeout(() => setLogoReady(true), 3500)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="app">
      <ParticleBackground active={logoReady} />
      <header className="header-region">
        <Header />
      </header>
      <main className="hero-layer">
        <Hero onLogoDone={() => setLogoReady(true)} />
      </main>
      <LanguageFloatingButton />
      <Footer />
    </div>
  )
}
