import { setSetting, settings } from './settings';

export type SupportedLanguage = 'ru' | 'sr' | 'en';

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ['ru', 'sr', 'en'];

export interface LanguageCardDef {
  id: SupportedLanguage;
  label: string;
  htmlLang: string;
}

/**
 * Неизменяемые названия на карточках выбора языка (независимо от активного языка).
 */
export const LANGUAGE_CARDS: LanguageCardDef[] = [
  { id: 'ru', label: 'Русский (Россия)', htmlLang: 'ru' },
  { id: 'sr', label: 'Srpski (latinica) (Srbija)', htmlLang: 'sr-Latn' },
  { id: 'en', label: 'English (USA)', htmlLang: 'en' },
];

export interface TankLocalized {
  role: string;
  country: string;
  gunName: string;
  description: string;
  mgName: string;
}

export interface ModeLocalized {
  name: string;
  shortDesc: string;
  extraDesc?: string;
}

export interface MapLocalized {
  name: string;
  desc: string;
}

type TranslationDict = Record<string, string>;

const DICT_RU: TranslationDict = {
  // Brand & fixed
  brandTitle: 'IRON & SKY',
  tankBattleTag: 'ТАНКОВЫЙ БОЙ',
  pageTitle: 'IRON & SKY — Танковый бой',
  pageDesc: '3D танковый бой с ангаром, базовым танком Т-55, зонами бронирования и баллистикой.',

  // Main buttons
  btnPlay: 'ИГРАТЬ',
  btnContinueBattle: 'ПРОДОЛЖИТЬ БИТВУ',
  btnNewBattle: 'НОВАЯ БИТВА',
  btnModes: 'РЕЖИМЫ',
  btnMaps: 'КАРТЫ',
  btnHangar: 'АНГАР',
  btnSettings: 'НАСТРОЙКИ',
  btnHistory: 'ИСТОРИЯ БОЁВ',
  btnControls: 'УПРАВЛЕНИЕ',
  btnLanguage: 'Язык/Language/Jezik',

  // Language panel
  langChooseTitle: 'ВЫБЕРИТЕ ЯЗЫК',
  langChooseTag: 'ЯЗЫК ИНТЕРФЕЙСА',
  langIntro: 'Выберите удобный язык интерфейса игры. Вы всегда сможете переключить его в главном меню кнопкой «Язык/Language/Jezik».',
  langBadgeSelected: 'ВЫБРАН',

  // Control choice
  ctrlChooseTitle: 'ВЫБЕРИТЕ УПРАВЛЕНИЕ',
  ctrlIntro: 'Выберите удобный способ управления перед началом игры. Вы всегда сможете переключить его позже в разделе «Управление».',
  ctrlPcTitle: 'ПК (КЛАВИАТУРА И МЫШЬ)',
  ctrlPcDesc: 'Движение на WASD, обзор и стрельба мышью, пулемёт на F, способность на E, прицел на Shift, таблица счёта на TAB.',
  ctrlTouchTitle: 'ТЕЛЕФОН (СЕНСОР)',
  ctrlTouchDesc: 'Джойстик движения слева, джойстик пулемёта (огонь + наведение) и кнопка выстрела справа, поворот камеры свайпом в любом месте экрана.',
  ctrlRecommended: 'РЕКОМЕНДУЕТСЯ',

  // Common buttons
  btnDone: 'ГОТОВО',
  btnBack: 'НАЗАД',
  btnBackToMenu: 'В ГЛАВНОЕ МЕНЮ',
  btnBackToHangar: 'НАЗАД В АНГАР',
  btnToHangar: 'В АНГАР',
  btnResume: 'ПРОДОЛЖИТЬ',
  btnReset: 'СБРОС',
  btnClose: 'ЗАКРЫТЬ',
  btnSelect: 'ВЫБРАТЬ',
  badgeSelected: 'ВЫБРАНО',

  // Main menu line & info
  mapline: 'Режим: {mode} · Карта: {map} · Танк: {tank}',
  playEaster: 'Кто не одной каточки не сыграл тот пивасик весь пролил!',
  skyEaster: 'Ты что дуралей!? Богов не трогай!',
  tipTouch: 'Управление: Телефон (джойстик слева, свайп-обзор, кнопки справа)',
  tipPc: 'Консоль настроек: ~ · Таблица счёта: TAB · Таран: -20 ХП',
  menuOrbitHint: 'ЛКМ + мышь — вращать камеру · Колёсико — приблизить',
  menuOrbitHintTouch: 'Проведите пальцем — вращать камеру',
  extraTraining: 'Читы (sv_cheats on) и настройка точности ботов активны. Серебро не начисляется.',
  extraJuggernaut: 'Охота на Мауса: 6 охотников против босса (4000 ХП). У Мауса 128-мм орудие и огнемёт на 20 м. +1500 серебра за победу. Читы отключены.',
  extraDead: 'Выживите 5:00 против 5 врагов на случайной технике (респаун врагов 4 с, у вас 1 жизнь). +1500 серебра за победу. Читы отключены.',
  extraRounds: '+50 серебра за килл · +500 за победу · После смерти — режим наблюдателя. Читы (sv_cheats) отключены.',
  extraTdm: '+50 серебра за килл · +150 за 10 киллов · +300 за 20 киллов · +500 за победу. Читы (sv_cheats) отключены.',

  // Hangar
  hangarTitle: 'АНГАР',
  hangarSub: 'БОЕВАЯ ТЕХНИКА',
  hangarSilver: 'СЕРЕБРО',
  hangarBackBtn: 'НАЗАД В МЕНЮ',
  hangarRoster: 'СПИСОК ТЕХНИКИ',
  hangarHint: 'Нажмите на танк в списке слева, чтобы открыть характеристики.',
  badgeEquipped: 'ВЫБРАН',
  badgeInHangar: 'В АНГАРЕ',
  badgePriceSilver: '{n} СЕР.',
  hstatDamage: 'Урон',
  hstatMaxSpeed: 'Макс. скорость',
  hstatReload: 'Перезарядка орудия',
  hstatMaxRange: 'Дальность полёта снаряда',
  hstatMaxHp: 'Прочность корпуса',
  hstatGun: 'Орудие',
  hstatMg: 'Пулемёт ({mag}/{total})',
  hstatFrontArmor: 'Лобовая броня',
  hstatFrontDmg: 'Входящий урон в лоб',
  hstatSideRearDmg: 'Входящий урон в борт/корму',
  hstatWeakspot: 'Уязвимая зона',
  hstatWeakspotVal: 'Бензобак (ваншот)',
  hstatAps: 'Активная защита',
  hstatApsVal: 'КАЗ «Trophy» (Ветровка) · перехват каждые 15–20 с',
  hstatAbility: 'Спецспособность [E]',
  hstatAbilityLeclerc: '«Форсаж» 3.5 с + большой дым GALIX 8.5 с (откат 15 с)',
  hstatAbilityLeopard: 'Выстрел БПС DM63 (500–550 урона, игнор брони, откат 15 с)',
  hstatAbilityAbrams: 'Тепловизор Gen-2 (15 с, подсветка врагов и уязвимых зон, откат 30 с)',
  hstatAbilityK2: 'Снаряд KSTAM [E]+[ПКМ 1.5 с] (атака в крышу 500 ур. + 10 м сплэш)',
  hstatAbility2: 'Спецспособность [F]',
  hstatAbilityAbramsBarrage: '«Бронебойный шквал» 6 с (+35% скорострельности, +50% пробития, откат 18 с)',
  hstatPassive: 'Пассивно (подвеска)',
  hstatPassiveK2: 'Адаптивная гидропневмоподвеска (нет штрафа в гору, УВН -13°..+24°)',
  hstatPowerRating: 'Боевая мощь',
  hstatPrice: 'Стоимость',
  hstatPriceBase: 'Базовый (куплен)',
  hstatPriceSilver: '{n} серебра',
  armorSloped: '{hull} мм (наклонная)',
  armorMantlet: '{hull} / {turret} мм (лоб / маска)',
  unitDamage: '{dmg} ед.',
  unitDamageFull: '{dmg} ед. (полный)',
  unitDamageRange: '{min}–{max} ед.',
  unitPowerRating: '{score} ед.',
  unitSpeedKmh: '{spd} км/ч',
  unitSec: '{sec} сек',
  unitMeters: '{m} м',
  hangarEquippedStatus: 'Танк закреплён за вами для боя',
  hangarOwnedStatus: 'Куплен · готов к выбору',
  hangarCanBuyStatus: 'Доступно к покупке за {price} серебра',
  hangarNeedMoreStatus: 'Недостаточно серебра (нужно ещё {diff})',
  hangarBtnBuy: 'Купить за {price} серебра',
  hangarBtnSelect: 'Выбрать',
  hangarNotEnoughSilver: 'Недостаточно серебра',

  // Battle History
  histTitle: 'ИСТОРИЯ БОЁВ',
  histMatches: 'МАТЧЕЙ: <b>{total} / {max}</b>',
  histWins: 'ПОБЕД: <b>{wins}</b> ({pct}%)',
  histTotalSilver: 'СЕРЕБРО: <b>+{silver}</b>',
  histEmpty: 'История боёв пуста. Завершите матч в любом боевом режиме, чтобы увидеть статистику.',
  histClearBtn: 'ОЧИСТИТЬ ИСТОРИЮ',
  histScoreRow: 'Счёт: {score}',
  histWin: 'ПОБЕДА',
  histLoss: 'ПОРАЖЕНИЕ',
  histSilverEarned: '+{silver} сер.',
  histSilverZero: '0 сер.',

  // Map & Mode Panels
  mapPanelTitle: 'ВЫБОР КАРТЫ',
  mapLoading: 'Загрузка...',
  modePanelTitle: 'ВЫБОР РЕЖИМА',

  // Pause
  pauseTitle: 'ПАУЗА',

  // Match End
  meVictory: 'ПОБЕДА!',
  meDefeat: 'ПОРАЖЕНИЕ',
  meRowKills: 'Уничтожено вами',
  meRowDeaths: 'Потерь вашей техники',
  meRowVictorySilver: 'Награда за победу',
  meRowTotalSilver: 'Всего заработано за матч',
  meRowBalance: 'Текущий баланс',
  meScoreRounds: 'Счёт раундов',
  meScoreTeams: 'Счёт команд',
  meScoreSurvival: 'Время выживания',
  meSubSurvivalLived: '{mode} · ПРОЖИТО {time}',
  meSubSurvivalSurvived: '{mode} · ВЫЖИЛ {time}',
  meScoreSurvivalHistory: '{time} · {kills} фрагов',
  meMausHistory: 'Маус уничтожен · {kills} фрагов',
  meMausToast: 'Маус уничтожен',
  meBannerVictoryWork: 'ПОБЕДА! ХОРОШАЯ РАБОТА!',
  meTargetDestroyedToast: 'Уничтожен {target}',
  meSilverUnit: '{n} серебра',

  // Settings
  settingsTitle: 'НАСТРОЙКИ',
  tabSound: 'Звук',
  tabControls: 'Управление',
  tabGraphics: 'Графика',
  tabGame: 'Игра',
  settingsStorageOk: 'Настройки сохраняются автоматически.',
  settingsStorageBlocked: 'Внимание: браузер блокирует localStorage, настройки не сохранятся после перезагрузки.',
  ctrlSwitchLabel: 'Режим управления',
  ctrlSegPc: 'ПК (мышь + клавиатура)',
  ctrlSegTouch: 'Телефон (сенсор)',
  setMaster: 'Общая громкость',
  setMusic: 'Музыка',
  setSfx: 'Звуки (выстрелы, взрывы)',
  setEngine: 'Двигатель и гусеницы',
  setSens: 'Чувствительность мыши',
  setTouchSens: 'Чувствительность свайпа',
  setSensSniper: 'Чувствительность в прицеле',
  setInvertY: 'Инвертировать вертикаль',
  setShadows: 'Тени',
  optOff: 'Выкл',
  optLow: 'Низкая',
  optMed: 'Средняя',
  optHigh: 'Высокая',
  setPost: 'Пост-обработка (свечение, тонемаппинг)',
  setBloom: 'Сила свечения',
  setGrass: 'Трава',
  setDrawDist: 'Дальность прорисовки',
  setResolution: 'Разрешение рендера',
  setFov: 'Поле зрения (FOV)',
  setVignette: 'Виньетка',
  setHitcam: 'Камера попадания (рентген)',
  setHints: 'Подсказки по управлению',
  setBotSkill: 'Меткость ботов',
  setBotSkillFixed: '1 (фикс.)',
  setBotSkillLockedNote: 'Настройка точности ботов доступна только в режиме «Тренировка».',
  setTouchGuide:
    '<div><b>Джойстик слева:</b> газ, задний ход и поворот корпуса.</div>' +
    '<div><b>Джойстик пулемёта справа:</b> зажмите для стрельбы и ведите палец для наведения камеры.</div>' +
    '<div><b>Свайп по свободному экрану:</b> поворот камеры и наведение башни.</div>' +
    '<div><b>Кнопки справа и сверху:</b> Огонь, Спецспособность (E), Лента R, Прицел, Бинокль, Зум, Счёт и Пауза.</div>',
  keysHead: 'Клавиши (нажмите кнопку и затем новую клавишу, Esc — отмена)',
  keysWait: 'нажмите клавишу...',
  keysNote: 'Стрельба — левая кнопка мыши. Колесо — зум. Эти действия не переназначаются.',

  // Key Actions
  keyForward: 'Вперёд',
  keyBack: 'Назад',
  keyLeft: 'Влево (поворот)',
  keyRight: 'Вправо (поворот)',
  keyBrake: 'Ручной тормоз',
  keyMg: 'Пулемёт (огонь)',
  keyAbility: 'Спецспособность [E]',
  keySniper: 'Снайперский прицел',
  keyBinoc: 'Бинокль',
  keyComp: 'Баллистический вычислитель',
  keyPost: 'Пост-обработка вкл/выкл',
  keyConsole: 'Консоль',

  // Scoreboard
  sbSub: 'Таблица счёта · удерживайте TAB или нажмите СЧЁТ',
  sbAllies: 'СОЮЗНИКИ',
  sbEnemies: 'ПРОТИВНИКИ',
  sbWeVsEnemiesGoal: 'МЫ {a} : {b} ВРАГИ (цель: {goal})',
  sbWeVsEnemiesTraining: 'МЫ {a} : {b} ВРАГИ (тренировка)',
  sbRoundsScore: 'РАУНД {round} · МЫ {a} : {b} ВРАГИ (до {win})',
  sbSurvivalScore: 'ОСТАЛОСЬ {time} · ФРАГИ: {kills}',
  sbBossScore: 'МАУС: {hp} / {max} ХП',
  sbPlayerSelf: 'ВЫ ({name})',

  // HUD
  hudThirdPerson: 'ОТ ТРЕТЬЕГО ЛИЦА',
  hudSniper: 'ПРИЦЕЛ НАВОДЧИКА',
  hudBinoc: 'БИНОКЛЬ',
  hudBinocAim: 'БИНОКЛЬ - КЛИК: НАВЕСТИ БАШНЮ',
  hudDistance: 'ДИСТАНЦИЯ',
  hudZoom: 'ЗУМ',
  hudComp: 'БАЛЛИСТ. КОМП.',
  hudMv: 'СКОРОСТЬ СНАРЯДА',
  hudMps: 'м/с',
  hudMetersUnit: 'м',
  hudSecShort: 'с',
  hudCompOn: 'ВКЛ',
  hudCompOff: 'ВЫКЛ',
  hudKmh: 'КМ/Ч',
  hudGear: 'ПЕРЕДАЧА',
  hudHull: 'КОРПУС',
  hudTurret: 'БАШНЯ',
  hudDurability: 'ПРОЧНОСТЬ',
  hudKills: 'УБИТО',
  hudAlive: 'В СТРОЮ',
  hudWe: 'МЫ',
  hudEnemiesText: 'ВРАГИ',
  hudRemaining: 'ОСТАЛОСЬ',
  hudFragsVal: 'ФРАГИ: {n}',
  hudGoalDestroyMaus: '· УНИЧТОЖЬТЕ МАУСА',
  hudGoalFreeBattle: '· СВОБОДНЫЙ БОЙ',
  hudRoundTitle: '{mode} · РАУНД {round}',
  hudGunReady: 'ГОТОВ',
  hudMgLabel: 'ПУЛЕМЁТ [{key}]',
  hudMgReady: 'ГОТОВ',
  hudMgReloadPrompt: 'ГОТОВ · R ЛЕНТА',
  hudMgReloading: 'ПЕРЕЗАРЯДКА {t}с',
  hudMgOutOfAmmo: 'ПАТРОНЫ КОНЧИЛИСЬ',
  hudApsName: 'КАЗ «TROPHY»',
  hudApsReady: 'ГОТОВ',
  hudApsCooldown: '{t} с',
  hudAbilityGalix: 'GALIX [{key}]',
  hudAbilityDm63: 'БПС DM63 [{key}]',
  hudAbilityThermal: 'ТЕПЛОВИЗОР [{key}]',
  hudAbilityKstam: 'KSTAM [{key}]',
  hudAbility2Barrage: 'ШКВАЛ [{key}]',
  hudAbilityReady: 'ГОТОВ',
  hudAbilityActive: 'ФОРСАЖ {t} с',
  hudAbilityThermalActive: 'FLIR {t} с',
  hudAbilityBarrageActive: '+35%/+50% {t} с',
  hudAbilityPrimed: 'ЗАРЯЖЕН',
  hudAbilityCooldown: '{t} с',
  hudThermalTag: 'ТЕПЛОВИЗОР GEN-2 · FLIR',
  hudWeakspotHdr: 'УЯЗВИМЫЕ ЗОНЫ',
  hudWeakspotFuel: '• БЕНЗОБАК: ваншот (красный)',
  hudWeakspotRear: '• КОРМА / МТО: полный урон',
  hudWeakspotRoof: '• КРЫША: тонкая броня',
  hudKstamLocking: 'ЗАХВАТ KSTAM · {pct}%',
  hudKstamLocked: 'ЦЕЛЬ ЗАХВАЧЕНА · ОТПУСТИТЕ ПКМ',
  hudKstamNoTarget: 'НАВЕДИТЕСЬ НА ВРАГА (ПКМ)',
  hudBossName: 'МАУС',
  hudBossFlame: 'ОГНЕМЁТ',
  hudBossOverheat: 'ПЕРЕГРЕВ · ОХЛАЖДЕНИЕ',
  hudBossFlamePct: 'ОГНЕМЁТ · {pct}%',
  hudTrackDamagedRepair: 'ГУСЕНИЦА ПОВРЕЖДЕНА: ремонт {t} с',
  hudBarrelDamagedRepair: 'СТВОЛ ПОВРЕЖДЁН: ремонт {t} с',
  hudOnFireDps: 'В ОГНЕ: -{dps} ХП/с',
  hudBurningDps: 'ГОРЕНИЕ: -10 ХП/с ({t} с)',
  hudDeadRespawn: 'ВАШ ТАНК УНИЧТОЖЕН - ВОЗРОЖДЕНИЕ ЧЕРЕЗ {t}',
  hudSpectatorTitle: 'РЕЖИМ НАБЛЮДАТЕЛЯ',
  hudWatching: 'Наблюдение:',
  hudSpecPrev: '◀ ПРЕД',
  hudSpecNext: 'СЛЕД ▶',
  hudSpecHint: 'ЛКМ / ← / A — назад · ПКМ / → / D — вперёд · МЫШЬ — обзор',
  hudHpUnit: 'ХП',
  hudSilverToast: '+{amt} СЕРЕБРА',

  // Touch HUD
  tBtnScore: 'СЧЁТ',
  tBtnPause: 'ПАУЗА',
  tBtnZoomVal: 'ЗУМ {val}',
  tBtnBinoc: 'БИНОКЛЬ',
  tBtnSniper: 'ПРИЦЕЛ',
  tBtnMgReload: 'ЛЕНТА R',
  tBtnAbilityGalix: 'GALIX · {state}',
  tBtnAbilityDm63: 'DM63 · {state}',
  tBtnAbilityThermal: 'ТЕПЛ. · {state}',
  tBtnAbilityKstam: 'KSTAM · {state}',
  tBtnAbilityBarrage: 'ШКВАЛ · {state}',
  tBtnKstamHold: 'ПКМ · ЗАХВАТ',
  tBtnMgPad: 'ПУЛЕМЁТ',
  tBtnFire: 'ОГОНЬ',
  tBtnReady: 'ГОТОВ',
  tMgPadAria: 'Джойстик пулемёта: удерживайте для огня и ведите для наведения',

  // Combat notifications & logs
  msgPen: 'ПОПАДАНИЕ',
  msgCrit: 'КРИТИЧЕСКОЕ ПОПАДАНИЕ',
  msgNopen: 'НЕ ПРОБИЛ (БРОНЯ)',
  msgRicochet: 'РИКОШЕТ',
  msgTrack: 'ГУСЕНИЦА ПОВРЕЖДЕНА',
  msgBarrel: 'СТВОЛ ПОВРЕЖДЁН',
  msgFuel: 'КРИТИЧЕСКОЕ ПОПАДАНИЕ: БЕНЗОБАК!',
  msgTargetDestroyed: 'ЦЕЛЬ УНИЧТОЖЕНА',
  msgFuelDestroyed: 'ВЗРЫВ БЕНЗОБАКА — УНИЧТОЖЕН!',
  msgYouWereHit: 'ПО ВАМ ПОПАЛИ: {res}',
  msgRamDealt: 'ТАРАН! -{dmg} ХП',
  msgRamTaken: 'ТАРАН ПО ВАМ: -{dmg} ХП',
  msgRockImpact: 'УДАР О КАМЕНЬ: -{dmg} ХП',
  msgMausCrushed: 'МАУС РАЗДАВИЛ ВАС!',
  msgMausBurned: 'МАУС СЖЁГ ВАС ОГНЕМЁТОМ!',
  msgMgOutToast: 'ПАТРОНЫ ПУЛЕМЁТА КОНЧИЛИСЬ',
  msgTrophyIntercept: 'КАЗ «TROPHY» ПЕРЕХВАТИЛ СНАРЯД!',
  msgTrophyEnemyBlocked: 'СНАРЯД ПЕРЕХВАЧЕН КАЗ «TROPHY»!',
  msgGalixActivated: 'ФОРСАЖ + ДЫМОВАЯ ЗАВЕСА GALIX!',
  msgDm63Primed: 'ПОДКАЛИБЕРНЫЙ DM63 ЗАРЯЖЕН (500–550 УРОНА)!',
  msgDm63Fired: 'ВЫСТРЕЛ БПС DM63!',
  msgDm63Hit: 'ПРОБИТИЕ DM63: -{dmg} ХП!',
  msgThermalActivated: 'ТЕПЛОВИЗОР GEN-2 ВКЛЮЧЁН (15 с)!',
  msgBarrageActivated: 'БРОНЕБОЙНЫЙ ШКВАЛ: +35% СКОРОСТРЕЛЬНОСТЬ, +50% ПРОБИТИЕ!',
  msgKstamPrimed: 'KSTAM ВЗВЕДЁН — ЗАЖМИТЕ ПКМ (1.5 с) НА ВРАГЕ!',
  msgKstamLocked: 'ЦЕЛЬ ЗАХВАЧЕНА! ОТПУСТИТЕ ПКМ ДЛЯ ЗАПУСКА KSTAM!',
  msgKstamFired: 'УМНЫЙ СНАРЯД KSTAM ЗАПУЩЕН В КРЫШУ!',
  msgKstamHit: 'KSTAM СВЕРХУ: -{dmg} ХП!',
  msgKstamCancelled: 'Захват KSTAM отменён',
  msgRoundWinBanner: 'ПОБЕДА В РАУНДЕ!',
  msgRoundLossBanner: 'РАУНД ПРОИГРАН',
  msgRoundFullBanner: 'РАУНД {round}: {res} ({a} : {b})',
  msgRoundToast: 'РАУНД {round}',
  suffixFuel: ' [БЕНЗОБАК]',
  suffixRam: ' [ТАРАН]',
  suffixRock: ' [КАМЕНЬ]',
  suffixFlame: ' [ОГНЕМЁТ]',
  suffixMg: ' [ПУЛЕМЁТ]',

  // HitCam
  hcPen: 'Попадание',
  hcCrit: 'Критическое попадание',
  hcNopen: 'Не пробил',
  hcRicochet: 'Рикошет',
  hcTrack: 'Гусеница повреждена',
  hcBarrel: 'Ствол повреждён',
  hcFuel: 'Бензобак — ВЗРЫВ!',
  hcDestroyed: 'Цель уничтожена',
  hcTopView: 'СВЕРХУ',
  hcSideView: 'СБОКУ',
};

