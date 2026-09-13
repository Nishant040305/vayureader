/**
 * E2EE Encryption Module for React Native
 *
 * Identical key derivation as server (encryption.service.js) and
 * admin dashboard (encryption.js). All three sides independently
 * compute the same AES-256-GCM key from:
 *   HKDF(salt="vayureader-e2ee-v1", IKM="${id}:${contact}:${tokenVersion}")
 *
 * Zero external dependencies — uses pure-JS SHA-256, HMAC, AES-GCM,
 * with WebCrypto fallback when available.
 */

// =============================================================================
// CONSTANTS — must match server encryption.service.js exactly
// =============================================================================

const HKDF_SALT = 'vayureader-e2ee-v1';
const HKDF_INFO = 'api-payload-encryption';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

// =============================================================================
// HELPERS
// =============================================================================

const encode = (str: string): Uint8Array => new TextEncoder().encode(str);
const decode = (buf: ArrayBuffer): string => {
    const bytes = new Uint8Array(buf);
    let r = '';
    for (let i = 0; i < bytes.length; i++) r += String.fromCharCode(bytes[i]);
    return r;
};

const bufToBase64 = (buf: ArrayBuffer): string => {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return globalThis.btoa(bin);
};

const base64ToBuf = (b64: string): ArrayBuffer => {
    const bin = globalThis.atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
};

function getRandomBytes(len: number): Uint8Array {
    const b = new Uint8Array(len);
    globalThis.crypto.getRandomValues(b);
    return b;
}

// =============================================================================
// JWT PAYLOAD EXTRACTION
// =============================================================================

function decodeJwtPayload(token: string): any {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
        let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4 !== 0) b64 += '=';
        return JSON.parse(globalThis.atob(b64));
    } catch {
        return null;
    }
}

export type E2EEIdentity = { id: string; contact: string; tokenVersion: number };

export function extractIdentity(token: string): E2EEIdentity | null {
    const p = decodeJwtPayload(token);
    if (!p) return null;
    if (p.type === 'admin') {
        return { id: String(p.adminId), contact: p.contact, tokenVersion: typeof p.tokenVersion === 'number' ? p.tokenVersion : 0 };
    }
    if (p.type === 'user') {
        return { id: String(p.userId), contact: p.phone_number, tokenVersion: typeof p.tokenVersion === 'number' ? p.tokenVersion : 0 };
    }
    return null;
}

// =============================================================================
// KEY DERIVATION — identical to server & admin dashboard
// =============================================================================

/**
 * HKDF key derivation (synchronous, pure JS).
 *   PRK = HMAC-SHA256(salt, IKM)
 *   OKM = HMAC-SHA256(PRK, info || 0x01)[0..31]
 */
export function deriveKey(id: string, contact: string, tokenVersion: number): Uint8Array {
    const ikm = id + ':' + contact + ':' + tokenVersion;
    const prk = hmacSha256(encode(HKDF_SALT), encode(ikm));
    const info = encode(HKDF_INFO);
    const infoC = new Uint8Array(info.length + 1);
    infoC.set(info);
    infoC[info.length] = 0x01;
    return hmacSha256(prk, infoC).slice(0, KEY_LENGTH);
}

// =============================================================================
// HMAC-SHA256 (pure JS)
// =============================================================================

function hmacSha256(key: Uint8Array, msg: Uint8Array): Uint8Array {
    const BS = 64;
    let k = key;
    if (k.length > BS) k = sha256(k);
    const pk = new Uint8Array(BS);
    pk.set(k);
    const ip = new Uint8Array(BS);
    const op = new Uint8Array(BS);
    for (let i = 0; i < BS; i++) { ip[i] = pk[i] ^ 0x36; op[i] = pk[i] ^ 0x5c; }
    const inner = new Uint8Array(BS + msg.length);
    inner.set(ip); inner.set(msg, BS);
    const ih = sha256(inner);
    const outer = new Uint8Array(BS + 32);
    outer.set(op); outer.set(ih, BS);
    return sha256(outer);
}

