import { GAS_WEB_APP_URL, FRONTEND_VERSION } from "./config.js";

const state = {
  app: {
    allow_manual_name: true,
    timezone: "America/Sao_Paulo"
  },
  students: [],
  selectedStudent: null,
  typedName: "",
  currentChallenge: null,
  startedAt: Date.now()
};

const studentInput = document.querySelector("#student-input");
const suggestionsEl = document.querySelector("#student-suggestions");
const studentStatus = document.querySelector("#student-status");
const challengeEl = document.querySelector("#challenge");
const responseForm = document.querySelector("#response-form");
const submitButton = document.querySelector("#submit-button");
const feedbackEl = document.querySelector("#feedback");
const formMessageEl = document.querySelector("#form-message");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getApiUrl(action) {
  const url = new URL(GAS_WEB_APP_URL);
  url.searchParams.set("action", action);
  return url.toString();
}

function isApiConfigured() {
  return GAS_WEB_APP_URL && !GAS_WEB_APP_URL.includes("PASTE_DEPLOYED_GAS_WEB_APP_URL_HERE");
}

async function apiGetBootstrap() {
  if (!isApiConfigured()) {
    throw new Error("Configure a URL do backend em config.js.");
  }

  const response = await fetch(getApiUrl("getBootstrap"));

  if (!response.ok) {
    throw new Error("Não foi possível carregar os dados iniciais.");
  }

  const data = await response.json();

  if (data.success === false) {
    throw new Error(data.error || "O backend retornou erro ao carregar os dados iniciais.");
  }

  return data;
}

async function apiSubmitResponse(payload) {
  const response = await fetch(getApiUrl("submitResponse"), {
    method: "POST",
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("Não foi possível enviar a resposta.");
  }

  const data = await response.json();

  if (data.success === false) {
    throw new Error(data.error || "O backend retornou erro ao salvar a resposta.");
  }

  return data;
}

function renderBlock(block) {
  if (block.type === "markdown") {
    return `<p class="text-block">${escapeHtml(block.content)}</p>`;
  }

  if (block.type === "question") {
    return `
      <div class="question-block">
        <span class="question-label">Pergunta-Desafio</span>
        <p>${escapeHtml(block.content)}</p>
      </div>
    `;
  }

  if (block.type === "code") {
    return `
      <figure class="code-block">
        <figcaption>${escapeHtml(block.language)}</figcaption>
        <pre><code>${escapeHtml(block.content)}</code></pre>
      </figure>
    `;
  }

  if (block.type === "callout") {
    return `
      <aside class="callout callout-${escapeHtml(block.style)}">
        ${escapeHtml(block.content)}
      </aside>
    `;
  }

  if (block.type === "image") {
    return `
      <figure class="image-block">
        <img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt)}">
        ${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ""}
      </figure>
    `;
  }

  return `<p class="error">Tipo de bloco não suportado: ${escapeHtml(block.type)}</p>`;
}

function renderChallenge() {
  if (!state.currentChallenge?.challenge) {
    challengeEl.innerHTML = `<p class="error">Nenhum desafio disponível no momento.</p>`;
    responseForm.innerHTML = "";
    submitButton.disabled = true;
    return;
  }

  const challenge = state.currentChallenge.challenge;
  submitButton.disabled = false;

  challengeEl.innerHTML = `
    <div class="challenge-header">
      <p class="daily-label">Desafio do dia</p>
      <h2>${escapeHtml(challenge.title)}</h2>
      <div class="tags">
        ${(challenge.topics ?? []).map(topic => `<span>${escapeHtml(topic)}</span>`).join("")}
        <span>${escapeHtml(challenge.difficulty)}</span>
      </div>
    </div>

    <div class="challenge-body">
      ${(challenge.intro ?? []).map(renderBlock).join("")}
      ${(challenge.prompt ?? []).map(renderBlock).join("")}
    </div>
  `;
}

function renderResponseField(field) {
  if (field.type === "single_choice") {
    return `
      <fieldset class="field-group">
        <legend>${escapeHtml(field.label)}</legend>
        <div class="choice-grid">
          ${field.options.map(option => `
            <label class="choice-card">
              <input type="radio" name="${escapeHtml(field.id)}" value="${escapeHtml(option.id)}">
              <span class="choice-option-letter">${escapeHtml(option.id).toUpperCase()})</span>
              <span class="choice-option-text">${escapeHtml(option.label)}</span>
            </label>
          `).join("")}
        </div>
      </fieldset>
    `;
  }

  if (field.type === "open_text") {
    return `
      <label class="field-group">
        <span>${escapeHtml(field.label)}</span>
        <textarea
          name="${escapeHtml(field.id)}"
          rows="5"
          placeholder="${escapeHtml(field.placeholder ?? "")}"
        ></textarea>
      </label>
    `;
  }

  if (field.type === "code") {
    return `
      <label class="field-group">
        <span>${escapeHtml(field.label)}</span>
        <textarea
          class="code-response"
          name="${escapeHtml(field.id)}"
          rows="5"
          placeholder="${escapeHtml(field.placeholder ?? "")}"
        ></textarea>
      </label>
    `;
  }

  return `<p class="error">Campo de resposta não suportado: ${escapeHtml(field.type)}</p>`;
}

