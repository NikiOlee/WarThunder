import {
  detectTouchDeviceHint,
  getKeyLabels,
  keyName,
  resetSettings,
  setKeyBind,
  setSetting,
  settings,
  storage,
  type ControlMode,
  type GameSettings,
  type KeyAction,
  type SupportedLanguage,
} from './settings';
import { audio } from './audio';
import { getAllTanks, getSelectedTankId, getTankPowerRating, getTankSpec, setSelectedTankId, type TankSpec } from './tanks';
import { getSilver, isTankOwned, purchaseTank } from './economy';
import { getAllModes, getModeDef } from './modes';
import { isLondonMap, isModeOptionLocked } from './bombardment';
import { computeFrontDamage } from './damage';
import {
  clearMatchHistory,
  formatMatchTimestamp,
  getMatchHistory,
  MAX_MATCH_HISTORY,
  summarizeMatchHistory,
} from './matchHistory';
import {
  applyDocumentLanguage,
  getLanguage,
  getMapText,
  getModeText,
  getTankText,
  setLanguage,
  t,
} from './i18n';
import type { BenchmarkProfileId, BenchmarkSummary } from './benchmark';

interface SettingItem {
  k?: keyof GameSettings;
  t: 'range' | 'check' | 'select' | 'keys' | 'section';
  l?: string;
  min?: number;
  max?: number;
  step?: number;
  pct?: boolean;
  num?: boolean;
  opts?: Array<[string | number, string]>;
  controlOnly?: ControlMode;
}

function getLocalizedTabs(): Record<string, { label: string; items: SettingItem[] }> {
  return {
    sound: {
      label: t('tabSound'),
      items: [
        { k: 'master', t: 'range', l: t('setMaster'), min: 0, max: 1, step: 0.05, pct: true },
        { k: 'music', t: 'range', l: t('setMusic'), min: 0, max: 1, step: 0.05, pct: true },
        { k: 'sfx', t: 'range', l: t('setSfx'), min: 0, max: 1, step: 0.05, pct: true },
        { k: 'engine', t: 'range', l: t('setEngine'), min: 0, max: 1, step: 0.05, pct: true },
      ],
    },
    controls: {
      label: t('tabControls'),
      items: [
        { k: 'sens', t: 'range', l: t('setSens'), min: 0.2, max: 3, step: 0.05, controlOnly: 'pc' },
        { k: 'touchSens', t: 'range', l: t('setTouchSens'), min: 0.3, max: 2.8, step: 0.05, controlOnly: 'touch' },
        { k: 'sensSniper', t: 'range', l: t('setSensSniper'), min: 0.2, max: 3, step: 0.05 },
        { k: 'invertY', t: 'check', l: t('setInvertY') },
        { t: 'keys', controlOnly: 'pc' },
      ],
    },
    graphics: {
      label: t('tabGraphics'),
      items: [
        { t: 'section', l: t('gfxSecPerf') },
        {
          k: 'fpsLimit',
          t: 'select',
          num: true,
          l: t('setFpsLimit'),
          opts: [
            [0, t('optFpsUnlimited')],
            [120, '120 FPS'],
            [60, '60 FPS'],
            [30, '30 FPS'],
          ],
        },
        {
          k: 'resolution',
          t: 'select',
          num: true,
          l: t('setResolution'),
          opts: [
            [0.5, '50%'],
            [0.6, '60%'],
            [0.8, '80%'],
            [1, '100%'],
            [1.25, '125%'],
          ],
        },
        {
          k: 'dprCap',
          t: 'select',
          num: true,
          l: t('setDprCap'),
          opts: [
            [1, '1.0x'],
            [1.5, '1.5x'],
            [2, '2.0x'],
          ],
        },
        { k: 'showFps', t: 'check', l: t('setShowFps') },
        { t: 'section', l: t('gfxSecLighting') },
        {
          k: 'shadows',
          t: 'select',
          l: t('setShadows'),
          opts: [
            ['off', t('optOff')],
            ['low', t('optLow')],
            ['medium', t('optMed')],
            ['high', t('optHigh')],
            ['ultra', t('optUltra')],
          ],
        },
        {
          k: 'shadowType',
          t: 'select',
          l: t('setShadowType'),
          opts: [
            ['basic', t('optShadowBasic')],
            ['pcf', t('optShadowPcf')],
            ['soft', t('optShadowSoft')],
          ],
        },
        { k: 'envReflections', t: 'check', l: t('setEnvReflections') },
        { k: 'post', t: 'check', l: t('setPost') },
        { k: 'bloom', t: 'range', l: t('setBloom'), min: 0, max: 1.2, step: 0.05 },
        { k: 'colorSaturation', t: 'range', l: t('setColorSat'), min: 0.6, max: 1.4, step: 0.05 },
        { k: 'exposureBias', t: 'range', l: t('setExposure'), min: 0.7, max: 1.4, step: 0.05 },
        { k: 'vignette', t: 'check', l: t('setVignette') },
        { t: 'section', l: t('gfxSecWorld') },
        {
          k: 'drawDist',
          t: 'select',
          l: t('setDrawDist'),
          opts: [
            ['low', t('optLow')],
            ['medium', t('optMed')],
            ['high', t('optHigh')],
            ['ultra', t('optUltra')],
          ],
        },
        { k: 'lodScale', t: 'range', l: t('setLodScale'), min: 0.5, max: 1.5, step: 0.05 },
        {
          k: 'grass',
          t: 'select',
          num: true,
          l: t('setGrass'),
          opts: [
            [0, t('optOff')],
            [0.25, '25%'],
            [0.5, t('optMed')],
            [0.75, '75%'],
            [1, t('optHigh')],
          ],
        },
        { k: 'particles', t: 'range', l: t('setParticles'), min: 0.25, max: 1.5, step: 0.05 },
        { k: 'fov', t: 'range', l: t('setFov'), min: 50, max: 95, step: 1 },
      ],
    },
    game: {
      label: t('tabGame'),
      items: [
        { k: 'hitcam', t: 'check', l: t('setHitcam') },
        { k: 'hints', t: 'check', l: t('setHints') },
        { k: 'botSkill', t: 'range', l: t('setBotSkill'), min: 0.4, max: 1.8, step: 0.05 },
      ],
    },
  };
}

export interface MapDef {
  id: string;
  name: string;
  desc: string;
}

export interface MatchEndSummary {
  won: boolean;
  modeName: string;
  scoreLabel: string;
  scoreText?: string;
  subLabel?: string;
  teamAScore: number;
  teamBScore: number;
  targetGoal: number;
  playerKills: number;
  playerDeaths: number;
  matchSilverEarned: number;
  victorySilver: number;
  totalSilver: number;
}

export interface UIHandlers {
  play: (fresh: boolean) => void;
  resume: () => void;
  toMenu: () => void;
  started: () => boolean;
  maps: MapDef[];
  getMap: () => string;
  setMap: (id: string) => void;
  getModeId: () => string;
  setModeId: (id: string) => void;
  onSelectTank: (tankId: string) => void;
  onPreviewTank?: (tankId: string) => void;
  onHangarToggle: (open: boolean) => void;
  startBenchmark: () => void;
}

