/** The IPC pipe closes even if Windows forcibly terminates the launcher. */
import { pathToFileURL } from 'node:url'

const [ownerToken, entry, ...args] = process.argv.slice(2)
if (!ownerToken || !entry || !process.connected) throw new Error('Run services through the music test launcher')
process.on('disconnect', () => process.exit(0))
process.argv = [process.execPath, entry, ...args]
await import(pathToFileURL(entry).href)
