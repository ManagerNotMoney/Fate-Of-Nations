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
        dragMoved: false
    };

    let config = { mapSize: 'medium', difficulty: 'normal' };

    const startMenu    = document.getElementById('startMenu');
    const setupModal   = document.getElementById('setupModal');
    const loadingScreen= document.getElementById('loadingScreen');
    const gameScreen   = document.getElementById('gameScreen');
    const authorsModal = document.getElementById('authorsModal');
    const howToModal   = document.getElementById('howToModal');
    const aboutModal   = document.getElementById('aboutModal');

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
    }

    function openSetupModal() {
        if (setupModal) setupModal.style.display = 'flex';
    }

    function closeSetupModal() {
        if (setupModal) setupModal.style.display = 'none';
    }

    // ─── Game Flow ─────────────────────────────────────────
    function startGame() {
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
        UI.cleanup();
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
    }

    function backToMenu() {
        gameScreen.style.display = 'none';
        UI.closePanel();
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

        // ПКМ — быстрое назначение/снятие рабочих
        canvas.addEventListener('contextmenu', e => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const hex = HM.pixelToHex(e.clientX - rect.left, e.clientY - rect.top);
            if (!hex) return;
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