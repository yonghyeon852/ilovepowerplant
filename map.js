// ============================================================
// 지도 (지형 + 도시)
//  - 전체 지도는 COLS x ROWS 칸. 화면에는 VIEW_COLS x VIEW_ROWS 칸만 보이고
//    미니맵이나 방향키로 보이는 영역(view)을 옮김
//  - 도시는 칸 묶음(tiles). 인구(만 명)를 가짐
// ============================================================

const COLS = 100;         // 전체 가로 칸 수
const ROWS = 72;          // 전체 세로 칸 수
const VIEW_COLS = 32;     // 화면에 보이는 가로 칸 수
const VIEW_ROWS = 24;     // 화면에 보이는 세로 칸 수
const TILE = 24;          // 칸 하나의 크기 (픽셀)
const MINI = 2;           // 미니맵에서 칸 하나의 크기 (픽셀)

const LAND  = 'land';
const RIVER = 'river';
const SEA   = 'sea';
const MOUNTAIN = 'mountain';   // 산: 태양광·풍력만 지을 수 있고, 도시는 반 칸으로 침
const MOUNTAIN_SHARE = 0.18;       // 땅 중 산의 비율 (후반에 태양광 부지가 모자라도록 넉넉히)
const MOUNTAIN_CITY_FACTOR = 0.5;  // 산 칸의 도시 수용력 (평지 대비)

const TERRAIN_COLORS = {
  [LAND]:  '#7cb342',
  [RIVER]: '#4fc3f7',
  [SEA]:   '#1565c0',
  [MOUNTAIN]: '#2e7d32',
};

// 우리나라 시(市) 이름 전체. 새 게임마다 섞어서 랜덤 순서로 씀 (도시 탭에서 이름 변경 가능)
const CITY_NAMES = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '수원', '성남', '고양', '용인', '부천', '안산', '안양', '남양주', '화성', '평택', '의정부', '시흥', '파주', '김포', '광명', '군포', '하남', '오산', '이천', '양주', '구리', '안성', '포천', '의왕', '여주', '동두천', '과천', '춘천', '원주', '강릉', '동해', '태백', '속초', '삼척', '청주', '충주', '제천', '천안', '공주', '보령', '아산', '서산', '논산', '계룡', '당진', '전주', '군산', '익산', '정읍', '남원', '김제', '목포', '여수', '순천', '나주', '광양', '포항', '경주', '김천', '안동', '구미', '영주', '영천', '상주', '문경', '경산', '창원', '진주', '통영', '사천', '김해', '밀양', '거제', '양산', '제주', '서귀포'];

// ---------- 난수 도우미 ----------
function randInt(n) { return Math.floor(Math.random() * n); }
function rand(a, b) { return a + Math.random() * (b - a); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ---------- 좌표 도우미 ----------
function isInside(col, row) {
  return col >= 0 && col < COLS && row >= 0 && row < ROWS;
}

function chebyshev(c1, r1, c2, r2) {
  return Math.max(Math.abs(c1 - c2), Math.abs(r1 - r2));
}

function tileKey(col, row) { return col + ',' + row; }

// 설비가 차지하는 칸 목록
function footprintCells(type, col, row) {
  const p = PLANTS[type];
  const cells = [];
  for (let dr = 0; dr < p.height; dr++) {
    for (let dc = 0; dc < p.width; dc++) {
      cells.push({ col: col + dc, row: row + dr });
    }
  }
  return cells;
}

// 칸 묶음이 특정 지형과 (8방향으로) 맞닿아 있는가
function footprintAdjacentTo(grid, cells, terrain) {
  for (const cell of cells) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = cell.col + dc, r = cell.row + dr;
        if (isInside(c, r) && grid[r][c] === terrain) return true;
      }
    }
  }
  return false;
}

// 칸 묶음이 지도 가장자리에 닿아 있는가
function footprintOnEdge(cells) {
  return cells.some((c) => c.col === 0 || c.col === COLS - 1 || c.row === 0 || c.row === ROWS - 1);
}