// =============================================================================
// SHA-256 (pure JS)
// =============================================================================

const SHA_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rr(n: number, b: number) { return ((n >>> b) | (n << (32 - b))) >>> 0; }

function sha256(data: Uint8Array): Uint8Array {
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const ml = data.length, bl = ml * 8;
    const pl = ((56 - (ml + 1) % 64) + 64) % 64;
    const pd = new Uint8Array(ml + 1 + pl + 8);
    pd.set(data); pd[ml] = 0x80;
    const dv = new DataView(pd.buffer);
    dv.setUint32(pd.length - 4, bl, false);
    const W = new Uint32Array(64);
    for (let off = 0; off < pd.length; off += 64) {
        for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4, false);
        for (let i = 16; i < 64; i++) {
            const s0 = (rr(W[i - 15], 7) ^ rr(W[i - 15], 18) ^ (W[i - 15] >>> 3)) >>> 0;
            const s1 = (rr(W[i - 2], 17) ^ rr(W[i - 2], 19) ^ (W[i - 2] >>> 10)) >>> 0;
            W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
        }
        let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
        for (let i = 0; i < 64; i++) {
            const S1 = (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) >>> 0;
            const ch = ((e & f) ^ (~e & g)) >>> 0;
            const t1 = (h + S1 + ch + SHA_K[i] + W[i]) >>> 0;
            const S0 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) >>> 0;
            const mj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
            const t2 = (S0 + mj) >>> 0;
            h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }
    const r = new Uint8Array(32);
    const rv = new DataView(r.buffer);
    rv.setUint32(0, h0, false); rv.setUint32(4, h1, false);
    rv.setUint32(8, h2, false); rv.setUint32(12, h3, false);
    rv.setUint32(16, h4, false); rv.setUint32(20, h5, false);
    rv.setUint32(24, h6, false); rv.setUint32(28, h7, false);
    return r;
}

// =============================================================================
// AES-256-GCM ENCRYPT / DECRYPT
// =============================================================================

export async function encrypt(data: any, keyBytes: Uint8Array): Promise<string> {
    const pt = typeof data === 'string' ? data : JSON.stringify(data);
    const ptBytes = encode(pt);
    const iv = getRandomBytes(IV_LENGTH);

    // Try native WebCrypto first (available on Expo Web)
    if (typeof globalThis.crypto?.subtle?.encrypt === 'function') {
        const ck = await globalThis.crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
        const cb = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: TAG_LENGTH * 8 }, ck, ptBytes);
        const pk = new Uint8Array(IV_LENGTH + cb.byteLength);
        pk.set(iv, 0); pk.set(new Uint8Array(cb), IV_LENGTH);
        return bufToBase64(pk.buffer);
    }

    // Pure JS fallback (React Native / Hermes)
    const { ciphertext, tag } = aesGcmEnc(keyBytes, iv, ptBytes);
    const pk = new Uint8Array(IV_LENGTH + ciphertext.length + TAG_LENGTH);
    pk.set(iv, 0); pk.set(ciphertext, IV_LENGTH); pk.set(tag, IV_LENGTH + ciphertext.length);
    return bufToBase64(pk.buffer);
}

export async function decrypt(enc64: string, keyBytes: Uint8Array): Promise<string> {
    const packed = new Uint8Array(base64ToBuf(enc64));
    const iv = packed.slice(0, IV_LENGTH);
    const ct = packed.slice(IV_LENGTH);

    if (typeof globalThis.crypto?.subtle?.decrypt === 'function') {
        const ck = await globalThis.crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
        const db = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: TAG_LENGTH * 8 }, ck, ct);
        return decode(db);
    }

    const ciphertext = ct.slice(0, ct.length - TAG_LENGTH);
    const tag = ct.slice(ct.length - TAG_LENGTH);
    return decode(aesGcmDec(keyBytes, iv, ciphertext, tag).buffer as ArrayBuffer);
}

