// ============================================================
// 발전 설비 정의 + 경제 상수 + 돌발 이벤트
//  단위: 용량 MW, 비용 억 원, 연료비·운영비 원/kWh, 탄소 t/MWh
// ============================================================

const PLANTS = {
  gasTurbine: {
    name: '가스터빈', short: 'GT', kind: 'gt',
    width: 2, height: 1, color: '#ff9800',
    capacity: 200, capex: 1200, buildMonths: 4,
    fuelCost: 170, co2: 0.55, omRate: 0.03, varOm: 6, lifeYears: 15,
    dispatchable: true, inertial: true, minLoad: 0, ramp: 1.0,   // 한 시간에 출력 100% 변경 가능
    terrain: [LAND],
    upgradeTo: 'ccgt', upgradeCost: 1000, upgradeMonths: 6,
    traits: '빠른 건설 · 즉시 출력 조절(램프 100%/h) · 연료비 높음 · 외기온 영향',
    desc: '가스를 태워 터빈을 돌립니다. 출력을 자유롭게 조절할 수 있어 첨두 대응에 좋지만 연료비가 비쌉니다. 외기온이 높으면 출력이 줄고 낮으면 늘어납니다. 하부 사이클을 붙여 복합발전으로 업그레이드할 수 있습니다.',
  },
  ccgt: {
    name: '복합발전', short: 'CC', kind: 'ccgt',
    width: 2, height: 1, color: '#f4511e',
    capacity: 300, capex: 2400, buildMonths: 8,
    fuelCost: 115, co2: 0.37, omRate: 0.03, varOm: 5, lifeYears: 20,
    dispatchable: true, inertial: true, minLoad: 0, ramp: 0.5,   // 한 시간에 용량의 50%까지 변경
    terrain: [LAND],
    traits: '출력 조절 램프 50%/h · 가스터빈보다 효율 높음 · 외기온 영향',
    desc: '가스터빈의 배기열로 증기터빈을 한 번 더 돌립니다. 같은 자리에서 더 많은 전기를 더 싸게 만들고 탄소도 덜 나옵니다. 테크트리에서 2P, 3P, 3P Reheat 구조로 출력을 높일 수 있습니다.',
  },
  coal: {
    name: '석탄화력', short: '석탄', kind: 'coal',
    width: 3, height: 2, color: '#546e7a',
    capacity: 500, capex: 4500, buildMonths: 10,
    fuelCost: 60, co2: 0.85, omRate: 0.04, varOm: 8, lifeYears: 25,
    dispatchable: true, inertial: true, minLoad: 0.4, ramp: 0.2,   // 한 시간에 용량의 20%까지 변경
    terrain: [LAND],
    traits: '건설비 최저(9억/MW) · 빠른 공사 · 연료비 낮고 가격 안정 · 탄소·매연 큼 · 최소 출력 40%',
    desc: '값싼 전기를 대량으로 만들지만 탄소를 가장 많이 배출합니다. 기저 전원이라 정산조정계수(SMP의 75%)가 적용됩니다. 도시 가까이 지으면 매연 때문에 주민 행복도가 떨어집니다. 출력을 40% 아래로 줄일 수 없어 밤에 전기가 남을 수 있습니다. 테크트리로 IGCC, CCS를 붙이면 탄소가 크게 줍니다.',
  },
  nuclear: {
    name: '원자력', short: '원전', kind: 'nuclear',
    width: 3, height: 3, color: '#f06292',
    capacity: 1000, capex: 20000, buildMonths: 30,
    fuelCost: 25, co2: 0, omRate: 0.06, varOm: 30, lifeYears: 30,   // varOm에 폐기물·해체 충당금 포함
    dispatchable: true, inertial: true, minLoad: 1.0, mustRun: true,
    terrain: [LAND], needsSea: true, oppositionRange: 5, oppositionMult: 1.3,
    requiresTech: { tree: 'nuclear', level: 1 },
    traits: 'MW당 가장 싼 무탄소 기저(20억/MW) · 바다 옆 · 30개월 · 출력 조절 불가 · 주민 반발',
    desc: '가장 싸고 깨끗한 기저 전원입니다. 냉각수 때문에 바다 옆에만 지을 수 있고, 항상 100%로만 돌아갑니다. 도시에서 5칸 이내에 지으면 주민 반발로 건설비가 30% 오르고 공사도 6개월 길어집니다. 정산조정계수 때문에 원전 전력은 SMP의 75%(시장 자유화 85%, 요금 규제 65%)로 정산됩니다. 연료비에는 폐기물·해체 충당금이 포함됩니다. 테크트리 "안전성 강화 설계"를 먼저 개발해야 지을 수 있습니다.',
  },
  smr: {
    name: 'SMR (소형모듈원전)', short: 'SMR', kind: 'nuclear',
    width: 2, height: 2, color: '#b0bec5',
    capacity: 300, capex: 9000, buildMonths: 12,
    fuelCost: 25, co2: 0, omRate: 0.06, varOm: 20, lifeYears: 30,
    dispatchable: true, inertial: true, minLoad: 1.0, mustRun: true,
    terrain: [LAND], needsSea: false, oppositionRange: 3, oppositionMult: 1.15,
    nuisance: { range: 3, per: 1, inside: 2 },
    requiresTech: { tree: 'nuclear', level: 2 },
    traits: '탄소 0 · 바다 불필요 · 작은 부지 · 12개월 공사 · 출력 조절 불가 · MW당 30억',
    desc: '공장에서 모듈로 만들어 조립하는 소형 원전입니다. 바다가 없어도 지을 수 있고 부지가 작으며 12개월이면 지어집니다(양산 테크 후 8개월). 대형 원전처럼 항상 100%로만 돌아가고, MW당 건설비와 유지비는 대형 원전보다 비쌉니다. 테크트리 "SMR 개발"이 필요합니다.',
  },
  solar: {   // 재생에너지는 계통 통합 비용 공제(그 시간 재생 비중 × 40%)를 정산에서 뺀다
    name: '태양광', short: '태양광', kind: 'solar',
    width: 3, height: 3, color: '#1a237e',
    capacity: 100, capex: 1300, buildMonths: 3,      // 13억/MW: 국내 1MW급 태양광 실제 설치비(2025년 11~14억/MW) 기준
    fuelCost: 0, co2: 0, omRate: 0.015, varOm: 2, lifeYears: 25,
    dispatchable: false, inertial: false, renewable: 'solar',
    terrain: [LAND, MOUNTAIN],
    traits: '연료비 0 · 탄소 0 · 낮에만 발전 · 넓은 부지 · 산에 지으면 행복도 −',
    desc: '낮에만, 날씨에 따라 발전합니다. 연료비가 없고 보조금(REC)을 받지만 재생 비중이 높은 시간에는 계통 통합 비용(비중 × 40%)이 정산에서 빠지고, 넓은 땅이 필요하고 출력을 조절할 수 없습니다. 비중이 너무 높으면 계통 주파수가 불안해집니다.',
  },
  wind: {
    name: '풍력', short: '풍력', kind: 'wind',
    width: 2, height: 2, color: '#a5d6a7',
    capacity: 100, capex: 3000, buildMonths: 6,      // 30억/MW: 국내 육상풍력 수준 (해상은 58억이지만 해안 보너스로 갈음)
    fuelCost: 0, co2: 0, omRate: 0.025, varOm: 4, lifeYears: 22,
    dispatchable: false, inertial: false, renewable: 'wind', coastalBonus: 0.4,
    terrain: [LAND, MOUNTAIN],
    traits: '연료비 0 · 탄소 0 · 바람 따라 변동 · 해안·산 보너스 · 평지 페널티',
    desc: '바람이 불 때만 발전합니다. 바다와 맞닿은 곳에 지으면 발전량이 늘어납니다. 재생 비중이 높은 시간에는 계통 통합 비용(비중 × 40%)이 정산에서 빠집니다. 출력을 조절할 수 없고 비관성 전원입니다. 테크트리 "부유식 해상풍력"을 개발하면 바다 위에도 지을 수 있습니다.',
  },
  ess: {
    name: '에너지저장장치 (ESS)', short: 'ESS', kind: 'ess',
    width: 2, height: 2, color: '#26c6da',
    capacity: 200, capex: 2200, buildMonths: 6,      // 27.5만원/kWh(4h): 2025년 ESS 중앙계약시장 배터리 20만원/kWh + 공사비
    energyHours: 4,          // 출력 대비 저장 시간 (200MW × 4h = 800MWh)
    fuelCost: 0, co2: 0, omRate: 0.02, varOm: 3, lifeYears: 15,
    dispatchable: true, inertial: false, minLoad: 0, isStorage: true,
    terrain: [LAND],
    traits: '남는 전기 충전 · 부족할 때 방전 · 출력 제한 줄임 · 관성 없음 · 효율 85%',
    desc: '배터리에 전기를 담아 두는 설비입니다. 낮에 남아서 버려질 재생에너지나 밤의 원전·석탄 잉여를 충전하고, 저녁 피크처럼 모자란 시간에 방전합니다. 덕커브 대응의 핵심입니다. 다만 회전체가 없어 관성은 제공하지 않으므로 방전 전력도 비관성으로 계산됩니다. 테크트리 "에너지 저장"으로 저장 시간·효율·수명을 늘릴 수 있습니다.',
  },
  cracker: {
    name: '암모니아 크래킹 설비', short: '크래킹', kind: 'h2',
    width: 2, height: 2, color: '#7e57c2',
    capacity: 200, capex: 2000, buildMonths: 8,      // capacity = 이 설비의 수소로 돌릴 수 있는 가스터빈·복합 출력 (MW분)
    elecLoad: 20,                                     // 크래킹에 드는 전력 (MW). 잉여 전기가 있으면 그걸로, 없으면 계통에서
    fuelCost: 0, co2: 0, omRate: 0.03, varOm: 0, lifeYears: 25,
    dispatchable: false, inertial: false, isH2: true,
    terrain: [LAND],
    requiresTech: { tree: 'h2crack', level: 1 },
    traits: '수입 암모니아 → 수소 · 터빈 200MW분 연료 · 전력 20MW 소비 · 남는 수소는 수출',
    desc: '수입한 암모니아를 분해해 수소를 만듭니다. 한 기가 만드는 수소는 가스터빈·복합발전 200MW를 계속 돌릴 만큼이며, 수소 터빈 테크가 있으면 가스 발전이 자동으로 이 수소를 먼저 태웁니다(그만큼 탄소 0). 암모니아 값이 가스보다 비싸 수소로 돌리는 시간의 전기값(SMP)은 오릅니다. 크래킹에 드는 전력은 잉여 전기가 있으면 그것을 쓰고, 없으면 계통에서 끌어옵니다. 쓰고 남은 수소는 작은 마진으로 수출됩니다.',
  },
  interconnect: {
    name: '국제 연계선', short: '연계선', kind: 'link',
    width: 1, height: 1, color: '#ab47bc',
    capacity: 500, capex: 3000, buildMonths: 12,
    fuelCost: 0, co2: 0, omRate: 0.02, varOm: 0, lifeYears: 30,
    dispatchable: false, inertial: true, isLink: true,
    terrain: [LAND], edgeOnly: true,
    traits: '지도 가장자리 · 개수 제한 없음 · 수출은 이웃 나라 구매 의향까지 · 수입은 수요의 30%까지',
    desc: '이웃 나라와 전력망을 잇습니다. 전기가 남으면 수출하고(110→50원, 이웃의 구매 의향을 채울수록 싸짐), 모자라면 수입해 정전을 막습니다(170→300원, 많이 기댈수록 비싸지고 그 값이 SMP가 됨). 이웃도 여름·겨울에는 여유가 적고, 수입은 그 시간 수요의 30%까지만 가능합니다.',
  },
};

