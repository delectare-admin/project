// Hybrid Search Engine v1
// YouTube-inspired tiered relevance + dynamic Fuse.js threshold + Japanese reading/romaji + logarithmic engagement/freshness boost.

const ROMAJI_TABLE = Object.freeze({
  // 4-char
  ltsu: 'っ', xtsu: 'っ',
  // 3-char
  sha: 'しゃ', shi: 'し', shu: 'しゅ', she: 'しぇ', sho: 'しょ',
  sya: 'しゃ', syi: 'しぃ', syu: 'しゅ', sye: 'しぇ', syo: 'しょ',
  chi: 'ち', cha: 'ちゃ', chu: 'ちゅ', che: 'ちぇ', cho: 'ちょ',
  tya: 'ちゃ', tyi: 'ちぃ', tyu: 'ちゅ', tye: 'ちぇ', tyo: 'ちょ',
  cya: 'ちゃ', cyi: 'ちぃ', cyu: 'ちゅ', cye: 'ちぇ', cyo: 'ちょ',
  tsu: 'つ', tsa: 'つぁ', tsi: 'つぃ', tse: 'つぇ', tso: 'つぉ',
  kya: 'きゃ', kyi: 'きぃ', kyu: 'きゅ', kye: 'きぇ', kyo: 'きょ',
  gya: 'ぎゃ', gyi: 'ぎぃ', gyu: 'ぎゅ', gye: 'ぎぇ', gyo: 'ぎょ',
  zya: 'じゃ', zyi: 'じぃ', zyu: 'じゅ', zye: 'じぇ', zyo: 'じょ',
  jya: 'じゃ', jyi: 'じぃ', jyu: 'じゅ', jye: 'じぇ', jyo: 'じょ',
  dya: 'ぢゃ', dyi: 'ぢぃ', dyu: 'ぢゅ', dye: 'ぢぇ', dyo: 'ぢょ',
  nya: 'にゃ', nyi: 'にぃ', nyu: 'にゅ', nye: 'にぇ', nyo: 'にょ',
  hya: 'ひゃ', hyi: 'ひぃ', hyu: 'ひゅ', hye: 'ひぇ', hyo: 'ひょ',
  bya: 'びゃ', byi: 'びぃ', byu: 'びゅ', bye: 'びぇ', byo: 'びょ',
  pya: 'ぴゃ', pyi: 'ぴぃ', pyu: 'ぴゅ', pye: 'ぴぇ', pyo: 'ぴょ',
  mya: 'みゃ', myi: 'みぃ', myu: 'みゅ', mye: 'みぇ', myo: 'みょ',
  rya: 'りゃ', ryi: 'りぃ', ryu: 'りゅ', rye: 'りぇ', ryo: 'りょ',
  fya: 'ふゃ', fyu: 'ふゅ', fyo: 'ふょ',
  vya: 'ゔゃ', vyu: 'ゔゅ', vyo: 'ゔょ',
  tha: 'てゃ', thi: 'てぃ', thu: 'てゅ', the: 'てぇ', tho: 'てょ',
  dha: 'でゃ', dhi: 'でぃ', dhu: 'でゅ', dhe: 'でぇ', dho: 'でょ',
  kwa: 'くぁ', gwa: 'ぐぁ',
  lya: 'ゃ', lyu: 'ゅ', lyo: 'ょ', ltu: 'っ',
  xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ', xtu: 'っ',
  // 2-char
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ',
  ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
  sa: 'さ', si: 'し', su: 'す', se: 'せ', so: 'そ',
  za: 'ざ', zi: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
  ja: 'じゃ', ji: 'じ', ju: 'じゅ', je: 'じぇ', jo: 'じょ',
  ta: 'た', ti: 'ち', tu: 'つ', te: 'て', to: 'と',
  da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
  ha: 'は', hi: 'ひ', hu: 'ふ', he: 'へ', ho: 'ほ',
  fu: 'ふ', fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ',
  ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
  pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
  ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も',
  ya: 'や', yu: 'ゆ', yo: 'よ',
  ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ',
  wa: 'わ', wi: 'うぃ', we: 'うぇ', wo: 'を',
  va: 'ゔぁ', vi: 'ゔぃ', vu: 'ゔ', ve: 'ゔぇ', vo: 'ゔぉ',
  la: 'ぁ', li: 'ぃ', lu: 'ぅ', le: 'ぇ', lo: 'ぉ',
  xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ',
  ca: 'か', cu: 'く', co: 'こ',
  qa: 'くぁ', qi: 'くぃ', qu: 'く', qe: 'くぇ', qo: 'くぉ',
  // 1-char
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お'
});

