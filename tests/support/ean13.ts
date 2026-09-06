/**
 * Renders a valid EAN-13 barcode to a JPEG, for testing the server-side
 * decoder without checking binary fixtures into the repo.
 *
 * The point of generating rather than committing a photo is that the tests can
 * ask for the *hard* versions on demand — small, rotated, low-contrast, JPEG
 * mangled — which is what a phone actually uploads. A single clean fixture
 * would only ever prove the easy case.
 */

import jpeg from "jpeg-js";

/** Left-hand odd parity. */
const L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
/** Left-hand even parity. */
const G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
/** Right-hand. */
const R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];

/**
 * The first digit isn't drawn as bars at all — it's encoded in which parity
 * each of the next six digits uses. That's how 13 digits fit in 12 symbols.
 */
const PARITY = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];

export function checkDigit(first12: string): number {
  const sum = first12
    .split("")
    .map(Number)
    .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

/** Appends the correct check digit to 12 digits. */
export function withCheckDigit(first12: string): string {
  return first12 + checkDigit(first12);
}

function modulePattern(code: string): string {
  const d = code.split("").map(Number);
  const parity = PARITY[d[0]];
  let bits = "101"; // start guard
  for (let i = 0; i < 6; i++) bits += (parity[i] === "L" ? L : G)[d[i + 1]];
  bits += "01010"; // centre guard
  for (let i = 0; i < 6; i++) bits += R[d[i + 7]];
  return bits + "101"; // end guard
}

export type RenderOptions = {
  /** Pixels per barcode module. Below ~2 the bars stop being separable. */
  scale?: number;
  height?: number;
  /** Quiet-zone width in modules. Scanners need one; real labels get it wrong. */
  quiet?: number;
  /** JPEG quality, 1-100. Low values are what a small upload looks like. */
  quality?: number;
  /** Turn the picture on its side, as when someone holds the phone wrong. */
  rotate90?: boolean;
  /** 0 = full black on white, 0.5 = washed out under bad light. */
  fade?: number;
};

/** A JPEG containing `code`, rendered as bars. */
export function renderEan13Jpeg(code: string, options: RenderOptions = {}): Buffer {
  const { scale = 3, height = 200, quiet = 10, quality = 90, rotate90 = false, fade = 0 } = options;

  const bits = modulePattern(code);
  const width = (bits.length + quiet * 2) * scale;
  const dark = Math.round(255 * fade);

  const data = Buffer.alloc(width * height * 4, 0xff);
  const top = Math.round(height * 0.1);
  const bottom = height - top;

  for (let i = 0; i < bits.length; i++) {
    if (bits[i] !== "1") continue;
    for (let px = 0; px < scale; px++) {
      const x = (quiet + i) * scale + px;
      for (let y = top; y < bottom; y++) {
        const o = (y * width + x) * 4;
        data[o] = data[o + 1] = data[o + 2] = dark;
      }
    }
  }

  const raster = rotate90 ? rotateRgba(data, width, height) : { data, width, height };
  return jpeg.encode(raster, quality).data;
}

/** Quarter turn clockwise. */
function rotateRgba(src: Buffer, width: number, height: number) {
  const out = Buffer.alloc(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4;
      const to = (x * height + (height - 1 - y)) * 4;
      src.copy(out, to, from, from + 4);
    }
  }
  return { data: out, width: height, height: width };
}
