import { createGame } from './game.js';

const canvas = document.getElementById('game-canvas');
const ui = {
  hud: document.getElementById('hud'),
  overlay: document.getElementById('overlay'),
  overlayTitle: document.getElementById('overlay-title'),
  overlayCopy: document.getElementById('overlay-copy'),
  startBtn: document.getElementById('start-btn'),
  score: document.getElementById('score'),
  timer: document.getElementById('timer'),
  ammo: document.getElementById('ammo'),
  hpFill: document.getElementById('hp-fill'),
  hpText: document.getElementById('hp-text'),
};

createGame(canvas, ui);

const reveal = document.querySelectorAll('.mode-list li, .weapon, .section-head');
const io = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.2 },
);

for (const el of reveal) {
  el.style.opacity = '0';
  el.style.transform = 'translateY(16px)';
  el.style.transition = 'opacity 0.6s cubic-bezier(0.22, 1, 0.36, 1), transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)';
  io.observe(el);
}

const style = document.createElement('style');
style.textContent = `.is-in { opacity: 1 !important; transform: none !important; }`;
document.head.appendChild(style);
