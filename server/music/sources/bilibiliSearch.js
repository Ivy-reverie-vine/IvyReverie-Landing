import { createHash } from 'node:crypto'

// WBI permutation used by Bilibili's web client (also documented in BBPlayer wbi.ts).
const permutation = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52]

export async function searchBilibili(adapter, keywords, headers, signal) {
  const response = await adapter.fetchImpl('https://api.bilibili.com/x/web-interface/nav', { headers, signal })
  if (!response.ok) { await response.body?.cancel(); throw Object.assign(new Error('Bilibili search key unavailable'), { code: 'BILIBILI_SEARCH_KEY_FAILED' }) }
  const nav = await response.json()
  const keys = [nav.data?.wbi_img?.img_url, nav.data?.wbi_img?.sub_url].map(value => {
    try { return new URL(value).pathname.split('/').pop().split('.')[0] } catch { return '' }
  }).join('')
  if (!/^[a-f0-9]{64}$/i.test(keys)) throw Object.assign(new Error('Bilibili search key invalid'), { code: 'BILIBILI_SEARCH_KEY_FAILED' })
  const mixin = permutation.map(index => keys[index]).join('').slice(0, 32)
  const params = { keyword: keywords, search_type: 'video', page: '1', page_size: '10', wts: String(Math.floor(Date.now() / 1000)) }
  const query = Object.keys(params).sort().map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key].replace(/[!'()*]/g, ''))}`).join('&')
  const signed = query + '&w_rid=' + createHash('md5').update(query + mixin).digest('hex')
  return adapter.json('/x/web-interface/wbi/search/type', Object.fromEntries(new URLSearchParams(signed)), headers, signal)
}
