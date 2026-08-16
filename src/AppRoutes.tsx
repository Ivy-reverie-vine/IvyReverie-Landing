import { Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing'
import DreamMusic from './pages/DreamMusic'

/** 路由表（不含 Router 外壳，便于测试用 MemoryRouter 包裹）。 */
export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/dreammusic" element={<DreamMusic />} />
    </Routes>
  )
}
