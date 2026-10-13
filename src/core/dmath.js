// Deterministic maths for everything that decides a battle's outcome.
//
// JavaScript engines may return different last bits for Math.sin, cos, tan,
// atan2, exp, log, pow, hypot and the rest (the spec leaves them
// "implementation-approximated"; measured: Node, Chromium, Firefox and WebKit
// all disagree with each other). The simulation is chaotic, so one bit grows
// into a different battle and a Daily Seed replay would fail to verify on
// another device. These versions use only + - * / and Math.sqrt, which IEEE
// 754 makes exact and JavaScript never fuses, so they give the same bits
// everywhere. Accuracy is about 1 ulp (pow with a fractional exponent a few
// ulps). The algorithms and coefficients are the classic fdlibm ones:
// Cody-Waite argument reduction plus minimax polynomials.
//
// Rendering, audio and UI may keep using Math.*: only code that feeds the
// simulation, the AI, launches, item generation or scoring must use these.

const sqrt = Math.sqrt;

// ------------------------------------------------------------ bits

const dv = new DataView(new ArrayBuffer(8));
function hiWord(x) { dv.setFloat64(0, x); return dv.getUint32(0); }
function loWord(x) { dv.setFloat64(0, x); return dv.getUint32(4); }
function fromWords(hi, lo) { dv.setUint32(0, hi >>> 0); dv.setUint32(4, lo >>> 0); return dv.getFloat64(0); }
// 2^k for an integer k in [-1022, 1023], exact
function pow2(k) { return fromWords((k + 1023) << 20, 0); }
function scale(y, k) {
  if (k > 1023) return y * pow2(1023) * pow2(k - 1023);
  if (k < -1022) return y * pow2(-1022) * pow2(Math.max(-1022, k + 1022));
  return y * pow2(k);
}

// ------------------------------------------------------------ sin, cos, tan

const INVPIO2 = 6.36619772367581382433e-01;
const PIO2_1 = 1.57079632673412561417e+00; // first 33 bits of pi/2
const PIO2_2 = 6.07710050630396597660e-11; // next 33 bits
const PIO2_3 = 2.02226624871116645580e-21; // next 33 bits
const PIO2_3T = 8.47842766036889956997e-32; // pi/2 - (PIO2_1 + PIO2_2 + PIO2_3)

const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04;
const S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05;
const C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;

// on |y| <= pi/4
function ksin(y) {
  const z = y * y;
  return y + y * z * (S1 + z * (S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))));
}
function kcos(y) {
  const z = y * y, hz = 0.5 * z;
  const r = z * z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  const w = 1 - hz;
  return w + (((1 - w) - hz) + r);
}
// x = n*pi/2 + y, |y| <= pi/4 (n returned mod 4)
let red = 0;
function reduce(x) {
  const n = Math.round(x * INVPIO2);
  red = n & 3;
  return (((x - n * PIO2_1) - n * PIO2_2) - n * PIO2_3) - n * PIO2_3T;
}

export function sin(x) {
  if (!(x - x === 0)) return NaN; // NaN, +-Infinity
  if (x > -0.7853981633974483 && x < 0.7853981633974483) return ksin(x);
  const y = reduce(x);
  switch (red) { case 0: return ksin(y); case 1: return kcos(y); case 2: return -ksin(y); default: return -kcos(y); }
}
export function cos(x) {
  if (!(x - x === 0)) return NaN;
  if (x > -0.7853981633974483 && x < 0.7853981633974483) return kcos(x);
  const y = reduce(x);
  switch (red) { case 0: return kcos(y); case 1: return -ksin(y); case 2: return -kcos(y); default: return ksin(y); }
}
export function tan(x) {
  if (!(x - x === 0)) return NaN;
  if (x > -0.7853981633974483 && x < 0.7853981633974483) return ksin(x) / kcos(x);
  const y = reduce(x);
  return red & 1 ? -kcos(y) / ksin(y) : ksin(y) / kcos(y);
}

// ------------------------------------------------------------ atan, atan2, asin, acos

const ATANHI = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
const ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT = [3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
  9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
  4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02];

export function atan(x) {
  if (x !== x) return NaN;
  const neg = x < 0;
  let a = neg ? -x : x;
  let id;
  if (a >= 7.378697629483821e19) return neg ? -(ATANHI[3] + ATANLO[3]) : ATANHI[3] + ATANLO[3]; // 2^66
  if (a < 0.4375) {
    if (a < 7.450580596923828e-9) return x; // 2^-27
    id = -1;
  } else if (a < 1.1875) {
    if (a < 0.6875) { id = 0; a = (2 * a - 1) / (2 + a); } else { id = 1; a = (a - 1) / (a + 1); }
  } else if (a < 2.4375) { id = 2; a = (a - 1.5) / (1 + 1.5 * a); } else { id = 3; a = -1 / a; }
  const z = a * a, w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) return x - x * (s1 + s2);
  const r = ATANHI[id] - ((a * (s1 + s2) - ATANLO[id]) - a);
  return neg ? -r : r;
}

