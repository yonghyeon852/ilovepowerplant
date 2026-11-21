// ============================================================
// 발전 설비 정의 + 경제 상수 + 돌발 이벤트
//  단위: 용량 MW, 비용 억 원, 연료비·운영비 원/kWh, 탄소 t/MWh
// ============================================================

const PLANTS = {
  gasTurbine: {
    removed: true,   /* 복합발전 하나로 합침 (예전 저장본의 가스터빈은 그대로 돌아감) */
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
    capacity: 300, capex: 2400, buildMonths: 6,
    fuelCost: 115, co2: 0.37, omRate: 0.03, varOm: 5, lifeYears: 20,
    dispatchable: true, inertial: true, minLoad: 0, ramp: 0.7,   // 한 시간에 용량의 70%까지 변경 (가스터빈이 없어져 첨두 대응도 맡음)
    terrain: [LAND],
    traits: '빨리 짓고 출력 조절이 자유로움 · 연료비와 탄소세가 듦 · 가스에만 기대면 겨울과 가스값 급등에 약함',
    desc: '가스터빈과 증기터빈을 함께 돌리는 화력발전입니다. 6개월이면 짓고 출력을 자유롭게 조절하지만, 연료비와 탄소세가 듭니다. 복합발전 테크로 효율과 출력을 올리고 탄소를 포집할 수 있지만, 테크를 올려도 탄소는 국민의 기대 수준을 넘기 쉽습니다. 태양광·풍력·원자력 같은 무탄소 전원을 섞어야 공기 점수가 오릅니다. 또 가스 발전이 전체의 55%를 넘으면, 겨울에는 난방에 쓸 가스가 모자라서, 가스값이 뛸 때는 그 부담 때문에 민심이 깎입니다.',
  },
  coal: {
    name: '석탄화력', short: '석탄', kind: 'coal',
    width: 3, height: 2, color: '#546e7a',
    capacity: 500, capex: 4500, buildMonths: 10,
    fuelCost: 60, co2: 0.85, omRate: 0.04, varOm: 8, lifeYears: 25,
    dispatchable: true, inertial: true, minLoad: 0.4, ramp: 0.2,   // 한 시간에 용량의 20%까지 변경
    terrain: [LAND],
    traits: '연료가 싸고 꾸준함 · 탄소·매연이 가장 많음 · 출력 조절이 느림 (최소 40%)',
    desc: '싼 전기를 꾸준히 만들지만 탄소를 가장 많이 냅니다. 도시 가까이 지으면 매연 불만이 생기고, 출력을 40% 아래로 못 줄여 밤에 전기가 남을 수 있습니다. 도매가보다 싸게 정산돼 소비자 요금을 낮춥니다. 석탄화력 테크로 탄소와 매연을 줄이고 출력 조절을 빠르게 할 수 있습니다.',
  },
  nuclear: {
    name: '원자력', short: '원전', kind: 'nuclear',
    width: 3, height: 3, color: '#f06292',
    capacity: 1000, capex: 14000, buildMonths: 30,
    fuelCost: 25, co2: 0, omRate: 0.06, varOm: 30, lifeYears: 30,   // varOm에 폐기물·해체 충당금 포함
    dispatchable: true, inertial: true, minLoad: 1.0, mustRun: true,
    terrain: [LAND], needsSea: true, oppositionRange: 5, oppositionMult: 1.3,
    requiresTech: { tree: 'nuclear', level: 1 },
    traits: '탄소 0 · 싸고 꾸준함 · 바다 옆에만 · 공사 30개월 · 출력 조절 불가 · 많아지면 불안 · 테크 15단계',
    desc: '가장 싸고 깨끗한 전기를 꾸준히 만듭니다. 바다 옆에만 지을 수 있고 항상 100%로 돕니다. 출력을 줄일 수 없어서, 수요가 적은 밤에 전기가 남으면 그 처리 비용이 전기요금에 얹힙니다. 반대로 원전만으로 낮의 최대 수요를 못 채우면 정전이 납니다. 밤의 최소 수요만큼만 짓고 나머지는 복합발전·배터리·수출과 섞으세요. 도시 가까이 지으면 주민 반발로 건설비와 공사 기간이 늘고, 2기째부터는 원전 밀집 불안이 생깁니다(기당 −2.5, SMR보다 같은 전기당 불안이 훨씬 적음). 도매가보다 싸게 정산돼 소비자 요금을 낮춥니다. 원자력 테크 1단계가 있어야 지을 수 있습니다.',
  },
  smr: {
    name: 'SMR (소형모듈원전)', short: 'SMR', kind: 'nuclear',
    width: 2, height: 2, color: '#b0bec5',
    capacity: 300, capex: 5400, buildMonths: 12,
    fuelCost: 25, co2: 0, omRate: 0.06, varOm: 20, lifeYears: 30,
    dispatchable: true, inertial: true, minLoad: 1.0, mustRun: true,
    terrain: [LAND], needsSea: false, oppositionRange: 3, oppositionMult: 1.15,
    nuisance: { range: 3, per: 1, inside: 2 },
    requiresTech: { tree: 'nuclear', level: 2 },
    traits: '탄소 0 · 바다가 없어도 됨 · 작은 부지 · 공사 12개월 · 출력 조절 불가 · MW당 비쌈 · 기수가 늘면 불안이 빨리 커짐',
    desc: '공장에서 만들어 조립하는 작은 원전입니다. 바다가 없어도 되고 12개월이면 짓지만, 같은 전기를 내는 데 드는 건설비는 대형 원전보다 비쌉니다. 3기째부터 원전 밀집 불안이 기당 −1.5씩 쌓여, 많이 지을수록 안전 테크(원자력 8단계)나 대형 원전으로 옮겨 가야 합니다. 원자력 테크 2단계가 있어야 지을 수 있습니다.',
  },
  solar: {   // 재생에너지는 계통 통합 비용 공제(그 시간 재생 비중 × 40%)를 정산에서 뺀다
    name: '태양광', short: '태양광', kind: 'solar',
    width: 3, height: 3, color: '#1a237e',
    capacity: 100, capex: 1300, buildMonths: 3,      // 13억/MW: 국내 1MW급 태양광 실제 설치비(2025년 11~14억/MW) 기준
    fuelCost: 0, co2: 0, omRate: 0.015, varOm: 2, lifeYears: 25,
    dispatchable: false, inertial: false, renewable: 'solar',
    terrain: [LAND, MOUNTAIN],
    traits: '연료비·탄소 0 · 낮과 여름에 강함 (밤에는 0) · 땅을 많이 씀 · 도시 안에는 못 지음 · 산에 지으면 민심·탄소 손해',
    desc: '낮에만, 날씨에 따라 발전합니다. 연료비가 없고 빨리 짓지만 땅을 많이 쓰고 출력을 조절할 수 없습니다. 재생에너지가 한꺼번에 너무 많아지면 계통이 받아내지 못해 버려지니(주파수 안정도 한도), 배터리와 계통 테크가 함께 필요합니다. 밤과 겨울에 강한 풍력과 섞어 지어야 하루와 한 해가 고르게 채워집니다.',
  },
  wind: {
    name: '풍력', short: '풍력', kind: 'wind',
    width: 2, height: 2, color: '#a5d6a7',
    capacity: 100, capex: 2800, buildMonths: 6,      // 28억/MW. 해안·산에 지으면 같은 전기를 내는 값이 태양광과 비슷하고, 평지에서는 훨씬 비쌈 (봇 실험: 3,000이면 섞어 지을 이유가 없고 2,500이면 풍력만 지어도 됨)
    fuelCost: 0, co2: 0, omRate: 0.025, varOm: 4, lifeYears: 22,
    dispatchable: false, inertial: false, renewable: 'wind', coastalBonus: 0.4,
    terrain: [LAND, MOUNTAIN],
    traits: '연료비·탄소 0 · 밤과 겨울에 강함 (한낮과 여름에 약함) · 해안·산에서 잘 돎 · 도시 가까이면 소음 불만',
    desc: '바람이 불 때 발전합니다. 밤과 겨울에 세고 한낮과 여름에 약해 태양광과 반대라서, 둘을 섞으면 서로의 빈 시간을 메웁니다. 바다와 맞닿은 곳이나 산에 지으면 더 많이 나오고, 평지에서는 덜 나옵니다. 풍력 테크 5단계부터는 바다 위에도 지을 수 있습니다(땅을 안 쓰는 대신 유지비 2배).',
  },
  ess: {   /* 배터리: 어느 노선이든 쓰는 공통 설비 (계통 · 배터리 묶음). 발전 설비 바로 옆에만 지을 수 있음 */
    name: '배터리', short: '배터리', kind: 'ess',
    width: 2, height: 2, color: '#26c6da',
    capacity: 200, capex: 2200, buildMonths: 6,      // 27.5만원/kWh(4h): 2025년 ESS 중앙계약시장 배터리 20만원/kWh + 공사비
    energyHours: 4,          // 출력 대비 저장 시간 (200MW × 4h = 800MWh)
    fuelCost: 0, co2: 0, omRate: 0.02, varOm: 3, lifeYears: 15,
    dispatchable: true, inertial: false, minLoad: 0, isStorage: true,
    terrain: [LAND],
    traits: '남는 전기를 담았다가 모자랄 때 내보냄 · 4시간분 저장 · 발전 설비 바로 옆에만 지음 · 관성 없음',
    desc: '전기가 남는 시간(낮의 태양광, 밤의 원전·석탄)에 충전하고 모자란 시간(저녁)에 내보냅니다. 하루 동안 오르내리는 수요와 공급의 틈을 메워 정전과 버려지는 전기를 줄입니다. 발전 설비(건설 중 포함) 바로 옆 칸에 붙여 지어야 합니다. 태양광·풍력처럼 관성이 없어서, 이들과 합친 전기가 주파수 안정도 한도를 넘지 않는 만큼만 내보냅니다. 그래서 배터리만으로는 안 되고 복합발전 같은 터빈 발전기가 함께 돌아야 합니다. 계통 · 배터리 테크로 저장 시간, 출력, 건설비가 좋아집니다.',
  },
  interconnect: {
    name: '국제 연계선', short: '연계선', kind: 'link',
    width: 1, height: 1, color: '#ab47bc',
    capacity: 500, capex: 3000, buildMonths: 12,
    fuelCost: 0, co2: 0, omRate: 0.02, varOm: 0, lifeYears: 30,
    dispatchable: false, inertial: true, isLink: true,
    terrain: [LAND], edgeOnly: true,
    traits: '국경에 접한 칸 · 남는 전기를 수출 (돈 + 민심) · 모자라면 수입 · 수입은 수요의 30%까지',
    desc: '이웃 나라와 전력망을 잇습니다. 수출량이 그달 수요의 1%일 때마다 민심이 +0.5 오릅니다(최대 +5). 팔 수 있는 것은 남는 전기뿐이라, 원전이나 태양광·풍력을 넉넉히 지어야 수출이 생깁니다. 전기가 남으면 수출하고(110→50원, 이웃의 구매 의향을 채울수록 싸짐), 모자라면 수입해 정전을 막습니다(170→300원, 많이 기댈수록 비싸지고 그 값이 SMP가 됨). 이웃도 여름·겨울에는 여유가 적고, 수입은 그 시간 수요의 30%까지만 가능합니다.',
  },
};

