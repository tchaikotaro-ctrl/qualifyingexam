const els = {
  metaInfo: document.querySelector('#meta-info'),
  attempted: document.querySelector('#attempted-count'),
  correct: document.querySelector('#correct-count'),
  accuracy: document.querySelector('#accuracy'),
  card: document.querySelector('#question-card'),
  qid: document.querySelector('#question-id'),
  qtext: document.querySelector('#question-text'),
  bookletFigure: document.querySelector('#booklet-figure'),
  bookletImages: document.querySelector('#booklet-images'),
  bookletCaption: document.querySelector('#booklet-caption'),
  form: document.querySelector('#answer-form'),
  judge: document.querySelector('#judge-btn'),
  next: document.querySelector('#next-btn'),
  result: document.querySelector('#result')
};

const state = {
  questions: [],
  current: null,
  attempted: 0,
  correct: 0,
  answeredCurrent: false
};

function sampleQuestion() {
  const index = Math.floor(Math.random() * state.questions.length);
  return state.questions[index];
}

function renderQuestion(question) {
  state.current = question;
  state.answeredCurrent = false;

  els.qid.textContent = `${question.examLabel} / ${question.id}`;
  els.qtext.textContent = question.prompt;

  const imagePaths = Array.isArray(question.bookletImagePaths)
    ? question.bookletImagePaths
    : question.bookletImagePath
      ? [question.bookletImagePath]
      : [];

  if (imagePaths.length > 0) {
    els.bookletImages.innerHTML = '';
    for (const p of imagePaths) {
      const img = document.createElement('img');
      img.src = `./${p}`;
      img.alt = '別冊画像';
      img.loading = 'lazy';
      els.bookletImages.appendChild(img);
    }
    els.bookletCaption.textContent = question.bookletNo
      ? `別冊 No.${question.bookletNo}${imagePaths.length > 1 ? `（${imagePaths.length}枚）` : ''}`
      : `別冊画像${imagePaths.length > 1 ? `（${imagePaths.length}枚）` : ''}`;
    els.bookletFigure.hidden = false;
  } else {
    els.bookletImages.innerHTML = '';
    els.bookletCaption.textContent = '';
    els.bookletFigure.hidden = true;
  }

  els.form.innerHTML = '';
  for (const key of question.optionOrder) {
    const option = question.options[key];
    const label = document.createElement('label');
    label.className = 'option';
    label.innerHTML = `
      <input type="checkbox" name="answer" value="${key}" />
      <span><strong>${key}.</strong>${option}</span>
    `;
    els.form.appendChild(label);
  }

  els.result.textContent = '';
  els.result.className = 'result';
}

function updateScore() {
  const accuracy = state.attempted === 0 ? 0 : Math.round((state.correct / state.attempted) * 100);
  els.attempted.textContent = String(state.attempted);
  els.correct.textContent = String(state.correct);
  els.accuracy.textContent = `${accuracy}%`;
}

function getSelectedAnswer() {
  const selected = [...document.querySelectorAll('input[name="answer"]:checked')]
    .map((input) => input.value)
    .sort()
    .join('');

  return selected;
}

function judgeAnswer() {
  if (!state.current || state.answeredCurrent) return;

  const selected = getSelectedAnswer();
  if (!selected) {
    els.result.textContent = '選択肢を1つ以上選んでください。';
    els.result.className = 'result bad';
    return;
  }

  state.answeredCurrent = true;
  state.attempted += 1;

  if (selected === state.current.answer) {
    state.correct += 1;
    els.result.textContent = `正解です（正答: ${state.current.answer}）`;
    els.result.className = 'result good';
  } else {
    els.result.textContent = `不正解です（あなたの解答: ${selected} / 正答: ${state.current.answer}）`;
    els.result.className = 'result bad';
  }

  updateScore();
}

async function init() {
  const response = await fetch('./data/generated/questions.json');
  if (!response.ok) {
    throw new Error('問題データの読み込みに失敗しました。');
  }

  const payload = await response.json();
  state.questions = payload.questions;

  els.metaInfo.textContent = `${payload.totalQuestions}問をロードしました。ランダム出題で解いてください。`;
  updateScore();
  renderQuestion(sampleQuestion());
  els.card.hidden = false;
}

els.judge.addEventListener('click', judgeAnswer);
els.next.addEventListener('click', () => renderQuestion(sampleQuestion()));

init().catch((error) => {
  console.error(error);
  els.metaInfo.textContent = '問題データの読み込みに失敗しました。';
});
