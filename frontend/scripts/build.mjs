import { build, createLogger } from 'vite'

const logger = createLogger()
await build({ customLogger: logger })
if (logger.hasWarned) process.exitCode = 1
