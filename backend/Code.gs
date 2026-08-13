const APP_VERSION = '1.1.0';

const SHEET_NAMES = {
  CONFIG: 'Config',
  STUDENTS: 'Students',
  CHALLENGES: 'Challenges',
  RESPONSES: 'Responses',
};

const CHALLENGE_HEADERS = [
  'challenge_key',
  'date',
  'active',
  'label',
  'title',
  'challenge_json',
];

const RESPONSE_HEADERS = [
  'timestamp',
  'submitted_at',
  'challenge_id',
  'challenge_version',
  'challenge_key',
  'student_id',
  'student_display_name',
  'student_source',
  'response_json',
  'feedback_json',
  'is_correct',
  'elapsed_seconds',
  'frontend_version',
  'user_agent',
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Challenge of the Day')
    .addItem('Open challenge editor', 'openChallengeEditor')
    .addItem('Validate challenges', 'validateChallengesFromMenu')
    .addToUi();
}

function doGet(e) {
  return handleRequest_(e, false);
}

function doPost(e) {
  return handleRequest_(e, true);
}

function handleRequest_(e, isPost) {
  try {
    const body = isPost ? parseJsonStrict_(e && e.postData && e.postData.contents) : null;
    const action = getAction_(e, body);

    if (!action) {
      return jsonResponse_({ success: false, error: 'Missing action parameter.' });
    }

    if (isPost) {
      if (action === 'submitResponse') {
        const payload = body && body.payload ? body.payload : body;
        return jsonResponse_(submitResponse_(payload));
      }

      return jsonResponse_({ success: false, error: `Unsupported POST action: ${action}` });
    }

    switch (action) {
      case 'getBootstrap':
      case 'bootstrap':
        return jsonResponse_(getBootstrap_());
      case 'getConfig':
        return jsonResponse_({ success: true, app: getConfig_() });
      case 'getStudents':
        return jsonResponse_({ success: true, students: getStudents_() });
      case 'getActiveChallenge':
        return jsonResponse_({ success: true, current_challenge: getActiveChallenge_() });
      default:
        return jsonResponse_({ success: false, error: `Unsupported GET action: ${action}` });
    }
  } catch (error) {
    return jsonResponse_({
      success: false,
      error: String(error && error.message ? error.message : error),
    });
  }
}

function getAction_(e, body) {
  if (e && e.parameter && e.parameter.action) {
    return String(e.parameter.action).trim();
  }

  if (body && body.action) {
    return String(body.action).trim();
  }

  return '';
}

function getBootstrap_() {
  const activeResult = getActiveChallengeResult_();

  return {
    success: true,
    app: getConfig_(),
    students: getStudents_(),
    current_challenge: activeResult.challenge,
    current_challenge_key: activeResult.challenge ? activeResult.challenge.id : '',
    message: activeResult.message || '',
  };
}

function getConfig_() {
  const config = Object.assign({
    course_name: 'Desafio do Dia',
    timezone: 'America/Sao_Paulo',
    allow_manual_name: true,
    frontend_version: APP_VERSION,
    challenge_selection_mode: 'date',
    allow_undated_challenge_fallback: false,
  }, readConfigSheet_());

  config.allow_manual_name = isTruthy_(config.allow_manual_name);
  config.allow_undated_challenge_fallback = isTruthy_(config.allow_undated_challenge_fallback);

  return config;
}

function getStudents_() {
  const sheet = getSheetByName_(SHEET_NAMES.STUDENTS);
  if (!sheet) return [];

  return getSheetData_(sheet)
    .filter(row => row.student_id && row.display_name)
    .filter(row => isTruthy_(row.active))
    .map(row => ({
      student_id: String(row.student_id),
      display_name: String(row.display_name),
      active: true,
    }));
}

function getActiveChallenge_() {
  return getActiveChallengeResult_().challenge;
}

function getActiveChallengeResult_() {
  const sheet = getSheetByName_(SHEET_NAMES.CHALLENGES);
  if (!sheet) {
    return { challenge: null, message: 'Challenges sheet not found.' };
  }

  const rows = getSheetData_(sheet);
  const config = getConfig_();
  const timezone = config.timezone || 'America/Sao_Paulo';
  const selectionMode = String(config.challenge_selection_mode || 'date').trim();
  const allowUndatedFallback = isTruthy_(config.allow_undated_challenge_fallback);
  const today = Utilities.formatDate(new Date(), timezone, 'yyyy-MM-dd');
  const activeRows = rows.filter(row => isTruthy_(row.active));

  if (activeRows.length === 0) {
    return { challenge: null, message: 'No active challenge configured.' };
  }

  let match = null;
  let message = '';

  if (selectionMode === 'first_active') {
    match = activeRows[0];
  } else {
    match = activeRows.find(row => normalizeDate_(row.date, timezone) === today) || null;

    if (!match && allowUndatedFallback) {
      match = activeRows.find(row => !normalizeDate_(row.date, timezone)) || null;
      if (match) {
        message = 'No challenge matched today; using an undated active challenge as fallback.';
      }
    }

    if (!match) {
      return {
        challenge: null,
        message: `No active challenge found for today (${today}).`,
      };
    }
  }

  const challenge = parseJson_(match.challenge_json);

  if (!challenge || typeof challenge !== 'object') {
    return { challenge: null, message: 'Challenge JSON is malformed.' };
  }

  return { challenge, message };
}