// 왼쪽 카드에 보여줄 순서
const PALETTE_ORDER = ['gasTurbine', 'ccgt', 'coal', 'nuclear', 'smr', 'solar', 'wind', 'ess', 'cracker', 'interconnect'];

// ---------- 경제 / 계통 상수 ----------
const ECON = {
  startYear: new Date().getFullYear(),   // 시작 시점 = 게임을 시작하는 오늘
  startMonth: new Date().getMonth() + 1,
  normalYears: 20,         // 일반 모드 임기 (년)
  startMoney: 5000,        // 억 원
  overhead: 25,            // 회사 운영비 억/월 (고정)
  daysPerMonth: 30,

  startReserve: 1.06,      // 시작 시 조절 설비 = 가장 수요 큰 계절 최대 수요 × 1.06 → 첫 해 안에 첫 설비를 지어야 함 (가스터빈 4개월)
  windMountainBonus: 0.30, // 풍력을 산에 지으면 출력 +30% (바람이 셈)
  windPlainPenalty: 0.20,  // 풍력을 해안도 산도 아닌 평지에 지으면 출력 −20%
  solarMountainNuisance: 0.2, // 산지 태양광 1기당 매달 행복도 −0.2 (산림 훼손, 상시)
  solarMountainBuildHit: 1.5, // 산지 태양광을 지을 때 한 번 행복도 −1.5 (벌목 반발)
  solarMountainCap: 1.5,   // 산지 태양광 상시 벌점 월 상한
  perCapitaMW: 4.3,        // 인구 1만 명당 최대 수요 (MW). 시작 설비 500MW에 수요 ~500MW라 첫 달부터 지어야 함
  perCapitaGrowth: 0.015,  // 전력화(전기차·히트펌프·데이터센터)로 1인당 전력 수요가 연 1.5%씩 늘어남 → 인구가 안 늘어도 설비는 계속 더 필요
  popGrowth: 0.006,        // 기본 인구 증가율의 기준값 (월). 실제 기본 증가율은 아래 연간 곡선을 월로 바꾼 값 (earlyGrowthMult = 곡선 ÷ 이 값)
  // 기본 수요 증가 곡선(연): floor + boost × e^(−연차/tau). 시작 13%/년 → 4년차 7.4% → 8년차 4.5% → 12년차 3.1% → 20년차 1.9%
  //  초반은 빠르게 커져 계속 지어야 하고, 후반은 성숙기라 증가보다 노후 설비 교체·탄소 전환이 과제가 됨 (20년 총 수요 ×5~7배 목표)
  baseGrowthFloor: 0.015,
  baseGrowthBoost: 0.115,
  baseGrowthTau: 6,
  // 유도 수요: 설비 여유율(공급 능력 ÷ 최대 수요)이 inducedReserve를 넘으면 초과분 × inducedRate 만큼 인구가 더 늘어남(월, 최대 inducedMax).
  //  여유율이 shortageBelow 아래면 기본 증가의 shortageDamp 만큼 유입이 줄어듦
  //  → 핵심 압박 장치: 여유가 20%를 넘으면 초과 여유의 10%씩 매달 수요가 따라붙음 (여유 50%면 +3%/월, 최대 3.5%). 설비를 크게 앞서 지어도 몇 달이면 수요가 채움
  inducedReserve: 1.20,
  inducedRate: 0.10,
  inducedMax: 0.02,
  inducedYears: 6,          // 유도 유입 상한이 이 연차까지 직선으로 내려감 (6년 뒤 inducedLateMin 배 = 월 0.2%)
  inducedLateMin: 0.07,     // 후반 유도 유입 최대 월 0.14%: 성숙기에는 과잉 건설이 수요를 크게 못 끌어옴
  growthCapLate: 0.005,     // 후반 월 증가율 상한 (growthCapYears 뒤): 연 6% (+1인당 전력화 1.5%)
  growthCapYears: 12,
  growthCap: 0.045,         // 한 달 인구 증가율 상한 (기본 + 행복도 + 유도 합계). 기본 증가만으로는 1.3%쯤, 유도 수요가 붙으면 최대 6%
  landSaturationFrom: 6,   // 도시가 이 수를 넘으면 국토 포화로 유입 상한이 줄어듦
  landSaturationPerCity: 0.10,
  shortageBelow: 1.0,
  shortageDamp: 0.5,
  solarAvgCf: 0.18,        // 여유율 계산에 쓰는 태양광 평균 출력 비율
  windAvgCf: 0.32,         // 여유율 계산에 쓰는 풍력 평균 출력 비율

  // 건설 물가: 경제 규모(시작 대비 최대 수요 배수)가 costIndexFrom배를 넘으면, 넘는 배수의 costIndexPower 제곱만큼 건설비·고정 유지비가 오름
  //  (땅값·인건비·자재비). 수요가 커질수록 수입도 커지므로, 후반에 돈이 남아돌지 않고 끝까지 투자 순서를 고민하게 하는 장치
  costIndexFrom: 3,
  costIndexPower: 0.7,
  smpMarkup: 1.30,         // SMP = 한계 발전기 원가 × 마진
  // 수소: 수입 암모니아 크래킹 → 가스 발전 연료(수소 터빈 테크) / 남는 수소는 수출
  h2KgPerMWh: 50,          // 가스터빈·복합 발전 1MWh를 대신하는 데 드는 수소 (kg). 복합 효율 60% 기준
  nh3CostPerKgH2: 3400,    // 수소 1kg을 뽑는 데 드는 수입 암모니아 값 (원). 50kg/MWh면 터빈 연료비 170원/kWh (가스 115~170원보다 비싸지만 탄소 0)
  h2ExportMargin: 0.08,    // 남는 수소 수출 마진 (암모니아 원가 대비)
  h2MarketShare: 0.3,      // 수소 수출 시장 한도: 이웃 나라가 그 시간 전력 수요의 30%를 수소 발전으로 돌릴 만큼만 마진을 주고 사 줌. 넘는 양은 원가에 넘김(이익 0)
  powerTax: 5,             // 세수: 국내 공급 전기 1kWh당 5원이 전력 부문 예산으로 들어옴 (수요를 키우고 잘 채울수록 커짐)
  boomGrowth: 0.15,        // 최근 1년 인구 증가율이 이 값을 넘고 정전이 없으면 경기 호황 행복도 +1 (유도 수요로 빨리 클 때만)
  baseloadSettle: 0.75,    // 정산조정계수: 원전·SMR·석탄은 SMP의 이 비율로 정산 (기저 전원 초과 이윤 환수)
  renewIntegration: 0.4,   // 재생에너지 계통 통합 비용 공제: 그 시간 재생 비중 × 이 값만큼 정산에서 뺌 (비중 100%면 −40%)
  smpRefWeight: 0.5,       // 가격 산정 시 표준 원가(테크 미반영) 비중. 나머지는 내 실제 원가
  refCostDecline: 0.015,   // 업계 표준 원가가 매년 이만큼 개선됨 (연구 안 하면 뒤처짐)
  smpFloor: 40,            // 원/kWh
  smpCap: 250,             // 원/kWh (가격 상한, 탄소세가 오르면 함께 상승)
  smpCapCarbon: 0.6,       // 탄소세 1,000원/t 상승당 상한 +0.6원
  voll: 600,               // 정전 보상 원/kWh (미공급 전력)
  clawRoi: 0.12,           // 초과 이윤 환수 기준: 최근 1년 이익 ÷ 투자 자본이 이 값(연 12%)을 넘으면 넘는 비율만큼 국내 정산 수입을 환수
  capacityPayment: 0.15,   // 용량 요금 억/MW/월 (조절 가능 설비)
  capacityReserveCap: 1.15, // 용량 요금은 최대 수요의 이 배수까지만 지급 (예비력 과잉은 보상 없음)
  rec: 20,                 // 재생에너지 보조금 원/kWh (시작 시점)
  recYears: 10,            // 이 기간에 걸쳐 보조금이 0으로 줄어듦
  exportPriceMax: 110,     // 수출 단가 원/kWh (연계선 비었을 때)
  exportPriceMin: 50,      // 수출 단가 원/kWh (연계선 꽉 찼을 때)
  importPriceMin: 170,     // 수입 단가 원/kWh (이용률 0%)
  importPriceMax: 300,     // 수입 단가 원/kWh (이용률 100%)
  importShareLimit: 0.3,   // 그 시간 수요의 30%까지만 수입 가능 (계통 안정성 규제)
  // 이웃 나라: 자체 수요가 있고, 그 수요의 일부만 우리 전기를 사 줌 (연계선 개수는 제한 없음)
  neighborDemandRatio: 1.0,   // 시작 시 이웃 나라 최대 수요 = 우리 최대 수요 × 이 값
  neighborGrowth: 0.04,       // 이웃 나라 수요 연 증가율 (우리보다 느려서 갈수록 상대적으로 작아짐)
  neighborMinRatio: 0.5,      // 이웃 나라 최대수요는 우리 최대수요의 이 비율 아래로는 안 내려감 (수출 시장 유지)
  neighborImportShare: 1.0,   // 이웃 나라는 자기 수요만큼까지 수입함 (우리 수출 상한 = 그 시간 이웃 수요)
  linkAvailMid: [0.8, 1.0],    // 봄·가을 이웃 나라 여유 비율 범위
  linkAvailPeak: [0.6, 0.85],  // 여름·겨울 이웃 나라 여유 비율 범위
  overGenCost: 50,         // 과잉 발전 안정화 비용 원/kWh

  carbonTaxStart: 20000,   // 원/톤
  carbonTaxGrowth: 0.10,   // 매년 인상률
  carbonTaxMax: 120000,    // 탄소세 상한 원/톤

  inertiaLimit: 0.7,       // 비관성 비중이 이 값을 넘으면 주파수 사고 (테크로 상승)
  freqLossRatio: 0.1,      // 주파수 사고 시 그 시간 수요의 10% 정전
  freqRiskAtLimit: 0.03,   // 비관성 한도까지 채워 운전하는 시간대의 주파수 사고 확률

  lossPerTile: 0.01,       // 도시에서 1칸 멀어질 때마다 송전 손실 (테크로 감소)
  lossMax: 0.2,

  essEff: 0.85,            // ESS 왕복 효율 (테크로 상승)

  // 가스터빈 외기온 영향: 15℃ 기준으로 1℃당 0.6% 출력 변화
  isoTemp: 15,
  tempCoef: 0.006,

  outageNoticeMonths: 6,   // 원전 정기검사 예고 기간 (개월)

  // 설비 수명 / 철거
  agingStart: 0.85,        // 수명의 85%부터 노후 (출력 감소)
  agingFactor: 0.9,
  demolishMonths: 2,
  demolishRefund: 0.05,    // 철거 완료 시 건설비의 5% 환급

  // 주민 행복도 (0~100)
  happinessStart: 70,
  happyGrowthPivot: 75,    // 행복도가 이 값이면 기본 증가율 그대로. 100이면 1.25배, 50이면 0.75배, 25면 0.5배
  happyGrowthSlope: 0.01,  // 행복도 1점당 증가율 배수 변화
  happinessGameOver: 15,
  // 안정 공급 회복: 행복도 구간별로 줄어듦 (70 미만 +2, 70~89 +1, 90 이상 0). 90대는 싼 전기·호황·목표 보상 같은 성과가 있어야 올라감
  happinessRecovery: 2,
  happinessLowBar: 70,
  happinessRecoveryMid: 1,
  happinessHighBar: 90,      // 행복도가 이 값 이상이면 회복 보너스가 happinessRecoveryHigh로 줄어듦
  happinessRecoveryHigh: 0,
  happinessExpectAt: 95,     // 행복도가 이 값 이상이면 '높아진 기대치'로 매달 −happinessExpectPenalty (회복 +1보다 커서 100은 저절로 유지되지 않음)
  happinessExpectPenalty: 3,
  happinessRecoveryMinor: 1,
  happinessMinorBlackout: 4,
  happinessBlackoutCap: 8,
  happinessFreqCap: 4,
  happinessBlackout: 0.5,
  happinessFreq: 0.5,
  nuisance: {              // 기피 시설: 도시 안이면 inside, 도시에서 range 칸 이내면 per 만큼 매달 감소
    nuclear: { range: 6, per: 2, inside: 4 },
    wind:    { range: 3, per: 0.5, inside: 1 },
    coal:    { range: 4, per: 1, inside: 3 },
  },
  // 탄소 배출 기준 (발전량당 t/MWh): 시작 연차부터 매년 낮아지고, 넘기면 국민 불만
  intensityStartYear: 6,
  intensityStart: 0.40,
  intensityEnd: 0.20,      // 20년차 기준 0.20 t/MWh (복합발전 0.37 기준 절반쯤을 무탄소로 채우면 통과). 0.15는 재생 60% 전략도 막판에 탄핵돼 완화
  intensityEndYear: 20,
  intensityStep: 0.08,     // 초과 0.08 t/MWh마다 행복도 −1 (조금 넘는 건 −1, 석탄·가스만 쓰면 −2~−3)
  intensityCap: 3,
  co2Threshold: 400000,
  co2Step: 300000,
  co2Cap: 4,               // 탄소 배출 과다 벌점 월 상한
  smpThreshold: 200,
  smpCheap: 120,
  smpStep: 50,
  smpPenaltyCap: 2,

  // 도시
  cityTiles: 80,           // 새 도시 칸 수 (크게 잡아 새 도시를 자주 세우지 않아도 되게)
  cityGap: 3,              // 도시 사이 최소 빈 칸
  densityLimit: 2.5,       // 칸당 인구(만 명)가 이 값을 넘으면 과밀
  densityStep: 0.5,        // 초과 0.5만/칸마다 행복도 −1
  densityCap: 4,           // 도시 하나의 과밀 벌점 월 상한
  densityTotalCap: 6,      // 모든 도시 과밀 벌점 합계 월 상한
  migrationRate: 0.03,     // 과밀 도시에서 매달 빠져나가는 인구 비율
  foundCityCost: 1000,     // 새 도시 조성 비용 (억)
  cityCostStep: 0.25,      // 4번째 도시부터 도시 하나당 조성비 +25% (땅이 귀해짐 · 돈이 남아돌 때 도시 남발 방지)
  // 국정 운영 점수의 경제 항목 = 성장(인구 배수, 로그 눈금: growthScoreMin배 0점 → growthScoreMax배 50점) + 교역(순수출 수입 ÷ 발전 수입이 tradeShareFull이면 50점)
  growthScoreMin: 2.5,
  growthScoreMax: 10,
  tradeShareFull: 0.06,     // 임기 수출 전력량이 국내 소비의 6%면 교역 50점
  carbonRecentWeight: 0.7,  // 탄소 점수: 최근 3년 원단위 70% + 기간 평균 30% (늦게라도 깨끗하게 끝내면 만회 가능)
  cityNewcomers: 0.15,     // 새 도시를 세우면 수용량(과밀 기준 × 칸 수)의 이 비율만큼 신규 인구가 밖에서 들어옴
  cityNewcomerFadeFrom: 5, // 도시가 이 수를 넘은 뒤 세우는 도시부터 신규 유입이 줄어듦 (6번째 도시까지는 그대로)
  cityNewcomerFade: 0.15,  // 넘는 도시 하나당 신규 유입 −15%
  cityNewcomerMin: 0.25,   // 신규 유입 최소 배수

  loanRate: 0.01,
  bankruptAt: -3000,
  netZeroYears: 20,
  netZeroStreak: 12,
  netZeroCut: 0.8,         // 첫해 월평균 배출 대비 이만큼 줄인 상태를 유지해야 달성
};

