import { UI, SPEECH_LANG, otherLang } from './i18n.js';
import { AGE_BANDS, DEFAULT_AGE_BAND, CATEGORIES, bandById, buildRound, eligibleQuestions, starsFor } from './quiz.js';
import { sounds, confetti, speak } from './effects.js';

const CATEGORY_LOOK = {
  all: { emoji: '🎲', color: 'var(--c-purple)' },
  science: { emoji: '🔬', color: 'var(--c-green)' },
  geography: { emoji: '🌎', color: 'var(--c-blue)' },
  math: { emoji: '🔢', color: 'var(--c-orange)' },
  popCulture: { emoji: '🎬', color: 'var(--c-pink)' },
};
const ANSWER_COLORS = ['var(--c-blue)', 'var(--c-pink)', 'var(--c-green)', 'var(--c-orange)'];

// ---- tiny persisted settings (browser storage can be unavailable) ----
const store = {
  get(k, fallback) { try { const v = localStorage.getItem('trivia.' + k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem('trivia.' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};

const state = {
  lang: store.get('lang', 'es'),
  band: store.get('band', DEFAULT_AGE_BAND),
  category: 'all',
  sound: store.get('sound', true),
  questions: [],
  round: [],
  index: 0,
  score: 0,
  choice: null,
  cheer: 0,
  celebrated: false,
  peek: false,
  screen: 'home',
};

const app = document.getElementById('app');
const t = () => UI[state.lang];
const tx = (loc, lang = state.lang) => (loc && (loc[lang] || loc.es)) || '';
const play = (name) => { if (state.sound) sounds[name](); };

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c);
  return node;
}

function visual(media, cls, alt) {
  if (media && media.image && media.image.src) {
    return el('img', { class: cls + ' pic', src: media.image.src, alt: tx(media.image.alt) || alt || '', loading: 'lazy' });
  }
  return el('span', { class: cls, 'aria-hidden': 'true' }, (media && media.emoji) || '❓');
}

// ---- top bar ----
function renderChrome() {
  document.documentElement.lang = state.lang;
  document.title = t().title;
  const home = document.getElementById('homeBtn');
  home.hidden = state.screen === 'home';
  home.replaceChildren('🏠 ', el('span', { class: 'lbl' }, t().home));
  home.setAttribute('aria-label', t().home);
  const snd = document.getElementById('soundBtn');
  snd.replaceChildren(state.sound ? '🔊 ' : '🔇 ', el('span', { class: 'lbl' }, t().sound));
  snd.setAttribute('aria-label', t().sound);
  snd.setAttribute('aria-pressed', String(state.sound));
  for (const b of document.querySelectorAll('#langGroup button')) b.classList.toggle('on', b.dataset.lang === state.lang);
}

document.getElementById('langGroup').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-lang]');
  if (!b) return;
  state.lang = b.dataset.lang;
  store.set('lang', state.lang);
  play('tap');
  render();
});
document.getElementById('soundBtn').addEventListener('click', () => {
  state.sound = !state.sound;
  store.set('sound', state.sound);
  render();
});
document.getElementById('homeBtn').addEventListener('click', () => { state.screen = 'home'; render(); });

// ---- screens ----
function homeScreen() {
  const band = bandById(state.band);
  const counts = Object.fromEntries(['all', ...CATEGORIES].map((c) => [c, eligibleQuestions(state.questions, { band, category: c }).length]));
  return el('section', { class: 'screen home' },
    el('div', { class: 'mascot', 'aria-hidden': 'true' }, '🦉'),
    el('h1', { class: 'title' }, t().title),
    el('p', { class: 'subtitle' }, t().subtitle),
    el('h2', {}, t().chooseAge),
    el('div', { class: 'ages' },
      AGE_BANDS.map((b) => el('button', {
        class: 'age' + (b.id === state.band ? ' on' : ''),
        'aria-pressed': String(b.id === state.band),
        onclick: () => { state.band = b.id; store.set('band', b.id); play('tap'); render(); },
      }, el('b', {}, b.id.replace('-', '–')), el('small', {}, t().years))),
    ),
    el('h2', {}, t().chooseTopic),
    el('div', { class: 'topics' },
      ['all', ...CATEGORIES].map((c) => el('button', {
        class: 'topic' + (c === state.category ? ' on' : ''),
        style: `--tone:${CATEGORY_LOOK[c].color}`,
        'aria-pressed': String(c === state.category),
        disabled: counts[c] === 0,
        onclick: () => { state.category = c; play('tap'); render(); },
      }, el('span', { class: 'topic-emoji', 'aria-hidden': 'true' }, CATEGORY_LOOK[c].emoji), el('span', {}, t().categories[c]))),
    ),
    el('button', { class: 'big-btn start', onclick: startRound, disabled: counts[state.category] === 0 }, '🚀 ' + t().start),
    counts[state.category] === 0 ? el('p', { class: 'note' }, t().notEnough) : null,
  );
}

function startRound() {
  const band = bandById(state.band);
  state.round = buildRound(state.questions, { band, category: state.category });
  if (!state.round.length) return;
  state.index = 0;
  state.score = 0;
  state.choice = null;
  state.celebrated = false;
  state.screen = 'question';
  play('tap');
  render();
}

