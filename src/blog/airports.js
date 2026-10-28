// 목적지 → 대표 공항 코드 (탑승권·전광판에 찍힌다). 한국 사람이 자주 가는 도시 위주.
// 키는 영문 소문자 또는 한글 이름. 공항이 여러 개인 도시는 GROUP에서 고를 수 있다 (작성 화면의 공항 칩).
// 목록에 없으면 사용자가 "다른 공항 직접 입력"으로 넣는다.
const A = {
  // 일본
  tokyo: 'NRT', 도쿄: 'NRT', osaka: 'KIX', 오사카: 'KIX', kyoto: 'KIX', 교토: 'KIX', nara: 'KIX', 나라: 'KIX', kobe: 'UKB', 고베: 'UKB',
  fukuoka: 'FUK', 후쿠오카: 'FUK', sapporo: 'CTS', 삿포로: 'CTS', otaru: 'CTS', 오타루: 'CTS', okinawa: 'OKA', 오키나와: 'OKA', naha: 'OKA', 나하: 'OKA',
  nagoya: 'NGO', 나고야: 'NGO', hiroshima: 'HIJ', 히로시마: 'HIJ', kagoshima: 'KOJ', 가고시마: 'KOJ', matsuyama: 'MYJ', 마쓰야마: 'MYJ', takamatsu: 'TAK', 다카마쓰: 'TAK',
  sendai: 'SDJ', 센다이: 'SDJ', kanazawa: 'KMQ', 가나자와: 'KMQ', nagasaki: 'NGS', 나가사키: 'NGS', kumamoto: 'KMJ', 구마모토: 'KMJ', oita: 'OIT', 오이타: 'OIT', beppu: 'OIT', 벳푸: 'OIT', yokohama: 'HND', 요코하마: 'HND',
  // 중화권
  taipei: 'TPE', 타이베이: 'TPE', kaohsiung: 'KHH', 가오슝: 'KHH', taichung: 'RMQ', 타이중: 'RMQ', 'hong kong': 'HKG', 홍콩: 'HKG', macau: 'MFM', 마카오: 'MFM',
  shanghai: 'PVG', 상하이: 'PVG', beijing: 'PEK', 베이징: 'PEK', qingdao: 'TAO', 칭다오: 'TAO', 'zhangjiajie': 'DYG', 장자제: 'DYG', 장가계: 'DYG', chengdu: 'TFU', 청두: 'TFU', xian: 'XIY', "xi'an": 'XIY', 시안: 'XIY',
  // 동남아
  bangkok: 'BKK', 방콕: 'BKK', 'chiang mai': 'CNX', 치앙마이: 'CNX', phuket: 'HKT', 푸껫: 'HKT', 푸켓: 'HKT', pattaya: 'BKK', 파타야: 'BKK', krabi: 'KBV', 끄라비: 'KBV',
  hanoi: 'HAN', 하노이: 'HAN', 'ho chi minh city': 'SGN', 호찌민: 'SGN', 호치민: 'SGN', 'da nang': 'DAD', danang: 'DAD', 다낭: 'DAD', hoian: 'DAD', 'hoi an': 'DAD', 호이안: 'DAD', nhatrang: 'CXR', 'nha trang': 'CXR', 나트랑: 'CXR', 냐짱: 'CXR', 'phu quoc': 'PQC', 푸꾸옥: 'PQC', dalat: 'DLI', 'da lat': 'DLI', 달랏: 'DLI',
  singapore: 'SIN', 싱가포르: 'SIN', 'kuala lumpur': 'KUL', 쿠알라룸푸르: 'KUL', 'kota kinabalu': 'BKI', 코타키나발루: 'BKI', penang: 'PEN', 페낭: 'PEN',
  bali: 'DPS', 발리: 'DPS', denpasar: 'DPS', jakarta: 'CGK', 자카르타: 'CGK', manila: 'MNL', 마닐라: 'MNL', cebu: 'CEB', 세부: 'CEB', boracay: 'MPH', 보라카이: 'MPH', bohol: 'TAG', 보홀: 'TAG',
  'luang prabang': 'LPQ', 루앙프라방: 'LPQ', vientiane: 'VTE', 비엔티안: 'VTE', 'siem reap': 'SAI', 시엠레아프: 'SAI', 'phnom penh': 'PNH', 프놈펜: 'PNH', ulaanbaatar: 'UBN', 울란바토르: 'UBN',
  // 미주·대양주
  'new york': 'JFK', 뉴욕: 'JFK', 'los angeles': 'LAX', 로스앤젤레스: 'LAX', 엘에이: 'LAX', 'san francisco': 'SFO', 샌프란시스코: 'SFO', seattle: 'SEA', 시애틀: 'SEA', 'las vegas': 'LAS', 라스베이거스: 'LAS',
  honolulu: 'HNL', 호놀룰루: 'HNL', hawaii: 'HNL', 하와이: 'HNL', guam: 'GUM', 괌: 'GUM', saipan: 'SPN', 사이판: 'SPN', chicago: 'ORD', 시카고: 'ORD', boston: 'BOS', 보스턴: 'BOS',
  vancouver: 'YVR', 밴쿠버: 'YVR', toronto: 'YYZ', 토론토: 'YYZ', 'mexico city': 'MEX', 멕시코시티: 'MEX', cancun: 'CUN', 칸쿤: 'CUN',
  sydney: 'SYD', 시드니: 'SYD', melbourne: 'MEL', 멜버른: 'MEL', brisbane: 'BNE', 브리즈번: 'BNE', auckland: 'AKL', 오클랜드: 'AKL', queenstown: 'ZQN', 퀸스타운: 'ZQN',
  // 유럽
  london: 'LHR', 런던: 'LHR', paris: 'CDG', 파리: 'CDG', rome: 'FCO', 로마: 'FCO', milan: 'MXP', 밀라노: 'MXP', venice: 'VCE', 베네치아: 'VCE', florence: 'FLR', 피렌체: 'FLR',
  barcelona: 'BCN', 바르셀로나: 'BCN', madrid: 'MAD', 마드리드: 'MAD', seville: 'SVQ', sevilla: 'SVQ', 세비야: 'SVQ', lisbon: 'LIS', lisboa: 'LIS', 리스본: 'LIS', porto: 'OPO', 포르투: 'OPO',
  amsterdam: 'AMS', 암스테르담: 'AMS', berlin: 'BER', 베를린: 'BER', munich: 'MUC', 뮌헨: 'MUC', frankfurt: 'FRA', 프랑크푸르트: 'FRA', vienna: 'VIE', 빈: 'VIE', prague: 'PRG', 프라하: 'PRG', budapest: 'BUD', 부다페스트: 'BUD',
  zurich: 'ZRH', 취리히: 'ZRH', interlaken: 'ZRH', 인터라켄: 'ZRH', athens: 'ATH', 아테네: 'ATH', santorini: 'JTR', 산토리니: 'JTR', istanbul: 'IST', 이스탄불: 'IST', dubrovnik: 'DBV', 두브로브니크: 'DBV',
  copenhagen: 'CPH', 코펜하겐: 'CPH', stockholm: 'ARN', 스톡홀름: 'ARN', oslo: 'OSL', 오슬로: 'OSL', helsinki: 'HEL', 헬싱키: 'HEL', reykjavik: 'KEF', 레이캬비크: 'KEF', edinburgh: 'EDI', 에든버러: 'EDI',
  // 그 밖
  dubai: 'DXB', 두바이: 'DXB', marrakech: 'RAK', 마라케시: 'RAK', cairo: 'CAI', 카이로: 'CAI', 'cape town': 'CPT', 케이프타운: 'CPT', kathmandu: 'KTM', 카트만두: 'KTM',
  // 국내
  jeju: 'CJU', 제주: 'CJU', 제주시: 'CJU', 서귀포: 'CJU', busan: 'PUS', 부산: 'PUS', gangneung: 'YNY', 강릉: 'YNY', 양양: 'YNY', yeosu: 'RSU', 여수: 'RSU', daegu: 'TAE', 대구: 'TAE', gwangju: 'KWJ', 광주: 'KWJ', ulsan: 'USN', 울산: 'USN', pohang: 'KPO', 포항: 'KPO',
};

