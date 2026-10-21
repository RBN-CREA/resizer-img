// Bascule entre le thème pixel art et le thème classique (mémorisée)
const root = document.documentElement;
const button = document.getElementById('themeToggle');

function render() {
  const pixel = root.classList.contains('px-theme');
  button.setAttribute('aria-pressed', pixel ? 'true' : 'false');
  button.textContent = pixel ? 'Style : pixel' : 'Style : classique';
}

button.addEventListener('click', () => {
  const pixel = root.classList.toggle('px-theme');
  try { localStorage.setItem('resizeStudio.theme', pixel ? 'pixel' : 'classic'); } catch (e) { /* stockage indisponible */ }
  render();
});

render();