const DICT_SR: TranslationDict = {
  // Brand & fixed
  brandTitle: 'IRON & SKY',
  tankBattleTag: 'TENKOVSKA BITKA',
  pageTitle: 'IRON & SKY — Tenkovska bitka',
  pageDesc: '3D tenkovska bitka sa hangarom, osnovnim tenkom T-55, zonama oklopa i balistikom.',

  // Main buttons
  btnPlay: 'IGRAJ',
  btnContinueBattle: 'NASTAVI BITKU',
  btnNewBattle: 'NOVA BITKA',
  btnModes: 'REŽIMI',
  btnMaps: 'MAPE',
  btnHangar: 'HANGAR',
  btnSettings: 'PODEŠAVANJA',
  btnHistory: 'ISTORIJA BORBI',
  btnControls: 'KONTROLE',
  btnLanguage: 'Язык/Language/Jezik',

  // Language panel
  langChooseTitle: 'IZBOR JEZIKA',
  langChooseTag: 'JEZIK INTERFEJSA',
  langIntro: 'Izaberite jezik interfejsa igre. Jezik možete promeniti u bilo kom trenutku u glavnom meniju pomoću dugmeta «Язык/Language/Jezik».',
  langBadgeSelected: 'IZABRANO',

  // Control choice
  ctrlChooseTitle: 'IZABERITE KONTROLE',
  ctrlIntro: 'Izaberite pogodan način upravljanja pre početka igre. Uvek ga možete promeniti kasnije u odeljku «Kontrole».',
  ctrlPcTitle: 'PC (TASTATURA I MIŠ)',
  ctrlPcDesc: 'Kretanje na WASD, pogled i paljba mišem, mitraljez na F, sposobnost na E, snajperski nišan na Shift, tabela rezultata na TAB.',
  ctrlTouchTitle: 'TELEFON (DODIR)',
  ctrlTouchDesc: 'Džojstik kretanja levo, džojstik mitraljeza (paljba + nišanjenje) i dugme paljbe desno, rotacija kamere prevlačenjem po ekranu.',
  ctrlRecommended: 'PREPORUČENO',

  // Common buttons
  btnDone: 'GOTOVO',
  btnBack: 'NAZAD',
  btnBackToMenu: 'U GLAVNI MENI',
  btnBackToHangar: 'NAZAD U HANGAR',
  btnToHangar: 'U HANGAR',
  btnResume: 'NASTAVI',
  btnReset: 'RESETUJ',
  btnClose: 'ZATVORI',
  btnSelect: 'IZABERI',
  badgeSelected: 'IZABRANO',

  // Main menu line & info
  mapline: 'Režim: {mode} · Mapa: {map} · Tenk: {tank}',
  playEaster: 'Ko nije odigrao nijednu partiju, prosuo je sve pivo!',
  skyEaster: 'Šta ti je, budalo!? Ne diraj bogove!',
  tipTouch: 'Kontrole: Telefon (džojstik levo, prevlačenje za pogled, dugmad desno)',
  tipPc: 'Konzola podešavanja: ~ · Tabela rezultata: TAB · Udarac: -20 HP',
  menuOrbitHint: 'LKM + miš — rotacija kamere · Točkić — zum',
  menuOrbitHintTouch: 'Prevucite prstom — rotacija kamere',
  extraTraining: 'Čitovi (sv_cheats on) i podešavanje preciznosti botova su aktivni. Srebro se ne dodeljuje.',
  extraJuggernaut: 'Lov na Mausa: 6 lovaca protiv bosa (4000 HP). Maus ima top od 128 mm i bacač plamena na 20 m. +1500 srebra za pobedu. Čitovi su isključeni.',
  extraDead: 'Preživite 5:00 protiv 5 neprijatelja na nasumičnim tenkovima (neprijatelji se ponovo rađaju svake 4 s, vi imate 1 život). +1500 srebra za pobedu. Čitovi su isključeni.',
  extraRounds: '+50 srebra za ubistvo · +500 za pobedu · Posle smrti — režim posmatrača. Čitovi (sv_cheats) su isključeni.',
  extraTdm: '+50 srebra za ubistvo · +150 za 10 ubistava · +300 za 20 ubistava · +500 za pobedu. Čitovi (sv_cheats) su isključeni.',

  // Hangar
  hangarTitle: 'HANGAR',
  hangarSub: 'BORBENA VOZILA',
  hangarSilver: 'SREBRO',
  hangarBackBtn: 'NAZAD U MENI',
  hangarRoster: 'SPISAK VOZILA',
  hangarHint: 'Kliknite na tenk u listi levo da biste otvorili karakteristike.',
  badgeEquipped: 'IZABRAN',
  badgeInHangar: 'U HANGARU',
  badgePriceSilver: '{n} SREB.',
  hstatDamage: 'Šteta',
  hstatMaxSpeed: 'Maks. brzina',
  hstatReload: 'Punjenje topa',
  hstatMaxRange: 'Domet granate',
  hstatMaxHp: 'Izdržljivost tela',
  hstatGun: 'Top',
  hstatMg: 'Mitraljez ({mag}/{total})',
  hstatFrontArmor: 'Čeoni oklop',
  hstatFrontDmg: 'Dolazna šteta u čelo',
  hstatSideRearDmg: 'Dolazna šteta u bok/krmu',
  hstatWeakspot: 'Ranjiva zona',
  hstatWeakspotVal: 'Rezervoar za gorivo (jedan pogodak)',
  hstatAps: 'Aktivna zaštita',
  hstatApsVal: 'APS «Trophy» (Vetrovka) · presretanje svakih 15–20 s',
  hstatAbility: 'Specijalna sposobnost [E]',
  hstatAbilityLeclerc: '«Forsaž» 3.5 s + veliki dim GALIX 8.5 s (punjenje 15 s)',
  hstatAbilityLeopard: 'APFSDS hitac DM63 (500–550 štete, ignoriše oklop, 15 s)',
  hstatAbilityAbrams: 'Termovizija Gen-2 (15 s, isticanje meta i slabih tačaka, 30 s)',
  hstatAbilityK2: 'Granata KSTAM [E]+[DKM 1.5 s] (napad odozgo 500 štete + 10 m)',
  hstatAbility2: 'Specijalna sposobnost [F]',
  hstatAbilityAbramsBarrage: '«Probojni pljusak» 6 s (+35% brzina punjenja, +50% probojnost, 18 s)',
  hstatPassive: 'Pasivno (vešanje)',
  hstatPassiveK2: 'Adaptivno hidropneumatsko vešanje (bez usporavanja uzbrdo, -13°..+24°)',
  hstatPowerRating: 'Borbena moć',
  hstatPrice: 'Cena',
  hstatPriceBase: 'Osnovni (u vlasništvu)',
  hstatPriceSilver: '{n} srebra',
  armorSloped: '{hull} mm (kosi)',
  armorMantlet: '{hull} / {turret} mm (čelo / maska)',
  unitDamage: '{dmg} jed.',
  unitDamageFull: '{dmg} jed. (puna)',
  unitDamageRange: '{min}–{max} jed.',
  unitPowerRating: '{score} jed.',
  unitSpeedKmh: '{spd} km/h',
  unitSec: '{sec} sek',
  unitMeters: '{m} m',
  hangarEquippedStatus: 'Tenk je izabran za vas za bitku',
  hangarOwnedStatus: 'Kupljen · spreman za izbor',
  hangarCanBuyStatus: 'Dostupno za kupovinu za {price} srebra',
  hangarNeedMoreStatus: 'Nedovoljno srebra (potrebno još {diff})',
  hangarBtnBuy: 'Kupi za {price} srebra',
  hangarBtnSelect: 'Izaberi',
  hangarNotEnoughSilver: 'Nedovoljno srebra',

  // Battle History
  histTitle: 'ISTORIJA BORBI',
  histMatches: 'MEČEVA: <b>{total} / {max}</b>',
  histWins: 'POBEDA: <b>{wins}</b> ({pct}%)',
  histTotalSilver: 'SREBRO: <b>+{silver}</b>',
  histEmpty: 'Istorija borbi je prazna. Završite meč u bilo kom borbenom režimu da biste videli statistiku.',
  histClearBtn: 'OBRIŠI ISTORIJU',
  histScoreRow: 'Rezultat: {score}',
  histWin: 'POBEDA',
  histLoss: 'PORAZ',
  histSilverEarned: '+{silver} sreb.',
  histSilverZero: '0 sreb.',

  // Map & Mode Panels
  mapPanelTitle: 'IZBOR MAPE',
  mapLoading: 'Učitavanje...',
  modePanelTitle: 'IZBOR REŽIMA',

  // Pause
  pauseTitle: 'PAUZA',

  // Match End
  meVictory: 'POBEDA!',
  meDefeat: 'PORAZ',
  meRowKills: 'Uništili ste',
  meRowDeaths: 'Izgubljeno vaših vozila',
  meRowVictorySilver: 'Nagrada za pobedu',
  meRowTotalSilver: 'Ukupno zarađeno u meču',
  meRowBalance: 'Trenutno stanje',
  meScoreRounds: 'Rezultat rundi',
  meScoreTeams: 'Rezultat timova',
  meScoreSurvival: 'Vreme preživljavanja',
  meSubSurvivalLived: '{mode} · IZDRŽAO {time}',
  meSubSurvivalSurvived: '{mode} · PREŽIVEO {time}',
  meScoreSurvivalHistory: '{time} · {kills} ubistava',
  meMausHistory: 'Maus uništen · {kills} ubistava',
  meMausToast: 'Maus uništen',
  meBannerVictoryWork: 'POBEDA! ODLIČAN POSAO!',
  meTargetDestroyedToast: 'Uništen {target}',
  meSilverUnit: '{n} srebra',

  // Settings
  settingsTitle: 'PODEŠAVANJA',
  tabSound: 'Zvuk',
  tabControls: 'Kontrole',
  tabGraphics: 'Grafika',
  tabGame: 'Igra',
  settingsStorageOk: 'Podešavanja se automatski čuvaju.',
  settingsStorageBlocked: 'Upozorenje: pregledač blokira localStorage, podešavanja se neće sačuvati nakon osvežavanja.',
  ctrlSwitchLabel: 'Režim upravljanja',
  ctrlSegPc: 'PC (miš + tastatura)',
  ctrlSegTouch: 'Telefon (dodir)',
  setMaster: 'Glavna jačina zvuka',
  setMusic: 'Muzika',
  setSfx: 'Zvučni efekti (pucnji, eksplozije)',
  setEngine: 'Motor i gusenice',
  setSens: 'Osetljivost miša',
  setTouchSens: 'Osetljivost prevlačenja',
  setSensSniper: 'Osetljivost u nišanu',
  setInvertY: 'Obrnuta vertikala (Invert Y)',
  setShadows: 'Senke',
  optOff: 'Isklj',
  optLow: 'Niska',
  optMed: 'Srednja',
  optHigh: 'Visoka',
  setPost: 'Naknadna obrada (sjaj, mapiranje tonova)',
  setBloom: 'Jačina sjaja',
  setGrass: 'Trava',
  setDrawDist: 'Daljina iscrtavanja',
  setResolution: 'Rezolucija renderovanja',
  setFov: 'Vidno polje (FOV)',
  setVignette: 'Vinjeta',
  setHitcam: 'Kamera pogodaka (rendgen)',
  setHints: 'Saveti za upravljanje',
  setBotSkill: 'Preciznost botova',
  setBotSkillFixed: '1 (fiksno)',
  setBotSkillLockedNote: 'Podešavanje preciznosti botova je dostupno samo u režimu «Trening».',
  setTouchGuide:
    '<div><b>Džojstik levo:</b> gas, rikverc i okretanje tela.</div>' +
    '<div><b>Džojstik mitraljeza desno:</b> držite za paljbu i pomerajte prst za nišanjenje kamere.</div>' +
    '<div><b>Prevlačenje po slobodnom ekranu:</b> rotacija kamere i nišanjenje kupole.</div>' +
    '<div><b>Dugmad desno i gore:</b> Paljba, Sposobnost (E), Pojas R, Nišan, Dvogled, Zum, Rezultat i Pauza.</div>',
  keysHead: 'Tasteri (kliknite dugme pa pritisnite novi taster, Esc — otkaži)',
  keysWait: 'pritisnite taster...',
  keysNote: 'Pucanje — levi taster miša. Točkić — zum. Ove radnje se ne mogu promeniti.',

  // Key Actions
  keyForward: 'Napred',
  keyBack: 'Nazad',
  keyLeft: 'Levo (skretanje)',
  keyRight: 'Desno (skretanje)',
  keyBrake: 'Ručna kočnica',
  keyMg: 'Mitraljez (paljba)',
  keyAbility: 'Specijalna sposobnost [E]',
  keySniper: 'Snajperski nišan',
  keyBinoc: 'Dvogled',
  keyComp: 'Balistički računar',
  keyPost: 'Naknadna obrada uklj/isklj',
  keyConsole: 'Konzola',

  // Scoreboard
  sbSub: 'Tabela rezultata · držite TAB ili pritisnite REZULTAT',
  sbAllies: 'SAVEZNICI',
  sbEnemies: 'NEPRIJATELJI',
  sbWeVsEnemiesGoal: 'MI {a} : {b} NEPRIJATELJI (cilj: {goal})',
  sbWeVsEnemiesTraining: 'MI {a} : {b} NEPRIJATELJI (trening)',
  sbRoundsScore: 'RUNDA {round} · MI {a} : {b} NEPRIJATELJI (do {win})',
  sbSurvivalScore: 'PREOSTALO {time} · UBISTVA: {kills}',
  sbBossScore: 'MAUS: {hp} / {max} HP',
  sbPlayerSelf: 'VI ({name})',

  // HUD
  hudThirdPerson: 'IZ TREĆEG LICA',
  hudSniper: 'NIŠAN NIŠANDŽIJE',
  hudBinoc: 'DVOGLED',
  hudBinocAim: 'DVOGLED - KLIK: USMERI KUPOLU',
  hudDistance: 'UDALJENOST',
  hudZoom: 'ZUM',
  hudComp: 'BALIST. KOMP.',
  hudMv: 'BRZINA GRANATE',
  hudMps: 'm/s',
  hudMetersUnit: 'm',
  hudSecShort: 's',
  hudCompOn: 'UKLJ',
  hudCompOff: 'ISKLJ',
  hudKmh: 'KM/H',
  hudGear: 'BRZINA',
  hudHull: 'TELO',
  hudTurret: 'KUPOLA',
  hudDurability: 'IZDRŽLJIVOST',
  hudKills: 'UBIJENO',
  hudAlive: 'U STROJU',
  hudWe: 'MI',
  hudEnemiesText: 'NEPRIJATELJI',
  hudRemaining: 'PREOSTALO',
  hudFragsVal: 'UBISTVA: {n}',
  hudGoalDestroyMaus: '· UNIŠTITE MAUSA',
  hudGoalFreeBattle: '· SLOBODNA BITKA',
  hudRoundTitle: '{mode} · RUNDA {round}',
  hudGunReady: 'SPREMAN',
  hudMgLabel: 'MITRALJEZ [{key}]',
  hudMgReady: 'SPREMAN',
  hudMgReloadPrompt: 'SPREMAN · R POJAS',
  hudMgReloading: 'PUNJENJE {t}s',
  hudMgOutOfAmmo: 'NESTAO METAKA',
  hudApsName: 'APS «TROPHY»',
  hudApsReady: 'SPREMAN',
  hudApsCooldown: '{t} s',
  hudAbilityGalix: 'GALIX [{key}]',
  hudAbilityDm63: 'DM63 [{key}]',
  hudAbilityThermal: 'TERMO [{key}]',
  hudAbilityKstam: 'KSTAM [{key}]',
  hudAbility2Barrage: 'PLJUSAK [{key}]',
  hudAbilityReady: 'SPREMAN',
  hudAbilityActive: 'FORSAŽ {t} s',
  hudAbilityThermalActive: 'FLIR {t} s',
  hudAbilityBarrageActive: '+35%/+50% {t} s',
  hudAbilityPrimed: 'NAPUNJEN',
  hudAbilityCooldown: '{t} s',
  hudThermalTag: 'TERMOVIZIJA GEN-2 · FLIR',
  hudWeakspotHdr: 'RANJIVE ZONE',
  hudWeakspotFuel: '• REZERVOAR: jedan pogodak',
  hudWeakspotRear: '• KRMA / MOTOR: puna šteta',
  hudWeakspotRoof: '• KROV: tanak oklop',
  hudKstamLocking: 'ZAHVAT KSTAM · {pct}%',
  hudKstamLocked: 'CILJ ZAKLJUČAN · PUSTITE DKM',
  hudKstamNoTarget: 'NIŠANITE NEPRIJATELJA (DKM)',
  hudBossName: 'MAUS',
  hudBossFlame: 'BACAČ PLAMENA',
  hudBossOverheat: 'PREGREVANJE · HLAĐENJE',
  hudBossFlamePct: 'BACAČ PLAMENA · {pct}%',
  hudTrackDamagedRepair: 'GUSENICA OŠTEĆENA: popravka {t} s',
  hudBarrelDamagedRepair: 'CEV OŠTEĆENA: popravka {t} s',
  hudOnFireDps: 'U PLAMENU: -{dps} HP/s',
  hudBurningDps: 'GORENJE: -10 HP/s ({t} s)',
  hudDeadRespawn: 'VAŠ TENK JE UNIŠTEN - OŽIVLJAVANJE ZA {t}',
  hudSpectatorTitle: 'REŽIM POSMATRAČA',
  hudWatching: 'Posmatranje:',
  hudSpecPrev: '◀ PRETH',
  hudSpecNext: 'SLEDEĆI ▶',
  hudSpecHint: 'Levi klik / ← / A — nazad · Desni klik / → / D — napred · MIŠ — pogled',
  hudHpUnit: 'HP',
  hudSilverToast: '+{amt} SREBRA',

  // Touch HUD
  tBtnScore: 'REZULTAT',
  tBtnPause: 'PAUZA',
  tBtnZoomVal: 'ZUM {val}',
  tBtnBinoc: 'DVOGLED',
  tBtnSniper: 'NIŠAN',
  tBtnMgReload: 'POJAS R',
  tBtnAbilityGalix: 'GALIX · {state}',
  tBtnAbilityDm63: 'DM63 · {state}',
  tBtnAbilityThermal: 'TERMO · {state}',
  tBtnAbilityKstam: 'KSTAM · {state}',
  tBtnAbilityBarrage: 'PLJUSAK · {state}',
  tBtnKstamHold: 'DKM · ZAHVAT',
  tBtnMgPad: 'MITRALJEZ',
  tBtnFire: 'PALJBA',
  tBtnReady: 'SPREMAN',
  tMgPadAria: 'Džojstik mitraljeza: držite za paljbu i prevlačite za nišanjenje',

  // Combat notifications & logs
  msgPen: 'POGODAK',
  msgCrit: 'KRITIČAN POGODAK',
  msgNopen: 'NIJE PROBIO (OKLOP)',
  msgRicochet: 'RIKOŠET',
  msgTrack: 'GUSENICA OŠTEĆENA',
  msgBarrel: 'CEV OŠTEĆENA',
  msgFuel: 'KRITIČAN POGODAK: REZERVOAR ZA GORIVO!',
  msgTargetDestroyed: 'CILJ UNIŠTEN',
  msgFuelDestroyed: 'EKSPLOZIJA REZERVOARA — UNIŠTEN!',
  msgYouWereHit: 'POGOĐENI STE: {res}',
  msgRamDealt: 'UDARAC! -{dmg} HP',
  msgRamTaken: 'UDARAC PO VAMA: -{dmg} HP',
  msgRockImpact: 'UDARAC U KAMEN: -{dmg} HP',
  msgMausCrushed: 'MAUS VAS JE PREGAZIO!',
  msgMausBurned: 'MAUS VAS JE SPALIO BACAČEM PLAMENA!',
  msgMgOutToast: 'NESTAO JE METAKA ZA MITRALJEZ',
  msgTrophyIntercept: 'APS «TROPHY» PRESREO GRANATU!',
  msgTrophyEnemyBlocked: 'GRANATU PRESREO APS «TROPHY»!',
  msgGalixActivated: 'FORSAŽ + DIMNA ZAVESA GALIX!',
  msgDm63Primed: 'APFSDS DM63 SPREMAN (500–550 ŠTETE)!',
  msgDm63Fired: 'ISPALJEN DM63!',
  msgDm63Hit: 'PROBOJ DM63: -{dmg} HP!',
  msgThermalActivated: 'TERMOVIZIJA GEN-2 UKLJUČENA (15 s)!',
  msgBarrageActivated: 'PROBOJNI PLJUSAK: +35% PUNJENJE, +50% PROBOJNOST!',
  msgKstamPrimed: 'KSTAM NAPUNJEN — DRŽITE DKM (1.5 s) NA NEPRIJATELJU!',
  msgKstamLocked: 'CILJ ZAKLJUČAN! PUSTITE DKM ZA LANSIRANJE KSTAM!',
  msgKstamFired: 'PAMETNA GRANATA KSTAM LANSIRANA ODOZGO!',
  msgKstamHit: 'KSTAM POGODAK ODOZGO: -{dmg} HP!',
  msgKstamCancelled: 'Zahvat KSTAM otkazan',
  msgRoundWinBanner: 'POBEDA U RUNDI!',
  msgRoundLossBanner: 'RUNDA IZGUBLJENA',
  msgRoundFullBanner: 'RUNDA {round}: {res} ({a} : {b})',
  msgRoundToast: 'RUNDA {round}',
  suffixFuel: ' [REZERVOAR]',
  suffixRam: ' [UDARAC]',
  suffixRock: ' [KAMEN]',
  suffixFlame: ' [BACAČ PLAMENA]',
  suffixMg: ' [MITRALJEZ]',

  // HitCam
  hcPen: 'Pogodak',
  hcCrit: 'Kritičan pogodak',
  hcNopen: 'Nije probio',
  hcRicochet: 'Rikošet',
  hcTrack: 'Gusenica oštećena',
  hcBarrel: 'Cev oštećena',
  hcFuel: 'Rezervoar — EKSPLOZIJA!',
  hcDestroyed: 'Cilj uništen',
  hcTopView: 'ODOZGO',
  hcSideView: 'SA STRANE',
};