// 왼쪽 카드에 보여줄 순서
const PALETTE_ORDER = ['gasTurbine', 'ccgt', 'coal', 'nuclear', 'smr', 'solar', 'wind', 'ess', 'interconnect'];

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
  solarMountainNuisance: 0.2, // 산지 태양광 1기당 매달 민심 −0.2 (산림 훼손, 상시)
  solarMountainBuildHit: 1.5, // 산지 태양광을 지을 때 한 번 민심 −1.5 (벌목 반발)
  solarMountainCap: 1.5,   // 산지 태양광 상시 벌점 월 상한
  perCapitaMW: 4.3,        // 인구 1만 명당 최대 수요 (MW). 시작 설비 500MW에 수요 ~500MW라 첫 달부터 지어야 함
  perCapitaGrowth: 0.015,  // 전력화(전기차·히트펌프·데이터센터)로 1인당 전력 수요가 연 1.5%씩 늘어남 → 인구가 안 늘어도 설비는 계속 더 필요
  popGrowth: 0.006,        // 기본 인구 증가율의 기준값 (월). 실제 기본 증가율은 아래 연간 곡선을 월로 바꾼 값 (earlyGrowthMult = 곡선 ÷ 이 값)
  // 기본 수요 증가 곡선(연): floor + boost × e^(−연차/tau). 시작 13%/년 → 4년차 7.4% → 8년차 4.5% → 12년차 3.1% → 20년차 1.9%
  //  초반은 빠르게 커져 계속 지어야 하고, 후반은 성숙기라 증가보다 노후 설비 교체·탄소 전환이 과제가 됨 (20년 총 수요 ×5~7배 목표)
  baseGrowthFloor: 0.015,
  baseGrowthBoost: 0.115,
  baseGrowthTau: 6,
  // 개발 초기 고성장: 시작 설비가 복합발전 1기 + 태양광 1 + 풍력 1이라 나라가 예전(복합발전 2기)의 절반 크기에서 출발함.
  //  처음 몇 해 동안 연 증가율에 startGrowthBoost·e^(−연차/startGrowthTau)를 더해(시작 +35%p → 2년 뒤 +13%p → 5년 뒤 +3%p, 누적 약 2배) 5년 차쯤 예전 규모를 따라잡게 함
  startGrowthBoost: 0.35,
  startGrowthTau: 2,
  econScaleBase: 2,         // 경제 규모 배율(건설 물가·사건 금액·유도 수요 상한)의 기준 = 시작 인구의 2배. 규모 보정이 예전과 같은 절대 크기에서 시작되게 함
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
  growthCap: 0.045,         // 한 달 인구 증가율 상한 (기본 + 민심 + 유도 합계). 기본 증가만으로는 1.3%쯤, 유도 수요가 붙으면 최대 6%
  startCities: 2,          // 시작 도시 수. 3곳 → 2곳 (한 곳이 1.5배 넓어 처음 인구·밀도는 그대로)
  landSaturationFrom: 5,   // 도시가 이 수를 넘으면 국토 포화로 유입 상한이 줄어듦 (시작 2곳 + 새 도시 3곳. 예전에는 시작 3곳 + 3곳 = 6)
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
  powerTax: 5,             // 세수: 국내 공급 전기 1kWh당 5원이 전력 부문 예산으로 들어옴 (수요를 키우고 잘 채울수록 커짐)
  boomGrowth: 0.15,        // 최근 1년 인구 증가율이 이 값을 넘고 정전이 없으면 경기 호황 민심 +1 (유도 수요로 빨리 클 때만)
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

  inertiaLimit: 0.7,       // 주파수 안정도 한도: 관성 없는 전기(태양광·풍력·배터리)가 그 시간 수요에서 차지할 수 있는 최대 비중. 넘는 태양광·풍력은 버려지고 배터리는 못 내보냄 (계통 테크로 상승)
  freqLossRatio: 0.1,      // 주파수 사고 시 그 시간 수요의 10% 정전
  // 남는 전기(과잉 발전)는 정전이 아니라 요금 부담: 남은 전기 1kWh마다 overPriceWon원이 소비자 요금에 얹힘 (남은 양이 그달 수요의 10%면 kWh당 +30원 → 민심 −6).
  //  전기가 남는 시간은 값도 싸게 쳐 주지 않음 (기대 요금 이상으로 침). 원전을 최대 수요만큼 지으면(남는 양 약 22%) 요금 만족 +10이 −4쯤으로 떨어짐
  overPriceWon: 300,
  freqRiskAtLimit: 0.03,   // 비관성 한도까지 채워 운전하는 시간대의 주파수 사고 확률

  lossPerTile: 0.015,      // 도시에서 1칸 멀어질 때마다 송전 손실 1.5% (계통 테크로 감소). 지도가 작아진 만큼 칸당 손실을 키워 "도시 가까이"의 값어치를 유지
  lossMax: 0.2,

  essEff: 0.85,            // ESS 왕복 효율 (테크로 상승)

  // 가스터빈 외기온 영향: 15℃ 기준으로 1℃당 0.6% 출력 변화
  isoTemp: 15,
  tempCoef: 0.006,
  tempDemandSummer: 0.01,  // 여름: 평년보다 1℃ 더울 때마다 수요 +1% (냉방)
  tempDemandWinter: 0.008, // 겨울: 평년보다 1℃ 추울 때마다 수요 +0.8% (난방)

  outageNoticeMonths: 6,   // 원전 정기검사 예고 기간 (개월)

  // 설비 수명 / 철거
  agingStart: 0.85,        // 수명의 85%부터 노후 (출력 감소)
  agingFactor: 0.9,
  demolishMonths: 2,
  demolishRefund: 0.05,    // 철거 완료 시 건설비의 5% 환급

  // 주민 민심 (0~100)
  happinessStart: 70,
  happyGrowthPivot: 68,    // 민심이 이 값이면 기본 증가율 그대로. 높으면 더 빨리, 낮으면 더 느리게 늘어남

  // ---------- 민심 ----------
  //  민심은 매달 "예상 민심"를 향해 moodPull 비율만큼 움직인다. 예상 민심 = moodBase + 아래 요인들의 합 (0~100).
  //  요인: 전력 안정 · 전기 요금 · 공기(탄소) · 경제 · 도시 과밀 · 기피 시설 · 원전 밀집 · 기술 · 연구 인력 · 정책 노선 · 요금 조정
  //  그달의 정전·주파수 사고는 목표와 별개로 민심을 바로 깎는다 (happinessBlackout 등)
  moodBase: 60,
  moodSoftFrom: 30, moodSoftFrom2: 25, moodSoftRate: 0.5,   // (재선 뒤에는 기준이 +25로 내려감: 2기에는 재선 공약을 지켜야 100에 닿음)
  //   // 요인 합이 +30(예상 민심 90)을 넘으면 넘는 부분은 절반만 반영: 고점은 모든 요인을 고르게 관리해야 닿음
  moodPull: 0.10,
  moodReliabMax: 10,        // 정전 기억이 없을 때 +10
  moodOutageDecay: 0.90,    // 정전 기억이 매달 10%씩 옅어짐
  moodOutagePerHour: 1.5,   // 기억에 남은 정전 1시간대당 −1.5
  moodReliabMin: -20,
  moodPriceRef0: 190,       // 국민이 기대하는 전기값(원/kWh): 시작 190원
  moodPriceRefDrop: 2.5,    //  해마다 2.5원씩 내려감 (20년 차 140원) → 싸게 만드는 기술·전원이 계속 필요
  moodPriceSlope: 0.2,      // 기대보다 1원 비쌀 때마다 −0.2
  moodPriceMax: 10,
  moodPriceFloorPerCap: 5,  // 요금 불만 하한 = −5 × 정책별 상한(자유화 3 · 기본 2 · 규제 1)
  moodCleanMax: 10,         // 무탄소에 가까울수록 최대 +10
  moodCleanPreMin: -8,      // (예전 값: 배출 기준이 생기기 전의 하한. 지금은 moodCleanExpMin을 씀)
  // 국민이 기대하는 탄소 수준(t/MWh): 처음 0.27에서 해마다 0.0085씩 내려가 14년 차부터 0.15. 복합발전(0.37)은 처음부터 이보다 높고,
  //  테크로 줄여도(끝까지 올리면 약 0.17) 기대가 함께 내려가 따라잡지 못함 → 화력만으로는 임기 내내 민심이 조금씩 깎이고(화력의 한계), 무탄소 전원을 섞어야 플러스가 됨
  //  원단위가 기대보다 낮으면 (기대 − 원단위) ÷ 기대 × moodCleanMax, 높으면 같은 식으로 음수 (하한 moodCleanExpMin). 법정 기준 초과는 따로 더 크게 깎임
  cleanExpectStart: 0.27, cleanExpectDrop: 0.0085, cleanExpectMin: 0.15,
  moodCleanExpMin: -6,
  // 가스 의존: 가스 발전 비중이 moodGasFree(55%)를 넘으면, 겨울(난방용 가스 부족)과 가스값 급등 때 민심이 깎임. moodGasFull(85%) 이상이면 온전히
  //  겨울 최대 −8 · 가스값이 평소의 1.2배를 넘으면 넘는 0.1배마다 −1(최대 −6) · 합쳐서 최대 −10 · 첫 1년은 없고 그 뒤 3년에 걸쳐 서서히 커져 4년 차 말부터 온전히
  //  (봇 실험: 40%부터 깎으면 섞어 지은 노선도 가스만 쓰는 쪽과 똑같이 깎여 구분이 안 됨 → 절반 넘게 가스에 기댈 때부터)
  moodGasFree: 0.55, moodGasFull: 0.85, moodGasWinter: 8, moodGasSpikeFrom: 1.2, moodGasSpikePer: 10, moodGasSpikeMax: 6, moodGasCap: 10, moodGasGraceYears: 1, moodGasRampYears: 3,
  moodCleanOverPerStep: 8,  // 기준을 0.08 t/MWh 넘을 때마다 −8 (유예 기간에 따라 최대 −8/−16/−24)
  moodEconSlope: 6,         // 인구 증가율이 그해 기본 증가율의 2배면 +6, 0이면 −6
  moodEconMin: -8, moodEconMax: 8,
  // 전력 수출: 수출량이 그달 수요의 1%일 때마다 민심 +0.5, 최대 +5 (수요의 10%). 남는 전기만 수출되므로 원전·재생에너지를 넉넉히 짓고 연계선을 뚫은 사람만 얻음
  moodExportPer: 0.5, moodExportMax: 5,
  moodCrowdPerStep: 2,      // 과밀 단계당 −2
  moodNuisanceMult: 1.5,    // 기피 시설 벌점 배수
  // 원전 밀집 불안: 기수가 늘수록 커짐. 친원전 노선이면 절반, 원자력 테크 8단계(피동 안전 계통)면 다시 절반
  //  (봇 실험: SMR 기당 −1 · 3기까지 무료일 때는 SMR 13기를 지어도 −1.6이라 관리할 것이 없었음 → SMR을 잔뜩 짓는 길은 안전 테크·대형 원전·입지를 챙겨야 하게 함)
  moodNukeFree: 1, moodNukePer: 2.5,   // 대형 원전(1,000MW)은 1기까지 괜찮고, 2기째부터 기당 −2.5
  moodSmrFree: 2, moodSmrPer: 1.5,     // SMR(300MW)은 2기까지 괜찮고, 그 뒤로 기당 −1.5 (같은 전기라면 대형 원전 쪽이 불안이 훨씬 적음)
  moodNukeCap: 15,
  // 국토 사용: 땅 위의 태양광·풍력이 국토(땅+산)의 moodLandFree%를 넘으면, 넘는 1%마다 −moodLandPerPct (재생에너지 중심 노선이면 절반). 바다 위 풍력은 세지 않음
  //   나라를 2,700칸 → 2,300칸으로 줄이면서, 같은 설비 수에서 벌점이 같도록 기준을 넓이 비율(0.85)만큼 옮김 (5% · 1.2 → 5.9% · 1.02)
  moodLandFree: 5.9, moodLandPerPct: 1.02, moodLandCap: 10,
  offshoreOmMult: 2,        // 바다 위 풍력은 고정 유지비 2배 (관리가 어려움)
  // 연구: "연구 수준"(10단계 눈금)을 국민의 기대(해마다 moodTechPerYear단계씩 오름, 최대 10)와 비교. 1단계 앞서면 +moodTechSlope, 뒤처지면 −
  //  노선을 골랐으면 내 노선 테크 2 : 계통 테크 1 (화력 = 복합발전·석탄 평균, 재생에너지 = 태양광·풍력 평균, 원자력 = 15단계를 10단계 눈금으로)
  //  중립이면 지금 쓰는 설비들의 테크 평균. 어느 쪽이든 그 테크의 설비 용량(건설 중 포함)이 최대 수요의 moodTechFullShare 이상이어야 온전히 셈
  moodTechPerYear: 0.4,
  moodTechSlope: 1.5,
  moodTechMin: -10, moodTechMax: 10,
  moodTechFullShare: 0.2,
  // 정책 공약: 지키면 민심 +moodPledgeKept(임기 끝까지), 기한을 넘기면 −moodPledgeBroken (늦게라도 지키면 벌점만 사라짐)
  moodPledgeKept: 2, moodPledgeBroken: 3,
  // 새 도시: 시작 도시 말고 새로 세운 도시 1곳마다 민심 +moodNewCityPer (주거 여유·건설 경기), 최대 +moodNewCityMax
  moodNewCityPer: 1, moodNewCityMax: 4,
  // 산지 태양광: 숲을 베어 낸 만큼 탄소 흡수가 줄어, 그 발전량 1MWh마다 이만큼(t)을 배출한 것으로 셈 (복합발전의 절반쯤)
  solarMountainCo2: 0.18,
  pledgeFreePriceRatio: 1.0,   // 시장 자유화 공약: 기한이 되는 해의 평균 체감 요금이 기대 요금의 이 배율 이하

  // 점수: 매달 민심만큼 쌓이고, 이 달 번호부터는 한 달이 scoreLateWeight배로 쳐짐
  scoreLateFrom: 120,
  scoreLateWeight: 2,
  // 재선: electionMonth개월(10년)을 채우는 달의 민심이 electionBar 이상이어야 임기를 이어 감. electionNotice개월 전에 예고
  electionMonth: 120,
  electionNotice: 24,
  electionBar: 50,
  // 전기요금 조정: 국민이 실제로 내는 요금을 도매값(SMP)에서 rate만큼 올리거나 내림.
  //  지원(−)이면 깎아 준 만큼 전력 판매 수입에서 나가고, 할증(+)이면 그만큼 더 들어옴.
  //  민심은 따로 오르내리지 않고 "전기 요금" 요인 하나로만 작용함: 체감 요금이 내려가면 요금 불만이 줄지만, 요금 만족 상한(+moodPriceMax)을 넘겨 주지는 못함
  //  → 손잡이로 고칠 수 있는 것은 요금뿐. 탄소·정전·기술·원전 반대는 돈으로 덮을 수 없고, 전기값이 이미 싼 나라는 지원해도 얻는 게 거의 없음
  tariff: {
    '-2': { name: '요금 20% 지원', rate: -0.20 },
    '-1': { name: '요금 10% 지원', rate: -0.10 },
    '0':  { name: '표준 요금', rate: 0 },
    '1':  { name: '요금 10% 할증', rate: 0.10 },
    '2':  { name: '요금 20% 할증', rate: 0.20 },
  },
  tariffLockMonths: 6,     // 한 번 바꾸면 이 기간 동안 못 바꿈
  tariffFromMonth: 24,     // 3년 차부터 쓸 수 있음 (초반 2년은 플랜트만으로 버텨야 함)
  happyGrowthSlope: 0.01,  // 민심 1점당 증가율 배수 변화
  happinessGameOver: 0,    // 민심이 0이 되면 탄핵
  // 원전 중대 사고: 원전·SMR 1기가 1년 안에 사고를 낼 확률 0.0001% (게임 안에서는 설명하지 않고, 일어나면 사건으로 알림)
  nukeAccidentPerYear: 0.000001,
  nukeAccidentRadius: 2,   // 발전소 둘레 2칸까지 접근 금지 (대형 원전이면 7×7칸 = 지도 그림 nuclear-accident-ground.png의 크기)
  nukeAccidentHit: 60,     // 그달 민심 −60 (친원전 노선이면 1.5배)
  nukeAccidentMood: 30,    // 그 뒤 임기 끝까지 민심 −30
  // 안정 공급 회복: 민심 구간별로 줄어듦 (70 미만 +2, 70~89 +1, 90 이상 0). 90대는 싼 전기·호황·목표 보상 같은 성과가 있어야 올라감
  happinessRecovery: 2,
  happinessLowBar: 70,
  happinessRecoveryMid: 1,
  happinessHighBar: 90,      // 민심이 이 값 이상이면 회복 보너스가 happinessRecoveryHigh로 줄어듦
  happinessRecoveryHigh: 0,
  happinessExpectAt: 95,     // 민심이 이 값 이상이면 '높아진 기대치'로 매달 −happinessExpectPenalty (회복 +1보다 커서 100은 저절로 유지되지 않음)
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
  intensityStep: 0.08,     // 초과 0.08 t/MWh마다 민심 −1 (조금 넘는 건 −1, 석탄·가스만 쓰면 −2~−3)
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
  densityStep: 0.5,        // 초과 0.5만/칸마다 민심 −1
  densityCap: 4,           // 도시 하나의 과밀 벌점 월 상한
  densityTotalCap: 6,      // 모든 도시 과밀 벌점 합계 월 상한
  migrationRate: 0.03,     // 과밀 도시에서 매달 빠져나가는 인구 비율
  foundCityCost: 1000,     // 새 도시 조성 비용 (억)
  cityCostStep: 0.25,      // 새 도시를 하나 세울 때마다 다음 조성비 +25% (땅이 귀해짐 · 돈이 남아돌 때 도시 남발 방지)
  // 점수의 경제 항목 = 성장(인구 배수, 로그 눈금: growthScoreMin배 0점 → growthScoreMax배 50점) + 교역(순수출 수입 ÷ 발전 수입이 tradeShareFull이면 50점)
  growthScoreMin: 2.5,
  growthScoreMax: 10,
  tradeShareFull: 0.06,     // 임기 수출 전력량이 국내 소비의 6%면 교역 50점
  carbonRecentWeight: 0.7,  // 탄소 점수: 최근 3년 원단위 70% + 기간 평균 30% (늦게라도 깨끗하게 끝내면 만회 가능)
  cityNewcomers: 0.15,     // 새 도시를 세우면 수용량(과밀 기준 × 칸 수)의 이 비율만큼 신규 인구가 밖에서 들어옴
  cityNewcomerFadeFrom: 4, // 도시가 이 수를 넘은 뒤 세우는 도시부터 신규 유입이 줄어듦 (6번째 도시까지는 그대로)
  cityNewcomerFade: 0.15,  // 넘는 도시 하나당 신규 유입 −15%
  cityNewcomerMin: 0.25,   // 신규 유입 최소 배수

  loanRate: 0.01,
  bankruptAt: -3000,
};

// ---------- 돌발 이벤트 ----------
const EVENTS = [
  { id: 'heatwave',  name: '폭염',        seasons: ['summer'], demandMult: 1.15, tempDelta: 5,
    desc: '냉방 수요가 급증해 수요가 15% 늘고, 기온이 올라 복합발전 출력이 줄어듭니다.' },
  { id: 'coldwave',  name: '한파',        seasons: ['winter'], demandMult: 1.15, tempDelta: -6,
    desc: '난방 수요가 급증해 수요가 15% 늘어납니다. 기온이 낮아 복합발전 출력은 오릅니다.' },
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