function questionScreen() {
  const q = state.round[state.index];
  const total = state.round.length;
  const other = otherLang(state.lang);
  const look = CATEGORY_LOOK[q.category];

  const answers = el('div', { class: 'answers' + (q.answers.length === 2 ? ' two' : '') },
    q.answers.map((a, i) => el('button', {
      class: 'answer' + (state.choice && a.id === q.correctAnswerId ? ' right' : '') + (state.choice === a.id && a.id !== q.correctAnswerId ? ' wrong' : ''),
      style: `--tone:${ANSWER_COLORS[i % ANSWER_COLORS.length]}`,
      'data-id': a.id,
      disabled: Boolean(state.choice),
      onclick: () => choose(a.id),
    },
    a.emoji || (a.image && a.image.src) ? visual(a, 'answer-emoji', tx(a.text)) : null,
    el('span', { class: 'answer-text' }, tx(a.text)),
    state.peek ? el('small', { class: 'answer-peek', lang: other }, tx(a.text, other)) : null,
    )),
  );

  return el('section', { class: 'screen quiz', style: `--tone:${look.color}` },
    el('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': state.index + 1 },
      el('div', { class: 'progress-label' }, `${look.emoji} ${t().categories[q.category]} · ${t().question} ${state.index + 1} ${t().of} ${total}`),
      el('div', { class: 'dots' }, state.round.map((_, i) => el('i', { class: i < state.index ? 'done' : i === state.index ? 'now' : '' }))),
    ),
    el('div', { class: 'card' },
      visual(q.media, 'q-emoji'),
      el('h2', { class: 'q-text' }, tx(q.text)),
      state.peek ? el('p', { class: 'q-peek', lang: other }, tx(q.text, other)) : null,
      el('div', { class: 'tools' },
        el('button', { class: 'pill', onclick: () => speak(tx(q.text) + ' ' + q.answers.map((a) => tx(a.text)).join(', '), SPEECH_LANG[state.lang]) }, '🔈 ' + t().listen),
        el('button', { class: 'pill', 'aria-pressed': String(state.peek), onclick: () => { state.peek = !state.peek; render(); } }, (state.lang === 'es' ? '🇬🇧 ' : '💬 ') + (state.peek ? t().hidePeek : t().peek)),
      ),
    ),
    answers,
    state.choice ? feedback(q) : null,
  );
}

function choose(id) {
  if (state.choice) return;
  const q = state.round[state.index];
  state.choice = id;
  const ok = id === q.correctAnswerId;
  if (ok) state.score++;
  state.cheer = Math.floor(Math.random() * 100);
  play(ok ? 'correct' : 'wrong');
  if (ok) confetti(50);
  render();
  const fb = app.querySelector('.feedback');
  fb.querySelector('.next').focus({ preventScroll: true });
  fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function feedback(q) {
  const ok = state.choice === q.correctAnswerId;
  const right = q.answers.find((a) => a.id === q.correctAnswerId);
  const vocabLang = otherLang(state.lang);
  const last = state.index === state.round.length - 1;
  return el('div', { class: 'feedback ' + (ok ? 'ok' : 'ko') },
    el('div', { class: 'fb-head' }, (ok ? '🎉 ' : '💪 ') + (ok ? t().correct : t().wrong)[state.cheer % (ok ? t().correct : t().wrong).length]),
    ok ? null : el('p', {}, t().rightAnswerWas + ' ', el('b', {}, tx(right.text))),
    q.funFact ? el('p', { class: 'fact' }, el('b', {}, '💡 ' + t().funFact + ' '), tx(q.funFact)) : null,
    q.vocabulary && q.vocabulary.length ? el('div', { class: 'vocab' },
      el('span', { class: 'vocab-title' }, '🔤 ' + t().englishWords + ':'),
      q.vocabulary.map((v) => el('span', { class: 'chip' }, tx(v), ' → ', el('b', { lang: vocabLang }, tx(v, vocabLang)))),
    ) : null,
    el('button', { class: 'big-btn next', onclick: next }, last ? '🏁 ' + t().finish : t().next + ' ➜'),
  );
}

function next() {
  play('tap');
  if (state.index < state.round.length - 1) {
    state.index++;
    state.choice = null;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    state.screen = 'result';
    render();
  }
}

function resultScreen() {
  const total = state.round.length;
  const stars = starsFor(state.score, total);
  if (!state.celebrated) {
    state.celebrated = true;
    setTimeout(() => { if (stars >= 2) { confetti(120); play('fanfare'); } }, 150);
  }
  return el('section', { class: 'screen result' },
    el('div', { class: 'mascot', 'aria-hidden': 'true' }, stars === 3 ? '🏆' : stars === 2 ? '🥳' : '🦉'),
    el('h1', { class: 'title' }, t().resultTitle),
    el('div', { class: 'stars', 'aria-label': `${stars}/3` }, [0, 1, 2].map((i) => el('span', { class: i < stars ? 'lit' : '', style: `animation-delay:${i * 0.2}s` }, '⭐'))),
    el('p', { class: 'score' }, t().resultScore(state.score, total)),
    el('p', { class: 'subtitle' }, t().resultMsg[stars]),
    el('div', { class: 'row' },
      el('button', { class: 'big-btn start', onclick: startRound }, '🔁 ' + t().playAgain),
      el('button', { class: 'big-btn ghost', onclick: () => { state.screen = 'home'; render(); } }, '🏠 ' + t().home),
    ),
  );
}

function render() {
  renderChrome();
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  const screen = state.screen === 'question' ? questionScreen() : state.screen === 'result' ? resultScreen() : homeScreen();
  app.replaceChildren(screen);
}

async function init() {
  renderChrome();
  try {
    const res = await fetch('data/questions.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    state.questions = data.questions;
  } catch (err) {
    console.error(err);
    app.replaceChildren(el('p', { class: 'note' }, t().loadError));
    return;
  }
  render();
}

init();