const DICT_EN: TranslationDict = {
  // Brand & fixed
  brandTitle: 'IRON & SKY',
  tankBattleTag: 'TANK COMBAT',
  pageTitle: 'IRON & SKY — Tank Combat',
  pageDesc: '3D tank combat featuring a hangar, starter T-55 tank, armor zones, and realistic ballistics.',

  // Main buttons
  btnPlay: 'PLAY',
  btnContinueBattle: 'CONTINUE BATTLE',
  btnNewBattle: 'NEW BATTLE',
  btnModes: 'MODES',
  btnMaps: 'MAPS',
  btnHangar: 'HANGAR',
  btnSettings: 'SETTINGS',
  btnHistory: 'BATTLE HISTORY',
  btnControls: 'CONTROLS',
  btnLanguage: 'Язык/Language/Jezik',

  // Language panel
  langChooseTitle: 'CHOOSE LANGUAGE',
  langChooseTag: 'INTERFACE LANGUAGE',
  langIntro: 'Choose your preferred game interface language. You can change it at any time in the main menu using the "Язык/Language/Jezik" button.',
  langBadgeSelected: 'SELECTED',

  // Control choice
  ctrlChooseTitle: 'CHOOSE CONTROLS',
  ctrlIntro: 'Select your preferred control scheme before starting. You can always change it later in the "Controls" menu.',
  ctrlPcTitle: 'PC (KEYBOARD & MOUSE)',
  ctrlPcDesc: 'Movement with WASD, look & fire with mouse, machine gun on F, ability on E, sniper scope on Shift, scoreboard on TAB.',
  ctrlTouchTitle: 'MOBILE (TOUCH)',
  ctrlTouchDesc: 'Left joystick for movement, right joystick for machine gun (fire + aim) and fire button, swipe anywhere to aim.',
  ctrlRecommended: 'RECOMMENDED',

  // Common buttons
  btnDone: 'DONE',
  btnBack: 'BACK',
  btnBackToMenu: 'MAIN MENU',
  btnBackToHangar: 'BACK TO HANGAR',
  btnToHangar: 'TO HANGAR',
  btnResume: 'RESUME',
  btnReset: 'RESET',
  btnClose: 'CLOSE',
  btnSelect: 'SELECT',
  badgeSelected: 'SELECTED',

  // Main menu line & info
  mapline: 'Mode: {mode} · Map: {map} · Tank: {tank}',
  playEaster: "Whoever hasn't played a single match has spilled all the beer!",
  skyEaster: "What are you, a fool!? Don't mess with the gods!",
  tipTouch: 'Controls: Mobile (joystick on left, swipe look, buttons on right)',
  tipPc: 'Settings console: ~ · Scoreboard: TAB · Ramming: -20 HP',
  menuOrbitHint: 'LMB + drag — orbit camera · Wheel — zoom',
  menuOrbitHintTouch: 'Swipe to orbit camera',
  extraTraining: 'Cheats (sv_cheats on) and bot accuracy setting are active. No silver earned.',
  extraJuggernaut: 'Hunt for the Maus: 6 hunters vs boss (4000 HP). Maus has 128 mm gun and 20m flamethrower. +1500 silver for victory. Cheats disabled.',
  extraDead: 'Survive 5:00 against 5 enemies in random tanks (enemies respawn every 4s, you have 1 life). +1500 silver for victory. Cheats disabled.',
  extraRounds: '+50 silver per kill · +500 for victory · Spectator mode upon death. Cheats (sv_cheats) disabled.',
  extraTdm: '+50 silver per kill · +150 for 10 kills · +300 for 20 kills · +500 for victory. Cheats (sv_cheats) disabled.',

  // Hangar
  hangarTitle: 'HANGAR',
  hangarSub: 'COMBAT VEHICLES',
  hangarSilver: 'SILVER',
  hangarBackBtn: 'BACK TO MENU',
  hangarRoster: 'VEHICLE ROSTER',
  hangarHint: 'Click on a tank in the list on the left to view its specifications.',
  badgeEquipped: 'EQUIPPED',
  badgeInHangar: 'IN HANGAR',
  badgePriceSilver: '{n} SILV.',
  hstatDamage: 'Damage',
  hstatMaxSpeed: 'Max Speed',
  hstatReload: 'Gun Reload',
  hstatMaxRange: 'Max Shell Range',
  hstatMaxHp: 'Hull Durability',
  hstatGun: 'Main Gun',
  hstatMg: 'Machine Gun ({mag}/{total})',
  hstatFrontArmor: 'Front Armor',
  hstatFrontDmg: 'Incoming Frontal Damage',
  hstatSideRearDmg: 'Incoming Side/Rear Damage',
  hstatWeakspot: 'Weakspot',
  hstatWeakspotVal: 'Fuel Tank (one-shot)',
  hstatAps: 'Active Protection',
  hstatApsVal: 'Trophy APS · intercepts 1 shell every 15–20 s',
  hstatAbility: 'Special Ability [E]',
  hstatAbilityLeclerc: 'GALIX Overdrive 3.5 s + Large Smoke 8.5 s (15 s CD)',
  hstatAbilityLeopard: 'DM63 APFSDS Round (500–550 dmg, ignores armor, 15 s CD)',
  hstatAbilityAbrams: 'Thermal Sight Gen-2 (15 s, highlights enemies & weakspots, 30 s CD)',
  hstatAbilityK2: 'KSTAM Top-Attack [E]+[RMB 1.5 s] (500 roof dmg + 10 m splash)',
  hstatAbility2: 'Secondary Ability [F]',
  hstatAbilityAbramsBarrage: 'AP Barrage 6 s (+35% reload speed, +50% penetration, 18 s CD)',
  hstatPassive: 'Passive (Suspension)',
  hstatPassiveK2: 'Adaptive ISU Hydropneumatic (zero uphill penalty, -13°..+24° gun pitch)',
  hstatPowerRating: 'Combat Power',
  hstatPrice: 'Cost',
  hstatPriceBase: 'Starter (owned)',
  hstatPriceSilver: '{n} silver',
  armorSloped: '{hull} mm (sloped)',
  armorMantlet: '{hull} / {turret} mm (front / mantlet)',
  unitDamage: '{dmg} pts',
  unitDamageFull: '{dmg} pts (full)',
  unitDamageRange: '{min}–{max} pts',
  unitPowerRating: '{score} pts',
  unitSpeedKmh: '{spd} km/h',
  unitSec: '{sec} s',
  unitMeters: '{m} m',
  hangarEquippedStatus: 'Tank equipped for battle',
  hangarOwnedStatus: 'Purchased · ready to equip',
  hangarCanBuyStatus: 'Available for purchase for {price} silver',
  hangarNeedMoreStatus: 'Not enough silver (need {diff} more)',
  hangarBtnBuy: 'Buy for {price} silver',
  hangarBtnSelect: 'Select',
  hangarNotEnoughSilver: 'Not enough silver',

  // Battle History
  histTitle: 'BATTLE HISTORY',
  histMatches: 'MATCHES: <b>{total} / {max}</b>',
  histWins: 'WINS: <b>{wins}</b> ({pct}%)',
  histTotalSilver: 'SILVER: <b>+{silver}</b>',
  histEmpty: 'Battle history is empty. Finish a match in any game mode to see your stats.',
  histClearBtn: 'CLEAR HISTORY',
  histScoreRow: 'Score: {score}',
  histWin: 'VICTORY',
  histLoss: 'DEFEAT',
  histSilverEarned: '+{silver} silv.',
  histSilverZero: '0 silv.',

  // Map & Mode Panels
  mapPanelTitle: 'SELECT MAP',
  mapLoading: 'Loading...',
  modePanelTitle: 'SELECT MODE',

  // Pause
  pauseTitle: 'PAUSE',

  // Match End
  meVictory: 'VICTORY!',
  meDefeat: 'DEFEAT',
  meRowKills: 'Destroyed by you',
  meRowDeaths: 'Your vehicle losses',
  meRowVictorySilver: 'Victory reward',
  meRowTotalSilver: 'Total earned in match',
  meRowBalance: 'Current balance',
  meScoreRounds: 'Round score',
  meScoreTeams: 'Team score',
  meScoreSurvival: 'Survival time',
  meSubSurvivalLived: '{mode} · LIVED {time}',
  meSubSurvivalSurvived: '{mode} · SURVIVED {time}',
  meScoreSurvivalHistory: '{time} · {kills} kills',
  meMausHistory: 'Maus destroyed · {kills} kills',
  meMausToast: 'Maus destroyed',
  meBannerVictoryWork: 'VICTORY! WELL DONE!',
  meTargetDestroyedToast: 'Destroyed {target}',
  meSilverUnit: '{n} silver',

  // Settings
  settingsTitle: 'SETTINGS',
  tabSound: 'Sound',
  tabControls: 'Controls',
  tabGraphics: 'Graphics',
  tabGame: 'Game',
  settingsStorageOk: 'Settings are saved automatically.',
  settingsStorageBlocked: 'Warning: browser blocks localStorage, settings will not persist after restart.',
  ctrlSwitchLabel: 'Control Mode',
  ctrlSegPc: 'PC (mouse + keyboard)',
  ctrlSegTouch: 'Mobile (touch)',
  setMaster: 'Master Volume',
  setMusic: 'Music',
  setSfx: 'Sound Effects (shots, explosions)',
  setEngine: 'Engine & Tracks',
  setSens: 'Mouse Sensitivity',
  setTouchSens: 'Swipe Sensitivity',
  setSensSniper: 'Sniper Sensitivity',
  setInvertY: 'Invert Y-Axis',
  setShadows: 'Shadows',
  optOff: 'Off',
  optLow: 'Low',
  optMed: 'Medium',
  optHigh: 'High',
  setPost: 'Post-Processing (bloom, tonemapping)',
  setBloom: 'Bloom Intensity',
  setGrass: 'Grass',
  setDrawDist: 'Draw Distance',
  setResolution: 'Render Resolution',
  setFov: 'Field of View (FOV)',
  setVignette: 'Vignette',
  setHitcam: 'Hit Camera (X-ray)',
  setHints: 'Control Hints',
  setBotSkill: 'Bot Accuracy',
  setBotSkillFixed: '1 (fixed)',
  setBotSkillLockedNote: 'Bot accuracy adjustment is only available in "Training" mode.',
  setTouchGuide:
    '<div><b>Left joystick:</b> throttle, reverse, and hull steering.</div>' +
    '<div><b>Right machine gun joystick:</b> hold to fire and drag to aim camera.</div>' +
    '<div><b>Swipe on free screen:</b> rotate camera and aim turret.</div>' +
    '<div><b>Buttons on right and top:</b> Fire, Ability (E), Reload MG (R), Scope, Binoculars, Zoom, Score, and Pause.</div>',
  keysHead: 'Keybinds (click button then press a new key, Esc — cancel)',
  keysWait: 'press a key...',
  keysNote: 'Firing — Left Mouse Button. Wheel — Zoom. These actions cannot be rebound.',

  // Key Actions
  keyForward: 'Forward',
  keyBack: 'Backward',
  keyLeft: 'Steer Left',
  keyRight: 'Steer Right',
  keyBrake: 'Handbrake',
  keyMg: 'Machine Gun (fire)',
  keyAbility: 'Special Ability [E]',
  keySniper: 'Sniper Scope',
  keyBinoc: 'Binoculars',
  keyComp: 'Ballistic Computer',
  keyPost: 'Post-Processing toggle',
  keyConsole: 'Console',

  // Scoreboard
  sbSub: 'Scoreboard · hold TAB or press SCORE',
  sbAllies: 'ALLIES',
  sbEnemies: 'ENEMIES',
  sbWeVsEnemiesGoal: 'US {a} : {b} ENEMIES (goal: {goal})',
  sbWeVsEnemiesTraining: 'US {a} : {b} ENEMIES (training)',
  sbRoundsScore: 'ROUND {round} · US {a} : {b} ENEMIES (first to {win})',
  sbSurvivalScore: 'REMAINING {time} · KILLS: {kills}',
  sbBossScore: 'MAUS: {hp} / {max} HP',
  sbPlayerSelf: 'YOU ({name})',

  // HUD
  hudThirdPerson: 'THIRD PERSON',
  hudSniper: 'GUNNER SCOPE',
  hudBinoc: 'BINOCULARS',
  hudBinocAim: 'BINOCULARS - CLICK: ALIGN TURRET',
  hudDistance: 'DISTANCE',
  hudZoom: 'ZOOM',
  hudComp: 'BALLISTIC COMP.',
  hudMv: 'SHELL VELOCITY',
  hudMps: 'm/s',
  hudMetersUnit: 'm',
  hudSecShort: 's',
  hudCompOn: 'ON',
  hudCompOff: 'OFF',
  hudKmh: 'KM/H',
  hudGear: 'GEAR',
  hudHull: 'HULL',
  hudTurret: 'TURRET',
  hudDurability: 'DURABILITY',
  hudKills: 'KILLS',
  hudAlive: 'ALIVE',
  hudWe: 'US',
  hudEnemiesText: 'ENEMIES',
  hudRemaining: 'REMAINING',
  hudFragsVal: 'KILLS: {n}',
  hudGoalDestroyMaus: '· DESTROY THE MAUS',
  hudGoalFreeBattle: '· FREE BATTLE',
  hudRoundTitle: '{mode} · ROUND {round}',
  hudGunReady: 'READY',
  hudMgLabel: 'MACHINE GUN [{key}]',
  hudMgReady: 'READY',
  hudMgReloadPrompt: 'READY · R RELOAD',
  hudMgReloading: 'RELOADING {t}s',
  hudMgOutOfAmmo: 'OUT OF AMMO',
  hudApsName: 'TROPHY APS',
  hudApsReady: 'READY',
  hudApsCooldown: '{t}s',
  hudAbilityGalix: 'GALIX [{key}]',
  hudAbilityDm63: 'DM63 [{key}]',
  hudAbilityThermal: 'FLIR [{key}]',
  hudAbilityKstam: 'KSTAM [{key}]',
  hudAbility2Barrage: 'BARRAGE [{key}]',
  hudAbilityReady: 'READY',
  hudAbilityActive: 'BOOST {t}s',
  hudAbilityThermalActive: 'FLIR {t}s',
  hudAbilityBarrageActive: '+35%/+50% {t}s',
  hudAbilityPrimed: 'PRIMED',
  hudAbilityCooldown: '{t}s',
  hudThermalTag: 'THERMAL SIGHT GEN-2 · FLIR',
  hudWeakspotHdr: 'WEAKSPOTS',
  hudWeakspotFuel: '• FUEL TANK: instant kill (red)',
  hudWeakspotRear: '• REAR / ENGINE: full damage',
  hudWeakspotRoof: '• ROOF: thin top armor',
  hudKstamLocking: 'KSTAM LOCKING · {pct}%',
  hudKstamLocked: 'LOCKED · RELEASE RMB',
  hudKstamNoTarget: 'AIM AT ENEMY (RMB)',
  hudBossName: 'MAUS',
  hudBossFlame: 'FLAMETHROWER',
  hudBossOverheat: 'OVERHEAT · COOLING',
  hudBossFlamePct: 'FLAMETHROWER · {pct}%',
  hudTrackDamagedRepair: 'TRACK DAMAGED: repair {t} s',
  hudBarrelDamagedRepair: 'BARREL DAMAGED: repair {t} s',
  hudOnFireDps: 'ON FIRE: -{dps} HP/s',
  hudBurningDps: 'BURNING: -10 HP/s ({t} s)',
  hudDeadRespawn: 'YOUR TANK DESTROYED - RESPAWN IN {t}',
  hudSpectatorTitle: 'SPECTATOR MODE',
  hudWatching: 'Watching:',
  hudSpecPrev: '◀ PREV',
  hudSpecNext: 'NEXT ▶',
  hudSpecHint: 'LMB / ← / A — prev · RMB / → / D — next · MOUSE — look',
  hudHpUnit: 'HP',
  hudSilverToast: '+{amt} SILVER',

  // Touch HUD
  tBtnScore: 'SCORE',
  tBtnPause: 'PAUSE',
  tBtnZoomVal: 'ZOOM {val}',
  tBtnBinoc: 'BINOCULARS',
  tBtnSniper: 'SCOPE',
  tBtnMgReload: 'RELOAD R',
  tBtnAbilityGalix: 'GALIX · {state}',
  tBtnAbilityDm63: 'DM63 · {state}',
  tBtnAbilityThermal: 'FLIR · {state}',
  tBtnAbilityKstam: 'KSTAM · {state}',
  tBtnAbilityBarrage: 'BARRAGE · {state}',
  tBtnKstamHold: 'RMB · LOCK',
  tBtnMgPad: 'MG',
  tBtnFire: 'FIRE',
  tBtnReady: 'READY',
  tMgPadAria: 'Machine gun joystick: hold to fire and drag to aim',

  // Combat notifications & logs
  msgPen: 'HIT',
  msgCrit: 'CRITICAL HIT',
  msgNopen: 'DID NOT PENETRATE (ARMOR)',
  msgRicochet: 'RICOCHET',
  msgTrack: 'TRACK DAMAGED',
  msgBarrel: 'BARREL DAMAGED',
  msgFuel: 'CRITICAL HIT: FUEL TANK!',
  msgTargetDestroyed: 'TARGET DESTROYED',
  msgFuelDestroyed: 'FUEL TANK EXPLOSION — DESTROYED!',
  msgYouWereHit: 'YOU WERE HIT: {res}',
  msgRamDealt: 'RAMMING! -{dmg} HP',
  msgRamTaken: 'RAMMED: -{dmg} HP',
  msgRockImpact: 'ROCK IMPACT: -{dmg} HP',
  msgMausCrushed: 'THE MAUS CRUSHED YOU!',
  msgMausBurned: 'THE MAUS INCINERATED YOU WITH FLAMETHROWER!',
  msgMgOutToast: 'MACHINE GUN IS OUT OF AMMO',
  msgTrophyIntercept: 'TROPHY APS INTERCEPTED SHELL!',
  msgTrophyEnemyBlocked: 'SHELL INTERCEPTED BY TROPHY APS!',
  msgGalixActivated: 'GALIX OVERDRIVE + SMOKE SCREEN!',
  msgDm63Primed: 'DM63 APFSDS PRIMED (500–550 DMG)!',
  msgDm63Fired: 'DM63 APFSDS FIRED!',
  msgDm63Hit: 'DM63 PENETRATION: -{dmg} HP!',
  msgThermalActivated: 'THERMAL SIGHT GEN-2 ACTIVE (15 s)!',
  msgBarrageActivated: 'AP BARRAGE: +35% RELOAD SPEED, +50% PENETRATION!',
  msgKstamPrimed: 'KSTAM ARMED — HOLD RMB (1.5 s) ON AN ENEMY!',
  msgKstamLocked: 'TARGET LOCKED! RELEASE RMB TO LAUNCH KSTAM!',
  msgKstamFired: 'KSTAM TOP-ATTACK SHELL LAUNCHED!',
  msgKstamHit: 'KSTAM TOP-ATTACK HIT: -{dmg} HP!',
  msgKstamCancelled: 'KSTAM lock cancelled',
  msgRoundWinBanner: 'ROUND WON!',
  msgRoundLossBanner: 'ROUND LOST',
  msgRoundFullBanner: 'ROUND {round}: {res} ({a} : {b})',
  msgRoundToast: 'ROUND {round}',
  suffixFuel: ' [FUEL TANK]',
  suffixRam: ' [RAM]',
  suffixRock: ' [ROCK]',
  suffixFlame: ' [FLAMETHROWER]',
  suffixMg: ' [MACHINE GUN]',

  // HitCam
  hcPen: 'Hit',
  hcCrit: 'Critical Hit',
  hcNopen: 'Did Not Penetrate',
  hcRicochet: 'Ricochet',
  hcTrack: 'Track Damaged',
  hcBarrel: 'Barrel Damaged',
  hcFuel: 'Fuel Tank — EXPLOSION!',
  hcDestroyed: 'Target Destroyed',
  hcTopView: 'TOP',
  hcSideView: 'SIDE',
};