export function createUI(h: UIHandlers) {
  const $ = (id: string) => document.getElementById(id)!;
  const menu = $('menu');
  const panels: Record<string, HTMLElement> = {
    languageSelect: $('languageSelectPanel'),
    controlSelect: $('controlSelectPanel'),
    main: $('mainPanel'),
    pause: $('pausePanel'),
    settings: $('settingsPanel'),
    maps: $('mapPanel'),
    modes: $('modePanel'),
    history: $('historyPanel'),
    credits: $('creditsPanel'),
    hangar: $('hangarScreen'),
    matchEnd: $('matchEndPanel'),
    benchmarkResult: $('benchmarkResultPanel'),
  };

  document.body.dataset.control = settings.controlMode;

  const ui = {
    rebinding: false,
    from: 'main',
    currentScreen: 'main' as string | null,
    show(which: string | null) {},
    openSettings(from: string, tTab?: string) {},
    showMatchEnd(summary: MatchEndSummary) {},
    showBenchmarkResults(
      summary: BenchmarkSummary,
      onChooseProfile: (id: BenchmarkProfileId) => void,
      onBack: () => void,
    ) {},
    refreshSilver() {},
    updateAllStaticTexts() {},
    renderLanguageCards() {},
  };

  let tab = 'sound';
  let inspectedTankId: string | null = null;

  function applyControlChoice(nextMode: ControlMode): void {
    setSetting('controlMode', nextMode);
    setSetting('controlChosen', true);
    document.body.dataset.control = nextMode;
  }

  function renderLanguageCards(): void {
    const cur = getLanguage();
    $('bLangRu')?.classList.toggle('selected', cur === 'ru');
    $('bLangSr')?.classList.toggle('selected', cur === 'sr');
    $('bLangEn')?.classList.toggle('selected', cur === 'en');

    $('badgeLangRu')?.classList.toggle('hidden', cur !== 'ru');
    $('badgeLangSr')?.classList.toggle('hidden', cur !== 'sr');
    $('badgeLangEn')?.classList.toggle('hidden', cur !== 'en');

    const backBtn = $('bLangBack');
    if (backBtn) {
      backBtn.style.display = settings.languageChosen ? 'inline-block' : 'none';
      backBtn.textContent = t('btnDone');
    }
  }
  ui.renderLanguageCards = renderLanguageCards;

  function updateAllStaticTexts(): void {
    applyDocumentLanguage();

    // Main panel
    const bPlay = $('bPlay');
    if (bPlay) bPlay.textContent = h.started() ? t('btnContinueBattle') : t('btnPlay');
    const bNew = $('bNew');
    if (bNew) bNew.textContent = t('btnNewBattle');
    const bModes = $('bModes');
    if (bModes) bModes.textContent = t('btnModes');
    const bMaps = $('bMaps');
    if (bMaps) bMaps.textContent = t('btnMaps');
    const bHangar = $('bHangar');
    if (bHangar) bHangar.textContent = t('btnHangar');
    const bSet = $('bSet');
    if (bSet) bSet.textContent = t('btnSettings');
    const bHistory = $('bHistory');
    if (bHistory) bHistory.textContent = t('btnHistory');
    const bCtl = $('bCtl');
    if (bCtl) bCtl.textContent = t('btnControls');
    const bCredits = $('bCredits');
    if (bCredits) bCredits.textContent = t('btnCredits');
    // Note: bLang text remains invariant «Язык/Language/Jezik»
    const playEaster = $('playEaster');
    if (playEaster) playEaster.textContent = t('playEaster');
    const orbitHint = $('menuOrbitHint');
    if (orbitHint) {
      orbitHint.textContent = settings.controlMode === 'touch' ? t('menuOrbitHintTouch') : t('menuOrbitHint');
    }
    const mainTag = document.querySelector('#mainPanel .tag');
    if (mainTag) mainTag.textContent = t('tankBattleTag');

    // Language Select panel
    const langTag = $('langTag');
    if (langTag) langTag.textContent = t('langChooseTitle');
    const langIntro = $('langIntro');
    if (langIntro) langIntro.textContent = t('langIntro');
    const badgeLangRu = $('badgeLangRu');
    if (badgeLangRu) badgeLangRu.textContent = t('langBadgeSelected', undefined, 'ru');
    const badgeLangSr = $('badgeLangSr');
    if (badgeLangSr) badgeLangSr.textContent = t('langBadgeSelected', undefined, 'sr');
    const badgeLangEn = $('badgeLangEn');
    if (badgeLangEn) badgeLangEn.textContent = t('langBadgeSelected', undefined, 'en');
    const bLangBack = $('bLangBack');
    if (bLangBack) bLangBack.textContent = t('btnDone');

    // Control Select panel
    const ctrlTag = document.querySelector('#controlSelectPanel .tag');
    if (ctrlTag) ctrlTag.textContent = t('ctrlChooseTitle');
    const ctrlIntro = document.querySelector('#controlSelectPanel .ctrl-intro');
    if (ctrlIntro) ctrlIntro.textContent = t('ctrlIntro');
    const ctrlRecPc = $('ctrlRecPc');
    if (ctrlRecPc) ctrlRecPc.textContent = t('ctrlRecommended');
    const ctrlRecTouch = $('ctrlRecTouch');
    if (ctrlRecTouch) ctrlRecTouch.textContent = t('ctrlRecommended');
    const choosePcTitle = document.querySelector('#bChoosePc .ctrl-card-title');
    if (choosePcTitle) choosePcTitle.textContent = t('ctrlPcTitle');
    const choosePcDesc = document.querySelector('#bChoosePc .ctrl-card-desc');
    if (choosePcDesc) choosePcDesc.textContent = t('ctrlPcDesc');
    const chooseTouchTitle = document.querySelector('#bChooseTouch .ctrl-card-title');
    if (chooseTouchTitle) chooseTouchTitle.textContent = t('ctrlTouchTitle');
    const chooseTouchDesc = document.querySelector('#bChooseTouch .ctrl-card-desc');
    if (chooseTouchDesc) chooseTouchDesc.textContent = t('ctrlTouchDesc');

    // Hangar Screen
    const hTitle = document.querySelector('#hangarScreen .hangar-title');
    if (hTitle) hTitle.textContent = t('hangarTitle');
    const hSub = document.querySelector('#hangarScreen .hangar-sub');
    if (hSub) hSub.textContent = t('hangarSub');
    const hsLabel = document.querySelector('#hangarSilver .hs-label');
    if (hsLabel) hsLabel.textContent = t('hangarSilver');
    const bHangarBack = $('bHangarBack');
    if (bHangarBack) bHangarBack.textContent = t('hangarBackBtn');
    const hSecLabel = document.querySelector('#hangarScreen .hangar-sec-label');
    if (hSecLabel) hSecLabel.textContent = t('hangarRoster');
    const hHint = $('hangarHint');
    if (hHint) hHint.textContent = t('hangarHint');
    const bHSelect = $('bHangarSelect');
    if (bHSelect) bHSelect.textContent = t('hangarBtnSelect');

    // Map & Mode Panels
    const mapH2 = document.querySelector('#mapPanel h2');
    if (mapH2) mapH2.textContent = t('mapPanelTitle');
    const bMapsBack = $('bMapsBack');
    if (bMapsBack) bMapsBack.textContent = t('btnDone');
    const modeH2 = document.querySelector('#modePanel h2');
    if (modeH2) modeH2.textContent = t('modePanelTitle');
    const bModesBack = $('bModesBack');
    if (bModesBack) bModesBack.textContent = t('btnDone');

    // Battle History
    const histH2 = document.querySelector('#historyPanel h2');
    if (histH2) histH2.textContent = t('histTitle');
    const histEmpty = $('historyEmpty');
    if (histEmpty) histEmpty.textContent = t('histEmpty');
    const bHistClear = $('bHistoryClear');
    if (bHistClear) bHistClear.textContent = t('histClearBtn');
    const bHistBack = $('bHistoryBack');
    if (bHistBack) bHistBack.textContent = t('btnBack');

    // Pause Panel
    const pauseH2 = document.querySelector('#pausePanel h2');
    if (pauseH2) pauseH2.textContent = t('pauseTitle');
    const bResume = $('bResume');
    if (bResume) bResume.textContent = t('btnResume');
    const bPauseSet = $('bPauseSet');
    if (bPauseSet) bPauseSet.textContent = t('btnSettings');
    const bToMenu = $('bToMenu');
    if (bToMenu) bToMenu.textContent = t('btnBackToMenu');

    // Match End Panel
    const bMeHangar = $('bMeHangar');
    if (bMeHangar) bMeHangar.textContent = t('btnToHangar');
    const bMeMenu = $('bMeMenu');
    if (bMeMenu) bMeMenu.textContent = t('btnBackToMenu');
    const bMeAgain = $('bMeAgain');
    if (bMeAgain) bMeAgain.textContent = t('btnNewBattle');

    // Settings Panel
    const setH2 = document.querySelector('#settingsPanel h2');
    if (setH2) setH2.textContent = t('settingsTitle');
    const bReset = $('bReset');
    if (bReset) bReset.textContent = t('btnReset');
    const bBack = $('bBack');
    if (bBack) bBack.textContent = t('btnBack');

    // Credits Panel
    const creditsH2 = document.querySelector('#creditsPanel h2');
    if (creditsH2) creditsH2.textContent = t('creditsTitle');
    const creditsTag = $('creditsTag');
    if (creditsTag) creditsTag.textContent = t('creditsTag');
    const creditsArbuzName = $('creditsArbuzName');
    if (creditsArbuzName) creditsArbuzName.textContent = t('creditsArbuzName');
    const creditsArbuzRole = $('creditsArbuzRole');
    if (creditsArbuzRole) creditsArbuzRole.textContent = t('creditsArbuzRole');
    const creditsMandarinName = $('creditsMandarinName');
    if (creditsMandarinName) creditsMandarinName.textContent = t('creditsMandarinName');
    const creditsMandarinRole = $('creditsMandarinRole');
    if (creditsMandarinRole) creditsMandarinRole.textContent = t('creditsMandarinRole');
    const creditsMadeWithLabel = $('creditsMadeWithLabel');
    if (creditsMadeWithLabel) creditsMadeWithLabel.textContent = t('creditsMadeWithLabel');
    const creditsToolsList = $('creditsToolsList');
    if (creditsToolsList) creditsToolsList.textContent = t('creditsToolsList');
    const bCreditsBack = $('bCreditsBack');
    if (bCreditsBack) bCreditsBack.textContent = t('btnBack');

    // Scoreboard
    const sbSub = document.querySelector('#scoreboard .sb-sub');
    if (sbSub) sbSub.textContent = t('sbSub');
    const bSbClose = $('bSbClose');
    if (bSbClose) bSbClose.textContent = t('btnClose');
    const sbAlly = document.querySelector('#scoreboard .sb-col-title.ally');
    if (sbAlly) sbAlly.textContent = t('sbAllies');
    const sbEnemy = document.querySelector('#scoreboard .sb-col-title.enemy');
    if (sbEnemy) sbEnemy.textContent = t('sbEnemies');

    // Battle HUD static elements
    const rbRangeLbl = $('rbRangeLbl');
    if (rbRangeLbl) rbRangeLbl.textContent = t('hudDistance');
    const rbZoomLbl = $('rbZoomLbl');
    if (rbZoomLbl) rbZoomLbl.textContent = t('hudZoom');
    const rbCompLbl = $('rbCompLbl');
    if (rbCompLbl) rbCompLbl.textContent = t('hudComp');
    const rbMvLbl = $('rbMvLbl');
    if (rbMvLbl) rbMvLbl.textContent = t('hudMv');
    const rbMvUnit = $('rbMvUnit');
    if (rbMvUnit) rbMvUnit.textContent = t('hudMps');

    const statusSpeedLbl = $('statusSpeedLbl');
    if (statusSpeedLbl) statusSpeedLbl.textContent = t('hudKmh');
    const statusGearLbl = $('statusGearLbl');
    if (statusGearLbl) statusGearLbl.textContent = t('hudGear');
    const statusHullLbl = $('statusHullLbl');
    if (statusHullLbl) statusHullLbl.textContent = t('hudHull');
    const statusTurretLbl = $('statusTurretLbl');
    if (statusTurretLbl) statusTurretLbl.textContent = t('hudTurret');

    const hpLbl = $('hpLbl');
    if (hpLbl) hpLbl.textContent = t('hudDurability');
    const hpKillsLbl = $('hpKillsLbl');
    if (hpKillsLbl) hpKillsLbl.textContent = t('hudKills');
    const hpAliveLbl = $('hpAliveLbl');
    if (hpAliveLbl) hpAliveLbl.textContent = t('hudAlive');

    const msAllyLbl = $('msAllyLbl');
    if (msAllyLbl) msAllyLbl.textContent = t('hudWe');
    const msEnemyLbl = $('msEnemyLbl');
    if (msEnemyLbl) msEnemyLbl.textContent = t('hudEnemiesText');
    const msTimerLbl = $('msTimerLbl');
    if (msTimerLbl) msTimerLbl.textContent = t('hudRemaining');

    const bossFlameTxt = document.querySelector('#bossBar .boss-flame-txt');
    if (bossFlameTxt) bossFlameTxt.textContent = t('hudBossFlame');

    const specTitle = document.querySelector('#spectatorBar .spec-title');
    if (specTitle) specTitle.textContent = t('hudSpectatorTitle');
    const specTargetLbl = $('specTargetLbl');
    if (specTargetLbl) specTargetLbl.textContent = t('hudWatching');
    const bSpecPrev = $('bSpecPrev');
    if (bSpecPrev) bSpecPrev.textContent = t('hudSpecPrev');
    const bSpecNext = $('bSpecNext');
    if (bSpecNext) bSpecNext.textContent = t('hudSpecNext');
    const specHint = document.querySelector('#spectatorBar .spec-hint');
    if (specHint) specHint.textContent = t('hudSpecHint');

    // Touch HUD static labels
    const apsBadgeLbl = $('apsBadgeLbl');
    if (apsBadgeLbl) apsBadgeLbl.textContent = t('hudApsName');
    const tBtnScore = $('tBtnScore');
    if (tBtnScore) tBtnScore.textContent = t('tBtnScore');
    const tBtnPause = $('tBtnPause');
    if (tBtnPause) tBtnPause.textContent = t('tBtnPause');
    const tBtnBinoc = $('tBtnBinoc');
    if (tBtnBinoc) tBtnBinoc.textContent = t('tBtnBinoc');
    const tBtnSniper = $('tBtnSniper');
    if (tBtnSniper) tBtnSniper.textContent = t('tBtnSniper');
    const tBtnMgReload = $('tBtnMgReload');
    if (tBtnMgReload) tBtnMgReload.textContent = t('tBtnMgReload');
    const tBtnMgLabel = document.querySelector('#tBtnMg .tbtn-label');
    if (tBtnMgLabel) tBtnMgLabel.textContent = t('tBtnMgPad');
    const tBtnFireLabel = document.querySelector('#tBtnFire .tbtn-label');
    if (tBtnFireLabel) tBtnFireLabel.textContent = t('tBtnFire');
    const thTag = $('thermalHudTag');
    if (thTag) thTag.textContent = t('hudThermalTag');
    const wsHdr = $('weakspotHdr');
    if (wsHdr) wsHdr.textContent = t('hudWeakspotHdr');

    // Benchmark HUD & Results Modal
    const benchHudTitle = $('benchHudTitle');
    if (benchHudTitle) benchHudTitle.textContent = t('benchHudTitle');
    const benchLiveFpsLbl = $('benchLiveFpsLbl');
    if (benchLiveFpsLbl) benchLiveFpsLbl.textContent = t('benchLiveFps');
    const benchFrameMsLbl = $('benchFrameMsLbl');
    if (benchFrameMsLbl) benchFrameMsLbl.textContent = t('benchFrameMs');
    const benchAvgFpsLbl = $('benchAvgFpsLbl');
    if (benchAvgFpsLbl) benchAvgFpsLbl.textContent = t('benchAvgFps');
    const benchLowFpsLbl = $('benchLowFpsLbl');
    if (benchLowFpsLbl) benchLowFpsLbl.textContent = t('benchOnePctLow');
    const bBenchStop = $('bBenchStop');
    if (bBenchStop) bBenchStop.textContent = t('benchStopBtn');

    const benchResultTitle = $('benchResultTitle');
    if (benchResultTitle) benchResultTitle.textContent = t('benchResultTitle');
    const benchResultTag = $('benchResultTag');
    if (benchResultTag) benchResultTag.textContent = t('benchResultTag');
    const benchTitleMaxFps = $('benchTitleMaxFps');
    if (benchTitleMaxFps) benchTitleMaxFps.textContent = t('benchBtnMaxFps');
    const benchDescMaxFps = $('benchDescMaxFps');
    if (benchDescMaxFps) benchDescMaxFps.textContent = t('benchDescMaxFps');
    const benchTitleMaxGfx = $('benchTitleMaxGfx');
    if (benchTitleMaxGfx) benchTitleMaxGfx.textContent = t('benchBtnMaxGfx');
    const benchDescMaxGfx = $('benchDescMaxGfx');
    if (benchDescMaxGfx) benchDescMaxGfx.textContent = t('benchDescMaxGfx');
    const benchTitle60Fps = $('benchTitle60Fps');
    if (benchTitle60Fps) benchTitle60Fps.textContent = t('benchBtn60Fps');
    const benchDesc60Fps = $('benchDesc60Fps');
    if (benchDesc60Fps) benchDesc60Fps.textContent = t('benchDesc60Fps');
    for (const badgeId of ['benchRecMaxFps', 'benchRecMaxGfx', 'benchRec60Fps']) {
      const bEl = $(badgeId);
      if (bEl) bEl.textContent = t('benchRecommendedBadge');
    }
    const bBenchBack = $('bBenchBack');
    if (bBenchBack) bBenchBack.textContent = t('benchBackToSettings');
  }
  ui.updateAllStaticTexts = updateAllStaticTexts;

  function selectLanguage(lang: SupportedLanguage): void {
    const isFirstLaunch = !settings.languageChosen;
    setLanguage(lang);
    updateAllStaticTexts();
    renderLanguageCards();

    if (isFirstLaunch) {
      if (!settings.controlChosen) {
        show('controlSelect');
      } else {
        show('main');
      }
    } else {
      if (ui.currentScreen === 'hangar') renderHangar();
      else if (ui.currentScreen === 'history') renderHistory();
      else if (ui.currentScreen === 'settings') renderSettings();
      else if (ui.currentScreen === 'modes') renderModes();
      else if (ui.currentScreen === 'maps') renderMaps();
      else if (ui.currentScreen === 'main') show('main');
    }
  }

  function show(which: string | null): void {
    ui.currentScreen = which;
    h.onHangarToggle(which === 'hangar');
    if (!which) {
      menu.classList.add('hidden');
      menu.classList.remove('hangar-mode', 'main-showcase');
      return;
    }
    menu.classList.remove('hidden');
    menu.classList.toggle('hangar-mode', which === 'hangar');
    menu.classList.toggle('main-showcase', which === 'main');
    for (const k in panels) panels[k].classList.toggle('hidden', k !== which);
    document.body.dataset.screen = which;

    if (which === 'languageSelect') {
      renderLanguageCards();
    } else if (which === 'controlSelect') {
      const preferTouch = detectTouchDeviceHint();
      $('ctrlRecPc').classList.toggle('hidden', preferTouch);
      $('ctrlRecTouch').classList.toggle('hidden', !preferTouch);
      $('bChoosePc').classList.toggle('recommended', !preferTouch);
      $('bChooseTouch').classList.toggle('recommended', preferTouch);
    } else if (which === 'main') {
      $('bPlay').textContent = h.started() ? t('btnContinueBattle') : t('btnPlay');
      $('bNew').style.display = h.started() ? 'block' : 'none';
      const activeMap = h.maps.find((m) => m.id === h.getMap());
      const activeMapName = activeMap ? getMapText(activeMap.id).name : '';
      const activeTank = getTankSpec(getSelectedTankId());
      const activeModeDef = getModeDef(h.getModeId());
      const activeModeText = getModeText(activeModeDef.id);

      $('mapName').textContent = t('mapline', {
        mode: activeModeText.name,
        map: activeMapName,
        tank: activeTank.name,
      });

      const orbitHint = $('menuOrbitHint');
      if (orbitHint) {
        orbitHint.textContent = settings.controlMode === 'touch' ? t('menuOrbitHintTouch') : t('menuOrbitHint');
      }
      const infoEl = $('menuModeInfo');
      if (infoEl) {
        const extra =
          activeModeDef.id === 'training'
            ? t('extraTraining')
            : activeModeDef.id === 'juggernaut'
              ? t('extraJuggernaut')
              : activeModeDef.id === 'dead'
                ? t('extraDead')
                : activeModeDef.id === 'bombardment'
                  ? t('extraBombardment')
                  : activeModeDef.id === 'rounds5v5'
                    ? t('extraRounds')
                    : t('extraTdm');
        const ctrlTip = settings.controlMode === 'touch' ? t('tipTouch') : t('tipPc');
        infoEl.innerHTML = `${activeModeText.shortDesc}<br />${extra}<br />${ctrlTip}`;
      }
    } else if (which === 'hangar') {
      renderHangar();
    } else if (which === 'history') {
      renderHistory();
    }
  }
  ui.show = show;
  ui.refreshSilver = () => {
    $('hangarSilverVal').textContent = String(getSilver());
  };

  function openSettings(from: string, tTab?: string): void {
    ui.from = from;
    if (tTab) tab = tTab;
    renderSettings();
    show('settings');
  }
  ui.openSettings = openSettings;

  const click = () => audio.ui('click');

  // Language buttons
  $('bLangRu').onclick = () => {
    click();
    selectLanguage('ru');
  };
  $('bLangSr').onclick = () => {
    click();
    selectLanguage('sr');
  };
  $('bLangEn').onclick = () => {
    click();
    selectLanguage('en');
  };
  $('bLangBack').onclick = () => {
    click();
    show(ui.from || 'main');
  };

  // Main menu language button
  $('bLang').onclick = () => {
    click();
    ui.from = 'main';
    renderLanguageCards();
    show('languageSelect');
  };

  $('bChoosePc').onclick = () => {
    click();
    applyControlChoice('pc');
    show('main');
  };
  $('bChooseTouch').onclick = () => {
    click();
    applyControlChoice('touch');
    show('main');
  };

  $('bPlay').onclick = () => {
    click();
    h.play(false);
  };
  $('bNew').onclick = () => {
    click();
    h.play(true);
  };
  $('bModes').onclick = () => {
    click();
    renderModes();
    show('modes');
  };
  $('bModesBack').onclick = () => {
    click();
    show('main');
  };
  $('bMaps').onclick = () => {
    click();
    renderMaps();
    show('maps');
  };
  $('bMapsBack').onclick = () => {
    click();
    show('main');
  };
  $('bHangar').onclick = () => {
    audio.init();
    audio.music('menu');
    click();
    inspectedTankId = getSelectedTankId();
    show('hangar');
  };
  $('bHangarBack').onclick = () => {
    click();
    show('main');
  };
  $('bSet').onclick = () => {
    click();
    openSettings('main');
  };
  $('bHistory').onclick = () => {
    click();
    show('history');
  };
  $('bHistoryBack').onclick = () => {
    click();
    show('main');
  };
  $('bHistoryClear').onclick = () => {
    click();
    clearMatchHistory();
    renderHistory();
  };
  $('bCtl').onclick = () => {
    click();
    openSettings('main', 'controls');
  };
  $('bCredits').onclick = () => {
    click();
    show('credits');
  };
  $('bCreditsBack').onclick = () => {
    click();
    show('main');
  };
  $('bResume').onclick = () => {
    click();
    h.resume();
  };
  $('bPauseSet').onclick = () => {
    click();
    openSettings('pause');
  };
  $('bToMenu').onclick = () => {
    click();
    h.toMenu();
  };
  $('bMeMenu').onclick = () => {
    click();
    h.toMenu();
  };
  $('bMeHangar').onclick = () => {
    click();
    h.toMenu();
    inspectedTankId = getSelectedTankId();
    show('hangar');
  };
  $('bMeAgain').onclick = () => {
    click();
    h.play(true);
  };
  $('bBack').onclick = () => {
    click();
    show(ui.from);
  };
  $('bReset').onclick = () => {
    click();
    resetSettings();
    renderSettings();
  };

  ui.showMatchEnd = (s: MatchEndSummary) => {
    $('meTitle').textContent = s.won ? t('meVictory') : t('meDefeat');
    $('meTitle').style.color = s.won ? '#8fe36a' : '#ff6a4a';
    $('meSub').textContent = s.subLabel ?? `${s.modeName.toUpperCase()} · ${s.teamAScore} : ${s.teamBScore}`;
    const scoreRowTitle = s.scoreText ? s.scoreLabel : `${s.scoreLabel} (до ${s.targetGoal})`;
    const scoreRowValue = s.scoreText ?? `${t('hudWe')} ${s.teamAScore} : ${s.teamBScore} ${t('hudEnemiesText')}`;
    const silverWord = t('meSilverUnit', { n: '' }).trim();
    $('meSummary').innerHTML = `
      <div class="me-row"><span>${scoreRowTitle}</span><b>${scoreRowValue}</b></div>
      <div class="me-row"><span>${t('meRowKills')}</span><b>${s.playerKills}</b></div>
      <div class="me-row"><span>${t('meRowDeaths')}</span><b>${s.playerDeaths}</b></div>
      <div class="me-row silver"><span>${t('meRowVictorySilver')}</span><b>${s.victorySilver > 0 ? '+' + s.victorySilver + ' ' + silverWord : '0 ' + silverWord}</b></div>
      <div class="me-row silver"><span>${t('meRowTotalSilver')}</span><b>+${s.matchSilverEarned} ${silverWord}</b></div>
      <div class="me-row silver"><span>${t('meRowBalance')}</span><b>${s.totalSilver} ${silverWord}</b></div>
    `;
    show('matchEnd');
  };

  ui.showBenchmarkResults = (summary, onChooseProfile, onBack) => {
    const metricsEl = $('benchResultMetrics');
    metricsEl.innerHTML = `
      <div class="bench-metric"><span>${t('benchMetricAvg')}</span><b>${summary.avgFps} FPS</b></div>
      <div class="bench-metric"><span>${t('benchMetricLow')}</span><b>${summary.onePercentLowFps} FPS</b></div>
      <div class="bench-metric"><span>${t('benchMetricMinMax')}</span><b>${summary.minFps} / ${summary.maxFps}</b></div>
      <div class="bench-metric"><span>${t('benchMetricFrameMs')}</span><b>${summary.avgFrameTimeMs.toFixed(1)} ms</b></div>
    `;

    const recEl = $('benchRecommendTxt');
    recEl.textContent =
      summary.recommendedProfile === 'max_gfx'
        ? t('benchRecMaxGfx')
        : summary.recommendedProfile === 'fps_60'
          ? t('benchRec60Fps')
          : t('benchRecMaxFps');

    const mapBtns: Array<[BenchmarkProfileId, string, string]> = [
      ['max_fps', 'bBenchMaxFps', 'benchRecMaxFps'],
      ['max_gfx', 'bBenchMaxGfx', 'benchRecMaxGfx'],
      ['fps_60', 'bBench60Fps', 'benchRec60Fps'],
    ];

    for (const [profileId, btnId, badgeId] of mapBtns) {
      const btn = $(btnId);
      const badge = $(badgeId);
      const isRec = summary.recommendedProfile === profileId;
      btn.classList.toggle('recommended', isRec);
      badge.classList.toggle('hidden', !isRec);
      btn.onclick = () => {
        click();
        onChooseProfile(profileId);
      };
    }

    $('bBenchBack').onclick = () => {
      click();
      onBack();
    };

    show('benchmarkResult');
  };

  function renderHistory(): void {
    const entries = getMatchHistory();
    const summary = summarizeMatchHistory(entries);
    const summaryEl = $('historySummary');
    const listEl = $('historyList');
    const emptyEl = $('historyEmpty');
    const clearBtn = $('bHistoryClear') as HTMLButtonElement;

    summaryEl.innerHTML = `
      <span>${t('histMatches', { total: summary.total, max: MAX_MATCH_HISTORY })}</span>
      <span>${t('histWins', { wins: summary.wins, pct: summary.winRatePct })}</span>
      <span>${t('histTotalSilver', { silver: summary.totalSilver })}</span>
    `;

    clearBtn.disabled = entries.length === 0;
    listEl.innerHTML = '';

    if (entries.length === 0) {
      emptyEl.classList.remove('hidden');
      return;
    }

    emptyEl.classList.add('hidden');
    for (const entry of entries) {
      const row = document.createElement('div');
      row.className = 'hist-item ' + (entry.won ? 'won' : 'lost');
      row.dataset.testid = 'history-item';

      const top = document.createElement('div');
      top.className = 'hist-top';

      const main = document.createElement('div');
      main.className = 'hist-main';

      const res = document.createElement('span');
      res.className = 'hist-res';
      res.textContent = entry.won ? t('histWin') : t('histLoss');

      const dot = document.createElement('span');
      dot.className = 'hist-dot';
      dot.textContent = '·';

      const tank = document.createElement('span');
      tank.className = 'hist-tank';
      tank.textContent = entry.tankName;

      main.append(res, dot, tank);

      const silver = document.createElement('span');
      silver.className = 'hist-silver' + (entry.silverEarned === 0 ? ' zero' : '');
      silver.textContent = entry.silverEarned > 0 ? t('histSilverEarned', { silver: entry.silverEarned }) : t('histSilverZero');

      top.append(main, silver);

      const meta = document.createElement('div');
      meta.className = 'hist-meta';

      const mode = document.createElement('span');
      mode.className = 'hist-mode';
      const timeLabel = formatMatchTimestamp(entry.timestamp);
      const modeNameLocalized = entry.modeId ? getModeText(entry.modeId).name : entry.modeName;
      const mapNameLocalized = entry.mapId ? getMapText(entry.mapId).name : (entry.mapName || '');
      const parts = [modeNameLocalized, mapNameLocalized, timeLabel].filter(Boolean);
      mode.textContent = parts.join(' · ');

      const score = document.createElement('span');
      score.className = 'hist-score';
      score.textContent = t('histScoreRow', { score: entry.scoreText });

      meta.append(mode, score);
      row.append(top, meta);
      listEl.appendChild(row);
    }
  }

  type AbilityIconId =
    | 'trophy_aps'
    | 'suspension'
    | 'unmanned_turret'
    | 'galix_overdrive'
    | 'dm63_apfsds'
    | 'thermal_sight'
    | 'kstam_missile'
    | 'ap_barrage'
    | 'afghanit_shield'
    | 'trophy_reflect'
    | 'amp_homing';

  const ABILITY_SVGS: Record<AbilityIconId, string> = {
    trophy_aps:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17a8 8 0 0 1 16 0"/><path d="M7.5 17a4.5 4.5 0 0 1 9 0"/><circle cx="12" cy="17" r="1.5" fill="currentColor"/><path d="M18.5 5.5 14 10"/><path d="m14 6.5 3.5 3.5"/></svg>',
    suspension:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 18 18-5"/><path d="M6 12.5 17.5 9l1.5 2.5-11.5 3.5z"/><circle cx="7.5" cy="15.5" r="1.3"/><circle cx="12.5" cy="14" r="1.3"/><circle cx="17.5" cy="12.5" r="1.3"/></svg>',
    unmanned_turret:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17h16l-1.5 3h-13z"/><path d="M7 17v-3.5l3-2.5h4l3 2.5V17"/><path d="M12 4v5"/><path d="m9.5 6.5 2.5 2.5 2.5-2.5"/></svg>',
    galix_overdrive:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 14a3.5 3.5 0 0 1 2.2-6.2A4.5 4.5 0 0 1 15.8 7 3.5 3.5 0 0 1 19 14H5z"/><path d="m7 19 3-2.5L7 14"/><path d="m13 19 3-2.5L13 14"/></svg>',
    dm63_apfsds:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h15"/><path d="m15 9 6 3-6 3"/><path d="m4 9 3 3-3 3"/><path d="M13 5v14" stroke-dasharray="2 2"/></svg>',
    thermal_sight:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
    kstam_missile:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17C5 8 11 4 15 4c3 0 5 3 5 9"/><path d="m17 11 3 3 3-3"/><rect x="13" y="17" width="8" height="3.5" rx="0.8"/></svg>',
    ap_barrage:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10l3 2-3 2H4z"/><path d="M4 14h12l3 2-3 2H4z"/><path d="M19 5l2-1M20 12h2M19 19l2 1"/></svg>',
    afghanit_shield:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2"/></svg>',
    trophy_reflect:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v5c0 4.8 3 8.5 7 10 4-1.5 7-5.2 7-10V6z"/><path d="M8 13c1.5-2.5 4.5-2.5 7-1"/><path d="m13 9 2.5 2.8-3.2.8"/></svg>',
    amp_homing:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.2 4.5 4.8.7-3.5 3.4.8 4.8L12 14.2 7.7 16.4l.8-4.8L5 8.2l4.8-.7z"/><circle cx="12" cy="19.5" r="1.5" fill="currentColor"/></svg>',
  };

  interface HangarAbilityCard {
    icon: AbilityIconId;
    title: string;
    badge: string;
    desc: string;
    accent: 'amber' | 'cyan' | 'emerald';
  }

  function renderHangarAbilityGroup(label: string, cards: HangarAbilityCard[]): string {
    return `
      <div class="hangar-ab-group">
        <div class="hangar-ab-group-lbl">${label}</div>
        ${cards
          .map(
            (card) => `
          <div class="hangar-ab-card accent-${card.accent}">
            <div class="hangar-ab-icon">${ABILITY_SVGS[card.icon]}</div>
            <div class="hangar-ab-body">
              <div class="hangar-ab-top">
                <span class="hangar-ab-name">${card.title}</span>
                <span class="hangar-ab-badge">${card.badge}</span>
              </div>
              <div class="hangar-ab-desc">${card.desc}</div>
            </div>
          </div>`,
          )
          .join('')}
      </div>
    `;
  }

  function renderHangarAbilities(spec: TankSpec): void {
    const container = $('hangarAbilities');
    const passiveCards: HangarAbilityCard[] = [];
    const activeCards: HangarAbilityCard[] = [];
    const abKey = keyName(settings.keys.ability).toUpperCase();

    if (spec.aps) {
      passiveCards.push({
        icon: 'trophy_aps',
        title: t('hangarAbTrophyApsTitle'),
        badge: t('hangarAbBadgePassive'),
        desc: t('hangarAbTrophyApsDesc'),
        accent: 'cyan',
      });
    }
    if (spec.adaptiveSuspension) {
      passiveCards.push({
        icon: 'suspension',
        title: t('hangarAbSuspensionTitle'),
        badge: t('hangarAbBadgePassive'),
        desc: t('hangarAbSuspensionDesc'),
        accent: 'emerald',
      });
    }
    if (spec.turretDamageMult !== undefined && spec.turretDamageMult < 1) {
      passiveCards.push({
        icon: 'unmanned_turret',
        title: t('hangarAbUnmannedTurretTitle'),
        badge: t('hangarAbBadgePassive'),
        desc: t('hangarAbUnmannedTurretDesc', { pct: Math.round((1 - spec.turretDamageMult) * 100) }),
        accent: 'cyan',
      });
    }

    const pushActive = (ab: NonNullable<TankSpec['ability']>, isSecondary = false): void => {
      const keyStr = isSecondary ? 'G' : abKey;
      switch (ab.type) {
        case 'galix_overdrive':
          activeCards.push({
            icon: 'galix_overdrive',
            title: t('hangarAbGalixTitle'),
            badge: t('hangarAbBadgeKeyCd', { key: keyStr, cd: ab.cooldown }),
            desc: t('hangarAbGalixDesc'),
            accent: 'cyan',
          });
          break;
        case 'dm63_apfsds':
          activeCards.push({
            icon: 'dm63_apfsds',
            title: t('hangarAbDm63Title'),
            badge: t('hangarAbBadgeKeyCd', { key: keyStr, cd: ab.cooldown }),
            desc: t('hangarAbDm63Desc'),
            accent: 'amber',
          });
          break;
        case 'thermal_sight':
          activeCards.push({
            icon: 'thermal_sight',
            title: t('hangarAbThermalTitle'),
            badge: t('hangarAbBadgeKeyCd', { key: keyStr, cd: ab.cooldown }),
            desc: t('hangarAbThermalDesc'),
            accent: 'emerald',
          });
          break;
        case 'kstam_missile':
          activeCards.push({
            icon: 'kstam_missile',
            title: t('hangarAbKstamTitle'),
            badge: t('hangarAbBadgeKstam', { key: keyStr, cd: ab.cooldown }),
            desc: t('hangarAbKstamDesc'),
            accent: 'amber',
          });
          break;
        case 'ap_barrage':
          activeCards.push({
            icon: 'ap_barrage',
            title: t('hangarAbBarrageTitle'),
            badge: t('hangarAbBadgeKeyCd', { key: keyStr, cd: ab.cooldown }),
            desc: t('hangarAbBarrageDesc'),
            accent: 'amber',
          });
          break;
        case 'afghanit_shield':
          activeCards.push({
            icon: 'afghanit_shield',
            title: t('hangarAbAfghanitTitle'),
            badge: t('hangarAbBadgeKeyCd', { key: keyStr, cd: ab.cooldown }),
            desc: t('hangarAbAfghanitDesc'),
            accent: 'cyan',
          });
          break;
        case 'trophy_reflect':
          activeCards.push({
            icon: 'trophy_reflect',
            title: t('hangarAbTrophyReflectTitle'),
            badge: t('hangarAbBadgeKeyCd', { key: keyStr, cd: ab.cooldown }),
            desc: t('hangarAbTrophyReflectDesc'),
            accent: 'amber',
          });
          break;
        case 'amp_homing':
          activeCards.push({
            icon: 'amp_homing',
            title: t('hangarAbAmpTitle'),
            badge: t('hangarAbBadgeKeyCd', { key: keyStr, cd: ab.cooldown }),
            desc: t('hangarAbAmpDesc'),
            accent: 'amber',
          });
          break;
      }
    };

    if (spec.ability) pushActive(spec.ability, false);
    if (spec.secondaryAbility) pushActive(spec.secondaryAbility, true);

    if (passiveCards.length === 0 && activeCards.length === 0) {
      container.classList.add('hidden');
      container.innerHTML = '';
      return;
    }

    const sections: string[] = [];
    if (passiveCards.length > 0) {
      sections.push(renderHangarAbilityGroup(t('hangarAbilitiesPassive'), passiveCards));
    }
    if (activeCards.length > 0) {
      sections.push(renderHangarAbilityGroup(t('hangarAbilitiesActive'), activeCards));
    }

    container.innerHTML = `
      <div class="hangar-abilities-title">${t('hangarAbilitiesTitle')}</div>
      ${sections.join('')}
    `;
    container.classList.remove('hidden');
  }

  function renderHangar(): void {
    const listEl = $('hangarList');
    const infoEl = $('hangarInfo');
    const hintEl = $('hangarHint');
    const selectedId = getSelectedTankId();
    const balance = getSilver();
    $('hangarSilverVal').textContent = String(balance);

    listEl.innerHTML = '';
    for (const spec of getAllTanks()) {
      const owned = isTankOwned(spec.id);
      const badge =
        spec.id === selectedId
          ? t('badgeEquipped')
          : owned
            ? t('badgeInHangar')
            : t('badgePriceSilver', { n: spec.priceSilver });
      const tText = getTankText(spec.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'hangar-item' +
        (spec.id === inspectedTankId ? ' inspected' : '') +
        (spec.id === selectedId ? ' equipped' : '');
      btn.dataset.tankId = spec.id;
      btn.setAttribute('aria-label', spec.name);
      btn.innerHTML = `
        <div class="hi-top">
          <span class="hi-name">${spec.name}</span>
          <span class="hi-badge">${badge}</span>
        </div>
        <div class="hi-sub">${tText.role} · ${tText.country}</div>
      `;
      btn.onclick = () => {
        click();
        inspectedTankId = spec.id;
        h.onPreviewTank?.(spec.id);
        renderHangar();
      };
      listEl.appendChild(btn);
    }

    if (!inspectedTankId) {
      infoEl.classList.add('hidden');
      hintEl.classList.remove('hidden');
      return;
    }

    hintEl.classList.add('hidden');
    infoEl.classList.remove('hidden');
    const spec = getTankSpec(inspectedTankId);
    const tText = getTankText(spec.id);
    const owned = isTankOwned(spec.id);
    const isEquipped = spec.id === selectedId;

    $('hangarTankTitle').textContent = spec.name;
    $('hangarTankRole').textContent = `${tText.role} · ${tText.country}`;
    $('hangarTankDesc').textContent = tText.description;

    const allTanks = getAllTanks();
    const minGun = Math.min(...allTanks.map((item) => item.gunDamage));
    const maxGun = Math.max(...allTanks.map((item) => item.gunDamage));
    const frontDmgVals = allTanks.map((item) => computeFrontDamage(item.gunDamage, item.penetrationMm, spec));
    const minFrontDmg = Math.min(...frontDmgVals);
    const maxFrontDmg = Math.max(...frontDmgVals);
    const frontDmgLabel =
      minFrontDmg === maxFrontDmg
        ? t('unitDamage', { dmg: minFrontDmg })
        : t('unitDamageRange', { min: minFrontDmg, max: maxFrontDmg });
    const sideRearDmgLabel =
      minGun === maxGun
        ? t('unitDamage', { dmg: minGun })
        : `${minGun}–${maxGun} ${t('unitDamageFull', { dmg: '' }).trim()}`;

    const frontArmorLabel =
      spec.armor.turretFront !== spec.armor.hullFront
        ? t('armorMantlet', { hull: spec.armor.hullFront, turret: spec.armor.turretFront })
        : t('armorSloped', { hull: spec.armor.hullFront });

    const priceText =
      spec.priceSilver === 0 ? t('hstatPriceBase') : t('hstatPriceSilver', { n: spec.priceSilver });

    $('hangarStats').innerHTML = `
      <div class="hstat"><span>${t('hstatDamage')}</span><b>${t('unitDamage', { dmg: spec.gunDamage })}</b></div>
      <div class="hstat"><span>${t('hstatMaxSpeed')}</span><b>${t('unitSpeedKmh', { spd: spec.maxSpeedKmh })}</b></div>
      <div class="hstat"><span>${t('hstatReload')}</span><b>${t('unitSec', { sec: spec.reload.toFixed(1) })}</b></div>
      <div class="hstat"><span>${t('hstatMaxRange')}</span><b>${t('unitMeters', { m: spec.maxRange })}</b></div>
      <div class="hstat"><span>${t('hstatMaxHp')}</span><b>${t('unitDamage', { dmg: spec.maxHp })}</b></div>
      <div class="hstat"><span>${t('hstatGun')}</span><b>${tText.gunName}</b></div>
      <div class="hstat"><span>${t('hstatMg', { mag: spec.mg.magSize, total: spec.mg.totalAmmo })}</span><b>${tText.mgName} · ${t('unitDamage', { dmg: spec.mg.damage.toFixed(2) })}</b></div>
      <div class="hstat"><span>${t('hstatFrontArmor')}</span><b>${frontArmorLabel}</b></div>
      <div class="hstat"><span>${t('hstatFrontDmg')}</span><b>${frontDmgLabel}</b></div>
      <div class="hstat"><span>${t('hstatSideRearDmg')}</span><b>${sideRearDmgLabel}</b></div>
      <div class="hstat hstat-warn"><span>${t('hstatWeakspot')}</span><b>${t('hstatWeakspotVal')}</b></div>
      <div class="hstat"><span>${t('hstatPowerRating')}</span><b>${t('unitPowerRating', { score: getTankPowerRating(spec) })}</b></div>
      <div class="hstat"><span>${t('hstatPrice')}</span><b>${priceText}</b></div>
    `;

    renderHangarAbilities(spec);

    const statusEl = $('hangarEquipStatus');
    const selectBtn = $('bHangarSelect') as HTMLButtonElement;
    if (!owned) {
      const canBuy = balance >= spec.priceSilver;
      statusEl.textContent = canBuy
        ? t('hangarCanBuyStatus', { price: spec.priceSilver })
        : t('hangarNeedMoreStatus', { diff: spec.priceSilver - balance });
      statusEl.className = 'hangar-equip-status';
      selectBtn.textContent = t('hangarBtnBuy', { price: spec.priceSilver });
      selectBtn.disabled = !canBuy;
      selectBtn.className = 'btn hangar-select-btn';
      selectBtn.onclick = () => {
        const res = purchaseTank(spec.id);
        if (res.ok) {
          audio.ui('silver');
          renderHangar();
        } else {
          statusEl.textContent = t('hangarNotEnoughSilver');
        }
      };
      return;
    }

    selectBtn.disabled = false;
    statusEl.textContent = isEquipped ? t('hangarEquippedStatus') : t('hangarOwnedStatus');
    statusEl.className = 'hangar-equip-status' + (isEquipped ? ' active' : '');
    selectBtn.textContent = isEquipped ? t('badgeEquipped') : t('hangarBtnSelect');
    selectBtn.className = 'btn hangar-select-btn' + (isEquipped ? ' selected' : '');
    selectBtn.onclick = () => {
      click();
      setSelectedTankId(spec.id);
      h.onSelectTank(spec.id);
      renderHangar();
    };
  }

  function renderMaps(): void {
    const box = $('mapCards');
    box.innerHTML = '';
    for (const m of h.maps) {
      const sel = h.getMap() === m.id;
      const mText = getMapText(m.id);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'mapcard ' + m.id + (sel ? ' sel' : '');
      card.innerHTML = `<div class="mname">${mText.name}</div><div class="mdesc">${mText.desc}</div>${sel ? `<span class="m-badge">${t('badgeSelected')}</span>` : ''}`;
      card.onclick = () => {
        if (h.getMap() === m.id) return;
        click();
        card.querySelector('.mdesc')!.textContent = t('mapLoading');
        setTimeout(() => {
          h.setMap(m.id);
          renderMaps();
        }, 40);
      };
      box.appendChild(card);
    }
  }

  function renderModes(): void {
    const box = $('modeCards');
    box.innerHTML = '';
    const activeMapId = h.getMap();
    const activeId = h.getModeId();
    if (isLondonMap(activeMapId)) {
      const note = document.createElement('div');
      note.className = 'mode-lock-note';
      note.id = 'modeLondonNotice';
      note.dataset.testid = 'mode-london-notice';
      note.textContent = t('modeLondonOnlyHint');
      box.appendChild(note);
    }
    for (const m of getAllModes()) {
      const sel = activeId === m.id;
      const locked = isModeOptionLocked(activeMapId, m.id);
      const mText = getModeText(m.id);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'modecard' + (sel ? ' sel' : '') + (locked ? ' locked' : '');
      card.dataset.modeId = m.id;
      card.disabled = locked;
      if (locked) card.setAttribute('aria-disabled', 'true');
      const badgeHtml = sel
        ? `<span class="m-badge">${t('badgeSelected')}</span>`
        : locked
          ? `<span class="m-badge">${t('modeLockedLondon')}</span>`
          : '';
      card.innerHTML = `<div class="mname">${mText.name}</div><div class="mdesc">${mText.shortDesc}</div>${badgeHtml}`;
      card.onclick = () => {
        if (locked || h.getModeId() === m.id) return;
        click();
        h.setModeId(m.id);
        renderModes();
      };
      box.appendChild(card);
    }
  }

  function renderSettings(): void {
    const tabs = $('tabs');
    const body = $('tabBody');
    const activeMode = getModeDef(h.getModeId());
    const tabsMap = getLocalizedTabs();

    tabs.innerHTML = '';
    for (const id in tabsMap) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = tabsMap[id].label;
      b.className = 'tab' + (id === tab ? ' on' : '');
      b.onclick = () => {
        tab = id;
        renderSettings();
      };
      tabs.appendChild(b);
    }
    body.innerHTML = '';
    const st = document.createElement('div');
    st.className = 'sub';
    st.textContent = storage.ok ? t('settingsStorageOk') : t('settingsStorageBlocked');
    st.style.color = storage.ok ? '#9aa58a' : '#ff9a7a';
    body.appendChild(st);

    if (tab === 'controls') {
      const modeRow = document.createElement('div');
      modeRow.className = 'ctrl-switch-row';

      const modeLabel = document.createElement('div');
      modeLabel.className = 'ctrl-switch-lbl';
      modeLabel.textContent = t('ctrlSwitchLabel');

      const seg = document.createElement('div');
      seg.className = 'ctrl-seg';
      seg.dataset.testid = 'control-mode-switcher';

      const mkOpt = (value: ControlMode, label: string, testId: string) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ctrl-seg-btn' + (settings.controlMode === value ? ' on' : '');
        b.textContent = label;
        b.dataset.testid = testId;
        b.onclick = () => {
          if (settings.controlMode === value) return;
          click();
          applyControlChoice(value);
          renderSettings();
        };
        return b;
      };

      seg.append(mkOpt('pc', t('ctrlSegPc'), 'switch-pc'), mkOpt('touch', t('ctrlSegTouch'), 'switch-touch'));
      modeRow.append(modeLabel, seg);
      body.appendChild(modeRow);
    }

    if (tab === 'graphics') {
      const benchBox = document.createElement('div');
      benchBox.className = 'bench-launch-box';

      const benchCopy = document.createElement('div');
      benchCopy.className = 'bench-launch-copy';

      const benchTitle = document.createElement('div');
      benchTitle.className = 'bench-launch-title';
      benchTitle.textContent = t('benchCardTitle');

      const benchDesc = document.createElement('div');
      benchDesc.className = 'bench-launch-desc';
      benchDesc.textContent = t('benchCardDesc');

      benchCopy.append(benchTitle, benchDesc);

      const startBtn = document.createElement('button');
      startBtn.type = 'button';
      startBtn.id = 'bStartBenchmark';
      startBtn.className = 'btn bench-start-btn';
      startBtn.dataset.testid = 'btn-start-benchmark';
      startBtn.textContent = t('benchStartBtn');
      startBtn.onclick = () => {
        click();
        h.startBenchmark();
      };

      benchBox.append(benchCopy, startBtn);
      body.appendChild(benchBox);
    }

    const currentTabDef = tabsMap[tab] || tabsMap.sound;
    for (const it of currentTabDef.items) {
      if (it.controlOnly && it.controlOnly !== settings.controlMode) continue;
      if (it.t === 'keys') {
        renderKeys(body);
        continue;
      }
      if (it.t === 'section') {
        const sec = document.createElement('div');
        sec.className = 'gfx-sec-head';
        sec.textContent = it.l || '';
        body.appendChild(sec);
        continue;
      }
      const key = it.k!;
      const isLockedBotSkill = key === 'botSkill' && !activeMode.allowBotAccuracy;
      const row = document.createElement('div');
      row.className = 'row' + (isLockedBotSkill ? ' locked' : '');
      const lab = document.createElement('label');
      lab.textContent = it.l || '';
      row.appendChild(lab);
      if (it.t === 'range') {
        const inp = document.createElement('input');
        inp.type = 'range';
        inp.min = String(it.min);
        inp.max = String(it.max);
        inp.step = String(it.step);
        inp.dataset.settingKey = String(key);
        const curVal = isLockedBotSkill ? 1 : Number(settings[key]);
        inp.value = String(curVal);
        inp.disabled = isLockedBotSkill;
        const val = document.createElement('span');
        val.className = 'val';
        const fmt = (v: number) => (it.pct ? Math.round(v * 100) + '%' : (+v).toFixed(2).replace(/\.?0+$/, ''));
        val.textContent = isLockedBotSkill ? t('setBotSkillFixed') : fmt(curVal);
        inp.oninput = () => {
          if (isLockedBotSkill) return;
          const v = parseFloat(inp.value);
          val.textContent = fmt(v);
          setSetting(key, v as never);
        };
        inp.onchange = () => {
          if (!isLockedBotSkill) audio.ui('click');
        };
        row.append(inp, val);
      } else if (it.t === 'check') {
        const inp = document.createElement('input');
        inp.type = 'checkbox';
        inp.checked = !!settings[key];
        inp.onchange = () => {
          setSetting(key, inp.checked as never);
          audio.ui('click');
        };
        row.appendChild(inp);
      } else if (it.t === 'select') {
        const sel = document.createElement('select');
        for (const [v, name] of it.opts || []) {
          const o = document.createElement('option');
          o.value = String(v);
          o.textContent = name;
          if (String(settings[key]) === String(v)) o.selected = true;
          sel.appendChild(o);
        }
        sel.onchange = () => {
          setSetting(key, (it.num ? parseFloat(sel.value) : sel.value) as never);
          audio.ui('click');
        };
        row.appendChild(sel);
      }
      body.appendChild(row);
      if (isLockedBotSkill) {
        const note = document.createElement('div');
        note.className = 'row-note';
        note.dataset.testid = 'bot-skill-locked-note';
        note.textContent = t('setBotSkillLockedNote');
        body.appendChild(note);
      }
    }

    if (tab === 'controls' && settings.controlMode === 'touch') {
      const guide = document.createElement('div');
      guide.className = 'ctrl-touch-guide';
      guide.dataset.testid = 'touch-guide';
      guide.innerHTML = t('setTouchGuide');
      body.appendChild(guide);
    }
  }

  function renderKeys(body: HTMLElement): void {
    const head = document.createElement('div');
    head.className = 'sub';
    head.textContent = t('keysHead');
    body.appendChild(head);
    const keyLabels = getKeyLabels(getLanguage());
    for (const action of Object.keys(keyLabels) as KeyAction[]) {
      const row = document.createElement('div');
      row.className = 'row';
      const lab = document.createElement('label');
      lab.textContent = keyLabels[action];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'key';
      btn.textContent = keyName(settings.keys[action], getLanguage());
      btn.onclick = () => {
        if (ui.rebinding) return;
        ui.rebinding = true;
        btn.textContent = t('keysWait');
        btn.classList.add('wait');
        const cap = (e: KeyboardEvent) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          window.removeEventListener('keydown', cap, true);
          ui.rebinding = false;
          btn.classList.remove('wait');
          if (e.code !== 'Escape') setKeyBind(action, e.code);
          btn.textContent = keyName(settings.keys[action], getLanguage());
        };
        window.addEventListener('keydown', cap, true);
      };
      row.append(lab, btn);
      body.appendChild(row);
    }
    const note = document.createElement('div');
    note.className = 'sub';
    note.textContent = t('keysNote');
    body.appendChild(note);
  }

  // Initial translation apply
  updateAllStaticTexts();

  return ui;
}