function submitResponse_(payload) {
  validateSubmissionPayload_(payload);

  const evaluation = evaluateSubmission_(payload);
  const spreadsheet = getSpreadsheet_();
  const sheet = getRequiredSheet_(SHEET_NAMES.RESPONSES);
  assertExactHeaders_(sheet, RESPONSE_HEADERS);

  const row = [
    new Date(),
    payload.submitted_at || '',
    payload.challenge_id,
    payload.challenge_version,
    payload.challenge_key,
    payload.student_id || '',
    payload.student_display_name,
    payload.student_source,
    JSON.stringify(payload.response_json || {}),
    JSON.stringify(evaluation.feedback_json || {}),
    evaluation.is_correct === null ? '' : evaluation.is_correct,
    Number(payload.elapsed_seconds) || 0,
    payload.frontend_version || APP_VERSION,
    payload.user_agent || '',
  ];

  sheet.appendRow(row);

  return {
    success: true,
    submission_id: sheet.getLastRow() - 1,
    is_correct: evaluation.is_correct,
  };
}

function validateSubmissionPayload_(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload must be a JSON object.');
  }

  const required = [
    'challenge_id',
    'challenge_version',
    'challenge_key',
    'student_display_name',
    'student_source',
    'response_json',
    'frontend_version',
  ];

  required.forEach(key => {
    if (payload[key] === undefined || payload[key] === null || payload[key] === '') {
      throw new Error(`Missing required field: ${key}`);
    }
  });

  if (payload.student_source === 'listed' && !payload.student_id) {
    throw new Error('student_id is required for listed students.');
  }

  if (!['listed', 'manual'].includes(payload.student_source)) {
    throw new Error('student_source must be either "listed" or "manual".');
  }

  if (typeof payload.response_json !== 'object' || Array.isArray(payload.response_json)) {
    throw new Error('response_json must be a JSON object.');
  }
}

function evaluateSubmission_(payload) {
  const challengeEntry = findChallengeEntry_(
    payload.challenge_key,
    payload.challenge_id,
    payload.challenge_version
  );

  if (!challengeEntry) {
    return { is_correct: null, feedback_json: {} };
  }

  const responseModel = challengeEntry.challenge && challengeEntry.challenge.response;
  let singleChoiceResult = null;

  if (responseModel && responseModel.type === 'mixed' && Array.isArray(responseModel.fields)) {
    const field = responseModel.fields.find(item =>
      item.type === 'single_choice' && item.correct_option_id
    );

    if (field) {
      const selectedOptionId = String(payload.response_json[field.id] || '');
      const selectedOption = Array.isArray(field.options)
        ? field.options.find(option => String(option.id) === selectedOptionId)
        : null;

      singleChoiceResult = {
        field_id: field.id,
        selected_option_id: selectedOptionId,
        selected_option_label: selectedOption ? String(selectedOption.label || '') : '',
        correct_option_id: String(field.correct_option_id),
        is_correct: selectedOptionId === String(field.correct_option_id),
      };
    }
  }

  return {
    is_correct: singleChoiceResult ? singleChoiceResult.is_correct : null,
    feedback_json: {
      single_choice_result: singleChoiceResult,
      messages: Array.isArray(challengeEntry.feedback && challengeEntry.feedback.messages)
        ? challengeEntry.feedback.messages
        : [],
    },
  };
}

function findChallengeEntry_(entryId, challengeId, challengeVersion) {
  const sheet = getSheetByName_(SHEET_NAMES.CHALLENGES);
  if (!sheet) return null;

  const rows = getSheetData_(sheet);

  for (const row of rows) {
    const entry = parseJson_(row.challenge_json);
    if (!entry || !entry.challenge) continue;

    const entryIdMatches = String(entry.id || '') === String(entryId || '');
    const challengeIdMatches = String(entry.challenge.challenge_id || '') === String(challengeId || '');
    const versionMatches = String(entry.challenge.version || '') === String(challengeVersion || '');

    if (entryIdMatches && challengeIdMatches && versionMatches) {
      return entry;
    }
  }

  return null;
}