// 공항이 여러 개인 도시: 대표 코드 → 고를 수 있는 공항들 (첫 번째가 기본)
const GROUP = {
  NRT: ['NRT', 'HND'], HND: ['HND', 'NRT'],
  KIX: ['KIX', 'ITM', 'UKB'], UKB: ['UKB', 'KIX', 'ITM'],
  TPE: ['TPE', 'TSA'], PVG: ['PVG', 'SHA'], PEK: ['PEK', 'PKX'],
  BKK: ['BKK', 'DMK'], CGK: ['CGK', 'HLP'],
  JFK: ['JFK', 'EWR', 'LGA'], LAX: ['LAX', 'BUR'], SFO: ['SFO', 'OAK', 'SJC'], ORD: ['ORD', 'MDW'], YYZ: ['YYZ', 'YTZ'], MEX: ['MEX', 'NLU'],
  LHR: ['LHR', 'LGW', 'STN', 'LTN', 'LCY'], CDG: ['CDG', 'ORY', 'BVA'], FCO: ['FCO', 'CIA'], MXP: ['MXP', 'LIN', 'BGY'], VCE: ['VCE', 'TSF'],
  ARN: ['ARN', 'BMA'], IST: ['IST', 'SAW'], DXB: ['DXB', 'DWC'],
};

