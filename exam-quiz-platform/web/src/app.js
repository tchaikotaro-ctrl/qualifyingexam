const els = {
  title: document.querySelector('#title'),
  meta: document.querySelector('#meta'),
  attempted: document.querySelector('#attempted'),
  correct: document.querySelector('#correct'),
  accuracy: document.querySelector('#accuracy'),
  card: document.querySelector('#card'),
  qid: document.querySelector('#qid'),
  prompt: document.querySelector('#prompt'),
  figure: document.querySelector('#figure'),
  images: document.querySelector('#images'),
  caption: document.querySelector('#caption'),
  options: document.querySelector('#options'),
  judge: document.querySelector('#judge'),
  next: document.querySelector('#next'),
  result: document.querySelector('#result')
};

const state = {
  questions: [],
  current: null,
  attempted: 0,
  correct: 0,
  answered: false
};

function pickRandom() {
  return state.questions[Math.floor(Math.random() * state.questions.length)];
}

function updateStats() {
  const acc = state.attempted === 0 ? 0 : Math.round((state.correct / state.attempted) * 100);
  els.attempted.textContent = String(state.attempted);
  els.correct.textContent = String(state.correct);
  els.accuracy.textContent = `${acc}%`;
}

function renderQuestion(question) {
  state.current = question;
  state.answered = false;

  els.qid.textContent = `${question.sourceExam} / ${question.id}`;
  els.prompt.textContent = question.prompt;

  const imagePaths = Array.isArray(question.imagePaths)
    ? question.imagePaths
    : question.imagePath
      ? [question.imagePath]
      : [];

  if (imagePaths.length > 0) {
    els.images.innerHTML = '';
    for (const imagePath of imagePaths) {
      const img = document.createElement('img');
      img.src = `./${imagePath}`;
      img.alt = '問題画像';
      img.loading = 'lazy';
      els.images.appendChild(img);
    }
    const base = question.bookletNo ? `別冊 No.${question.bookletNo}` : '関連画像';
    els.caption.textContent = imagePaths.length > 1 ? `${base}（${imagePaths.length}枚）` : base;
    els.figure.hidden = false;
  } else {
    els.images.innerHTML = '';
    els.caption.textContent = '';
    els.figure.hidden = true;
  }

  els.options.innerHTML = '';
  for (const key of ['A', 'B', 'C', 'D', 'E']) {
    const label = document.createElement('label');
    label.className = 'option';
    label.innerHTML = `<input type="checkbox" value="${key}" name="ans"/><span><strong>${key}.</strong>${question.options[key]}</span>`;
    els.options.appendChild(label);
  }

  els.result.className = 'result';
  els.result.textContent = '';
}

function selectedAnswer() {
  return [...document.querySelectorAll('input[name="ans"]:checked')]
    .map((n) => n.value)
    .sort()
    .join('');
}

function judge() {
  if (!state.current || state.answered) return;
  const selected = selectedAnswer();
  if (!selected) {
    els.result.className = 'result ng';
    els.result.textContent = '選択肢を選んでください。';
    return;
  }

  state.answered = true;
  state.attempted += 1;
  if (selected === state.current.answer) {
    state.correct += 1;
    els.result.className = 'result ok';
    els.result.textContent = `正解（正答: ${state.current.answer}）`;
  } else {
    els.result.className = 'result ng';
    els.result.textContent = `不正解（あなた: ${selected} / 正答: ${state.current.answer}）`;
  }
  updateStats();
}

async function main() {
  const res = await fetch('./output/questions.json');
  if (!res.ok) throw new Error('questions.json の読み込みに失敗しました');
  const data = await res.json();

  state.questions = data.questions;
  els.meta.textContent = `${data.totalQuestions}問（画像付き ${data.questionsWithImage}問）`;
  updateStats();
  renderQuestion(pickRandom());
  els.card.hidden = false;
}

els.judge.addEventListener('click', judge);
els.next.addEventListener('click', () => renderQuestion(pickRandom()));

main().catch((err) => {
  console.error(err);
  els.meta.textContent = '問題データを読み込めませんでした。';
});