function openChallengeEditor() {
  const html = HtmlService
    .createHtmlOutputFromFile('ChallengeEditor')
    .setWidth(1000)
    .setHeight(720);

  SpreadsheetApp.getUi().showModalDialog(html, 'Challenge editor');
}

function getChallengeEditorData() {
  const sheet = getSheetByName_(SHEET_NAMES.CHALLENGES);
  if (!sheet) {
    return { rows: [], template_json: JSON.stringify(createChallengeTemplate_(), null, 2) };
  }

  const rows = getSheetData_(sheet).map((row, index) => ({
    row_number: index + 2,
    challenge_key: String(row.challenge_key || ''),
    date: normalizeDate_(row.date, getConfig_().timezone),
    active: isTruthy_(row.active),
    label: String(row.label || ''),
    title: String(row.title || ''),
    challenge_json: typeof row.challenge_json === 'string'
      ? row.challenge_json
      : JSON.stringify(row.challenge_json || {}, null, 2),
  }));

  return {
    rows,
    template_json: JSON.stringify(createChallengeTemplate_(), null, 2),
  };
}

function validateChallengeJson(jsonText) {
  try {
    const entry = parseJsonStrict_(jsonText);
    const summary = validateChallengeEntry_(entry);
    return { success: true, summary };
  } catch (error) {
    return { success: false, error: String(error.message || error) };
  }
}

function saveChallengeFromEditor(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Editor payload is required.');
  }

  const entry = parseJsonStrict_(payload.challenge_json);
  const summary = validateChallengeEntry_(entry);
  const sheet = getRequiredSheet_(SHEET_NAMES.CHALLENGES);
  assertExactHeaders_(sheet, CHALLENGE_HEADERS);

  const rowNumber = Number(payload.row_number) || sheet.getLastRow() + 1;
  sheet.getRange(rowNumber, 1, 1, CHALLENGE_HEADERS.length).setValues([[
    summary.challenge_key,
    String(payload.date || '').trim(),
    Boolean(payload.active),
    summary.label,
    summary.title,
    JSON.stringify(entry),
  ]]);

  return {
    success: true,
    row_number: rowNumber,
    summary,
  };
}

function validateChallengesFromMenu() {
  const result = validateAllChallenges_();
  const ui = SpreadsheetApp.getUi();

  if (result.errors.length === 0) {
    ui.alert('Challenge validation', `${result.valid_count} challenge(s) are valid.`, ui.ButtonSet.OK);
    return;
  }

  ui.alert(
    'Challenge validation',
    `${result.valid_count} valid challenge(s).\n\n${result.errors.join('\n')}`,
    ui.ButtonSet.OK
  );
}

function validateAllChallenges_() {
  const sheet = getSheetByName_(SHEET_NAMES.CHALLENGES);
  if (!sheet) return { valid_count: 0, errors: ['Challenges sheet not found.'] };

  const rows = getSheetData_(sheet);
  const errors = [];
  let validCount = 0;

  rows.forEach((row, index) => {
    if (!row.challenge_json) return;

    try {
      const entry = parseJsonStrict_(row.challenge_json);
      validateChallengeEntry_(entry);
      validCount += 1;
    } catch (error) {
      errors.push(`Row ${index + 2}: ${String(error.message || error)}`);
    }
  });

  return { valid_count: validCount, errors };
}

function validateChallengeEntry_(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error('Challenge JSON must be an object.');
  }

  if (!entry.id) throw new Error('Missing top-level id.');
  if (!entry.challenge || typeof entry.challenge !== 'object') throw new Error('Missing challenge object.');
  if (!entry.challenge.challenge_id) throw new Error('Missing challenge.challenge_id.');
  if (entry.challenge.version === undefined || entry.challenge.version === null || entry.challenge.version === '') {
    throw new Error('Missing challenge.version.');
  }
  if (!entry.challenge.title) throw new Error('Missing challenge.title.');
  if (!entry.challenge.response || typeof entry.challenge.response !== 'object') {
    throw new Error('Missing challenge.response.');
  }

  validateResponseModel_(entry.challenge.response);

  return {
    challenge_key: String(entry.id),
    challenge_id: String(entry.challenge.challenge_id),
    version: entry.challenge.version,
    label: String(entry.label || entry.challenge.title),
    title: String(entry.challenge.title),
  };
}