// ------------------------------------------------------------
// 지형 생성: 한쪽 변에 바다, 강 두 줄기
// ------------------------------------------------------------
function generateMap() {
  const grid = [];
  for (let r = 0; r < ROWS; r++) grid.push(new Array(COLS).fill(LAND));

  const side = ['top', 'bottom', 'left', 'right'][randInt(4)];
  const baseDepth = 6 + randInt(3);          // 6~8칸

  // 바다: 완만하게 굽이치는 해안선
  let depth = baseDepth;
  const len = (side === 'top' || side === 'bottom') ? COLS : ROWS;
  for (let i = 0; i < len; i++) {
    depth = clamp(depth + randInt(3) - 1, baseDepth - 2, baseDepth + 4);
    for (let d = 0; d < depth; d++) {
      if (side === 'top') grid[d][i] = SEA;
      else if (side === 'bottom') grid[ROWS - 1 - d][i] = SEA;
      else if (side === 'left') grid[i][d] = SEA;
      else grid[i][COLS - 1 - d] = SEA;
    }
  }

  // 강: 바다 반대편에서 출발해 바다까지 굽이치며 흘러감 (두 줄기)
  const riverStarts = (side === 'top' || side === 'bottom')
    ? [Math.floor(COLS * 0.3) + randInt(6), Math.floor(COLS * 0.65) + randInt(6)]
    : [Math.floor(ROWS * 0.3) + randInt(6), Math.floor(ROWS * 0.65) + randInt(6)];

  for (const s of riverStarts) {
    if (side === 'top' || side === 'bottom') {
      let c = s;
      const start = side === 'top' ? ROWS - 1 : 0;
      const step  = side === 'top' ? -1 : 1;
      for (let r = start; r >= 0 && r < ROWS; r += step) {
        if (grid[r][c] === SEA) break;
        grid[r][c] = RIVER;
        const next = clamp(c + randInt(3) - 1, 1, COLS - 2);
        if (next !== c && grid[r][next] !== SEA) grid[r][next] = RIVER;
        c = next;
      }
    } else {
      let r = s;
      const start = side === 'left' ? COLS - 1 : 0;
      const step  = side === 'left' ? -1 : 1;
      for (let c = start; c >= 0 && c < COLS; c += step) {
        if (grid[r][c] === SEA) break;
        grid[r][c] = RIVER;
        const next = clamp(r + randInt(3) - 1, 1, ROWS - 2);
        if (next !== r && grid[next][c] !== SEA) grid[next][c] = RIVER;
        r = next;
      }
    }
  }


  // ---------- 산: 큼직한 산악 지대 2~3개가 자리 잡음 (땅의 약 18%). 서로 멀리 떨어뜨리고, 가장자리는 울퉁불퉁하게 ----------
  {
    let landCount = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] === LAND) landCount++;
    const target = Math.round(landCount * MOUNTAIN_SHARE);
    const massCount = 2 + randInt(2);                 // 2~3개
    const centers = [];
    let guard = 0;
    while (centers.length < massCount && guard++ < 500) {
      const c = 10 + randInt(COLS - 20), r = 8 + randInt(ROWS - 16);
      if (grid[r][c] !== LAND) continue;
      if (centers.some((o) => Math.hypot(o.c - c, o.r - r) < 28)) continue;   // 산악 지대끼리 최소 28칸 거리
      centers.push({ c, r });
    }
    let placed = 0;
    const per = Math.round(target / Math.max(1, centers.length));
    for (const o of centers) {
      // 타원 크기: 넓이 ≈ per 칸. 가로세로 비율은 무작위 (1:1.6까지)
      const ratio = 0.8 + Math.random() * 0.8;
      const ry = Math.sqrt(per / (Math.PI * ratio)), rx = ry * ratio;
      const tilt = Math.random() * Math.PI;           // 회전
      const cosT = Math.cos(tilt), sinT = Math.sin(tilt);
      const bumps = [];                               // 가장자리를 울퉁불퉁하게 만드는 각도별 요철
      for (let i = 0; i < 12; i++) bumps.push(0.75 + Math.random() * 0.5);
      const R = Math.ceil(Math.max(rx, ry) * 1.4);
      for (let yy = -R; yy <= R; yy++) for (let xx = -R; xx <= R; xx++) {
        const rr = o.r + yy, cc = o.c + xx;
        if (rr < 1 || rr >= ROWS - 1 || cc < 1 || cc >= COLS - 1) continue;
        if (grid[rr][cc] !== LAND) continue;
        const ux = xx * cosT + yy * sinT, uy = -xx * sinT + yy * cosT;   // 회전 좌표
        const ang = Math.atan2(uy, ux);
        const k = Math.floor(((ang + Math.PI) / (2 * Math.PI)) * 12) % 12;
        const edge = bumps[k] * 0.85 + bumps[(k + 1) % 12] * 0.15;
        const d = (ux / rx) * (ux / rx) + (uy / ry) * (uy / ry);
        if (d <= edge * edge) { grid[rr][cc] = MOUNTAIN; placed++; }
      }
    }
  }

  return grid;
}

