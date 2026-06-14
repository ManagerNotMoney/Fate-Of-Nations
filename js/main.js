(function() {
    'use strict';
    const HM = window.HexMap;
    const R = window.Renderer;
    const UI = window.UI;

    window.GameState = {
        currentTurn: 1,
        selectedCell: null,
        namingCell: null,
        isDragging: false,
        dragStartX: 0,
        dragStartY: 0,
        dragMoved: false,
        stampMode: false,      // Режим застройки (ПКМ строит)
        autoWork: false,       // Авто-работа
        lastBuildType: null    // Последний тип здания в очереди/постройке
    };

    let config = { mapSize: 'medium', difficulty: 'normal' };

    const startMenu    = document.getElementById('startMenu');
    const setupModal   = document.getElementById('setupModal');
    const loadingScreen= document.getElementById('loadingScreen');
    const gameScreen   = document.getElementById('gameScreen');
    const authorsModal = document.getElementById('authorsModal');
    const howToModal   = document.getElementById('howToModal');
    const aboutModal   = document.getElementById('aboutModal');

    // ─── Auto-save interval (every turn already; also every 30s as safety net) ──
    let _autoSaveTimer = null;

    // ─── Particles ─────────────────────────────────────────
    function initParticles() {
        const container = document.getElementById('particles');
        if (!container) return;
        for (let i = 0; i < 30; i++) createParticle(container);
    }

    function createParticle(container) {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = Math.random() * 3 + 2;
        p.style.cssText = `width:${size}px;height:${size}px;left:${Math.random()*100}%;` +
            `animation-duration:${Math.random()*8+6}s;animation-delay:${Math.random()*5}s;` +
            `background:${['#4f8ef7','#7c3aed','#22c55e','#f4b942'][Math.floor(Math.random()*4)]};` +
            `opacity:${Math.random()*0.3+0.1};`;
        container.appendChild(p);
        p.addEventListener('animationend', () => { p.remove(); createParticle(container); });
    }

    // ─── Menu ──────────────────────────────────────────────
    function initMenu() {
        // Show "Continue" button if save exists
        _refreshContinueBtn();

        // "Продолжить" button
        const btnContinue = document.getElementById('btnContinue');
        if (btnContinue) {
            btnContinue.addEventListener('click', () => {
                const data = window.SaveGame?.load();
                if (!data) return;
                startMenu.classList.add('hide');
                setTimeout(() => {
                    startMenu.style.display = 'none';
                    loadingScreen.style.display = 'flex';
                    document.getElementById('loadingBar').style.width = '0%';
                    document.getElementById('loadingText').textContent = 'Загрузка сохранения...';
                    setTimeout(() => {
                        document.getElementById('loadingBar').style.width = '100%';
                        document.getElementById('loadingText').textContent = 'Восстановление города...';
                        setTimeout(() => {
                            loadingScreen.style.display = 'none';
                            gameScreen.style.display = 'block';
                            loadGame(data);
                        }, 400);
                    }, 500);
                }, 350);
            });
        }

        // "Начать игру" → открываем настройки
        document.getElementById('btnPlay').addEventListener('click', openSetupModal);

        // Setup modal: map size selection
        document.getElementById('mapSizeGroup').querySelectorAll('.setup-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.getElementById('mapSizeGroup').querySelectorAll('.setup-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                config.mapSize = opt.dataset.size;
            });
        });

        // Setup modal: difficulty selection
        document.getElementById('difficultyGrid').querySelectorAll('.setup-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.getElementById('difficultyGrid').querySelectorAll('.setup-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                config.difficulty = opt.dataset.diff;
            });
        });

        // Setup modal: close / back
        document.getElementById('btnCloseSetup').addEventListener('click', closeSetupModal);
        setupModal.addEventListener('click', e => { if (e.target === setupModal) closeSetupModal(); });

        // Setup modal: confirm → start game
        document.getElementById('btnConfirmSetup').addEventListener('click', () => {
            closeSetupModal();
            startGame();
        });

        // How to play
        document.getElementById('btnHowToPlay').addEventListener('click', () => howToModal.style.display = 'flex');
        document.getElementById('btnCloseHowTo').addEventListener('click', () => howToModal.style.display = 'none');
        howToModal.addEventListener('click', e => { if (e.target === howToModal) howToModal.style.display = 'none'; });

        // About project (stub)
        document.getElementById('btnAboutProject').addEventListener('click', () => aboutModal.style.display = 'flex');
        document.getElementById('btnCloseAbout').addEventListener('click', () => aboutModal.style.display = 'none');
        aboutModal.addEventListener('click', e => { if (e.target === aboutModal) aboutModal.style.display = 'none'; });

        // Authors
        document.getElementById('btnAuthors').addEventListener('click', () => authorsModal.style.display = 'flex');

        // Authors
        document.getElementById('btnCloseAuthors').addEventListener('click', () => authorsModal.style.display = 'none');
        authorsModal.addEventListener('click', e => { if (e.target === authorsModal) authorsModal.style.display = 'none'; });

        // In-game menu
        document.getElementById('btnMenuInGame').addEventListener('click', backToMenu);

        // Settings (gear) button — legend toggle
        const settingsBtn = document.getElementById('settingsBtn');
        const settingsMenu = document.getElementById('settingsMenu');
        const toggleLegend = document.getElementById('toggleLegend');
        const mapLegend = document.getElementById('mapLegend');
        if (settingsBtn && settingsMenu) {
            settingsBtn.addEventListener('click', e => {
                e.stopPropagation();
                settingsMenu.style.display = settingsMenu.style.display === 'block' ? 'none' : 'block';
            });
            document.addEventListener('click', e => {
                if (settingsMenu.style.display === 'block' &&
                    !settingsMenu.contains(e.target) && e.target !== settingsBtn) {
                    settingsMenu.style.display = 'none';
                }
            });
        }
        if (toggleLegend && mapLegend) {
            toggleLegend.addEventListener('change', () => {
                mapLegend.style.display = toggleLegend.checked ? '' : 'none';
            });
        }

        // Stamp mode toggle
        const toggleStampMode = document.getElementById('toggleStampMode');
        const stampHint = document.getElementById('stampHint');
        if (toggleStampMode) {
            toggleStampMode.addEventListener('change', () => {
                window.GameState.stampMode = toggleStampMode.checked;
                if (stampHint) {
                    stampHint.style.display = toggleStampMode.checked ? 'block' : 'none';
                    _updateStampHint();
                }
                if (window.UI) window.UI.showNotification(
                    toggleStampMode.checked
                        ? '🖱️ Режим застройки включён — ПКМ по пустой клетке строит последнее здание'
                        : '🖱️ Режим застройки выключен',
                    3000
                );
            });
        }

        // Auto-work toggle
        const toggleAutoWork = document.getElementById('toggleAutoWork');
        if (toggleAutoWork) {
            toggleAutoWork.addEventListener('change', () => {
                window.GameState.autoWork = toggleAutoWork.checked;
                if (window.UI) window.UI.showNotification(
                    toggleAutoWork.checked
                        ? '👷 Авто-работа включена — рабочие назначаются автоматически'
                        : '👷 Авто-работа выключена',
                    3000
                );
            });
        }

        // Map mode toggle
        const mapModeToggle = document.getElementById('mapModeToggle');
        if (mapModeToggle) {
            mapModeToggle.querySelectorAll('.map-mode-option').forEach(opt => {
                opt.addEventListener('click', () => {
                    mapModeToggle.querySelectorAll('.map-mode-option').forEach(o => o.classList.remove('active'));
                    opt.classList.add('active');
                    const mode = opt.dataset.mode;
                    if (window.Renderer) window.Renderer.setMapMode(mode);
                    if (window.UI) {
                        if (mode === 'work') window.UI.startWorkModeAnim();
                        else window.UI.stopWorkModeAnim();
                    }
                });
            });
        }
    }

    window._updateStampHint = function() {
        const el = document.getElementById('stampHintType');
        if (!el) return;
        const type = window.GameState.lastBuildType;
        if (type && window.GameConfig && window.GameConfig.BUILDINGS[type]) {
            const bc = window.GameConfig.BUILDINGS[type];
            el.textContent = bc.icon + ' ' + bc.name;
        } else {
            el.textContent = 'Нет последнего здания';
        }
    };

    // Expose for ui-panel to call after queuing a build
    function openSetupModal() {
        if (setupModal) setupModal.style.display = 'flex';
    }

    function closeSetupModal() {
        if (setupModal) setupModal.style.display = 'none';
    }

    // ─── Game Flow ─────────────────────────────────────────
    function startGame() {
        // Clear any existing save — this is a brand new game
        if (window.SaveGame) window.SaveGame.clear();
        startMenu.classList.add('hide');
        setTimeout(() => {
            startMenu.style.display = 'none';
            loadingScreen.style.display = 'flex';
            let progress = 0;
            const steps = [
                'Генерация ландшафта...', 'Создание рек и озёр...',
                'Расстановка гор...', 'Посев плодородных земель...', 'Финальная обработка...'
            ];
            const interval = setInterval(() => {
                progress += Math.random() * 15 + 8;
                if (progress > 100) progress = 100;
                document.getElementById('loadingBar').style.width = progress + '%';
                document.getElementById('loadingText').textContent =
                    steps[Math.min(Math.floor((progress / 100) * steps.length), steps.length - 1)];
                if (progress >= 100) {
                    clearInterval(interval);
                    setTimeout(() => {
                        loadingScreen.style.display = 'none';
                        gameScreen.style.display = 'block';
                        initGameScreen();
                    }, 400);
                }
            }, 250);
        }, 350);
    }

    function initGameScreen() {
        // Full cleanup of previous game state
        if (window.UI && window.UI.cleanup) window.UI.cleanup();
        window.GameState.currentTurn = 1;
        window.GameState.selectedCell = null;
        window.GameState.namingCell = null;
        window.GameState.isDragging = false;
        window.GameState.dragMoved = false;
        document.getElementById('turnCounter').textContent = '1';
        HM.generate(config.mapSize);
        R.init('gameCanvas');
        HM.center(R.canvas.width, R.canvas.height);
        R.render();
        UI.init();
        initCanvasEvents();
        _startAutoSave();
    }

    function loadGame(data) {
        if (window.UI && window.UI.cleanup) window.UI.cleanup();
        window.GameState.currentTurn = 1; // will be overwritten by restore
        document.getElementById('turnCounter').textContent = '1';
        // Init renderer first (needs canvas)
        R.init('gameCanvas');
        // Restore all state
        const ok = window.SaveGame.restore(data);
        if (!ok) {
            // Fallback: start fresh
            HM.generate(config.mapSize);
        }
        document.getElementById('turnCounter').textContent = window.GameState.currentTurn;
        HM.center(R.canvas.width, R.canvas.height, /* keepCamera= */ true);
        R.render();
        UI.init();
        initCanvasEvents();
        _startAutoSave();
        if (window.UI) window.UI.showNotification('💾 Игра загружена — ход ' + window.GameState.currentTurn, 3000);
    }

    function _refreshContinueBtn() {
        const btn  = document.getElementById('btnContinue');
        const info = document.getElementById('saveSlotInfo');
        if (!btn) return;
        const meta = window.SaveGame?.getMeta();
        if (meta) {
            btn.style.display = '';
            if (info) {
                const date = new Date(meta.savedAt);
                const dateStr = date.toLocaleDateString('ru-RU', { day:'numeric', month:'short' }) +
                    ' ' + date.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });
                info.textContent = `${meta.cityName} · ход ${meta.turn} · ${dateStr}`;
                info.style.display = '';
            }
        } else {
            btn.style.display = 'none';
            if (info) info.style.display = 'none';
        }
    }

    function _startAutoSave() {
        // Save after every endTurn — hook into UI.endTurn
        if (!window._origEndTurn) {
            window._origEndTurn = window.UI.endTurn.bind(window.UI);
            window.UI.endTurn = function() {
                window._origEndTurn();
                if (window.SaveGame) window.SaveGame.save();
            };
        }
        // Also save every 30 seconds as a safety net
        clearInterval(_autoSaveTimer);
        _autoSaveTimer = setInterval(() => {
            if (gameScreen.style.display !== 'none') {
                if (window.SaveGame) window.SaveGame.save();
            }
        }, 30000);
    }

    function backToMenu() {
        const turns = window.GameState?.currentTurn || 0;
        if (turns > 5) {
            const cityName = window.HexMap?.cityName || window.GameConfig?.DEFAULT_CITY_NAME || 'город';
            if (!confirm(`Вернуться в главное меню?\n\nПрогресс «${cityName}» (${turns} ходов) не сохранится — игра начнётся заново.`)) return;
        }
        clearInterval(_autoSaveTimer);
        // Reset endTurn hook so it can be re-applied on next game
        if (window._origEndTurn) {
            window.UI.endTurn = window._origEndTurn;
            window._origEndTurn = null;
        }
        gameScreen.style.display = 'none';
        UI.closePanel();
        _refreshContinueBtn();
        startMenu.style.display = 'flex';
        startMenu.classList.remove('hide');
    }

    // ─── Canvas Events ──────────────────────────────────────
    function initCanvasEvents() {
        const canvas = R.canvas;
        if (!canvas) return;
        // Prevent duplicate listeners: check if already bound
        if (canvas.dataset.eventsBound === 'true') return;
        canvas.dataset.eventsBound = 'true';

        canvas.addEventListener('mousedown', e => {
            // Only left-click (button 0) starts drag; right-click (button 2) is for worker assign
            if (e.button !== 0) return;
            window.GameState.isDragging = true;
            window.GameState.dragMoved = false;
            window.GameState.dragStartX = e.clientX;
            window.GameState.dragStartY = e.clientY;
        });

        canvas.addEventListener('mousemove', e => {
            if (!window.GameState.isDragging || e.buttons !== 1) return;
            const dx = e.clientX - window.GameState.dragStartX;
            const dy = e.clientY - window.GameState.dragStartY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) window.GameState.dragMoved = true;
            HM.cameraX += dx;
            HM.cameraY += dy;
            window.GameState.dragStartX = e.clientX;
            window.GameState.dragStartY = e.clientY;
            R.render();
        });

        canvas.addEventListener('mouseup', e => {
            if (e.button === 0) window.GameState.isDragging = false;
        });
        canvas.addEventListener('mouseleave', () => { window.GameState.isDragging = false; });

        // ПКМ — застройка (stamp) или быстрое назначение рабочих
        canvas.addEventListener('contextmenu', e => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const hex = HM.pixelToHex(e.clientX - rect.left, e.clientY - rect.top);
            if (!hex) return;

            const key = hex.col + ',' + hex.row;
            const building = HM.buildings[key];
            const inQueue  = HM.buildQueue.find(q => q.col === hex.col && q.row === hex.row);

            // Stamp mode: ПКМ по пустой клетке → строим последнее здание
            if (window.GameState.stampMode && !building && !inQueue) {
                const type = window.GameState.lastBuildType;
                if (!type) {
                    UI.showNotification('🖱️ Режим застройки: сначала постройте любое здание вручную', 3000);
                    return;
                }
                const result = window.EconomyEngine.queueBuild(HM, hex.col, hex.row, type);
                if (result.ok) {
                    const bc = window.GameConfig.BUILDINGS[type];
                    UI.showNotification(bc.icon + ' ' + bc.name + ' — поставлено в очередь');
                    UI.updateResourceBar();
                    UI.startConstructionAnim();
                    // Auto-work: if enabled, will trigger on completion in processTurn
                    if (window.GameState.selectedCell &&
                        window.GameState.selectedCell.col === hex.col &&
                        window.GameState.selectedCell.row === hex.row) {
                        UI.openPanel(hex.col, hex.row);
                    }
                    R.render();
                } else {
                    UI.showNotification('⚠️ ' + result.reason, 2500);
                }
                return;
            }

            // Default: quick assign/remove workers
            if (window.UIPanel) window.UIPanel.quickAssignWorkers(hex.col, hex.row);
        });

        canvas.addEventListener('click', e => {
            if (window.GameState.dragMoved) return;
            const rect = canvas.getBoundingClientRect();
            const hex = HM.pixelToHex(e.clientX - rect.left, e.clientY - rect.top);
            if (hex) UI.openPanel(hex.col, hex.row);
            else UI.closePanel();
        });

        canvas.addEventListener('wheel', e => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.15 : 0.15;
            const newZoom = Math.max(0.4, Math.min(3.5, HM.zoom + delta));
            if (newZoom !== HM.zoom) {
                const rect = canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                const ratio = newZoom / HM.zoom;
                HM.cameraX = mx - (mx - HM.cameraX) * ratio;
                HM.cameraY = my - (my - HM.cameraY) * ratio;
                HM.zoom = newZoom;
                R.render();
            }
        }, { passive: false });

        // Touch support (basic)
        let lastTouchDist = 0;
        canvas.addEventListener('touchstart', e => {
            if (e.touches.length === 2) {
                lastTouchDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
            }
        }, { passive: true });

        canvas.addEventListener('touchmove', e => {
            if (e.touches.length === 2) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                const ratio = dist / lastTouchDist;
                const newZoom = Math.max(0.4, Math.min(3.5, HM.zoom * ratio));
                HM.zoom = newZoom;
                lastTouchDist = dist;
                R.render();
            }
        }, { passive: true });
    }

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (setupModal && setupModal.style.display === 'flex') { setupModal.style.display = 'none'; return; }
            if (authorsModal && authorsModal.style.display === 'flex') { authorsModal.style.display = 'none'; return; }
            if (howToModal && howToModal.style.display === 'flex') { howToModal.style.display = 'none'; return; }
            if (aboutModal && aboutModal.style.display === 'flex') { aboutModal.style.display = 'none'; return; }
            UI.closePanel();
        }
    });

    function init() {
        initParticles();
        initMenu();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();