export const DICTIONARIES: Record<SupportedLanguage, TranslationDict> = {
  ru: DICT_RU,
  sr: DICT_SR,
  en: DICT_EN,
};

export const TANKS_LOCALIZED: Record<SupportedLanguage, Record<string, TankLocalized>> = {
  ru: {
    t55: {
      role: 'Средний танк',
      country: 'СССР',
      gunName: '100-мм пушка Д-10Т2С',
      description:
        'Базовый средний танк, выдаваемый всем бойцам по умолчанию. Оснащён 200-мм наклонной лобовой бронёй, 100-мм нарезным орудием и внешними кормовыми топливными баками.',
      mgName: '7.62-мм пулемёт ПКТ',
    },
    m60a3: {
      role: 'Основной боевой танк',
      country: 'США',
      gunName: '105-мм пушка M68',
      description:
        'Тяжёлый американский основной боевой танк с массивным корпусом, усиленной маской орудия и дальнобойным 105-мм нарезным орудием. Уступает Т-55 в максимальной скорости, но превосходит по скорострельности, дальности боя и лобовой защите.',
      mgName: '12.7-мм пулемёт M85',
    },
    t62m: {
      role: 'Основной боевой танк',
      country: 'СССР',
      gunName: '115-мм гладкоствольная У-5ТС',
      description:
        'Модернизированная советская классика с удлинённым корпусом, бортовыми экранами, характерными накладками брони («бровями») на башне и дальнобойной 115-мм гладкоствольной пушкой.',
      mgName: '12.7-мм пулемёт ДШКМ',
    },
    t72b3: {
      role: 'Современный ОБТ',
      country: 'Россия',
      gunName: '125-мм гладкоствольная 2А46М-5',
      description:
        'Современный российский основной боевой танк с комплектом динамической защиты «Реликт» на корпусе и башне, тепловизионным прицелом и 125-мм пушкой с теплозащитным кожухом.',
      mgName: '7.62-мм пулемёт ПКТМ',
    },
    leopard2a4: {
      role: 'Основной боевой танк',
      country: 'Германия',
      gunName: '120-мм гладкоствольная Rh-120 L/44',
      description:
        'Немецкий основной боевой танк с характерной угловатой башней с вертикальной многослойной лобовой бронёй, длинным корпусом, высокой скоростью 65 км/ч и скорострельной 120-мм пушкой.',
      mgName: '7.62-мм пулемёт MG3',
    },
    m1a1: {
      role: 'Основной боевой танк',
      country: 'США',
      gunName: '120-мм гладкоствольная M256',
      description:
        'Американский основной боевой танк с широким приземистым корпусом, массивной угловатой башней со скошенными «скулами» и длинной 120-мм гладкоствольной пушкой. Мощная композитная броня с урановыми вставками отлично держит удары в лоб, а высокая скорость и быстрая перезарядка делают его опасным на любых дистанциях.',
      mgName: '12.7-мм пулемёт M2HB',
    },
    ztz96a: {
      role: 'Основной боевой танк',
      country: 'Китай',
      gunName: '125-мм гладкоствольная ZPT-98',
      description:
        'Китайский основной боевой танк с приземистым корпусом, клиновидной башней, плотно обвешанной блоками встроенной динамической защиты, и длинной 125-мм гладкоствольной пушкой с автоматом заряжания. Клиновидная композитная броня уверенно гасит удары спереди, а стабильное орудие награждает точную стрельбу.',
      mgName: '12.7-мм пулемёт QJC-88',
    },
    t90m: {
      role: 'Современный ОБТ',
      country: 'Россия',
      gunName: '125-мм гладкоствольная 2А46М-5',
      description:
        'Современный российский основной боевой танк с новой сварной башней, характерным забашенным ящиком, плотной обшивкой динамической защиты «Реликт» по корпусу и башне, а также длинной 125-мм пушкой с теплозащитным кожухом. Мощнейшая лобовая защита и отличная динамика.',
      mgName: '12.7-мм пулемёт Корд',
    },
    merkava4: {
      role: 'Современный ОБТ',
      country: 'Израиль',
      gunName: '120-мм гладкоствольная MG253',
      description:
        'Современный израильский основной боевой танк с передним расположением двигателя, массивным скошенным носом, сильно сдвинутой назад клиновидной башней «летающая тарелка» с цепями-экранами сзади, стабилизированной 120-мм пушкой и комплексом активной защиты «Trophy» (Ветровка), перехватывающим вражеский снаряд каждые 15–20 секунд.',
      mgName: '7.62-мм пулемёт MAG',
    },
    challenger2: {
      role: 'Основной боевой танк',
      country: 'Великобритания',
      gunName: '120-мм нарезная L30A1',
      description:
        'Британский основной боевой танк с массивным длинным корпусом, крупной угловатой башней со скосами композитной брони «Чобхэм» и мощнейшей 120-мм нарезной пушкой L30A1, наносящей 90 единиц урона.',
      mgName: '7.62-мм пулемёт L94A1',
    },
    leclerc: {
      role: 'Современный ОБТ',
      country: 'Франция',
      gunName: '120-мм гладкоствольная CN120-26 F1',
      description:
        'Компактный французский ОБТ с классически центрированной плоской угловатой башней, кормовым автоматом заряжания на 2.5 с, трёхцветным камуфляжем НАТО, 100 км/ч, лазерной стабилизацией на полном ходу и способностью [E]: «Форсаж» + дымовая завеса GALIX, срывающая наведение ботов.',
      mgName: '12.7-мм пулемёт M2HB',
    },
    leopard2a7v: {
      role: 'Тяжёлый современный ОБТ',
      country: 'Германия',
      gunName: '120-мм гладкоствольная Rh-120 L/55A1',
      description:
        'Тяжёлый немецкий ОБТ с удлинённым корпусом, стреловидной бронёй башни, усиленным носом и длинной пушкой L/55A1. Способность [E] заряжает подкалиберный снаряд DM63, игнорирующий любую броню и КАЗ с уроном 500–550 ед.',
      mgName: '7.62-мм пулемёт MG3',
    },
    k2: {
      role: 'Современный горный ОБТ',
      country: 'Южная Корея',
      gunName: '120-мм гладкоствольная CN08 L/55',
      description:
        'Корейский ОБТ «Чёрная пантера» с низким силуэтом, автоматом заряжания на 2.5 с, адаптивной гидропневмоподвеской (без потери скорости в гору, УВН -13°..+24°) и умным снарядом KSTAM [E]+[ПКМ 1.5 с], бьющим в крышу (500 ур. + 10 м сплэш).',
      mgName: '12.7-мм пулемёт K6',
    },
    m1a2sep: {
      role: 'Флагманский тяжёлый ОБТ',
      country: 'США',
      gunName: '120-мм гладкоствольная M256 (M829)',
      description:
        'Модернизированный «Абрамс» с газотурбинным двигателем, урановой лобовой бронёй башни, дальностью 1500 м, уроном 100 ед., тепловизором Gen-2 [E] (подсветка врагов и бензобаков) и способностью [F]: «Бронебойный шквал» (+35% скорострельность, +50% пробитие).',
      mgName: '12.7-мм турель M2HB',
    },
    maus: {
      role: 'Сверхтяжёлый танк (босс)',
      country: 'Германия',
      gunName: '128-мм пушка KwK 44 + Огнемёт',
      description:
        'ИИ-босс режима «Джагернаут». Сверхтяжёлый танк в тёмно-серой броне Dunkelgrau со 128-мм орудием и огнемётом на 20 м.',
      mgName: '7.92-мм спаренный MG 34',
    },
  },
  sr: {
    t55: {
      role: 'Srednji tenk',
      country: 'SSSR',
      gunName: 'Top 100 mm D-10T2S',
      description:
        'Osnovni srednji tenk koji se dodeljuje svim borcima po podrazumevanoj vrednosti. Opremljen kosim čeonim oklopom od 200 mm, olučenim topom od 100 mm i spoljnim krmenim rezervoarima za gorivo.',
      mgName: 'Mitraljez 7.62 mm PKT',
    },
    m60a3: {
      role: 'Osnovni borbeni tenk',
      country: 'SAD',
      gunName: 'Top 105 mm M68',
      description:
        'Teški američki osnovni borbeni tenk sa masivnim telom, ojačanom maskom topa i dalekometnim olučenim topom od 105 mm. Sporiji je od T-55 po maksimalnoj brzini, ali ga nadmašuje u brzini paljbe, dometu i čeonoj zaštiti.',
      mgName: 'Mitraljez 12.7 mm M85',
    },
    t62m: {
      role: 'Osnovni borbeni tenk',
      country: 'SSSR',
      gunName: 'Glatkocevni top 115 mm U-5TS',
      description:
        'Modernizovani sovjetski klasik sa produženim telom, bočnim štitnicima, prepoznatljivim dodacima oklopa («obrvama») na kupoli i dalekometnim glatkocevnim topom od 115 mm.',
      mgName: 'Mitraljez 12.7 mm DŠKM',
    },
    t72b3: {
      role: 'Savremeni OBT',
      country: 'Rusija',
      gunName: 'Glatkocevni top 125 mm 2A46M-5',
      description:
        'Savremeni ruski osnovni borbeni tenk sa kompletom reaktivnog oklopa «Relikt» na telu i kupoli, termovizijskim nišanom i topom od 125 mm sa termozaštitnom oblogom.',
      mgName: 'Mitraljez 7.62 mm PKTM',
    },
    leopard2a4: {
      role: 'Osnovni borbeni tenk',
      country: 'Nemačka',
      gunName: 'Glatkocevni top 120 mm Rh-120 L/44',
      description:
        'Nemački osnovni borbeni tenk sa karakterističnom uglastom kupolom i vertikalnim višeslojnim čeonim oklopom, dugim telom, velikom brzinom od 65 km/h i brzometnim topom od 120 mm.',
      mgName: 'Mitraljez 7.62 mm MG3',
    },
    m1a1: {
      role: 'Osnovni borbeni tenk',
      country: 'SAD',
      gunName: 'Glatkocevni top 120 mm M256',
      description:
        'Američki osnovni borbeni tenk sa širokim niskim telom, masivnom uglastom kupolom sa zakošenim stranicama i dugim glatkocevnim topom od 120 mm. Moćan kompozitni oklop sa uranijumskim umecima odlično zadržava čeone udarce, a velika brzina i brzo punjenje čine ga opasnim na svim distancama.',
      mgName: 'Mitraljez 12.7 mm M2HB',
    },
    ztz96a: {
      role: 'Osnovni borbeni tenk',
      country: 'Kina',
      gunName: 'Glatkocevni top 125 mm ZPT-98',
      description:
        'Kineski osnovni borbeni tenk sa niskim profilom, kupolom u obliku klina gusto obloženom blokovima integrisanog reaktivnog oklopa, i dugim glatkocevnim topom od 125 mm sa automatskim punjačem. Klinasti kompozitni oklop efikasno ublažava čeone udarce.',
      mgName: 'Mitraljez 12.7 mm QJC-88',
    },
    t90m: {
      role: 'Savremeni OBT',
      country: 'Rusija',
      gunName: 'Glatkocevni top 125 mm 2A46M-5',
      description:
        'Savremeni ruski osnovni borbeni tenk sa novom zavarenom kupolom, karakterističnim zadnjim sandukom, gustom oblogom reaktivnog oklopa «Relikt» po telu i kupoli, i dugim topom od 125 mm sa termozaštitnim plaštom. Vrhunska čeona zaštita i odlična dinamika.',
      mgName: 'Mitraljez 12.7 mm Kord',
    },
    merkava4: {
      role: 'Savremeni OBT',
      country: 'Izrael',
      gunName: 'Glatkocevni top 120 mm MG253',
      description:
        'Savremeni izraelski osnovni borbeni tenk sa motorom napred, masivnim kosim nosom, kupolom oblika «letećeg tanjira» pomerenom unazad sa lančanim zavesama, stabilisanim topom od 120 mm i sistemom aktivne zaštite «Trophy» (Vetrovka) koji presreće granatu svakih 15–20 sekundi.',
      mgName: 'Mitraljez 7.62 mm MAG',
    },
    challenger2: {
      role: 'Osnovni borbeni tenk',
      country: 'Velika Britanija',
      gunName: 'Olučeni top 120 mm L30A1',
      description:
        'Britanski osnovni borbeni tenk sa masivnim dugim telom, velikom uglastom kupolom sa zakošenim kompozitnim oklopom «Čobhem» i moćnim olučenim topom 120 mm L30A1 koji nanosi 90 jedinica štete.',
      mgName: 'Mitraljez 7.62 mm L94A1',
    },
    leclerc: {
      role: 'Savremeni OBT',
      country: 'Francuska',
      gunName: 'Glatkocevni top 120 mm CN120-26 F1',
      description:
        'Kompaktni francuski OBT sa centralno postavljenom niskom uglastom kupolom, automatskim punjačem od 2.5 s, NATO maskirnom šarom, brzinom od 100 km/h, laserskom stabilizacijom u pokretu i sposobnošću [E]: «Forsaž» + dimna zavesa GALIX.',
      mgName: 'Mitraljez 12.7 mm M2HB',
    },
    leopard2a7v: {
      role: 'Teški savremeni OBT',
      country: 'Nemačka',
      gunName: 'Glatkocevni top 120 mm Rh-120 L/55A1',
      description:
        'Teški nemački OBT sa produženim telom, strelastim oklopom kupole, pojačanim prednjim blokom i dugim topom L/55A1. Sposobnost [E] puni potkalibarnu granatu DM63 koja ignoriše oklop i APS uz štetu od 500–550 jed.',
      mgName: 'Mitraljez 7.62 mm MG3',
    },
    k2: {
      role: 'Savremeni planinski OBT',
      country: 'Južna Koreja',
      gunName: 'Glatkocevni top 120 mm CN08 L/55',
      description:
        'Južnokorejski OBT «Crni panter» sa niskim profilom, automatskim punjačem od 2.5 s, adaptivnim ISU vešanjem (bez gubitka brzine uzbrdo, -13°..+24°) i pametnom granatom KSTAM [E]+[DKM 1.5 s] za udar u krov (500 štete + 10 m).',
      mgName: 'Mitraljez 12.7 mm K6',
    },
    m1a2sep: {
      role: 'Vrhunski teški OBT',
      country: 'SAD',
      gunName: 'Glatkocevni top 120 mm M256 (M829)',
      description:
        'Napredni «Abrams» sa gasnom turbinom, uranijumskim oklopom kupole, dometom 1500 m, štetom od 100 jed., termovizijom Gen-2 [E] (isticanje meta i rezervoara) i sposobnošću [F]: «Probojni pljusak» (+35% punjenje, +50% probojnost).',
      mgName: 'Kupola 12.7 mm M2HB',
    },
    maus: {
      role: 'Superteški tenk (bos)',
      country: 'Nemačka',
      gunName: 'Top 128 mm KwK 44 + Bacač plamena',
      description:
        'AI bos režima «Džagernaut». Superteški tenk u tamno-sivom oklopu Dunkelgrau sa topom od 128 mm i bacačem plamena na 20 m.',
      mgName: 'Spregnuti mitraljez 7.92 mm MG 34',
    },
  },
  en: {
    t55: {
      role: 'Medium Tank',
      country: 'USSR',
      gunName: '100 mm D-10T2S gun',
      description:
        'Starter medium tank issued to all fighters by default. Equipped with 200 mm sloped frontal armor, a 100 mm rifled gun, and external rear fuel tanks.',
      mgName: '7.62 mm PKT machine gun',
    },
    m60a3: {
      role: 'Main Battle Tank',
      country: 'USA',
      gunName: '105 mm M68 gun',
      description:
        'Heavy American main battle tank with a massive hull, reinforced gun mantlet, and long-range 105 mm rifled gun. Trades top speed for superior fire rate, engagement range, and frontal protection.',
      mgName: '12.7 mm M85 machine gun',
    },
    t62m: {
      role: 'Main Battle Tank',
      country: 'USSR',
      gunName: '115 mm smoothbore U-5TS',
      description:
        'Modernized Soviet classic featuring an extended hull, side skirts, distinctive turret eyebrow armor, and a powerful 115 mm smoothbore gun.',
      mgName: '12.7 mm DShKM machine gun',
    },
    t72b3: {
      role: 'Modern MBT',
      country: 'Russia',
      gunName: '125 mm smoothbore 2A46M-5',
      description:
        'Modern Russian main battle tank outfitted with Relikt explosive reactive armor on hull and turret, thermal imaging sight, and a 125 mm gun with thermal sleeve.',
      mgName: '7.62 mm PKTM machine gun',
    },
    leopard2a4: {
      role: 'Main Battle Tank',
      country: 'Germany',
      gunName: '120 mm smoothbore Rh-120 L/44',
      description:
        'German main battle tank featuring an angular turret with vertical composite armor, extended hull, high top speed of 65 km/h, and a rapid-firing 120 mm gun.',
      mgName: '7.62 mm MG3 machine gun',
    },
    m1a1: {
      role: 'Main Battle Tank',
      country: 'USA',
      gunName: '120 mm smoothbore M256',
      description:
        'American main battle tank with a low slung profile, massive angular turret cheeks, and a long 120 mm smoothbore gun. Depleted uranium armor provides outstanding frontal resilience.',
      mgName: '12.7 mm M2HB machine gun',
    },
    ztz96a: {
      role: 'Main Battle Tank',
      country: 'China',
      gunName: '125 mm smoothbore ZPT-98',
      description:
        'Chinese main battle tank with a compact hull, arrowhead turret lined with modular reactive armor blocks, and an autoloader-fed 125 mm smoothbore gun.',
      mgName: '12.7 mm QJC-88 machine gun',
    },
    t90m: {
      role: 'Modern MBT',
      country: 'Russia',
      gunName: '125 mm smoothbore 2A46M-5',
      description:
        'State-of-the-art Russian main battle tank with a newly welded turret, rear bustle stowage, full Relikt reactive armor coverage, and a potent 125 mm gun. Unrivaled frontal armor and mobility.',
      mgName: '12.7 mm Kord machine gun',
    },
    merkava4: {
      role: 'Modern MBT',
      country: 'Israel',
      gunName: '120 mm smoothbore MG253',
      description:
        'Modern Israeli main battle tank with a front-mounted engine, heavily sloped glacis, rear-shifted saucer-wedge turret with ball-and-chain curtains, stabilized 120 mm gun, and Trophy active protection system intercepting incoming shells every 15–20 seconds.',
      mgName: '7.62 mm MAG machine gun',
    },
    challenger2: {
      role: 'Main Battle Tank',
      country: 'United Kingdom',
      gunName: '120 mm rifled L30A1',
      description:
        'British main battle tank featuring a massive extended hull, large angular turret with Chobham composite armor slopes, and a hard-hitting 120 mm L30A1 rifled gun dealing 90 damage per shot.',
      mgName: '7.62 mm L94A1 machine gun',
    },
    leclerc: {
      role: 'Modern MBT',
      country: 'France',
      gunName: '120 mm smoothbore CN120-26 F1',
      description:
        'Compact French MBT with a centered angular flat turret, 2.5 s autoloader, French NATO tricolor camo, 100 km/h top speed, pinpoint laser stabilization on the move, and [E] GALIX Overdrive + Smoke Screen disrupting enemy bot aim.',
      mgName: '12.7 mm M2HB machine gun',
    },
    leopard2a7v: {
      role: 'Heavy Modern MBT',
      country: 'Germany',
      gunName: '120 mm smoothbore Rh-120 L/55A1',
      description:
        'Predatory heavy German MBT with an extended hull, reinforced glacis nose module, sharp arrowhead turret cheeks, and long L/55A1 cannon. Ability [E] loads a DM63 APFSDS round dealing 500–550 damage while ignoring armor and APS.',
      mgName: '7.62 mm MG3 machine gun',
    },
    k2: {
      role: 'Modern Mountain MBT',
      country: 'South Korea',
      gunName: '120 mm smoothbore CN08 L/55',
      description:
        'South Korean Black Panther MBT with low-profile hull, 2.5 s autoloader, adaptive ISU suspension (zero uphill climb penalty, -13°..+24° pitch), and KSTAM top-attack smart shell [E]+[RMB 1.5 s] dealing 500 roof damage + 10 m enemy-only splash.',
      mgName: '12.7 mm K6 machine gun',
    },
    m1a2sep: {
      role: 'Flagship Heavy MBT',
      country: 'USA',
      gunName: '120 mm smoothbore M256 (M829)',
      description:
        'Upgraded Abrams with a gas turbine engine, depleted uranium turret armor, 1500 m effective range, 100 dmg DU rounds, [E] Gen-2 Thermal Sight highlighting enemies and fuel weakspots, and [F] AP Barrage (+35% fire rate, +50% penetration).',
      mgName: '12.7 mm M2HB cupola',
    },
    maus: {
      role: 'Super-Heavy Tank (Boss)',
      country: 'Germany',
      gunName: '128 mm KwK 44 gun + Flamethrower',
      description:
        'AI Boss in Juggernaut mode. Super-heavy behemoth in dark Dunkelgrau armor armed with a lethal 128 mm cannon and a 20m flamethrower.',
      mgName: '7.92 mm coaxial MG 34',
    },
  },
};