// 도시의 유효 칸 수: 산 칸은 반 칸으로 침 (산지 도시는 사람이 덜 살고 과밀도 빨리 옴)
function cityEffTiles(city, grid) {
  grid = grid || (typeof state !== 'undefined' && state ? state.grid : null);
  if (!grid) return city.tiles.length;
  return city.tiles.reduce((s, t) => s + ((grid[t.row] && grid[t.row][t.col]) === MOUNTAIN ? MOUNTAIN_CITY_FACTOR : 1), 0);
}
function cityDensity(city, grid) { return city.pop / Math.max(0.5, cityEffTiles(city, grid)); }

// ------------------------------------------------------------
// 도시: 칸 묶음. 씨앗 칸에서 주변 땅으로 자연스럽게 번져 나감
// ------------------------------------------------------------
function finalizeCity(city) {
  city.keys = new Set(city.tiles.map((t) => tileKey(t.col, t.row)));
  let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
  for (const t of city.tiles) {
    minC = Math.min(minC, t.col); maxC = Math.max(maxC, t.col);
    minR = Math.min(minR, t.row); maxR = Math.max(maxR, t.row);
  }
  city.bounds = { minC, maxC, minR, maxR };
  city.center = { col: Math.round((minC + maxC) / 2), row: Math.round((minR + maxR) / 2) };
  city.col = city.center.col;
  city.row = city.center.row;
  return city;
}

function restoreCity(city) {
  return finalizeCity(city);
}

// 칸 하나에서 도시까지의 거리 (체비쇼프). 도시 안이면 0
function distCellToCity(col, row, city) {
  if (city.keys && city.keys.has(tileKey(col, row))) return 0;
  let best = Infinity;
  for (const t of city.tiles) best = Math.min(best, chebyshev(col, row, t.col, t.row));
  return best;
}

// 설비에서 가장 가까운 도시까지의 거리 (칸 수). 도시 안에 있으면 0
function distToNearestCity(cities, type, col, row) {
  const cells = footprintCells(type, col, row);
  let best = Infinity;
  for (const city of cities) {
    for (const cell of cells) best = Math.min(best, distCellToCity(cell.col, cell.row, city));
  }
  return best === Infinity ? 0 : best;
}

function cityContaining(cities, col, row) {
  return cities.find((c) => c.keys && c.keys.has(tileKey(col, row))) || null;
}