// =============================================================================
// AES-GCM CORE (AES-CTR + GHASH) — pure JS
// =============================================================================

function aesBlock(key: Uint8Array, blk: Uint8Array): Uint8Array {
    const Nk = key.length / 4, Nr = Nk + 6;
    const W = aesExpandKey(key, Nk, Nr);
    const s = new Uint8Array(blk);
    aesEncBlock(s, W, Nr);
    return s;
}

function aesGcmEnc(key: Uint8Array, iv: Uint8Array, pt: Uint8Array): { ciphertext: Uint8Array; tag: Uint8Array } {
    const J0 = new Uint8Array(16); J0.set(iv); J0[15] = 1;
    const ct = aesCtr(key, incCtr(J0), pt);
    const H = aesBlock(key, new Uint8Array(16));
    const tg = ghash(H, new Uint8Array(0), ct);
    const eJ0 = aesBlock(key, J0);
    for (let i = 0; i < 16; i++) tg[i] ^= eJ0[i];
    return { ciphertext: ct, tag: tg };
}

function aesGcmDec(key: Uint8Array, iv: Uint8Array, ct: Uint8Array, expTag: Uint8Array): Uint8Array {
    const J0 = new Uint8Array(16); J0.set(iv); J0[15] = 1;
    const H = aesBlock(key, new Uint8Array(16));
    const tg = ghash(H, new Uint8Array(0), ct);
    const eJ0 = aesBlock(key, J0);
    for (let i = 0; i < 16; i++) tg[i] ^= eJ0[i];
    let ok = true;
    for (let i = 0; i < TAG_LENGTH; i++) if (tg[i] !== expTag[i]) ok = false;
    if (!ok) throw new Error('E2EE: AES-GCM auth tag mismatch');
    return aesCtr(key, incCtr(J0), ct);
}

function aesCtr(key: Uint8Array, ctr: Uint8Array, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(data.length);
    const c = new Uint8Array(ctr);
    for (let b = 0; b < Math.ceil(data.length / 16); b++) {
        const ks = aesBlock(key, c);
        const off = b * 16, len = Math.min(16, data.length - off);
        for (let i = 0; i < len; i++) out[off + i] = data[off + i] ^ ks[i];
        incCtrInPlace(c);
    }
    return out;
}

function incCtr(c: Uint8Array): Uint8Array { const r = new Uint8Array(c); incCtrInPlace(r); return r; }
function incCtrInPlace(c: Uint8Array) { for (let i = 15; i >= 12; i--) { c[i]++; if (c[i]) break; } }

function ghash(H: Uint8Array, aad: Uint8Array, ct: Uint8Array): Uint8Array {
    const t = new Uint8Array(16);
    const process = (d: Uint8Array) => {
        for (let i = 0; i < Math.ceil(d.length / 16); i++) {
            const b = new Uint8Array(16);
            b.set(d.subarray(i * 16, Math.min((i + 1) * 16, d.length)));
            for (let j = 0; j < 16; j++) t[j] ^= b[j];
            gfMul(t, H);
        }
    };
    if (aad.length) process(aad);
    if (ct.length) process(ct);
    const lb = new Uint8Array(16);
    const lv = new DataView(lb.buffer);
    lv.setUint32(4, aad.length * 8, false);
    lv.setUint32(12, ct.length * 8, false);
    for (let j = 0; j < 16; j++) t[j] ^= lb[j];
    gfMul(t, H);
    return t;
}

function gfMul(x: Uint8Array, y: Uint8Array) {
    const z = new Uint8Array(16), v = new Uint8Array(y);
    for (let i = 0; i < 128; i++) {
        if ((x[i >> 3] >> (7 - (i & 7))) & 1) for (let j = 0; j < 16; j++) z[j] ^= v[j];
        const lsb = v[15] & 1;
        for (let j = 15; j > 0; j--) v[j] = ((v[j] >>> 1) | ((v[j - 1] & 1) << 7)) & 0xff;
        v[0] = (v[0] >>> 1) & 0xff;
        if (lsb) v[0] ^= 0xe1;
    }
    x.set(z);
}

