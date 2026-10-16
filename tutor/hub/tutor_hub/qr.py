"""A small QR code maker for the sheet's footer (C2.1): alphanumeric text only, error correction level M, versions 1
to 3, which is all a sheet code needs ("Q1 M7-03-48217 PRS" is 18 characters; version 1 holds 20, version 3 holds 61).

Written here because the online home (the Worker) and the fallback kit carry no QR library, and the sheet must look
the same from every home. The hub's card (sheets.hub_card) still uses segno, which the hub has; the tests check this
maker against segno, mask by mask. The code holds text, never a URL (C2.1).
"""
ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:"
# version: (data codewords, error correction codewords) at level M, one block each
CAPACITY = {1: (16, 10), 2: (28, 16), 3: (44, 26)}
ALIGN = {1: None, 2: 18, 3: 22}          # the one alignment pattern's centre (row and column), version 2 and up
FORMAT_M = 0b00                          # level M's two format bits


def _gf_tables():
    exp, log = [0] * 512, [0] * 256
    x = 1
    for i in range(255):
        exp[i] = x
        log[x] = i
        x <<= 1
        if x & 0x100:
            x ^= 0x11D
    for i in range(255, 512):
        exp[i] = exp[i - 255]
    return exp, log


EXP, LOG = _gf_tables()


def _mul(a: int, b: int) -> int:
    return 0 if a == 0 or b == 0 else EXP[LOG[a] + LOG[b]]


def _ec(data: list[int], n: int) -> list[int]:
    """Reed-Solomon error correction codewords for `data`."""
    gen = [1]
    for i in range(n):
        nxt = [0] * (len(gen) + 1)
        for j, g in enumerate(gen):
            nxt[j] ^= g
            nxt[j + 1] ^= _mul(g, EXP[i])
        gen = nxt
    rem = list(data) + [0] * n
    for i in range(len(data)):
        c = rem[i]
        if c:
            for j in range(1, len(gen)):
                rem[i + j] ^= _mul(gen[j], c)
    return rem[len(data):]


def fits(text: str) -> bool:
    return all(c in ALNUM for c in text) and len(text) <= 61


def _bits(text: str, version: int) -> list[int]:
    out: list[int] = []

    def put(v, n):
        out.extend((v >> (n - 1 - i)) & 1 for i in range(n))

    put(0b0010, 4)
    put(len(text), 9)
    for i in range(0, len(text) - 1, 2):
        put(ALNUM.index(text[i]) * 45 + ALNUM.index(text[i + 1]), 11)
    if len(text) % 2:
        put(ALNUM.index(text[-1]), 6)
    cap = CAPACITY[version][0] * 8
    put(0, min(4, cap - len(out)))
    while len(out) % 8:
        out.append(0)
    pad = (0xEC, 0x11)
    i = 0
    while len(out) < cap:
        put(pad[i % 2], 8)
        i += 1
    return out


def _codewords(text: str, version: int) -> list[int]:
    bits = _bits(text, version)
    data = [int("".join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits), 8)]
    return data + _ec(data, CAPACITY[version][1])