// 씨앗에서 시작해 target칸이 될 때까지 땅으로만 번져 나감
function growCity(grid, cities, target, gap) {
  for (let tries = 0; tries < 300; tries++) {
    const sc = 3 + randInt(COLS - 6), sr = 3 + randInt(ROWS - 6);
    if (grid[sr][sc] !== LAND) continue;
    if (cities.some((ct) => distCellToCity(sc, sr, ct) < gap + 5)) continue;

    const tiles = [{ col: sc, row: sr }];
    const used = new Set([tileKey(sc, sr)]);

    while (tiles.length < target) {
      const cand = new Map();
      for (const t of tiles) {
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const c = t.col + dc, r = t.row + dr;
          const k = tileKey(c, r);
          if (used.has(k) || cand.has(k)) continue;
          if (c < 1 || c >= COLS - 1 || r < 1 || r >= ROWS - 1) continue;
          if (grid[r][c] !== LAND) continue;
          if (cities.some((ct) => distCellToCity(c, r, ct) < gap)) continue;
          let touch = 0;
          for (const [ddc, ddr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (used.has(tileKey(c + ddc, r + ddr))) touch++;
          cand.set(k, { col: c, row: r, w: touch * touch + 0.3 });
        }
      }
      if (cand.size === 0) break;
      const list = Array.from(cand.values());
      const total = list.reduce((s, x) => s + x.w, 0);
      let pick = Math.random() * total;
      let chosen = list[list.length - 1];
      for (const x of list) { pick -= x.w; if (pick <= 0) { chosen = x; break; } }
      tiles.push({ col: chosen.col, row: chosen.row });
      used.add(tileKey(chosen.col, chosen.row));
    }

    if (tiles.length >= target * 0.8) return tiles;
  }
  return null;
}

function makeCity(tiles, pop, name) {
  const city = { tiles, pop, name };
  return finalizeCity(city);
}

function generateCities(grid, count) {
  const cities = [];
  // 새 게임마다 도시 이름 순서를 섞음 (시작 도시도, 뒤에 세울 도시도 랜덤)
  for (let i = CITY_NAMES.length - 1; i > 0; i--) { const j = randInt(i + 1); [CITY_NAMES[i], CITY_NAMES[j]] = [CITY_NAMES[j], CITY_NAMES[i]]; }
  for (let i = 0; i < count; i++) {
    const tiles = growCity(grid, cities, ECON.cityTiles, 6) || growCity(grid, cities, ECON.cityTiles, 3);
    if (!tiles) break;
    cities.push(makeCity(tiles, 30 + randInt(31), CITY_NAMES[cities.length % CITY_NAMES.length]));   // 30~60만 명
  }
  return cities;
}

function nextCityName(cities) {
  const used = new Set(cities.map((c) => c.name));
  return CITY_NAMES.find((n) => !used.has(n)) || ('신도시 ' + (cities.length + 1));
}

// 칸 묶음이 상하좌우로 모두 이어져 있는가
function tilesConnected(keys) {
  if (keys.size === 0) return false;
  const start = keys.values().next().value;
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const [c, r] = queue.pop().split(',').map(Number);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = tileKey(c + dc, r + dr);
      if (keys.has(k) && !seen.has(k)) { seen.add(k); queue.push(k); }
    }
  }
  return seen.size === keys.size;
}

