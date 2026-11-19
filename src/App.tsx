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

      <div id="help" className="hud" />
      <div id="modeLabel" className="hud">
        ОТ ТРЕТЬЕГО ЛИЦА
      </div>
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
      <div id="dead" />

      <div id="console">
        <div id="conLog" />
        <input id="conIn" type="text" autoComplete="off" spellCheck={false} placeholder="команда... (help)" />
      </div>

      <div id="menu">
        <div id="mainPanel" className="panel">
          <h1>IRON &amp; SKY</h1>
          <div className="tag">ТАНКОВЫЙ БОЙ</div>
          <div className="btnrow">
            <button type="button" className="btn" id="bPlay" data-start="true">
              ИГРАТЬ
            </button>
            <button type="button" className="btn" id="bMaps">
              КАРТЫ
            </button>
          </div>
          <div className="mapline" id="mapName">
            Карта: Холмы · Танк: Т-55
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
          <button type="button" className="btn dim" id="bCtl">
            УПРАВЛЕНИЕ
          </button>
          <div className="info">
            Вы и 3 союзника против 4 ботов на танках Т-55.
            <br />
            Лоб 200 мм держит удар (50 урона при пробитии), борта и корма — 60 урона, точное попадание в бензобак — мгновенный взрыв.
            <br />
            Консоль: клавиша ~ (Ё)
          </div>
        </div>

        <div id="hangarScreen" className="hidden">
          <div className="hangar-top">
            <div className="hangar-title-wrap">
              <h2 className="hangar-title">АНГАР</h2>
              <span className="hangar-sub">БОЕВАЯ ТЕХНИКА</span>
            </div>
            <button type="button" className="btn dim hangar-back-btn" id="bHangarBack">
              НАЗАД В МЕНЮ
            </button>
          </div>

          <div className="hangar-body">
            <div className="hangar-left">
              <div className="hangar-sec-label">СПИСОК ТЕХНИКИ</div>
              <div id="hangarList" />
            </div>

            <div className="hangar-right-wrap">
              <div id="hangarHint" className="hangar-hint">
                Нажмите на танк «Т-55» в списке слева, чтобы открыть характеристики.
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