def _version(text: str) -> int:
    for v in sorted(CAPACITY):
        if 4 + 9 + 11 * (len(text) // 2) + 6 * (len(text) % 2) <= CAPACITY[v][0] * 8:
            return v
    raise ValueError("too long for a sheet's QR code")


def _base(version: int):
    """The matrix with every function pattern placed: (modules, reserved)."""
    size = 17 + 4 * version
    m = [[0] * size for _ in range(size)]
    r = [[False] * size for _ in range(size)]

    def setf(y, x, v):
        m[y][x] = v
        r[y][x] = True

    for cy, cx in ((0, 0), (0, size - 7), (size - 7, 0)):
        for dy in range(-1, 8):
            for dx in range(-1, 8):
                y, x = cy + dy, cx + dx
                if 0 <= y < size and 0 <= x < size:
                    ring = max(abs(dy - 3), abs(dx - 3))
                    setf(y, x, 1 if ring in (0, 1, 3) else 0)
    for i in range(8, size - 8):
        setf(6, i, int(i % 2 == 0))
        setf(i, 6, int(i % 2 == 0))
    a = ALIGN[version]
    if a:
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                setf(a + dy, a + dx, 1 if max(abs(dy), abs(dx)) != 1 else 0)
    setf(4 * version + 9, 8, 1)                  # the dark module
    for i in range(9):                           # format areas, filled later
        for y, x in ((8, i), (i, 8)):
            if not r[y][x]:
                setf(y, x, 0)
    for i in range(8):
        for y, x in ((8, size - 1 - i), (size - 1 - i, 8)):
            if not r[y][x]:
                setf(y, x, 0)
    return m, r


def _place(m, r, words):
    size = len(m)
    bits = [(w >> (7 - i)) & 1 for w in words for i in range(8)]
    k = 0
    x = size - 1
    up = True
    while x > 0:
        if x == 6:
            x -= 1
        for j in range(size):
            y = size - 1 - j if up else j
            for xx in (x, x - 1):
                if not r[y][xx]:
                    m[y][xx] = bits[k] if k < len(bits) else 0
                    k += 1
        up = not up
        x -= 2


MASKS = [
    lambda y, x: (y + x) % 2 == 0,
    lambda y, x: y % 2 == 0,
    lambda y, x: x % 3 == 0,
    lambda y, x: (y + x) % 3 == 0,
    lambda y, x: (y // 2 + x // 3) % 2 == 0,
    lambda y, x: (y * x) % 2 + (y * x) % 3 == 0,
    lambda y, x: ((y * x) % 2 + (y * x) % 3) % 2 == 0,
    lambda y, x: ((y + x) % 2 + (y * x) % 3) % 2 == 0,
]


def _format_bits(mask: int) -> int:
    data = (FORMAT_M << 3) | mask
    v = data << 10
    for i in range(14, 9, -1):
        if v & (1 << i):
            v ^= 0b10100110111 << (i - 10)
    return ((data << 10) | v) ^ 0b101010000010010


def _put_format(m, mask):
    size = len(m)
    f = _format_bits(mask)
    bit = [(f >> i) & 1 for i in range(15)]          # bit 0 is the least significant
    # around the top-left finder
    for i in range(6):
        m[i][8] = bit[i]
    m[7][8], m[8][8], m[8][7] = bit[6], bit[7], bit[8]
    for i in range(9, 15):
        m[8][14 - i] = bit[i]
    # the second copy, by the other two finders
    for i in range(8):
        m[8][size - 1 - i] = bit[i]
    for i in range(8, 15):
        m[size - 15 + i][8] = bit[i]


def _finder_like(row) -> int:
    """40 for each dark-light-dark-dark-dark-light-dark run with four light modules (or the edge) on one side."""
    n, p, i = len(row), 0, 0
    pat = [1, 0, 1, 1, 1, 0, 1]
    while i <= n - 7:
        if row[i:i + 7] == pat:
            after = i + 7
            if i in (0, n - 7) or not any(row[max(i - 4, 0):i]) or not any(row[after:after + 4]):
                p += 40
                i = after
            else:
                i += 4
            continue
        i += 1
    return p


def _penalty(m) -> int:
    size = len(m)
    p = 0
    for lines in (m, [list(c) for c in zip(*m)]):
        for row in lines:
            run, prev = 0, None
            for v in row:
                if v == prev:
                    run += 1
                else:
                    if run >= 5:
                        p += run - 2
                    run, prev = 1, v
            if run >= 5:
                p += run - 2
            p += _finder_like(row)
    for y in range(size - 1):
        for x in range(size - 1):
            if m[y][x] == m[y][x + 1] == m[y + 1][x] == m[y + 1][x + 1]:
                p += 3
    dark = sum(map(sum, m))
    p += 10 * (abs(dark * 20 - size * size * 10) // (size * size))
    return p


def matrix(text: str, mask: int | None = None) -> list[list[int]]:
    """The QR code for `text` as rows of 0 (light) and 1 (dark), without the quiet zone."""
    if not all(c in ALNUM for c in text):
        raise ValueError("a sheet's QR code holds capitals, digits and a few signs only")
    version = _version(text)
    words = _codewords(text, version)
    base, reserved = _base(version)
    _place(base, reserved, words)
    best = None
    for k in ([mask] if mask is not None else range(8)):
        m = [row[:] for row in base]
        for y in range(len(m)):
            for x in range(len(m)):
                if not reserved[y][x] and MASKS[k](y, x):
                    m[y][x] ^= 1
        dark = 4 * version + 9
        m[dark][8] = 0                   # judged before the format bits and the dark module (ISO/IEC 18004:2015, 7.8)
        score = _penalty(m)
        m[dark][8] = 1
        _put_format(m, k)
        if best is None or score < best[0]:
            best = (score, m)
    return best[1]


def svg(text: str, size_mm: float) -> str:
    """The QR code as inline SVG for an HTML page, `size_mm` wide, black on white, with no quiet zone (the sheet keeps
    it clear)."""
    m = matrix(text)
    n = len(m)
    path = "".join(f"M{x} {y}h1v1h-1z" for y in range(n) for x in range(n) if m[y][x])
    return (f'<svg class="qr" viewBox="0 0 {n} {n}" width="{size_mm}mm" '
            f'height="{size_mm}mm" shape-rendering="crispEdges"><rect width="{n}" height="{n}" fill="#fff"/>'
            f'<path d="{path}" fill="#000"/></svg>')
