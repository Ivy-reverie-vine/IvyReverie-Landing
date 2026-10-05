// Node 24+: actual installed Meting formatting → actual authenticated aggregate HTTP.
// Only provider HTTP is replaced. Run after npm ci in this runtime directory.
import assert from 'node:assert/strict'
import Meting from '@meting/core'
import { preserveRecordingEvidence } from './recording-evidence.mjs'
import { startIdentityGateway } from '../../server/test-support/identityGateway.js'

const gateway = await startIdentityGateway()
try {
  gateway.controls.thirdPartyResponse = async url => {
    if (url.host === 'upstream.test') return new Response(JSON.stringify({ code: 200, result: { more: false, songs: [
      { id: 701, name: '标准录音', ar: [{ name: '歌手' }], al: { name: '专辑' }, dt: 200000 },
      { id: 702, name: '另一首', ar: [{ name: '歌手' }], al: { name: '专辑' }, dt: 200000 },
    ] } }))
    const platform = url.searchParams.get('server')
    const meting = preserveRecordingEvidence(new Meting(platform)).format(true)
    const entries = platform === 'tencent' ? [
      { mid: 'qq-standard', name: '标准录音', title: '标准录音', singer: [{ name: '歌手' }], album: { title: '专辑', mid: 'a' }, interval: 200 },
      { mid: 'qq-live', name: '另一首', title: '另一首', subtitle: 'Live', singer: [{ name: '歌手' }], album: { title: '专辑', mid: 'a' }, interval: 200 },
    ] : [
      { hash: 'kg-standard', songName: '标准录音', filename: '歌手 - 标准录音', authors: [{ author_name: '歌手' }], album_name: '专辑', duration: 200 },
      // Meting truncates at the second " - ": originalTitle must retain the hidden version.
      { hash: 'kg-live', filename: '歌手 - 另一首 - Live', album_name: '专辑', duration: 200 },
    ]
    meting._curl = async () => {
      meting.raw = JSON.stringify(platform === 'tencent' ? { data: { song: { list: entries } } } : { data: { info: entries } })
      meting.info = { statusCode: 200 }; meting.error = null
      return meting
    }
    const formatted = JSON.parse(await meting.search('固定样本'))
    assert.equal(formatted[0].durationMs, 200000)
    assert.equal(formatted[1].durationMs, 200000)
    return new Response(JSON.stringify(formatted))
  }
  const response = await gateway.request('/dreammusic/api/v2/search?aggregate=true&merge=true&keywords=' + encodeURIComponent('固定样本'),
    { headers: { 'X-API-Key': gateway.apiKey } })
  assert.equal(response.status, 200)
  assert.equal(response.body.groups.length, 4)
  const merged = response.body.groups.find(group => group.entries[0].title === '标准录音')
  assert.equal(merged.entries.length, 3)
  assert.equal(response.body.groups.filter(group => group.reason === 'version_uncertain').length, 2)
  assert.deepEqual(response.body.data.find(song => song.sourceId === 'qq-live').versionTags, ['Live'])
  assert.equal(response.body.data.find(song => song.sourceId === 'kg-live').originalTitle, '歌手 - 另一首 - Live')
  assert.equal(gateway.controls.calls.length, 3)
  console.log('PASS: actual Meting formatter preserves duration/subtitle/original filename; real HTTP merges standard recording and retains hidden Live versions separately.')
} finally { await gateway.close() }