const PI = 3.1415926535897931160e+00, PI_LO = 1.2246467991473531772e-16, PIO2 = 1.5707963267948965580e+00, PIO4 = 7.8539816339744827900e-01;
const isNeg = (v) => v < 0 || (v === 0 && 1 / v < 0);

export function atan2(y, x) {
  if (x !== x || y !== y) return NaN;
  if (x === 1) return atan(y);
  if (y === 0) return isNeg(x) ? (isNeg(y) ? -PI : PI) : y;
  if (x === 0) return y < 0 ? -PIO2 : PIO2;
  const yInf = y === Infinity || y === -Infinity, xInf = x === Infinity || x === -Infinity;
  if (xInf) {
    if (yInf) return x > 0 ? (y > 0 ? PIO4 : -PIO4) : (y > 0 ? 3 * PIO4 : -3 * PIO4);
    return x > 0 ? (y > 0 ? 0 : -0) : (y > 0 ? PI : -PI);
  }
  if (yInf) return y > 0 ? PIO2 : -PIO2;
  const ay = y < 0 ? -y : y, ax = x < 0 ? -x : x;
  const ratio = ay / ax;
  let z;
  if (ratio > 1.152921504606847e18) z = PIO2 + 0.5 * PI_LO; // |y/x| > 2^60
  else if (x < 0 && ratio < 8.673617379884035e-19) z = 0; // |y/x| < 2^-60
  else z = atan(ratio);
  if (x > 0) return y < 0 ? -z : z;
  return y < 0 ? (z - PI_LO) - PI : PI - (z - PI_LO);
}

export function asin(x) { return atan2(x, sqrt((1 - x) * (1 + x))); }
export function acos(x) { return atan2(sqrt((1 - x) * (1 + x)), x); }

// ------------------------------------------------------------ exp, log, pow

const LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, INVLN2 = 1.44269504088896338700e+00;
const P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05;
const P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08;

export function exp(x) {
  if (x !== x) return NaN;
  if (x > 709.782712893384) return Infinity;
  if (x < -745.1332191019411) return 0;
  let hi, lo, k;
  const ax = x < 0 ? -x : x;
  if (ax > 0.34657359027997264) { // 0.5 ln2
    k = Math.trunc(INVLN2 * x + (x < 0 ? -0.5 : 0.5));
    hi = x - k * LN2_HI;
    lo = k * LN2_LO;
  } else if (ax < 3.725290298461914e-9) { // 2^-28
    return 1 + x;
  } else { k = 0; hi = x; lo = 0; }
  const r = hi - lo;
  const t = r * r;
  const c = r - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return 1 - ((r * c) / (c - 2) - r);
  const y = 1 - ((lo - (r * c) / (2 - c)) - hi);
  return scale(y, k);
}

const LG1 = 6.666666666666735130e-01, LG2 = 3.999999999940941908e-01, LG3 = 2.857142874366239149e-01;
const LG4 = 2.222219843214978396e-01, LG5 = 1.818357216161805012e-01, LG6 = 1.531383769920937332e-01, LG7 = 1.479819860511658591e-01;

export function log(x) {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  let k = 0;
  let hx = hiWord(x);
  if (hx < 0x00100000) { k -= 54; x *= 18014398509481984; hx = hiWord(x); } // subnormal: x * 2^54
  k += (hx >>> 20) - 1023;
  hx &= 0x000fffff;
  const i = (hx + 0x95f64) & 0x100000;
  const m = fromWords(hx | (i ^ 0x3ff00000), loWord(x)); // mantissa in [sqrt(2)/2, sqrt(2))
  k += i >>> 20;
  const f = m - 1;
  const s = f / (2 + f);
  const z = s * s, w = z * z;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  const R = t2 + t1;
  const hfsq = 0.5 * f * f;
  return k * LN2_HI - ((hfsq - (s * (hfsq + R) + k * LN2_LO)) - f);
}

// exact for powers of two (bracket sizes rely on it)
export function log2(x) {
  const hx = hiWord(x);
  if (x > 0 && hx >= 0x00100000 && hx < 0x7ff00000 && (hx & 0xfffff) === 0 && loWord(x) === 0) return (hx >>> 20) - 1023;
  return log(x) * 1.4426950408889634;
}

// x^y. Small integer exponents by repeated multiplication; otherwise
// exp(y log x). Same special cases as Math.pow for real-valued use.
export function pow(x, y) {
  if (y === 0) return 1;
  if (x !== x || y !== y) return NaN;
  const yInt = y === Math.trunc(y);
  if (yInt && y >= -64 && y <= 64) {
    let n = y < 0 ? -y : y, b = x, r = 1;
    while (n > 0) { if (n & 1) r *= b; b *= b; n >>= 1; }
    return y < 0 ? 1 / r : r;
  }
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (x < 0) {
    if (!yInt) return NaN;
    const v = exp(y * log(-x));
    return y % 2 === 0 ? v : -v;
  }
  return exp(y * log(x));
}

// ------------------------------------------------------------ hypot

export function hypot(a, b, c) {
  return c === undefined ? sqrt(a * a + b * b) : sqrt(a * a + b * b + c * c);
}
