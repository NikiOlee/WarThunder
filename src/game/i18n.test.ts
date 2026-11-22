import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_CARDS,
  DICTIONARIES,
  TANKS_LOCALIZED,
  MODES_LOCALIZED,
  MAPS_LOCALIZED,
  t,
  getLanguage,
  setLanguage,
  getTankText,
  getModeText,
  getMapText,
  getHitCamResult,
  SupportedLanguage,
} from './i18n';
import { getAllTanks, MAUS_SPEC } from './tanks';
import { GAME_MODES } from './modes';
import {
  DEFAULTS,
  resetSettings,
  setSetting,
  settings,
  keyName,
  getKeyLabels,
} from './settings';

test('i18n supports exactly ru, sr, and en', () => {
  assert.deepEqual(SUPPORTED_LANGUAGES, ['ru', 'sr', 'en']);
  assert.equal(LANGUAGE_CARDS.length, 3);
});

test('LANGUAGE_CARDS has invariant titles for all 3 options', () => {
  const ruCard = LANGUAGE_CARDS.find((c) => c.id === 'ru');
  const srCard = LANGUAGE_CARDS.find((c) => c.id === 'sr');
  const enCard = LANGUAGE_CARDS.find((c) => c.id === 'en');

  assert.ok(ruCard && srCard && enCard);
  assert.equal(ruCard.label, 'Русский (Россия)');
  assert.equal(srCard.label, 'Srpski (latinica) (Srbija)');
  assert.equal(enCard.label, 'English (USA)');
  assert.equal(ruCard.htmlLang, 'ru');
  assert.equal(srCard.htmlLang, 'sr-Latn');
  assert.equal(enCard.htmlLang, 'en');
});

test('Invariant terms are identical across all language dictionaries', () => {
  for (const lang of SUPPORTED_LANGUAGES) {
    const dict = DICTIONARIES[lang];
    // Brand title must never be altered
    assert.equal(dict.brandTitle, 'IRON & SKY', `brandTitle in ${lang} must be IRON & SKY`);
    // Language button must always be invariant «Язык/Language/Jezik»
    assert.equal(dict.btnLanguage, 'Язык/Language/Jezik', `btnLanguage in ${lang} must be Язык/Language/Jezik`);
  }
});

test('Dictionary completeness: all keys in ru exist in sr and en with non-empty strings', () => {
  const ruKeys = Object.keys(DICTIONARIES.ru);
  const srKeys = new Set(Object.keys(DICTIONARIES.sr));
  const enKeys = new Set(Object.keys(DICTIONARIES.en));

  const missingInSr = ruKeys.filter((k) => !srKeys.has(k) || DICTIONARIES.sr[k].trim() === '');
  const missingInEn = ruKeys.filter((k) => !enKeys.has(k) || DICTIONARIES.en[k].trim() === '');

  assert.deepEqual(missingInSr, [], `Missing or empty keys in Serbian dictionary: ${missingInSr.join(', ')}`);
  assert.deepEqual(missingInEn, [], `Missing or empty keys in English dictionary: ${missingInEn.join(', ')}`);
  assert.equal(srKeys.size, ruKeys.length, 'Serbian dictionary should match key count of Russian');
  assert.equal(enKeys.size, ruKeys.length, 'English dictionary should match key count of Russian');
});

test('t() translates strings and handles parameter interpolation', () => {
  // Direct translation
  assert.equal(t('btnPlay', undefined, 'ru'), 'ИГРАТЬ');
  assert.equal(t('btnPlay', undefined, 'sr'), 'IGRAJ');
  assert.equal(t('btnPlay', undefined, 'en'), 'PLAY');

  // Fallback to key if unknown
  assert.equal(t('non_existent_key_xyz', undefined, 'ru'), 'non_existent_key_xyz');

  // Variable interpolation
  const lineRu = t('mapline', { mode: 'TDM', map: 'Desert', tank: 'T-55' }, 'ru');
  assert.equal(lineRu, 'Режим: TDM · Карта: Desert · Танк: T-55');

  const lineSr = t('mapline', { mode: 'TDM', map: 'Pustinja', tank: 'T-55' }, 'sr');
  assert.equal(lineSr, 'Režim: TDM · Mapa: Pustinja · Tenk: T-55');

  const lineEn = t('mapline', { mode: 'TDM', map: 'Desert', tank: 'T-55' }, 'en');
  assert.equal(lineEn, 'Mode: TDM · Map: Desert · Tank: T-55');

  // Sky shot easter egg translations
  assert.equal(t('skyEaster', undefined, 'ru'), 'Ты что дуралей!? Богов не трогай!');
  assert.equal(t('skyEaster', undefined, 'sr'), 'Šta ti je, budalo!? Ne diraj bogove!');
  assert.equal(t('skyEaster', undefined, 'en'), "What are you, a fool!? Don't mess with the gods!");
});

