// Stable codes for places, illnesses and age groups in the research and DHIS2 exports.
// - sehat id: the id the app sends (content/src/districts.json). Never renamed or reused, so it is always a stable key.
// - pcode: Afghanistan's official administrative code (the NSIA/AGCHO numbering used by OCHA's COD-AB "AF" p-codes and by
//   the HMIS), filled in ONLY where it has been checked: Samangan province = 20 (AF20), Aybak district = 2001 (AF2001).
//   The other districts and provinces are left empty until the HMIS team or NSIA list confirms them; add them here (and their
//   source) rather than guessing. Aybak city and the Aybak villages are both inside district 2001.
// - DHIS2: Afghanistan's HMIS runs on DHIS2. The export names data elements, org units and age categories by code
//   (import with dataElementIdScheme=CODE, orgUnitIdScheme=CODE, categoryOptionComboIdScheme=CODE), or by the HMIS's own
//   UIDs when the owner sets DHIS2_MAP in wrangler.toml [vars], e.g.
//   DHIS2_MAP = '{"dataElements":{"measles":"uid..."},"orgUnits":{"aybak":"uid..."},"ages":{"u5":"uid..."}}'
export const CODES_VERSION = '2026-10-08.1';
export const PCODES = {
  'aybak-city': { pcode: 'AF2001', province: 'AF20', note: 'Aybak city, inside Aybak district (2001)' },
  aybak: { pcode: 'AF2001', province: 'AF20', note: 'Aybak district outside the city, inside district 2001' },
  'dara-i-suf-payin': { pcode: '', province: 'AF20' },
  'dara-i-suf-bala': { pcode: '', province: 'AF20' },
  'feroz-nakhchir': { pcode: '', province: 'AF20' },
  'hazrat-i-sultan': { pcode: '', province: 'AF20' },
  'khuram-wa-sarbagh': { pcode: '', province: 'AF20' },
  'ruyi-du-ab': { pcode: '', province: 'AF20' },
};
export const PCODE_SOURCE = 'Province 20 Samangan and district 2001 Aybak: NSIA/CSO administrative numbering as listed by citypopulation.de (checked 8 October 2026). Others: not yet confirmed.';
export const pcodeOf = (id) => (PCODES[id] && PCODES[id].pcode) || '';
export const provinceCodeOf = (id) => (PCODES[id] && PCODES[id].province) || '';

const up = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
export const AGE_CODE = { u5: 'SEHAT_AGE_U5', '5-14': 'SEHAT_AGE_5_14', '15+': 'SEHAT_AGE_15P' };
function map(env) {
  try { const m = JSON.parse(env && env.DHIS2_MAP ? String(env.DHIS2_MAP) : '{}'); return m && typeof m === 'object' ? m : {}; } catch { return {}; }
}
// how each Sehat value is named in the DHIS2 file
export function dhis2Names(env) {
  const m = map(env), de = m.dataElements || {}, ou = m.orgUnits || {}, ag = m.ages || {};
  return {
    custom: !!(m.dataElements || m.orgUnits || m.ages),
    dataElement: (syndrome) => de[syndrome] || 'SEHAT_' + up(syndrome) + '_SUSP',
    // places that share a pcode share one org unit (Aybak city + villages = Aybak district)
    orgUnit: (place) => ou[place] || pcodeOf(place) || 'SEHAT_' + up(place),
    age: (age) => ag[age] || AGE_CODE[age] || 'SEHAT_AGE_' + up(age),
  };
}
// ISO week "2026-W41" in DHIS2's weekly period form "2026W41"
export const dhis2Period = (week) => String(week).replace('-W', 'W');
