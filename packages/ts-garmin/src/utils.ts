import * as fs from 'node:fs'

export function checkIsDirectory(filePath: string): boolean {
  return fs.existsSync(filePath) && fs.lstatSync(filePath).isDirectory()
}

export function createDirectory(directoryPath: string): void {
  fs.mkdirSync(directoryPath, { recursive: true })
}

export function writeToFile(filePath: string, data: string | Buffer | Uint8Array): void {
  fs.writeFileSync(filePath, data)
}
