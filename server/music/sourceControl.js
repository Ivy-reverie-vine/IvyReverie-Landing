import { Router } from 'express'

/**
 * 管理员生产控制面：只暴露来源状态和安全的开关/优先级/熔断操作，绝不返回凭据、Cookie 或 URL。
 */
export function createMusicSourceControlRouter({ orchestrator, auth }) {
  const router = Router()

  function requireAdmin(req, res, next) {
    const user = auth.currentUser(req)
    if (!user) return res.status(401).json({ code: 401, message: '未登录或 API Key 无效' })
    if (user.status === 'banned') return res.status(403).json({ code: 403, message: '账号已被封禁' })
    if (user.role !== 'admin') return res.status(403).json({ code: 403, message: '需要管理员权限' })
    req.user = user
    next()
  }

  router.get('/', requireAdmin, (req, res) => {
    res.json({ code: 200, data: orchestrator.sourceStatuses() })
  })

  router.post('/:id', requireAdmin, (req, res) => {
    const sourceId = String(req.params.id || '')
    const action = String(req.body?.action || '')
    try {
      let status
      if (action === 'enable' || action === 'disable') {
        status = orchestrator.setSourceEnabled(sourceId, action === 'enable')
      } else if (action === 'priority') {
        status = orchestrator.setSourcePriority(sourceId, req.body?.priority)
      } else if (action === 'reset-circuit') {
        status = orchestrator.resetSourceCircuit(sourceId)
      } else {
        return res.status(400).json({ code: 400, message: '未知来源控制操作' })
      }
      if (!status) return res.status(404).json({ code: 404, message: '音乐来源不存在' })
      return res.json({ code: 200, data: status })
    } catch (error) {
      return res.status(400).json({ code: 400, message: error instanceof Error ? error.message : '来源控制参数无效' })
    }
  })

  return router
}
