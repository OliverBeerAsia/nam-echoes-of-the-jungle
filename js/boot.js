// Lightweight menu boot. The heavy Three.js game runtime is imported only
// after the player starts the mission.

let booting = false;

const startBtn = document.getElementById('btn-start');
const controlsBtn = document.getElementById('btn-controls');
const backBtn = document.getElementById('btn-back');
const gfxSelect = document.getElementById('gfx-quality');

function showMenu() {
  document.getElementById('controls-screen')?.classList.add('hidden');
  document.getElementById('loading-screen')?.classList.add('hidden');
  document.getElementById('menu-screen')?.classList.remove('hidden');
}

function showControls() {
  document.getElementById('menu-screen')?.classList.add('hidden');
  document.getElementById('loading-screen')?.classList.add('hidden');
  document.getElementById('controls-screen')?.classList.remove('hidden');
}

function setLoading(label, progress = 0.03) {
  document.getElementById('menu-screen')?.classList.add('hidden');
  document.getElementById('controls-screen')?.classList.add('hidden');
  document.getElementById('loading-screen')?.classList.remove('hidden');

  const stage = document.getElementById('loading-stage');
  const fill = document.getElementById('loading-fill');
  if (stage) stage.textContent = label.toUpperCase();
  if (fill) fill.style.width = Math.round(Math.max(0, Math.min(1, progress)) * 100) + '%';
}

function showBootError(message) {
  setLoading(message, 1);
  const title = document.querySelector('#loading-screen h2');
  if (title) title.textContent = 'BOOT FAILED';
  if (startBtn) startBtn.disabled = false;
  booting = false;
}

if (gfxSelect) {
  const savedPreset = localStorage.getItem('nam_gfx_preset') || 'auto';
  gfxSelect.value = savedPreset;
  gfxSelect.addEventListener('change', () => {
    localStorage.setItem('nam_gfx_preset', gfxSelect.value);
    if (window.game?.graphics) {
      window.game._applyGraphicsPreset(gfxSelect.value, true);
    }
  });
}

controlsBtn?.addEventListener('click', showControls);
backBtn?.addEventListener('click', showMenu);

startBtn?.addEventListener('click', async () => {
  if (booting) return;
  booting = true;
  if (startBtn) startBtn.disabled = true;

  try {
    setLoading('Loading field runtime...', 0.02);
    const { Game } = await import('./game.js');
    setLoading('Starting mission systems...', 0.05);
    const game = new Game();
    window.game = game;
    await game._startGame();
  } catch (err) {
    console.error('[NAM] Boot failed:', err);
    showBootError('Mission boot failed. Refresh and try again.');
  }
});