function validateResponseModel_(response) {
  const supportedTypes = ['mixed', 'open_text', 'code'];
  if (!supportedTypes.includes(response.type)) {
    throw new Error(`Unsupported response type: ${response.type}`);
  }

  if (response.type !== 'mixed') return;
  if (!Array.isArray(response.fields) || response.fields.length === 0) {
    throw new Error('A mixed response must contain fields.');
  }

  const ids = new Set();

  response.fields.forEach(field => {
    if (!field.id) throw new Error('Every response field must have an id.');
    if (ids.has(field.id)) throw new Error(`Duplicate response field id: ${field.id}`);
    ids.add(field.id);

    if (!['single_choice', 'open_text', 'code'].includes(field.type)) {
      throw new Error(`Unsupported response field type: ${field.type}`);
    }

    if (field.type === 'single_choice') {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        throw new Error(`Single-choice field ${field.id} must contain options.`);
      }

      const optionIds = field.options.map(option => String(option.id));
      if (field.correct_option_id && !optionIds.includes(String(field.correct_option_id))) {
        throw new Error(`Field ${field.id} has a correct_option_id that does not match any option.`);
      }
    }
  });
}

function createChallengeTemplate_() {
  return {
    id: 'example-challenge',
    label: 'Example challenge',
    challenge: {
      challenge_id: 'example-001',
      version: 1,
      title: 'Example challenge',
      topics: ['example'],
      difficulty: 'introductory',
      intro: [
        { type: 'markdown', content: 'Introduce the concept here.' },
      ],
      prompt: [
        { type: 'question', content: 'Write the challenge question here.' },
      ],
      response: {
        type: 'mixed',
        fields: [
          {
            id: 'choice',
            type: 'single_choice',
            label: 'Choose the best answer',
            required: true,
            correct_option_id: 'a',
            options: [
              { id: 'a', label: 'Option A' },
              { id: 'b', label: 'Option B' },
            ],
          },
          {
            id: 'explanation',
            type: 'open_text',
            label: 'Explain your reasoning',
            required: true,
            min_length: 20,
            placeholder: 'Explain how you reached your answer...',
          },
        ],
      },
    },
    feedback: {
      messages: ['Add feedback shown after submission.'],
      after_submission: [],
    },
  };
}

function readConfigSheet_() {
  const sheet = getSheetByName_(SHEET_NAMES.CONFIG);
  if (!sheet) return {};

  const config = {};
  getSheetData_(sheet).forEach(row => {
    if (row.key) config[String(row.key).trim()] = row.value;
  });
  return config;
}

function isTruthy_(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return /^(true|1|yes|y|sim)$/i.test(String(value).trim());
}

function normalizeDate_(value, timezone) {
  if (!value) return '';

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, timezone, 'yyyy-MM-dd');
  }

  const text = String(value).trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const brazilianDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brazilianDate) {
    const day = brazilianDate[1].padStart(2, '0');
    const month = brazilianDate[2].padStart(2, '0');
    return `${brazilianDate[3]}-${month}-${day}`;
  }

  return text;
}

function getSheetByName_(name) {
  return getSpreadsheet_().getSheetByName(name);
}

function getSpreadsheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');

  if (spreadsheetId) return SpreadsheetApp.openById(spreadsheetId);

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  throw new Error('Unable to open the spreadsheet. Set SPREADSHEET_ID or bind the script to a spreadsheet.');
}

function getRequiredSheet_(name) {
  const sheet = getSheetByName_(name);
  if (!sheet) {
    throw new Error(`Required sheet not found: ${name}. Use the provided spreadsheet template.`);
  }
  return sheet;
}

function assertExactHeaders_(sheet, expectedHeaders, allowExtraColumns) {
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    throw new Error(`${sheet.getName()} does not contain the expected header row.`);
  }

  const width = Math.max(sheet.getLastColumn(), expectedHeaders.length);
  const current = sheet.getRange(1, 1, 1, width).getValues()[0]
    .map(value => String(value || '').trim());

  expectedHeaders.forEach((header, index) => {
    if (current[index] !== header) {
      const found = current[index] || '(empty)';
      throw new Error(`Unexpected header in ${sheet.getName()} column ${index + 1}: expected "${header}", found "${found}".`);
    }
  });

  if (!allowExtraColumns && current.slice(expectedHeaders.length).some(Boolean)) {
    throw new Error(`${sheet.getName()} contains unexpected columns after ${expectedHeaders.length}.`);
  }
}

function getSheetData_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(header => String(header || '').trim());

  return values.slice(1).map(row => {
    const record = {};
    row.forEach((value, index) => {
      if (headers[index]) record[headers[index]] = value;
    });
    return record;
  });
}

function parseJson_(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(String(value));
  } catch (error) {
    return null;
  }
}

function parseJsonStrict_(value) {
  if (!value) throw new Error('JSON content is empty.');
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(String(value));
  } catch (error) {
    throw new Error(`Invalid JSON: ${error.message}`);
  }
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