function renderResponseForm() {
  const response = state.currentChallenge?.challenge?.response;

  if (!response) {
    responseForm.innerHTML = `<p class="error">Este desafio não tem um modelo de resposta.</p>`;
    return;
  }

  if (response.type === "mixed") {
    responseForm.innerHTML = response.fields.map(renderResponseField).join("");
    return;
  }

  if (response.type === "open_text" || response.type === "code") {
    responseForm.innerHTML = renderResponseField({
      id: "answer",
      label: response.label ?? "Sua resposta",
      ...response
    });
    return;
  }

  responseForm.innerHTML = `<p class="error">Tipo de resposta não suportado: ${escapeHtml(response.type)}</p>`;
}

function resetFeedback() {
  feedbackEl.classList.add("hidden");
  feedbackEl.innerHTML = "";
}

function resetResponseState() {
  responseForm.reset();
  resetFeedback();
  clearFormMessage();
  state.startedAt = Date.now();
}

function showFormMessage(message, type = "error") {
  formMessageEl.className = `form-message form-message-${type}`;
  formMessageEl.textContent = message;
}

function clearFormMessage() {
  formMessageEl.classList.add("hidden");
  formMessageEl.textContent = "";
}

function updateSuggestions() {
  const query = studentInput.value.trim().toLowerCase();
  state.typedName = studentInput.value;
  state.selectedStudent = null;

  if (!query) {
    suggestionsEl.innerHTML = "";
    studentStatus.textContent = "";
    return;
  }

  const matches = state.students.filter(student =>
    student.display_name.toLowerCase().includes(query)
  );

  suggestionsEl.innerHTML = matches.map(student => `
    <li>
      <button type="button" data-student-id="${escapeHtml(student.student_id)}">
        ${escapeHtml(student.display_name)}
      </button>
    </li>
  `).join("");

  if (matches.length === 0 && state.app.allow_manual_name) {
    studentStatus.textContent = "Este nome não está na lista, mas a digitação manual é permitida.";
  } else if (matches.length === 0) {
    studentStatus.textContent = "Escolha um nome da lista.";
  } else {
    studentStatus.textContent = "";
  }
}

function collectResponse() {
  const formData = new FormData(responseForm);
  const response = {};
  const responseModel = state.currentChallenge.challenge.response;

  if (responseModel.type === "mixed") {
    for (const field of responseModel.fields) {
      response[field.id] = String(formData.get(field.id) ?? "").trim();
    }
    return response;
  }

  response.answer = String(formData.get("answer") ?? "").trim();
  return response;
}

function validateResponse(response) {
  const responseModel = state.currentChallenge.challenge.response;

  if (responseModel.type === "mixed") {
    for (const field of responseModel.fields) {
      const value = String(response[field.id] ?? "").trim();

      if (field.required && !value) {
        return `Preencha o campo: ${field.label}`;
      }

      if (field.min_length && value.length < field.min_length) {
        return `Escreva uma resposta mais longa para: ${field.label}`;
      }
    }
    return null;
  }

  const value = String(response.answer ?? "").trim();

  if (responseModel.required && !value) {
    return "Escreva sua resposta.";
  }

  if (responseModel.min_length && value.length < responseModel.min_length) {
    return "Escreva uma resposta um pouco mais longa.";
  }

  return null;
}

function getSingleChoiceResult(response) {
  const responseModel = state.currentChallenge.challenge.response;

  if (responseModel.type !== "mixed") {
    return null;
  }

  const singleChoiceField = responseModel.fields.find(
    field => field.type === "single_choice"
  );

  if (!singleChoiceField?.correct_option_id) {
    return null;
  }

  const selectedOptionId = response[singleChoiceField.id];
  const selectedOption = singleChoiceField.options.find(
    option => option.id === selectedOptionId
  );

  return {
    field_id: singleChoiceField.id,
    selected_option_id: selectedOptionId,
    selected_option_label: selectedOption?.label ?? "",
    correct_option_id: singleChoiceField.correct_option_id,
    is_correct: selectedOptionId === singleChoiceField.correct_option_id
  };
}