export const MODES_LOCALIZED: Record<SupportedLanguage, Record<string, ModeLocalized>> = {
  ru: {
    tdm100: {
      name: 'Бой до 100 киллов',
      shortDesc: '4 на 4 с возрождениями до 100 уничтожений. +500 серебра за победу. Консоль без читов (sv_cheats off), точность ботов фиксирована.',
    },
    rounds5v5: {
      name: '5 на 5 (Раунды)',
      shortDesc: 'Командный бой 5 на 5 по раундам (до 3 побед) без возрождений. После гибели — режим наблюдателя. +500 серебра за победу.',
    },
    training: {
      name: 'Тренировка',
      shortDesc: 'Свободный тренировочный полигон 4 на 4. Разрешены читы (sv_cheats on) и настройка точности ботов в Настройках.',
    },
    juggernaut: {
      name: 'Джагернаут',
      shortDesc:
        'Охотники (вы + 5 союзных ботов) против сверхтяжёлого босса Pz.Kpfw. VIII «Маус» (4000 ХП) в центре карты. Смертельное 128-мм орудие, таран и огнемёт на 20 м с перегревом. +1500 серебра за победу.',
    },
    dead: {
      name: 'Мертвецы',
      shortDesc:
        'Выживание 5:00 в одиночку против 5 преследующих ботов на случайных танках. Без возрождения игрока, респаун врагов каждые 4 с. Награда: 1500 серебра.',
    },
  },
  sr: {
    tdm100: {
      name: 'Borba do 100 ubistava',
      shortDesc: '4 na 4 sa ponovnim oživljavanjem do 100 eliminacija. +500 srebra za pobedu. Konzola bez čitova (sv_cheats off), fiksna preciznost botova.',
    },
    rounds5v5: {
      name: '5 na 5 (Runde)',
      shortDesc: 'Timska borba 5 na 5 po rundama (do 3 pobede) bez ponovnog oživljavanja. Posle pogibije — režim posmatrača. +500 srebra za pobedu.',
    },
    training: {
      name: 'Trening',
      shortDesc: 'Slobodan poligon za vežbu 4 na 4. Dozvoljeni su čitovi (sv_cheats on) i podešavanje preciznosti botova u Podešavanjima.',
    },
    juggernaut: {
      name: 'Džagernaut',
      shortDesc:
        'Lovci (vi + 5 savezničkih botova) protiv superteškog bosa Pz.Kpfw. VIII «Maus» (4000 HP) u centru mape. Smrtonosni top od 128 mm, udarac i bacač plamena na 20 m sa pregrevanjem. +1500 srebra za pobedu.',
    },
    dead: {
      name: 'Mrtvaci',
      shortDesc:
        'Preživljavanje 5:00 solo protiv 5 botova koji vas progone na nasumičnim tenkovima. Bez oživljavanja igrača, neprijatelji se stvaraju svake 4 s. Nagrada: 1500 srebra.',
    },
  },
  en: {
    tdm100: {
      name: 'Battle to 100 Kills',
      shortDesc: '4v4 team deathmatch with respawns up to 100 team kills. +500 silver for victory. Console without cheats (sv_cheats off), fixed bot accuracy.',
    },
    rounds5v5: {
      name: '5v5 (Rounds)',
      shortDesc: '5v5 team elimination across rounds (first to 3 wins) with no respawns. Spectator mode upon death. +500 silver for victory.',
    },
    training: {
      name: 'Training',
      shortDesc: 'Free 4v4 training grounds. Cheats enabled (sv_cheats on) and bot accuracy customizable in Settings.',
    },
    juggernaut: {
      name: 'Juggernaut',
      shortDesc:
        'Hunters (you + 5 allied bots) vs super-heavy boss Pz.Kpfw. VIII "Maus" (4000 HP) in map center. Deadly 128 mm cannon, ramming, and 20m flamethrower. +1500 silver for victory.',
    },
    dead: {
      name: 'Dead Men',
      shortDesc:
        'Survive 5:00 solo against 5 relentless bots in random tanks. No player respawn, enemy respawn every 4 seconds. Reward: 1500 silver.',
    },
  },
};

