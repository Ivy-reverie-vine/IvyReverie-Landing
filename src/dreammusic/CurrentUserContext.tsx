import { createContext, useContext, type ReactNode } from 'react'
import type { UserInfo } from './api'

/** 已登录用户的轻量上下文（D4 多用户 + 红心 uid + 用户面板） */
const CurrentUserContext = createContext<UserInfo | null>(null)

export function CurrentUserProvider({
  user,
  children,
}: {
  user: UserInfo
  children: ReactNode
}) {
  return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>
}

export function useCurrentUser(): UserInfo {
  const user = useContext(CurrentUserContext)
  if (!user) throw new Error('useCurrentUser 必须在 CurrentUserProvider 内使用')
  return user
}

/** 测试/独立渲染场景可用：无 Provider 时返回 null 而不是抛错 */
export function useOptionalCurrentUser(): UserInfo | null {
  return useContext(CurrentUserContext)
}
