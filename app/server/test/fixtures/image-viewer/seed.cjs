const fs = require("node:fs")
const { execFileSync } = require("node:child_process")
const root = "/tmp/image-viewer-fixture"
fs.mkdirSync(root, { recursive: true })
const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim()
git("init", "-b", "main")
git("config", "user.email", "test@redpact.invalid")
git("config", "user.name", "Image review test")
const svg = (color) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" rx="16" fill="${color}"/></svg>`
fs.writeFileSync(`${root}/icon.svg`, svg("red"))
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
  "base64",
)
fs.writeFileSync(`${root}/picture.png`, png)
const ico = Buffer.alloc(22)
ico.writeUInt16LE(1, 2)
ico.writeUInt16LE(1, 4)
ico[6] = 1
ico[7] = 1
ico.writeUInt16LE(1, 10)
ico.writeUInt16LE(32, 12)
ico.writeUInt32LE(png.length, 14)
ico.writeUInt32LE(22, 18)
fs.writeFileSync(`${root}/favicon.ico`, Buffer.concat([ico, png]))
git("add", ".")
git("commit", "-m", "Image baseline")
git("checkout", "-b", "image-review")
fs.writeFileSync(`${root}/icon.svg`, svg("blue"))
git("add", ".")
git("commit", "-m", "Update image artwork")
git("branch", "image-history")
fs.writeFileSync(`${root}/icon.svg`, svg("green"))
git("add", ".")
fs.writeFileSync(`${root}/icon.svg`, svg("purple"))
fs.writeFileSync(`${root}/broken.png`, "invalid image")
fs.writeFileSync(`${root}/oversize.png`, Buffer.alloc(5 * 1024 * 1024 + 1))
fs.writeFileSync(`${root}/notes.txt`, "Image viewer text fallback")