export const MAPS_LOCALIZED: Record<SupportedLanguage, Record<string, MapLocalized>> = {
  ru: {
    hills: {
      name: 'Холмы',
      desc: 'Открытая местность: холмы, рощи, лощины и небольшой городок. Дальние дистанции, укрытия за рельефом.',
    },
    city: {
      name: 'Город',
      desc: 'Разрушенный войной город: руины, обломки стен, воронки и трещины в асфальте. Серая мгла, тесные улицы, ближний бой.',
    },
  },
  sr: {
    hills: {
      name: 'Brda',
      desc: 'Otvoreno područje: brda, šumarci, udoline i mali gradić. Velike daljine, zakloni iza reljefa.',
    },
    city: {
      name: 'Grad',
      desc: 'Ratom razrušen grad: ruševine, krhotine zidova, krateri i pukotine u asfaltu. Sivo sivilo, uske ulice, borba na blizinu.',
    },
  },
  en: {
    hills: {
      name: 'Hills',
      desc: 'Open terrain: rolling hills, groves, depressions, and a small township. Long ranges, tactical cresting.',
    },
    city: {
      name: 'City',
      desc: 'War-torn urban area: ruins, collapsed masonry, shell craters, and cracked asphalt. Gray haze, narrow streets, close-quarters combat.',
    },
  },
};