// ---------- 돌발 이벤트 ----------
const EVENTS = [
  { id: 'heatwave',  name: '폭염',        seasons: ['summer'], demandMult: 1.15, tempDelta: 5,
    desc: '냉방 수요가 급증해 수요가 15% 늘고, 기온이 올라 가스터빈 출력이 줄어듭니다.' },
  { id: 'coldwave',  name: '한파',        seasons: ['winter'], demandMult: 1.15, tempDelta: -6,
    desc: '난방 수요가 급증해 수요가 15% 늘어납니다. 기온이 낮아 가스터빈 출력은 오릅니다.' },
  { id: 'gasSpike',  name: 'LNG 가격 급등', gasMult: 1.6,
    desc: '국제 가스 가격이 치솟아 이번 달 가스 연료비가 60% 오릅니다.' },
  { id: 'monsoon',   name: '장마',        seasons: ['summer'], solarMult: 0.5,
    desc: '긴 장마로 이번 달 태양광 발전량이 절반으로 줄어듭니다.' },
  { id: 'typhoon',   name: '태풍',        seasons: ['summer', 'mid'], windMult: 0, solarMult: 0.4, demandMult: 0.95,
    desc: '태풍이 지나가는 동안 풍력은 안전을 위해 전부 정지하고 태양광도 40%로 떨어집니다. 수요는 5% 줄어듭니다.' },
  { id: 'industry',  name: '산업단지 유치', effect: 'popBoost', weight: 0.6,
    desc: '대형 산업단지가 들어서 모든 도시 인구가 2% 늘어났습니다.' },
  { id: 'protest',   name: '원전 반대 시위', effect: 'delayNuclear', requires: 'nuclearBuilding',
    desc: '주민 시위로 건설 중인 원전 공사가 2개월 지연됩니다.' },
  { id: 'carbonUp',  name: '탄소세 인상',  effect: 'carbonUp', weight: 0.25,
    desc: '정부가 탄소세를 10% 인상했습니다. (영구 적용)' },
  { id: 'outage', name: '원전 정기검사 예고', effect: 'nuclearOutage', requires: 'nuclearOnline', weight: 0.8,
    desc: '6개월 뒤 원전 한 기가 정기검사로 한 달 동안 멈춥니다. 그때까지 대체 설비를 준비하세요.' },
  { id: 'breakthrough', name: '연구 성과', effect: 'rdBoost',
    desc: '연구진이 학회에서 주목받아 이번 달 테크 연구 성공 확률이 15% 오릅니다.', techBonus: 0.15 },
];