// ------------------------------------------------------------
// 그리기 (모두 지도 좌표 기준. 호출 쪽에서 view만큼 translate 해둠)
// ------------------------------------------------------------
function drawTerrain(ctx, grid, view) {
  const c0 = Math.max(0, Math.floor(view.col)), r0 = Math.max(0, Math.floor(view.row));
  const c1 = Math.min(COLS, Math.ceil(c0 + (view.cols || VIEW_COLS)) + 1), r1 = Math.min(ROWS, Math.ceil(r0 + (view.rows || VIEW_ROWS)) + 1);
  for (let r = r0; r < r1; r++) {
    for (let c = c0; c < c1; c++) {
      ctx.fillStyle = TERRAIN_COLORS[grid[r][c]];
      ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      if (grid[r][c] === LAND && (r + c) % 2 === 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      } else if (grid[r][c] === MOUNTAIN) {
        // 산 봉우리 표시
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath(); ctx.moveTo(c * TILE + 4, r * TILE + TILE - 5); ctx.lineTo(c * TILE + TILE / 2, r * TILE + 5); ctx.lineTo(c * TILE + TILE - 4, r * TILE + TILE - 5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.moveTo(c * TILE + TILE / 2 - 3, r * TILE + 9); ctx.lineTo(c * TILE + TILE / 2, r * TILE + 5); ctx.lineTo(c * TILE + TILE / 2 + 3, r * TILE + 9); ctx.closePath(); ctx.fill();
      }
    }
  }

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.lineWidth = 1;
  for (let c = c0; c <= c1; c++) {
    ctx.beginPath();
    ctx.moveTo(c * TILE + 0.5, r0 * TILE);
    ctx.lineTo(c * TILE + 0.5, r1 * TILE);
    ctx.stroke();
  }
  for (let r = r0; r <= r1; r++) {
    ctx.beginPath();
    ctx.moveTo(c0 * TILE, r * TILE + 0.5);
    ctx.lineTo(c1 * TILE, r * TILE + 0.5);
    ctx.stroke();
  }
}

function drawCities(ctx, cities) {
  for (const city of cities) {
    for (const t of city.tiles) {
      const x = t.col * TILE, y = t.row * TILE;
      const seed = (t.col * 7919 + t.row * 104729) % 97;

      ctx.fillStyle = '#8d8d8d';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#6f6f6f';
      ctx.fillRect(x, y, TILE, 3);
      ctx.fillRect(x, y, 3, TILE);

      const h1 = 8 + (seed % 9);
      const h2 = 6 + ((seed * 3) % 11);
      ctx.fillStyle = seed % 3 === 0 ? '#455a64' : seed % 3 === 1 ? '#546e7a' : '#607d8b';
      ctx.fillRect(x + 5, y + TILE - 3 - h1, 7, h1);
      ctx.fillStyle = seed % 2 === 0 ? '#37474f' : '#4e6a75';
      ctx.fillRect(x + 14, y + TILE - 3 - h2, 7, h2);
      ctx.fillStyle = '#ffe082';
      if (seed % 4 !== 0) ctx.fillRect(x + 7, y + TILE - 3 - h1 + 3, 2, 2);
      if (seed % 5 !== 0) ctx.fillRect(x + 16, y + TILE - 3 - h2 + 2, 2, 2);
    }

    // 경계선: 도시가 아닌 칸과 맞닿은 변만
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    for (const t of city.tiles) {
      const x = t.col * TILE, y = t.row * TILE;
      if (!city.keys.has(tileKey(t.col, t.row - 1))) { ctx.moveTo(x, y + 1);         ctx.lineTo(x + TILE, y + 1); }
      if (!city.keys.has(tileKey(t.col, t.row + 1))) { ctx.moveTo(x, y + TILE - 1);  ctx.lineTo(x + TILE, y + TILE - 1); }
      if (!city.keys.has(tileKey(t.col - 1, t.row))) { ctx.moveTo(x + 1, y);         ctx.lineTo(x + 1, y + TILE); }
      if (!city.keys.has(tileKey(t.col + 1, t.row))) { ctx.moveTo(x + TILE - 1, y);  ctx.lineTo(x + TILE - 1, y + TILE); }
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawCityLabels(ctx, cities) {
  for (const city of cities) {
    const b = city.bounds;
    const cx = (b.minC + b.maxC + 1) / 2 * TILE;
    const y = b.minR * TILE;
    const density = cityDensity(city);
    const crowded = density > ECON.densityLimit;
    const label = city.name + ' · ' + Math.round(city.pop) + '만' + (crowded ? ' ⚠과밀' : '');
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const w = ctx.measureText(label).width + 10;
    ctx.fillStyle = crowded ? 'rgba(120,30,30,0.85)' : 'rgba(0,0,0,0.7)';
    ctx.fillRect(cx - w / 2, Math.max(0, y - 15), w, 14);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, cx, Math.max(14, y - 1));
  }
}