function renderAnswerStatus(result) {
  if (!result) return "";

  return `
    <div class="answer-status ${result.is_correct ? "answer-correct" : "answer-incorrect"}">
      <p class="answer-status-label">
        ${result.is_correct ? "Resposta correta" : "Resposta incorreta"}
      </p>
      <p>
        Você escolheu a opção:
        <strong>${escapeHtml(result.selected_option_id).toUpperCase()}) ${escapeHtml(result.selected_option_label)}</strong>
      </p>
    </div>
  `;
}

function buildSubmissionPayload(response) {
  const typedName = studentInput.value.trim();
  const challenge = state.currentChallenge.challenge;

  return {
    challenge_id: challenge.challenge_id,
    challenge_version: challenge.version,
    challenge_key: state.currentChallenge.id,
    student_id: state.selectedStudent?.student_id ?? "",
    student_display_name: state.selectedStudent?.display_name ?? typedName,
    student_source: state.selectedStudent ? "listed" : "manual",
    response_json: response,
    elapsed_seconds: Math.round((Date.now() - state.startedAt) / 1000),
    frontend_version: FRONTEND_VERSION,
    submitted_at: new Date().toISOString(),
    user_agent: navigator.userAgent
  };
}

function renderFeedback(singleChoiceResult) {
  const feedback = state.currentChallenge.feedback ?? {};

  feedbackEl.classList.remove("hidden");
  feedbackEl.innerHTML = `
    <h2>Feedback</h2>

    ${renderAnswerStatus(singleChoiceResult)}

    ${(feedback.messages ?? []).map(message => `
      <p>${escapeHtml(message)}</p>
    `).join("")}

    <div class="after-submission">
      ${(feedback.after_submission ?? []).map(renderBlock).join("")}
    </div>

    <div class="next-challenge-message">
      <h3>Por hoje é só...</h3>
      <p>Amanhã tem outro desafio!</p>
    </div>
  `;

  feedbackEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function handleSubmit() {
  const typedName = studentInput.value.trim();

  if (!state.selectedStudent && !typedName) {
    showFormMessage("Escolha ou digite seu nome.");
    return;
  }

  if (!state.selectedStudent && !state.app.allow_manual_name) {
    showFormMessage("Escolha um nome da lista.");
    return;
  }

  const response = collectResponse();
  const validationMessage = validateResponse(response);

  if (validationMessage) {
    showFormMessage(validationMessage);
    return;
  }

  clearFormMessage();

  const singleChoiceResult = getSingleChoiceResult(response);
  const payload = buildSubmissionPayload(response);

  submitButton.disabled = true;
  submitButton.textContent = "Enviando...";

  try {
    await apiSubmitResponse(payload);
    renderFeedback(singleChoiceResult);
    showFormMessage("Resposta enviada com sucesso.", "success");
  } catch (error) {
    console.error(error);
    showFormMessage(error.message || "Não foi possível enviar a resposta.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Enviar";
  }
}

async function initApp() {
  submitButton.disabled = true;
  challengeEl.innerHTML = `<p class="hint">Carregando desafio...</p>`;

  try {
    const bootstrap = await apiGetBootstrap();

    state.app = bootstrap.app ?? state.app;
    state.students = bootstrap.students ?? [];
    state.currentChallenge = bootstrap.current_challenge ?? null;

    renderChallenge();
    renderResponseForm();
    resetResponseState();
  } catch (error) {
    console.error(error);
    challengeEl.innerHTML = `
      <p class="error">${escapeHtml(error.message || "Não foi possível carregar o desafio.")}</p>
    `;
    responseForm.innerHTML = "";
    submitButton.disabled = true;
  }
}

suggestionsEl.addEventListener("click", event => {
  const button = event.target.closest("button[data-student-id]");
  if (!button) return;

  const student = state.students.find(
    item => item.student_id === button.dataset.studentId
  );

  if (!student) return;

  state.selectedStudent = student;
  state.typedName = student.display_name;
  studentInput.value = student.display_name;
  suggestionsEl.innerHTML = "";
  studentStatus.textContent = `Selecionado: ${student.display_name}`;
});

studentInput.addEventListener("input", () => {
  clearFormMessage();
  updateSuggestions();
});

responseForm.addEventListener("input", clearFormMessage);
submitButton.addEventListener("click", handleSubmit);

initApp();