test('getLanguage() and setLanguage() manage active language and chosen state', () => {
  const initialLang = getLanguage();
  const initialChosen = settings.languageChosen;

  setLanguage('sr');
  assert.equal(getLanguage(), 'sr');
  assert.equal(settings.language, 'sr');
  assert.equal(settings.languageChosen, true);

  setLanguage('en');
  assert.equal(getLanguage(), 'en');
  assert.equal(settings.language, 'en');

  setLanguage('ru');
  assert.equal(getLanguage(), 'ru');
  assert.equal(settings.language, 'ru');

  // Revert back
  setSetting('language', initialLang);
  setSetting('languageChosen', initialChosen);
});

test('Tank model names remain canonical while roles, countries, and descriptions localize', () => {
  // Canonical names in tanks.ts must never be translated
  const expectedTankNames = [
    'Т-55',
    'M60A3 Patton',
    'Т-62М',
    'Т-72Б3',
    'Leopard 2A4',
    'M1A1 Abrams',
    'ZTZ-96A',
    'Т-90М',
    'Merkava Mk.4',
    'Challenger 2',
    'Маус',
  ];
  const allTanks = [...getAllTanks(), MAUS_SPEC];
  const actualTankNames = allTanks.map((tank) => tank.name);
  assert.deepEqual(actualTankNames, expectedTankNames);

  // Localization for each tank exists in ru, sr, and en
  for (const tank of allTanks) {
    for (const lang of SUPPORTED_LANGUAGES) {
      const loc = getTankText(tank.id, lang);
      assert.ok(loc.role && loc.role.length > 0, `Missing role for ${tank.id} in ${lang}`);
      assert.ok(loc.country && loc.country.length > 0, `Missing country for ${tank.id} in ${lang}`);
      assert.ok(loc.gunName && loc.gunName.length > 0, `Missing gunName for ${tank.id} in ${lang}`);
      assert.ok(loc.description && loc.description.length > 0, `Missing description for ${tank.id} in ${lang}`);
      assert.ok(loc.mgName && loc.mgName.length > 0, `Missing mgName for ${tank.id} in ${lang}`);
    }
  }

  // Check specific role / country differences
  const t55Ru = getTankText('t55', 'ru');
  const t55Sr = getTankText('t55', 'sr');
  const t55En = getTankText('t55', 'en');
  assert.equal(t55Ru.country, 'СССР');
  assert.equal(t55Sr.country, 'SSSR');
  assert.equal(t55En.country, 'USSR');

  const mausRu = getTankText('maus', 'ru');
  const mausSr = getTankText('maus', 'sr');
  const mausEn = getTankText('maus', 'en');
  assert.equal(mausRu.role, 'Сверхтяжёлый танк (босс)');
  assert.equal(mausSr.role, 'Superteški tenk (bos)');
  assert.equal(mausEn.role, 'Super-Heavy Tank (Boss)');

  // Trophy APS keys exist in all languages
  assert.equal(t('hudApsName', undefined, 'ru'), 'КАЗ «TROPHY»');
  assert.equal(t('hudApsName', undefined, 'sr'), 'APS «TROPHY»');
  assert.equal(t('hudApsName', undefined, 'en'), 'TROPHY APS');
  assert.ok(t('hstatApsVal', undefined, 'en').includes('Trophy APS'));
  assert.ok(t('msgTrophyIntercept', undefined, 'ru').includes('TROPHY'));
});

test('Mode canonical specs preserved while UI displays localized text', () => {
  // Existing tests rely on canonical mode names (e.g. modes.ts)
  assert.equal(GAME_MODES.tdm100.name, 'Бой до 100 киллов');

  for (const mode of Object.values(GAME_MODES)) {
    for (const lang of SUPPORTED_LANGUAGES) {
      const loc = getModeText(mode.id, lang);
      assert.ok(loc.name && loc.name.length > 0, `Missing mode name for ${mode.id} in ${lang}`);
      assert.ok(loc.shortDesc && loc.shortDesc.length > 0, `Missing mode shortDesc for ${mode.id} in ${lang}`);
    }
  }

  assert.equal(getModeText('tdm100', 'ru').name, 'Бой до 100 киллов');
  assert.equal(getModeText('tdm100', 'sr').name, 'Borba do 100 ubistava');
  assert.equal(getModeText('tdm100', 'en').name, 'Battle to 100 Kills');

  assert.equal(getModeText('juggernaut', 'ru').name, 'Джагернаут');
  assert.equal(getModeText('juggernaut', 'sr').name, 'Džagernaut');
  assert.equal(getModeText('juggernaut', 'en').name, 'Juggernaut');

  assert.equal(getModeText('dead', 'ru').name, 'Мертвецы');
  assert.equal(getModeText('dead', 'sr').name, 'Mrtvaci');
  assert.equal(getModeText('dead', 'en').name, 'Dead Men');
});