export function getLanguage(): SupportedLanguage {
  const l = settings.language;
  return l === 'sr' || l === 'en' ? l : 'ru';
}

export function setLanguage(lang: SupportedLanguage): void {
  const nextLang = SUPPORTED_LANGUAGES.includes(lang) ? lang : 'ru';
  setSetting('language', nextLang);
  setSetting('languageChosen', true);
  applyDocumentLanguage(nextLang);
}

export function applyDocumentLanguage(lang: SupportedLanguage = getLanguage()): void {
  if (typeof document === 'undefined') return;
  const card = LANGUAGE_CARDS.find((c) => c.id === lang) || LANGUAGE_CARDS[0];
  document.documentElement.lang = card.htmlLang;
  document.title = t('pageTitle', undefined, lang);
}

export function t(key: string, vars?: Record<string, string | number>, lang?: SupportedLanguage): string {
  const activeLang = lang || getLanguage();
  const dict = DICTIONARIES[activeLang] || DICT_RU;
  let text = dict[key] ?? DICT_RU[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

export function getTankText(tankId: string, lang?: SupportedLanguage): TankLocalized {
  const activeLang = lang || getLanguage();
  const localizedPool = TANKS_LOCALIZED[activeLang] || TANKS_LOCALIZED.ru;
  if (localizedPool[tankId]) return localizedPool[tankId];
  return TANKS_LOCALIZED.ru[tankId] || TANKS_LOCALIZED.ru.t55;
}

export function getModeText(modeId: string, lang?: SupportedLanguage): ModeLocalized {
  const activeLang = lang || getLanguage();
  const localizedPool = MODES_LOCALIZED[activeLang] || MODES_LOCALIZED.ru;
  if (localizedPool[modeId]) return localizedPool[modeId];
  return MODES_LOCALIZED.ru[modeId] || MODES_LOCALIZED.ru.tdm100;
}

export function getMapText(mapId: string, lang?: SupportedLanguage): MapLocalized {
  const activeLang = lang || getLanguage();
  const localizedPool = MAPS_LOCALIZED[activeLang] || MAPS_LOCALIZED.ru;
  if (localizedPool[mapId]) return localizedPool[mapId];
  return MAPS_LOCALIZED.ru[mapId] || MAPS_LOCALIZED.ru.hills;
}

export function getHitCamResult(
  result: string,
  destroyed: boolean,
  lang?: SupportedLanguage,
): { label: string; color: string } {
  if (result === 'fuel') {
    return { label: t('hcFuel', undefined, lang), color: '#ff4c2a' };
  }
  if (destroyed) {
    return { label: t('hcDestroyed', undefined, lang), color: '#ff6a4a' };
  }
  const map: Record<string, [string, string]> = {
    pen: [t('hcPen', undefined, lang), '#ffd27a'],
    crit: [t('hcCrit', undefined, lang), '#ff6a4a'],
    nopen: [t('hcNopen', undefined, lang), '#cfd6dd'],
    ricochet: [t('hcRicochet', undefined, lang), '#cfd6dd'],
    track: [t('hcTrack', undefined, lang), '#ffd27a'],
    barrel: [t('hcBarrel', undefined, lang), '#ffd27a'],
  };
  const [label, color] = map[result] || ['', '#fff'];
  return { label, color };
}
