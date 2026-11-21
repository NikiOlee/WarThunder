import { useEffect, useRef } from 'react';
import { initGame } from './game/engine';

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const cleanup = initGame(el);
    return () => {
      cleanup();
    };
  }, []);

  return (
    <>
      <div id="app" ref={mountRef} data-testid="game-canvas" />
      <canvas id="scope" />
      <div id="vignette" />
      <div id="crosshair" />
      <div id="gunMark" />
      <canvas id="hitcam" />
      <canvas id="minimap" className="hud" width={156} height={156} data-testid="minimap" />
      <div id="mgHud" className="hud" data-testid="mg-hud">
        <div className="mg-head">
          <span id="mgKeyLabel">ПУЛЕМЁТ [F]</span>
          <span id="mgAmmo" data-testid="mg-ammo">
            100 / 300
          </span>
        </div>
        <div className="mg-bar">
          <div id="mgBarFill" />
        </div>
        <div id="mgStateTxt" className="mg-state">
          ГОТОВ
        </div>
      </div>

      <div id="help" className="hud" />
      <div id="modeLabel" className="hud">
        ОТ ТРЕТЬЕГО ЛИЦА
      </div>
      <div id="modeScore" className="hud" data-testid="mode-score">
        <span id="modeTitleHud">БОЙ ДО 100 КИЛЛОВ</span>
        <span className="ms-sep">·</span>
        <span id="modeScoreTeams">
          <span className="ms-ally">
            МЫ <b id="teamAKills">0</b>
          </span>{' '}
          <span className="ms-vs">:</span>{' '}
          <span className="ms-enemy">
            <b id="teamBKills">0</b> ВРАГИ
          </span>{' '}
          <span className="ms-goal" id="modeGoalHud">
            / 100
          </span>
        </span>
        <span id="modeScoreSurvival" className="hidden">
          <span className="ms-timer-lbl">ОСТАЛОСЬ</span>{' '}
          <b id="survivalTimerHud" className="ms-timer-val" data-testid="survival-timer">
            05:00
          </b>
          <span className="ms-sep">·</span>
          <span className="ms-goal" id="survivalKillsHud">
            ФРАГИ: 0
          </span>
        </span>
      </div>
      <div id="silverToasts" className="hud" data-testid="silver-toasts" />
      <div id="rangeBox" className="hud">
        <div className="lbl">ДИСТАНЦИЯ</div>
        <div className="big" id="range">
          ---
        </div>
        <div>
          ЗУМ <span id="zoom">x1.0</span>
        </div>
        <div>
          БАЛЛИСТ. КОМП. <span id="comp">ВЫКЛ</span>
        </div>
        <div>
          СКОРОСТЬ СНАРЯДА <span id="mv">500</span> м/с
        </div>
      </div>
      <div id="fps" className="hud">
        FPS
      </div>
      <div id="feed" className="hud" />
      <div id="status" className="hud">
        <div className="cell">
          <div className="big" id="speed">
            0
          </div>
          <div className="lbl">КМ/Ч</div>
        </div>
        <div className="cell">
          <div className="big" id="gear">
            N
          </div>
          <div className="lbl">ПЕРЕДАЧА</div>
        </div>
        <div id="reloadRing">
          <span id="reloadTxt">ГОТОВ</span>
        </div>
        <div className="cell">
          <div className="big" id="hullBrg">
            000
          </div>
          <div className="lbl">КОРПУС</div>
        </div>
        <div className="cell">
          <div className="big" id="turBrg">
            000
          </div>
          <div className="lbl">БАШНЯ</div>
        </div>
      </div>
      <div id="hp" className="hud">
        <div className="hp-head">
          <span>ПРОЧНОСТЬ</span>
          <span id="tankTag" style={{ color: '#ffd27a' }}>
            Т-55 · 120/120
          </span>
        </div>
        <div className="bar">
          <div id="hpFill" />
        </div>
        УБИТО{' '}
        <b id="kills" style={{ color: '#fff' }}>
          0
        </b>{' '}
        &nbsp; В СТРОЮ{' '}
        <b id="alive" style={{ color: '#fff' }}>
          4 v 4
        </b>
      </div>
      <div id="dmgStat" className="hud" />
      <div id="msg" className="hud" />
      <div id="roundBanner" className="hud hidden" data-testid="round-banner" />
      <div id="bossBar" className="hud hidden" data-testid="boss-bar">
        <div className="boss-name">МАУС</div>
        <div className="boss-track">
          <div id="bossFill" />
          <div id="bossHpText" className="boss-hp" />
        </div>
        <div className="boss-flame-wrap">
          <div id="bossFlameFill" />
          <div id="bossFlameText" className="boss-flame-txt">
            ОГНЕМЁТ
          </div>
        </div>
      </div>
      <div id="victoryBanner" className="hud hidden" data-testid="victory-banner" />
      <div id="spectatorBar" className="hud hidden" data-testid="spectator-bar">
        <div className="spec-title">РЕЖИМ НАБЛЮДАТЕЛЯ</div>
        <div className="spec-target">
          Наблюдение: <b id="specTargetName">—</b> <span id="specTargetHp" />
        </div>
        <div className="spec-actions">
          <button type="button" className="spec-nav-btn" id="bSpecPrev" aria-label="Предыдущий союзник">
            ◀ ПРЕД
          </button>
          <span className="spec-hint">ЛКМ / ← / A — назад · ПКМ / → / D — вперёд · МЫШЬ — обзор</span>
          <button type="button" className="spec-nav-btn" id="bSpecNext" aria-label="Следующий союзник">
            СЛЕД ▶
          </button>
        </div>
      </div>
      <div id="dead" />

      <div id="touchHud" className="hud" data-testid="touch-hud">
        <div className="touch-top-bar">
          <button type="button" className="tbtn tbtn-top" id="tBtnScore" data-touch-control="true" data-testid="touch-btn-score">
            СЧЁТ
          </button>
          <button type="button" className="tbtn tbtn-top" id="tBtnPause" data-touch-control="true" data-testid="touch-btn-pause">
            ПАУЗА
          </button>
        </div>

        <div id="touchJoyBase" className="touch-joy-base" data-touch-control="true" data-testid="touch-joystick">
          <div className="touch-joy-cross" aria-hidden="true" />
          <div id="touchJoyKnob" className="touch-joy-knob" />
        </div>

        <div className="touch-actions">
          <div className="touch-sec-row">
            <button type="button" className="tbtn tbtn-sec hidden" id="tBtnZoom" data-touch-control="true" data-testid="touch-btn-zoom">
              ЗУМ x1.0
            </button>
            <button type="button" className="tbtn tbtn-sec" id="tBtnBinoc" data-touch-control="true" data-testid="touch-btn-binoc">
              БИНОКЛЬ
            </button>
            <button type="button" className="tbtn tbtn-sec" id="tBtnSniper" data-touch-control="true" data-testid="touch-btn-sniper">
              ПРИЦЕЛ
            </button>
            <button type="button" className="tbtn tbtn-sec tbtn-reload" id="tBtnMgReload" data-touch-control="true" data-testid="touch-btn-mg-reload">
              ЛЕНТА R
            </button>
          </div>
          <div className="touch-main-row">
            <button type="button" className="tbtn tbtn-mg" id="tBtnMg" data-touch-control="true" data-testid="touch-btn-mg">
              <span className="tbtn-label">ПУЛЕМЁТ</span>
              <span id="tMgAmmoTxt" className="tbtn-sub">
                100/400
              </span>
            </button>
            <button type="button" className="tbtn tbtn-fire" id="tBtnFire" data-touch-control="true" data-testid="touch-btn-fire">
              <span className="tbtn-label">ОГОНЬ</span>
              <span id="tFireReloadTxt" className="tbtn-sub">
                ГОТОВ
              </span>
            </button>
          </div>
        </div>
      </div>

      <div id="scoreboard" className="hidden" data-testid="scoreboard">
        <div className="sb-card">
          <div className="sb-head">
            <div>
              <div className="sb-mode" id="sbModeName">
                БОЙ ДО 100 КИЛЛОВ
              </div>
              <div className="sb-sub">Таблица счёта · удерживайте TAB или нажмите СЧЁТ</div>
            </div>
            <div className="sb-head-right">
              <div className="sb-score" id="sbTeamScore">
                МЫ 0 : 0 ВРАГИ (цель: 100)
              </div>
              <button type="button" className="sb-close-btn" id="bSbClose" aria-label="Закрыть счёт">
                ЗАКРЫТЬ
              </button>
            </div>
          </div>
          <div className="sb-cols">
            <div className="sb-col">
              <div className="sb-col-title ally">СОЮЗНИКИ</div>
              <div id="sbTeamA" className="sb-list" />
            </div>
            <div className="sb-col">
              <div className="sb-col-title enemy">ПРОТИВНИКИ</div>
              <div id="sbTeamB" className="sb-list" />
            </div>
          </div>
        </div>
      </div>

      <div id="console">
        <div id="conLog" />
        <input id="conIn" type="text" autoComplete="off" spellCheck={false} placeholder="команда... (help)" />
      </div>

      <div id="menu">
        <div id="controlSelectPanel" className="panel hidden" data-testid="control-select-panel">
          <h1>IRON &amp; SKY</h1>
          <div className="tag">ВЫБЕРИТЕ УПРАВЛЕНИЕ</div>
          <div className="ctrl-intro">
            Выберите удобный способ управления перед началом игры. Вы всегда сможете переключить его позже в разделе «Управление».
          </div>
          <div className="ctrl-cards">
            <button type="button" className="ctrl-card" id="bChoosePc" data-testid="choose-pc">
              <div className="ctrl-card-head">
                <span className="ctrl-card-title">ПК (КЛАВИАТУРА И МЫШЬ)</span>
                <span id="ctrlRecPc" className="ctrl-rec hidden">
                  РЕКОМЕНДУЕТСЯ
                </span>
              </div>
              <div className="ctrl-card-desc">
                Движение на WASD, обзор и стрельба мышью, пулемёт на F, прицел на Shift, таблица счёта на TAB.
              </div>
            </button>
            <button type="button" className="ctrl-card" id="bChooseTouch" data-testid="choose-touch">
              <div className="ctrl-card-head">
                <span className="ctrl-card-title">ТЕЛЕФОН (СЕНСОР)</span>
                <span id="ctrlRecTouch" className="ctrl-rec hidden">
                  РЕКОМЕНДУЕТСЯ
                </span>
              </div>
              <div className="ctrl-card-desc">
                Виртуальный джойстик слева, поворот камеры свайпом в любом месте экрана, кнопки огня, пулемёта, прицела, бинокля, паузы и счёта.
              </div>
            </button>
          </div>
        </div>

        <div id="mainPanel" className="panel">
          <h1>IRON &amp; SKY</h1>
          <div className="tag">ТАНКОВЫЙ БОЙ</div>
          <div className="btnrow">
            <button type="button" className="btn" id="bPlay" data-start="true">
              ИГРАТЬ
            </button>
            <button type="button" className="btn" id="bModes">
              РЕЖИМЫ
            </button>
            <button type="button" className="btn" id="bMaps">
              КАРТЫ
            </button>
          </div>
          <div className="mapline" id="mapName">
            Режим: Бой до 100 киллов · Карта: Холмы · Танк: Т-55
          </div>
          <button type="button" className="btn dim" id="bNew" style={{ display: 'none' }}>
            НОВАЯ БИТВА
          </button>
          <div className="btnrow">
            <button type="button" className="btn dim" id="bHangar">
              АНГАР
            </button>
            <button type="button" className="btn dim" id="bSet">
              НАСТРОЙКИ
            </button>
          </div>
          <div className="btnrow">
            <button type="button" className="btn dim" id="bHistory" data-testid="btn-history">
              ИСТОРИЯ БОЁВ
            </button>
            <button type="button" className="btn dim" id="bCtl">
              УПРАВЛЕНИЕ
            </button>
          </div>
          <div className="info" id="menuModeInfo">
            Режим «Бой до 100 киллов»: вы и 3 союзника против 4 ботов на танках Т-55.
            <br />
            +50 серебра за килл · +150 за 10 киллов · +300 за 20 киллов · +500 за победу. Читы (sv_cheats) отключены.
            <br />
            Консоль настроек: ~ · Таблица счёта: TAB · Таран: -20 ХП
          </div>
        </div>

        <div id="hangarScreen" className="hidden">
          <div className="hangar-top">
            <div className="hangar-title-wrap">
              <h2 className="hangar-title">АНГАР</h2>
              <span className="hangar-sub">БОЕВАЯ ТЕХНИКА</span>
            </div>
            <div className="hangar-top-actions">
              <div className="hangar-silver" id="hangarSilver" data-testid="hangar-silver">
                <span className="hs-label">СЕРЕБРО</span>
                <b className="hs-val" id="hangarSilverVal">
                  0
                </b>
              </div>
              <button type="button" className="btn dim hangar-back-btn" id="bHangarBack">
                НАЗАД В МЕНЮ
              </button>
            </div>
          </div>

          <div className="hangar-body">
            <div className="hangar-left">
              <div className="hangar-sec-label">СПИСОК ТЕХНИКИ</div>
              <div id="hangarList" />
            </div>

            <div className="hangar-right-wrap">
              <div id="hangarHint" className="hangar-hint">
                Нажмите на танк в списке слева, чтобы открыть характеристики.
              </div>
              <div id="hangarInfo" className="hangar-info hidden" data-testid="hangar-info">
                <div className="hangar-info-head">
                  <h3 id="hangarTankTitle">Т-55</h3>
                  <span id="hangarTankRole" className="hangar-info-role" />
                </div>
                <div id="hangarTankDesc" className="hangar-info-desc" />
                <div id="hangarStats" className="hangar-stats" />
                <div className="hangar-info-foot">
                  <div id="hangarEquipStatus" className="hangar-equip-status" />
                  <button type="button" className="btn hangar-select-btn" id="bHangarSelect">
                    ВЫБРАТЬ
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div id="mapPanel" className="panel hidden">
          <h2>ВЫБОР КАРТЫ</h2>
          <div id="mapCards" />
          <div className="foot">
            <button type="button" className="btn dim" id="bMapsBack">
              ГОТОВО
            </button>
          </div>
        </div>

        <div id="modePanel" className="panel hidden" data-testid="mode-panel">
          <h2>ВЫБОР РЕЖИМА</h2>
          <div id="modeCards" />
          <div className="foot">
            <button type="button" className="btn dim" id="bModesBack">
              ГОТОВО
            </button>
          </div>
        </div>

        <div id="historyPanel" className="panel hidden" data-testid="history-panel">
          <h2>ИСТОРИЯ БОЁВ</h2>
          <div id="historySummary" className="hist-summary" data-testid="history-summary" />
          <div id="historyEmpty" className="hist-empty hidden" data-testid="history-empty">
            История боёв пуста. Завершите матч в любом боевом режиме, чтобы увидеть статистику.
          </div>
          <div id="historyList" className="hist-list" data-testid="history-list" />
          <div className="foot">
            <button type="button" className="btn dim" id="bHistoryClear" data-testid="history-clear">
              ОЧИСТИТЬ ИСТОРИЮ
            </button>
            <button type="button" className="btn dim" id="bHistoryBack" data-testid="history-back">
              НАЗАД
            </button>
          </div>
        </div>

        <div id="pausePanel" className="panel hidden">
          <h2>ПАУЗА</h2>
          <button type="button" className="btn" id="bResume">
            ПРОДОЛЖИТЬ
          </button>
          <button type="button" className="btn dim" id="bPauseSet">
            НАСТРОЙКИ
          </button>
          <button type="button" className="btn dim" id="bToMenu">
            В ГЛАВНОЕ МЕНЮ
          </button>
        </div>

        <div id="matchEndPanel" className="panel hidden" data-testid="match-end-panel">
          <h2 id="meTitle">ПОБЕДА!</h2>
          <div className="tag" id="meSub">
            БОЙ ДО 100 КИЛЛОВ
          </div>
          <div id="meSummary" className="me-summary" />
          <div className="me-actions">
            <button type="button" className="btn" id="bMeHangar">
              В АНГАР
            </button>
            <button type="button" className="btn dim" id="bMeMenu">
              В ГЛАВНОЕ МЕНЮ
            </button>
            <button type="button" className="btn dim" id="bMeAgain">
              НОВАЯ БИТВА
            </button>
          </div>
        </div>

        <div id="settingsPanel" className="panel hidden">
          <h2>НАСТРОЙКИ</h2>
          <div id="tabs" />
          <div id="tabBody" />
          <div className="foot">
            <button type="button" className="btn dim" id="bReset">
              СБРОС
            </button>
            <button type="button" className="btn dim" id="bBack">
              НАЗАД
            </button>
          </div>
        </div>
      </div>

      <div id="err" />
    </>
  );
}