/** 공항 이름 (칩에 같이 보여 준다) */
export const AIRPORT_NAME = {
  NRT: '나리타', HND: '하네다', KIX: '간사이', ITM: '이타미', UKB: '고베', TPE: '타오위안', TSA: '쑹산', PVG: '푸둥', SHA: '훙차오', PEK: '서우두', PKX: '다싱',
  BKK: '수완나품', DMK: '돈므앙', CGK: '수카르노하타', HLP: '할림', JFK: 'JFK', EWR: '뉴어크', LGA: '라과디아', LAX: 'LA 국제', BUR: '버뱅크', SFO: 'SF 국제', OAK: '오클랜드', SJC: '산호세',
  ORD: '오헤어', MDW: '미드웨이', YYZ: '피어슨', YTZ: '빌리 비숍', MEX: '베니토 후아레스', NLU: '펠리페 앙헬레스', LHR: '히스로', LGW: '개트윅', STN: '스탠스테드', LTN: '루턴', LCY: '런던 시티',
  CDG: '샤를드골', ORY: '오를리', BVA: '보베', FCO: '피우미치노', CIA: '참피노', MXP: '말펜사', LIN: '리나테', BGY: '베르가모', VCE: '마르코 폴로', TSF: '트레비소',
  ARN: '알란다', BMA: '브롬마', IST: '이스탄불', SAW: '사비하 괵첸', DXB: '두바이 국제', DWC: '알 막툼',
};

/** 고를 수 있는 공항들 (대표 공항이 먼저). 모르는 도시면 빈 목록 */
export function airportsFor(...names) {
  const main = iataFor(...names);
  if (!main) return [];
  return (GROUP[main] || [main]).map((code) => ({ code, name: AIRPORT_NAME[code] || '' }));
}

/** 이름(한글·영문) 몇 개 중 하나라도 맞으면 공항 코드 */
export function iataFor(...names) {
  for (const n of names) {
    if (!n) continue;
    const raw = String(n).trim().toLowerCase();
    if (A[raw]) return A[raw];
    const k = raw.replace(/(특별시|광역시|특별자치도|특별자치시|시|도)$/, '');
    if (A[k]) return A[k];
  }
  return '';
}
