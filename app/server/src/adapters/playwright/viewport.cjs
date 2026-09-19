const { crc32 } = require("node:zlib")

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const keyword = Buffer.from("redpact.viewport\0")

function validViewport(value) {
  return value && [value.width, value.height].every((n) => Number.isSafeInteger(n) && n > 0)
}

// Keep provenance inside the PNG so delayed/path attachments cannot confuse identical crops.
function annotate(buffer, viewport) {
  if (!buffer.subarray(0, 8).equals(signature) || !validViewport(viewport)) {
    return buffer
  }
  const data = Buffer.concat([keyword, Buffer.from(JSON.stringify(viewport))])
  const chunk = Buffer.alloc(data.length + 12)
  chunk.writeUInt32BE(data.length, 0)
  chunk.write("tEXt", 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4)
  return Buffer.concat([buffer.subarray(0, 33), chunk, buffer.subarray(33)])
}

function readViewport(buffer) {
  if (!buffer.subarray(0, 8).equals(signature)) {
    return undefined
  }
  for (let offset = 8; offset + 12 <= buffer.length; ) {
    const length = buffer.readUInt32BE(offset)
    const end = offset + 12 + length
    if (end > buffer.length) {
      return undefined
    }
    const data = buffer.subarray(offset + 8, end - 4)
    if (
      buffer.toString("ascii", offset + 4, offset + 8) === "tEXt" &&
      data.subarray(0, keyword.length).equals(keyword)
    ) {
      if (
        length > 256 ||
        crc32(buffer.subarray(offset + 4, end - 4)) !== buffer.readUInt32BE(end - 4)
      ) {
        return undefined
      }
      try {
        const value = JSON.parse(data.subarray(keyword.length).toString())
        if (validViewport(value)) {
          return { width: value.width, height: value.height }
        }
      } catch {}
      return undefined
    }
    offset = end
  }
  return undefined
}

module.exports = { annotate, readViewport }