test('Maps localize correctly in ru, sr, and en', () => {
  const mapIds = ['hills', 'city'];
  for (const mapId of mapIds) {
    for (const lang of SUPPORTED_LANGUAGES) {
      const loc = getMapText(mapId, lang);
      assert.ok(loc.name && loc.name.length > 0, `Missing map name for ${mapId} in ${lang}`);
      assert.ok(loc.desc && loc.desc.length > 0, `Missing map desc for ${mapId} in ${lang}`);
    }
  }

  assert.equal(getMapText('hills', 'ru').name, 'Холмы');
  assert.equal(getMapText('hills', 'sr').name, 'Brda');
  assert.equal(getMapText('hills', 'en').name, 'Hills');

  assert.equal(getMapText('city', 'ru').name, 'Город');
  assert.equal(getMapText('city', 'sr').name, 'Grad');
  assert.equal(getMapText('city', 'en').name, 'City');
});

test('HitCam results and view orientation texts localize cleanly', () => {
  // Fuel instant kill
  assert.equal(getHitCamResult('fuel', false, 'ru').label, 'Бензобак — ВЗРЫВ!');
  assert.equal(getHitCamResult('fuel', false, 'sr').label, 'Rezervoar — EKSPLOZIJA!');
  assert.equal(getHitCamResult('fuel', false, 'en').label, 'Fuel Tank — EXPLOSION!');

  // Destroyed
  assert.equal(getHitCamResult('pen', true, 'ru').label, 'Цель уничтожена');
  assert.equal(getHitCamResult('pen', true, 'sr').label, 'Cilj uništen');
  assert.equal(getHitCamResult('pen', true, 'en').label, 'Target Destroyed');

  // Ricochet
  assert.equal(getHitCamResult('ricochet', false, 'ru').label, 'Рикошет');
  assert.equal(getHitCamResult('ricochet', false, 'sr').label, 'Rikošet');
  assert.equal(getHitCamResult('ricochet', false, 'en').label, 'Ricochet');

  // Non-penetration
  assert.equal(getHitCamResult('nopen', false, 'ru').label, 'Не пробил');
  assert.equal(getHitCamResult('nopen', false, 'sr').label, 'Nije probio');
  assert.equal(getHitCamResult('nopen', false, 'en').label, 'Did Not Penetrate');

  // Views
  assert.equal(t('hcTopView', undefined, 'ru'), 'СВЕРХУ');
  assert.equal(t('hcTopView', undefined, 'sr'), 'ODOZGO');
  assert.equal(t('hcTopView', undefined, 'en'), 'TOP');

  assert.equal(t('hcSideView', undefined, 'ru'), 'СБОКУ');
  assert.equal(t('hcSideView', undefined, 'sr'), 'SA STRANE');
  assert.equal(t('hcSideView', undefined, 'en'), 'SIDE');
});

test('resetSettings preserves language and languageChosen', () => {
  setSetting('language', 'sr');
  setSetting('languageChosen', true);
  setSetting('master', 0.1);

  resetSettings();

  assert.equal(settings.language, 'sr');
  assert.equal(settings.languageChosen, true);
  assert.equal(settings.master, DEFAULTS.master);

  // Restore clean state
  setSetting('language', DEFAULTS.language);
  setSetting('languageChosen', DEFAULTS.languageChosen);
});

test('keyName and getKeyLabels provide localized key representations and action labels', () => {
  // Key names
  assert.equal(keyName('Space', 'ru'), 'Пробел');
  assert.equal(keyName('Space', 'sr'), 'Razmak');
  assert.equal(keyName('Space', 'en'), 'Space');

  assert.equal(keyName('ShiftLeft', 'ru'), 'Shift (лев)');
  assert.equal(keyName('ShiftLeft', 'sr'), 'Shift (levi)');
  assert.equal(keyName('ShiftLeft', 'en'), 'Shift (L)');

  // Action labels
  const ruLabels = getKeyLabels('ru');
  const srLabels = getKeyLabels('sr');
  const enLabels = getKeyLabels('en');

  assert.equal(ruLabels.forward, 'Вперёд');
  assert.equal(srLabels.forward, 'Napred');
  assert.equal(enLabels.forward, 'Forward');

  assert.equal(ruLabels.mg, 'Пулемёт (огонь)');
  assert.equal(srLabels.mg, 'Mitraljez (paljba)');
  assert.equal(enLabels.mg, 'Machine Gun (fire)');

  assert.equal(ruLabels.sniper, 'Снайперский прицел');
  assert.equal(srLabels.sniper, 'Snajperski nišan');
  assert.equal(enLabels.sniper, 'Sniper Scope');

  assert.equal(ruLabels.console, 'Консоль');
  assert.equal(srLabels.console, 'Konzola');
  assert.equal(enLabels.console, 'Console');
});
