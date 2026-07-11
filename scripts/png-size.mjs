import { open } from 'node:fs/promises';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export async function readPngSize(filePath) {
  const file = await open(filePath, 'r');
  try {
    const header = Buffer.alloc(24);
    await file.read(header, 0, header.length, 0);
    if (!header.subarray(0, 8).equals(PNG_SIGNATURE)) {
      throw new Error(`Not a PNG file: ${filePath}`);
    }

    return {
      width: header.readUInt32BE(16),
      height: header.readUInt32BE(20),
    };
  } finally {
    await file.close();
  }
}