const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);
const DOUBLE_CONSONANTS = new Set(['b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'm', 'p', 'q', 'r', 's', 't', 'v', 'w', 'x', 'y', 'z']);

export const RELEVANCE_BOOST_GATE = 140;
export const MAX_QUALITY_FRESHNESS_BOOST = 0.30;

export function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('ja-JP')
    .replace(/[\u30a1-\u30f6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\p{P}\p{S}\s]+/gu, ' ')
    .trim();
}

export function romajiToHiragana(input) {
  const raw = String(input || '').normalize('NFKC').toLowerCase().trim();
  if (!raw || raw.length < 2 || raw.length > 40) return '';
  if (!/^[a-z\-']+$/.test(raw)) return '';

  let out = '';
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '-') {
      if (!out) return '';
      out += 'ー';
      i += 1;
      continue;
    }
    if (ch === "'") {
      i += 1;
      continue;
    }

    // "tch" -> っ + ch (e.g., matcha -> まっちゃ)
    if (raw.startsWith('tch', i)) {
      out += 'っ';
      i += 1;
      continue;
    }

    // Sokuon (double consonant, except n)
    if (i + 1 < raw.length && ch === raw[i + 1] && DOUBLE_CONSONANTS.has(ch)) {
      out += 'っ';
      i += 1;
      continue;
    }

    // Syllabic n / m before p, b
    if (ch === 'n') {
      const next = raw[i + 1] || '';
      const next2 = raw[i + 2] || '';
      if (next === "'") {
        out += 'ん';
        i += 2;
        continue;
      }
      if (next === 'n') {
        out += 'ん';
        // "minna" / "konnichiwa": keep the second 'n' for na/ni/nu/ne/no
        i += VOWELS.has(next2) ? 1 : 2;
        continue;
      }
      if (!next || (!VOWELS.has(next) && next !== 'y')) {
        out += 'ん';
        i += 1;
        continue;
      }
    }
    if (ch === 'm') {
      const next = raw[i + 1] || '';
      if (next === 'p' || next === 'b') {
        out += 'ん';
        i += 1;
        continue;
      }
    }

    // Longest-first lookup (4 -> 3 -> 2 -> 1)
    let matched = '';
    let step = 0;
    for (let len = 4; len >= 1; len--) {
      if (i + len > raw.length) continue;
      const slice = raw.slice(i, i + len);
      if (Object.prototype.hasOwnProperty.call(ROMAJI_TABLE, slice)) {
        matched = ROMAJI_TABLE[slice];
        step = len;
        break;
      }
    }
    if (!matched) return '';
    out += matched;
    i += step;
  }

  return out.length >= 2 ? out : '';
}

export function tokenizeSearchQuery(queryText) {
  const clipped = String(queryText || '').slice(0, 200);
  const normalized = normalizeSearchText(clipped);
  if (!normalized) {
    return { normalized: '', tokens: [], rawRomajiHints: new Map() };
  }

  const tokens = [...new Set(normalized.split(' ').filter(Boolean))].slice(0, 12);

  // Preserve hyphenated romaji like "ge-mu" -> "げーむ" even though normalizeSearchText splits hyphens.
  const rawRomajiHints = new Map();
  const rawParts = clipped.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean).slice(0, 12);
  for (const part of rawParts) {
    if (part.includes('-') && /^[a-z\-']+$/.test(part)) {
      const kana = romajiToHiragana(part);
      if (kana) {
        const subTokens = normalizeSearchText(part).split(' ').filter(Boolean);
        for (const sub of subTokens) {
          rawRomajiHints.set(sub, kana);
        }
      }
    }
  }

  return { normalized, tokens, rawRomajiHints };
}

export function dynamicFuseThreshold(token) {
  const len = [...String(token || '')].length;
  if (len <= 2) return -1;
  if (len <= 4) return 0.12;
  if (len <= 7) return 0.18;
  return 0.24;
}

export function computeQualityFreshnessBoost(video, metrics = null, now = Date.now()) {
  const views = Math.max(0, Number(metrics?.views) || 0);
  const likes = Math.max(0, Number(metrics?.likes) || 0);
  const dislikes = Math.max(0, Number(metrics?.dislikes) || 0);
  const comments = Math.max(0, Number(metrics?.comments) || 0);
  const danmaku = Math.max(0, Number(metrics?.danmaku) || 0);

  // Logarithmic view boost (max +0.13)
  const viewsBoost = 0.0325 * Math.min(4, Math.log10(views + 1));

  // Likes volume + Bayesian smoothed like rate (max +0.08)
  const likesVolumeBoost = 0.015 * Math.min(3, Math.log10(likes + 1));
  let likeRateBoost = 0;
  if (likes + dislikes > 0) {
    const smoothedRate = (likes + 2) / (likes + dislikes + 4);
    likeRateBoost = Math.max(0, (smoothedRate - 0.5) * 2) * 0.035;
  }

  // Comment + danmaku activity boost (max +0.04)
  const activityBoost = 0.016 * Math.min(2.5, Math.log10(comments + danmaku + 1));

  // Freshness decay boost (max +0.05; half-value around 30 days)
  let freshnessBoost = 0;
  const uploadedMs = Date.parse(video?.uploadedAt || '');
  if (Number.isFinite(uploadedMs)) {
    const ageDays = Math.max(0, (now - uploadedMs) / 86400000);
    freshnessBoost = 0.05 * (1 / (1 + ageDays / 30));
  }

  return Math.min(
    MAX_QUALITY_FRESHNESS_BOOST,
    viewsBoost + likesVolumeBoost + likeRateBoost + activityBoost + freshnessBoost
  );
}

function tokensAppearInOrder(text, tokens) {
  if (tokens.length < 2) return false;
  let pos = 0;
  for (const token of tokens) {
    const idx = text.indexOf(token, pos);
    if (idx === -1) return false;
    pos = idx + token.length;
  }
  return true;
}

function getVideoId(video) {
  return String(video?.itemRef?.fullPath || video?.id || '');
}

export function createSearchEngine(options = {}) {
  const getFuseCtor = options.getFuse || (() => (typeof globalThis !== 'undefined' ? globalThis.Fuse : null));
  const readingsUrl = options.readingsUrl || './assets/search-japanese-readings-v2.json';
  const fetchImpl = options.fetch || (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);

  const documentCache = new WeakMap();
  const readingLattices = new Map();
  const readingPatterns = new Map();

  let readingsMap = null;
  let readingsPromise = null;
  let readingsRetryAt = 0;

  // Fuse index cache per threshold bucket, invalidated whenever the video array identity or Fuse ctor changes
  let fuseSourceVideos = null;
  let fuseSourceCtor = null;
  let fuseSourceDocs = null;
  const fuseInstances = new Map();

  function sanitizeReadingsObject(raw) {
    const clean = Object.create(null);
    if (!raw || typeof raw !== 'object') return clean;
    for (const [character, values] of Object.entries(raw)) {
      if ([...character].length !== 1 || !Array.isArray(values)) continue;
      const choices = values
        .filter(value => typeof value === 'string' && value.length <= 40)
        .map(normalizeSearchText)
        .filter(Boolean);
      if (choices.length) {
        clean[character] = [...new Set(choices)].slice(0, 32);
      }
    }
    return clean;
  }

  function setReadings(raw) {
    readingsMap = sanitizeReadingsObject(raw);
    readingLattices.clear();
  }

  async function ensureReadings(baseHref = (typeof location !== 'undefined' ? location.href : undefined)) {
    if (readingsMap) return readingsMap;
    if (readingsPromise) return readingsPromise;
    if (Date.now() < readingsRetryAt) return null;
    if (!fetchImpl) return null;

    readingsPromise = (async () => {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 8000) : 0;
      try {
        const url = baseHref ? new URL(readingsUrl, baseHref) : readingsUrl;
        const response = await fetchImpl(url, {
          ...(controller ? { signal: controller.signal } : {}),
          credentials: 'same-origin'
        });
        if (!response.ok) throw new Error('readings-http-' + response.status);
        const payload = await response.json();
        if (!payload?.readings || typeof payload.readings !== 'object') {
          throw new Error('readings-invalid');
        }
        setReadings(payload.readings);
        return readingsMap;
      } catch (error) {
        readingsRetryAt = Date.now() + 30000;
        console.warn('読み検索の補助データを読み込めませんでした。通常の文字検索は続けます。', error?.message || error);
        return null;
      } finally {
        if (timer) clearTimeout(timer);
        readingsPromise = null;
      }
    })();

    return readingsPromise;
  }

  function readingChoices(character, nextCharacter = '') {
    const readings = readingsMap?.[character];
    if (!readings) return [character];
    const result = [character, ...readings];
    // Restore stems before okurigana, e.g. 美(うつくしい)+しき -> うつく+しき
    if (/^[ぁ-ゖ]$/.test(nextCharacter)) {
      for (const reading of readings) {
        for (let i = Math.max(1, reading.length - 3); i < reading.length; i++) {
          if (reading[i] === nextCharacter) result.push(reading.slice(0, i));
        }
      }
    }
    return [...new Set(result)];
  }

  function getReadingLattice(text) {
    if (readingLattices.has(text)) return readingLattices.get(text);
    const chars = [...text];
    const lattice = chars.map((ch, idx) => readingChoices(ch, chars[idx + 1]));
    readingLattices.set(text, lattice);
    if (readingLattices.size > 1000) {
      readingLattices.delete(readingLattices.keys().next().value);
    }
    return lattice;
  }

  function queryReadingForms(token, rawRomajiHint = '') {
    const forms = new Set();

    // 1. Romaji -> hiragana expansion (works even before kanji readings load)
    if (rawRomajiHint && rawRomajiHint.length >= 2 && rawRomajiHint.length <= 40) {
      forms.add(rawRomajiHint);
    } else {
      const romajiKana = romajiToHiragana(token);
      if (romajiKana && romajiKana.length >= 2 && romajiKana.length <= 40) {
        forms.add(romajiKana);
      }
    }

    // 2. Kana or Kanji -> kana reading forms
    if (token.length <= 32) {
      const hasHan = /\p{Script=Han}/u.test(token);
      if (!hasHan) {
        // Pure kana / mixed non-Han token: useful for matching kanji titles via lattice
        if ([...token].length >= 2 && /[ぁ-ゖ]/.test(token)) {
          forms.add(token);
        }
      } else if (readingsMap) {
        let expanded = [''];
        const chars = [...token];
        let valid = true;
        for (let i = 0; i < chars.length; i++) {
          const choices = readingChoices(chars[i], chars[i + 1]).filter(val => !/\p{Script=Han}/u.test(val));
          if (!choices.length) {
            valid = false;
            break;
          }
          const next = [];
          for (const base of expanded) {
            for (const choice of choices) {
              next.push(base + choice);
            }
          }
          expanded = [...new Set(next)].slice(0, 32);
        }
        if (valid) {
          for (const form of expanded) {
            if (form.length >= 2 && form.length <= 40) forms.add(form);
          }
        }
      }
    }

    return [...forms].slice(0, 32);
  }

  function readingLatticeContains(lattice, pattern) {
    let compiled = readingPatterns.get(pattern);
    if (!compiled) {
      const chars = [...pattern];
      const wide = chars.length > 30;
      const masks = Object.create(null);
      chars.forEach((character, index) => {
        const bit = wide ? (1n << BigInt(index)) : (1 << index);
        masks[character] = (masks[character] || (wide ? 0n : 0)) | bit;
      });
      compiled = {
        masks,
        wide,
        last: wide ? (1n << BigInt(chars.length - 1)) : (1 << (chars.length - 1))
      };
      readingPatterns.set(pattern, compiled);
      if (readingPatterns.size > 160) {
        readingPatterns.delete(readingPatterns.keys().next().value);
      }
    }

    const { masks, wide, last } = compiled;
    if (wide) {
      let state = 0n;
      for (const choices of lattice) {
        let merged = 0n;
        for (const choice of choices) {
          let current = state;
          for (const ch of choice) {
            current = ((current << 1n) | 1n) & (masks[ch] || 0n);
            if (current & last) return true;
          }
          merged |= current;
        }
        state = merged;
      }
    } else {
      let state = 0;
      for (const choices of lattice) {
        let merged = 0;
        for (const choice of choices) {
          let current = state;
          for (const ch of choice) {
            current = ((current << 1) | 1) & (masks[ch] || 0);
            if (current & last) return true;
          }
          merged |= current;
        }
        state = merged;
      }
    }
    return false;
  }

  function phoneticMatch(text, forms) {
    if (!text || !forms.length) return false;
    const lattice = getReadingLattice(text);
    return forms.some(form => readingLatticeContains(lattice, form));
  }

  function getSearchDocument(video) {
    let entry = documentCache.get(video);
    const titleRaw = String(video?.title || '');
    const authorRaw = String(video?.uploaderName || '');
    const categoryRaw = String(video?.category || '');
    const descRaw = String(video?.desc || '').slice(0, 6000);
    if (
      !entry ||
      entry.titleRaw !== titleRaw ||
      entry.authorRaw !== authorRaw ||
      entry.categoryRaw !== categoryRaw ||
      entry.descRaw !== descRaw
    ) {
      const description = normalizeSearchText(descRaw);
      entry = {
        video,
        titleRaw,
        authorRaw,
        categoryRaw,
        descRaw,
        title: normalizeSearchText(titleRaw),
        author: normalizeSearchText(authorRaw),
        category: normalizeSearchText(categoryRaw),
        description,
        fuseDescription: description.slice(0, 1200)
      };
      documentCache.set(video, entry);
    }
    return entry;
  }

  function getFuseInstance(videos, threshold) {
    const FuseCtor = getFuseCtor();
    if (!FuseCtor || threshold < 0) return null;

    if (fuseSourceVideos !== videos || fuseSourceCtor !== FuseCtor) {
      fuseSourceVideos = videos;
      fuseSourceCtor = FuseCtor;
      fuseSourceDocs = videos.map(getSearchDocument);
      fuseInstances.clear();
    }

    let instance = fuseInstances.get(threshold);
    if (!instance) {
      instance = new FuseCtor(fuseSourceDocs, {
        keys: [
          { name: 'title', weight: 0.65 },
          { name: 'author', weight: 0.22 },
          { name: 'category', weight: 0.08 },
          { name: 'fuseDescription', weight: 0.05 }
        ],
        includeScore: true,
        ignoreLocation: true,
        threshold,
        minMatchCharLength: 3
      });
      fuseInstances.set(threshold, instance);
    }
    return instance;
  }

  function runFuzzyLookup(videos, token) {
    const threshold = dynamicFuseThreshold(token);
    if (threshold < 0) return { map: new Map(), threshold };
    const fuse = getFuseInstance(videos, threshold);
    if (!fuse) return { map: new Map(), threshold };

    const hits = fuse.search(token) || [];
    const map = new Map();
    for (const hit of hits) {
      const score = Number.isFinite(hit.score) ? hit.score : 1;
      // Strictly reject hits exceeding the dynamic threshold
      if (score <= threshold && hit.item?.video) {
        map.set(hit.item.video, score);
      }
    }
    return { map, threshold };
  }

  function evaluateVideo(video, parsed, tokenForms, fuzzyResults) {
    const entry = getSearchDocument(video);
    const { normalized, tokens } = parsed;
    const count = tokens.length;

    let titleHits = 0;
    let authorHits = 0;
    let categoryHits = 0;
    let descHits = 0;
    let readingHits = 0;
    let readingTitleHits = 0;
    let readingAuthorHits = 0;
    let readingCategoryHits = 0;
    let readingDescHits = 0;
    let fuseHits = 0;
    let fuseQualitySum = 0;
    let matchedCount = 0;
    let nonFuseMatchedCount = 0;
    let directHits = 0;
    let directHeaderHits = 0; // title | author | category
    let totalMatchedTokenLen = 0;

    for (let i = 0; i < count; i++) {
      const token = tokens[i];
      const forms = tokenForms[i];
      const inTitle = entry.title.includes(token);
      const inAuthor = entry.author.includes(token);
      const inCategory = entry.category.includes(token);
      const inDesc = entry.description.includes(token);

      if (inTitle) {
        titleHits++;
        totalMatchedTokenLen += token.length;
      }
      if (inAuthor) authorHits++;
      if (inCategory) categoryHits++;
      if (inDesc) descHits++;

      if (inTitle || inAuthor || inCategory) directHeaderHits++;

      if (inTitle || inAuthor || inCategory || inDesc) {
        directHits++;
        matchedCount++;
        nonFuseMatchedCount++;
        continue;
      }

      // Reading / Romaji match (kanji <-> kana <-> romaji)
      let matchedReading = false;
      if (forms.length) {
        if (phoneticMatch(entry.title.slice(0, 300), forms)) {
          readingTitleHits++;
          matchedReading = true;
        } else if (phoneticMatch(entry.author.slice(0, 200), forms)) {
          readingAuthorHits++;
          matchedReading = true;
        } else if (phoneticMatch(entry.category.slice(0, 100), forms)) {
          readingCategoryHits++;
          matchedReading = true;
        } else if (phoneticMatch(entry.description.slice(0, 600), forms)) {
          readingDescHits++;
          matchedReading = true;
        }
      }

      if (matchedReading) {
        readingHits++;
        matchedCount++;
        nonFuseMatchedCount++;
        continue;
      }

      // Fuse.js typo-tolerant fallback
      const fuzzy = fuzzyResults[i];
      if (fuzzy.map.has(video)) {
        const rawScore = fuzzy.map.get(video);
        const quality = Math.max(0, Math.min(1, 1 - rawScore / Math.max(0.01, fuzzy.threshold)));
        fuseHits++;
        fuseQualitySum += quality;
        matchedCount++;
      }
    }

    if (matchedCount === 0) return null;

    const allMatched = matchedCount === count;
    let tier = 0;
    let relevance = 0;

    if (allMatched) {
      // Tier 1: タイトル完全一致 (1700)
      if (entry.title === normalized) {
        tier = 1;
        relevance = 1700;
      }
      // Tier 2: タイトル前方一致 (1150..1280)
      else if (entry.title.startsWith(normalized)) {
        tier = 2;
        const ratio = normalized.length / Math.max(1, entry.title.length);
        relevance = 1150 + Math.round(130 * Math.min(1, ratio));
      }
      // Tier 3: タイトル全ワード一致 (760..870)
      else if (titleHits === count) {
        tier = 3;
        let bonus = 0;
        if (entry.title.includes(normalized)) bonus += 55;
        else if (tokensAppearInOrder(entry.title, tokens)) bonus += 25;
        const coverage = Math.min(1, totalMatchedTokenLen / Math.max(1, entry.title.length));
        bonus += Math.round(55 * coverage);
        relevance = 760 + Math.min(110, bonus);
      }
      // Tier 4: チャンネル名 / カテゴリ一致 (480..580)
      // All tokens matched directly without needing reading/description/fuse, and at least one is in author/category
      else if (directHeaderHits === count && (authorHits > 0 || categoryHits > 0)) {
        tier = 4;
        if (entry.author === normalized) {
          relevance = 580;
        } else if (entry.author.startsWith(normalized)) {
          relevance = 560;
        } else if (authorHits === count) {
          relevance = 535 + (entry.author.includes(normalized) ? 15 : 0);
        } else if (titleHits > 0 && authorHits > 0) {
          // Cross-field direct match (e.g., title keyword + channel name)
          relevance = 525 + Math.round(25 * (titleHits / count));
        } else if (entry.category === normalized) {
          relevance = 515;
        } else if (categoryHits === count) {
          relevance = 500;
        } else {
          // Title + category or author + category direct match
          relevance = 480 + Math.round(30 * ((titleHits + authorHits) / count));
        }
      }
      // Tier 5: 読み一致 (280..365)
      // At least one token matched via reading/romaji, and NO token required Fuse fallback
      else if (readingHits > 0 && fuseHits === 0) {
        tier = 5;
        // Prefer title reading hits, then author, category, description
        const weightedReading =
          (titleHits * 1.0 +
            readingTitleHits * 0.92 +
            authorHits * 0.78 +
            readingAuthorHits * 0.72 +
            categoryHits * 0.62 +
            readingCategoryHits * 0.56 +
            descHits * 0.35 +
            readingDescHits * 0.25) / count;
        relevance = 280 + Math.round(85 * Math.max(0, Math.min(1, weightedReading)));
      }
      // Tier 6: 説明文一致 (150..210)
      // All tokens matched directly (at least one in description, none in Fuse)
      else if (directHits === count && descHits > 0) {
        tier = 6;
        let bonus = 0;
        // Higher if some tokens also matched title/author/category
        bonus += Math.round(35 * (directHeaderHits / count));
        if (entry.description.includes(normalized)) bonus += 15;
        const firstIdx = entry.description.indexOf(tokens[0]);
        if (firstIdx >= 0 && firstIdx < 160) bonus += 10;
        relevance = 150 + Math.min(60, bonus);
      }
      // Tier 7: Fuse.js タイポ許容一致 (50..115)
      else if (fuseHits > 0) {
        tier = 7;
        const avgQuality = fuseQualitySum / fuseHits;
        const directSupport = (directHeaderHits + readingTitleHits) / count;
        relevance = 50 + Math.round(40 * avgQuality + 25 * Math.min(1, directSupport));
      }
    }

    return {
      video,
      entry,
      allMatched,
      matchedCount,
      nonFuseMatchedCount,
      directHeaderHits,
      titleHits,
      readingTitleHits,
      tier,
      relevance
    };
  }

  function scoreCandidates(videos, queryText, opts = {}) {
    const filter = typeof opts.filter === 'function' ? opts.filter : () => true;
    const getMetrics = typeof opts.getMetrics === 'function' ? opts.getMetrics : () => null;
    const now = Number.isFinite(opts.now) ? opts.now : Date.now();
    const indexVideos = Array.isArray(opts.indexVideos) ? opts.indexVideos : videos;

    const parsed = tokenizeSearchQuery(queryText);
    if (!parsed.normalized) {
      return videos.filter(filter).map(video => ({
        video,
        tier: 0,
        relevance: 0,
        boost: 0,
        finalScore: 0,
        andMatched: true
      }));
    }

    const tokenForms = parsed.tokens.map(token =>
      queryReadingForms(token, parsed.rawRomajiHints.get(token) || '')
    );
    const fuzzyResults = parsed.tokens.map(token => runFuzzyLookup(indexVideos, token));

    const exactAndHits = [];
    const partialCandidates = [];
    const minRelaxedMatches = parsed.tokens.length >= 3 ? Math.ceil(parsed.tokens.length * 0.65) : Infinity;

    for (const video of videos) {
      if (!filter(video)) continue;
      const evaluated = evaluateVideo(video, parsed, tokenForms, fuzzyResults);
      if (!evaluated) continue;

      if (evaluated.allMatched && evaluated.relevance > 0) {
        exactAndHits.push(evaluated);
      } else if (
        parsed.tokens.length >= 3 &&
        evaluated.nonFuseMatchedCount >= minRelaxedMatches
      ) {
        partialCandidates.push(evaluated);
      }
    }

    // Use relaxed partial matches ONLY when strict AND produces 0 hits
    let selected = exactAndHits;
    if (!selected.length && partialCandidates.length) {
      selected = partialCandidates.map(item => {
        const ratio = item.nonFuseMatchedCount / parsed.tokens.length;
        const headerRatio = (item.titleHits + item.directHeaderHits * 0.5 + item.readingTitleHits * 0.4) / parsed.tokens.length;
        // Strictly capped below RELEVANCE_BOOST_GATE so relaxed hits don't get engagement boost
        const relevance = Math.min(130, Math.round(55 + 45 * ratio + 30 * Math.min(1, headerRatio)));
        return { ...item, tier: 8, relevance };
      });
    }

    const scored = selected.map(item => {
      const metrics = getMetrics(item.video);
      const boost = item.relevance >= RELEVANCE_BOOST_GATE
        ? computeQualityFreshnessBoost(item.video, metrics, now)
        : 0;
      const finalScore = item.relevance * (1 + boost);
      return {
        video: item.video,
        tier: item.tier,
        relevance: item.relevance,
        boost,
        finalScore,
        andMatched: item.allMatched
      };
    });

    scored.sort((a, b) =>
      b.finalScore - a.finalScore ||
      b.relevance - a.relevance ||
      (Date.parse(b.video?.uploadedAt || '') || 0) - (Date.parse(a.video?.uploadedAt || '') || 0) ||
      getVideoId(a.video).localeCompare(getVideoId(b.video))
    );

    return scored;
  }

  function sortSearchResults(scoredItems, sortMode = 'relevance', getMetrics = () => null) {
    const items = [...scoredItems];
    if (sortMode === 'newest') {
      items.sort((a, b) =>
        (Date.parse(b.video?.uploadedAt || '') || 0) - (Date.parse(a.video?.uploadedAt || '') || 0) ||
        b.finalScore - a.finalScore ||
        getVideoId(a.video).localeCompare(getVideoId(b.video))
      );
      return items;
    }
    if (sortMode === 'views') {
      items.sort((a, b) => {
        const ma = getMetrics(a.video) || {};
        const mb = getMetrics(b.video) || {};
        const va = Math.max(0, Number(ma.views) || 0);
        const vb = Math.max(0, Number(mb.views) || 0);
        if (vb !== va) return vb - va;
        const la = Math.max(0, Number(ma.likes) || 0);
        const lb = Math.max(0, Number(mb.likes) || 0);
        if (lb !== la) return lb - la;
        return b.finalScore - a.finalScore ||
          (Date.parse(b.video?.uploadedAt || '') || 0) - (Date.parse(a.video?.uploadedAt || '') || 0) ||
          getVideoId(a.video).localeCompare(getVideoId(b.video));
      });
      return items;
    }
    // Default: 'relevance'
    items.sort((a, b) =>
      b.finalScore - a.finalScore ||
      b.relevance - a.relevance ||
      (Date.parse(b.video?.uploadedAt || '') || 0) - (Date.parse(a.video?.uploadedAt || '') || 0) ||
      getVideoId(a.video).localeCompare(getVideoId(b.video))
    );
    return items;
  }

  function searchVideos(videos, queryText, opts = {}) {
    const scored = scoreCandidates(videos, queryText, opts);
    const ordered = opts.sortMode ? sortSearchResults(scored, opts.sortMode, opts.getMetrics) : scored;
    return ordered.map(item => item.video);
  }

  function suggestVideos(videos, queryText, count = 7, opts = {}) {
    const seen = new Set();
    const ranked = searchVideos(videos, queryText, opts);
    const suggestions = [];
    for (const video of ranked) {
      const key = normalizeSearchText(video?.title || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      suggestions.push(video);
      if (suggestions.length >= count) break;
    }
    return suggestions;
  }

  return {
    normalizeSearchText,
    tokenizeSearchQuery,
    romajiToHiragana,
    dynamicFuseThreshold,
    computeQualityFreshnessBoost,
    ensureReadings,
    setReadings,
    hasReadings: () => Boolean(readingsMap),
    scoreCandidates,
    sortSearchResults,
    searchVideos,
    suggestVideos
  };
}