// =============================================================================
// AES CORE (Rijndael 256-bit)
// =============================================================================

const SB = new Uint8Array([
    0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
    0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
    0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
    0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
    0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
    0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
    0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
    0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
    0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
    0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
    0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
    0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
    0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
    0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
    0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
    0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16,
]);
const RC = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

function sw(w: number) { return (SB[(w >>> 24) & 0xff] << 24) | (SB[(w >>> 16) & 0xff] << 16) | (SB[(w >>> 8) & 0xff] << 8) | SB[w & 0xff]; }
function rw(w: number) { return ((w << 8) | (w >>> 24)) >>> 0; }

function aesExpandKey(key: Uint8Array, Nk: number, Nr: number): Uint32Array {
    const W = new Uint32Array(4 * (Nr + 1));
    for (let i = 0; i < Nk; i++) W[i] = (key[4 * i] << 24) | (key[4 * i + 1] << 16) | (key[4 * i + 2] << 8) | key[4 * i + 3];
    for (let i = Nk; i < 4 * (Nr + 1); i++) {
        let t = W[i - 1];
        if (i % Nk === 0) t = sw(rw(t)) ^ (RC[i / Nk - 1] << 24);
        else if (Nk > 6 && i % Nk === 4) t = sw(t);
        W[i] = W[i - Nk] ^ t;
    }
    return W;
}

function aesEncBlock(s: Uint8Array, W: Uint32Array, Nr: number) {
    const ark = (r: number) => { for (let c = 0; c < 4; c++) { const w = W[r * 4 + c]; s[c * 4] ^= (w >>> 24) & 0xff; s[c * 4 + 1] ^= (w >>> 16) & 0xff; s[c * 4 + 2] ^= (w >>> 8) & 0xff; s[c * 4 + 3] ^= w & 0xff; } };
    const sub = () => { for (let i = 0; i < 16; i++) s[i] = SB[s[i]]; };
    const shr = () => { let t = s[1]; s[1] = s[5]; s[5] = s[9]; s[9] = s[13]; s[13] = t; t = s[2]; s[2] = s[10]; s[10] = t; t = s[6]; s[6] = s[14]; s[14] = t; t = s[15]; s[15] = s[11]; s[11] = s[7]; s[7] = s[3]; s[3] = t; };
    const gm = (a: number, b: number) => { let p = 0; for (let i = 0; i < 8; i++) { if (b & 1) p ^= a; const hi = a & 0x80; a = (a << 1) & 0xff; if (hi) a ^= 0x1b; b >>= 1; } return p; };
    const mix = () => { for (let c = 0; c < 4; c++) { const i = c * 4, a = s[i], b = s[i + 1], cc = s[i + 2], d = s[i + 3]; s[i] = gm(2, a) ^ gm(3, b) ^ cc ^ d; s[i + 1] = a ^ gm(2, b) ^ gm(3, cc) ^ d; s[i + 2] = a ^ b ^ gm(2, cc) ^ gm(3, d); s[i + 3] = gm(3, a) ^ b ^ cc ^ gm(2, d); } };
    ark(0);
    for (let r = 1; r < Nr; r++) { sub(); shr(); mix(); ark(r); }
    sub(); shr(); ark(Nr);
}

// =============================================================================
// KEY CACHE
// =============================================================================

let _ck: Uint8Array | null = null;
let _ct: string | null = null;

export function getSessionKey(token: string): Uint8Array | null {
    if (!token) return null;
    if (_ck && _ct === token) return _ck;
    const id = extractIdentity(token);
    if (!id) return null;
    _ck = deriveKey(id.id, id.contact, id.tokenVersion);
    _ct = token;
    return _ck;
}

export function clearKeyCache(): void { _ck = null; _ct = null; }
