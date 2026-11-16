/**
 * ================================================================
 *  WEB APP LUYỆN TIẾNG ANH — PHẦN MÁY CHỦ (Google Apps Script)
 *  Dữ liệu lưu trong Google Sheet gồm 4 trang tính:
 *    Users      – tài khoản học sinh & giáo viên
 *    Exercises  – thông tin bài tập (cấp độ, kỹ năng, bài đọc, audio)
 *    Questions  – câu hỏi của từng bài
 *    Results    – kết quả làm bài
 * ================================================================
 */

// ===================== 1. CẤU HÌNH (bạn sửa ở đây) =====================
const APP_NAME = 'Practice Makes Perfect';
const SCHOOL_NAME = 'Ba Chuc High School';

// Tài khoản giáo viên đầu tiên — ĐỔI MẬT KHẨU trước khi chạy setup()
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'doimatkhau123';
const ADMIN_FULLNAME = 'Giáo viên quản trị';

// Đăng nhập được giữ trong bao nhiêu giờ (tối đa 6)
const SESSION_HOURS = 6;

// Các cấp độ và cấp nhỏ bên trong — thêm/bớt tuỳ ý
const LEVELS = [
  { id: 'THCS',  name: 'THCS',          subs: ['Lớp 6', 'Lớp 7', 'Lớp 8', 'Lớp 9'] },
  { id: 'THPT',  name: 'THPT',          subs: ['Lớp 10', 'Lớp 11', 'Lớp 12'] },
  { id: 'HSG',   name: 'Học sinh giỏi', subs: ['Cấp trường', 'Cấp tỉnh', 'Cấp quốc gia'] },
  { id: 'IELTS', name: 'IELTS',         subs: ['Band 4.0–5.0', 'Band 5.5–6.5', 'Band 7.0+'] }
];

// Các kỹ năng
const SKILLS = ['Ngữ pháp', 'Từ vựng', 'Đọc hiểu', 'Nghe', 'Viết', 'Tổng hợp'];


// ===================== 2. CẤU TRÚC CÁC TRANG TÍNH =====================
const SCHEMA = {
  Users:     ['id', 'username', 'passHash', 'salt', 'fullName', 'className', 'level', 'role', 'status', 'createdAt'],
  Exercises: ['id', 'title', 'level', 'subLevel', 'skill', 'passage', 'audioUrl', 'status', 'createdBy', 'createdAt', 'updatedAt'],
  Questions: ['exerciseId', 'order', 'type', 'question', 'A', 'B', 'C', 'D', 'answer', 'explanation', 'points'],
  Results:   ['id', 'userId', 'username', 'fullName', 'className', 'exerciseId', 'title', 'level', 'subLevel',
              'autoScore', 'autoTotal', 'essayScore', 'essayTotal', 'percent', 'needsReview',
              'teacherComment', 'reviewedBy', 'answersJson', 'submittedAt'],
  WordSets:   ['id', 'title', 'level', 'subLevel', 'status', 'createdBy', 'createdAt', 'updatedAt'],
  Words:      ['setId', 'order', 'kind', 'text', 'meaning', 'example', 'image'],
  GameScores: ['id', 'userId', 'username', 'fullName', 'className', 'setId', 'setTitle', 'level', 'game',
               'score', 'correct', 'total', 'seconds', 'playedAt'],
  Classes:     ['id', 'name', 'level', 'createdBy', 'createdAt'],
  Assignments: ['id', 'classId', 'className', 'kind', 'refId', 'refTitle', 'level', 'game', 'dueAt', 'note', 'createdBy', 'createdAt'],
  Exams:       ['id', 'title', 'grade', 'examType', 'duration', 'answerMode', 'released', 'status', 'questionCount', 'createdBy', 'createdAt', 'updatedAt'],
  ExamParts:   ['examId', 'order', 'json'],
  ExamResults: ['id', 'userId', 'username', 'fullName', 'className', 'examId', 'title', 'grade', 'examType',
                'score', 'correct', 'total', 'partsJson', 'answersJson', 'seconds', 'submittedAt']
};

// Luyện đề: các khối và loại đề
const EXAM_GRADES = ['6', '7', '8', '9', '10', '11', '12'];
const EXAM_TYPES = { UNIT: 'Kiểm tra theo Unit', GK1: 'Giữa kì 1', CK1: 'Cuối kì 1', GK2: 'Giữa kì 2', CK2: 'Cuối kì 2', TN: 'Luyện thi tốt nghiệp' };

// Các trò chơi ôn tập
const GAMES = { flashcard: 'Flashcard', match: 'Ghép từ – nghĩa', scramble: 'Sắp xếp câu', speed: 'Đua tốc độ', picture: 'Nhìn tranh đoán từ' };


// ===================== 3. MỞ TRANG WEB =====================
function doGet() {
  const t = HtmlService.createTemplateFromFile('Index');
  t.appName = APP_NAME;
  t.schoolName = SCHOOL_NAME;
  // Hình nền trường: nằm trong file Banner.html (không có file thì dùng nền màu)
  try { t.bannerUrl = HtmlService.createHtmlOutputFromFile('Banner').getContent().trim(); }
  catch (e) { t.bannerUrl = ''; }
  t.levelsJson = JSON.stringify(LEVELS);
  t.skillsJson = JSON.stringify(SKILLS);
  t.examJson = JSON.stringify({ grades: EXAM_GRADES, types: EXAM_TYPES });
  return t.evaluate()
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}


/**
 * Cổng API cho giao diện đặt trên GitHub Pages (hoặc trang web khác).
 * Trang web gửi POST (Content-Type: text/plain) với nội dung JSON: { fn: 'api', args: [action, payload, token] }
 */
function doPost(e) {
  let out;
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.fn !== 'api') throw new Error('Yêu cầu không hợp lệ.');
    const a = body.args || [];
    out = api(a[0], a[1], a[2]);
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** Cấu hình công khai cho giao diện (tên app, cấp độ, kỹ năng, loại đề) */
function publicConfig_() {
  return { appName: APP_NAME, schoolName: SCHOOL_NAME, levels: LEVELS, skills: SKILLS,
           exam: { grades: EXAM_GRADES, types: EXAM_TYPES } };
}


// ===================== 4. CÀI ĐẶT LẦN ĐẦU =====================
/** Chạy hàm này MỘT LẦN trong trình soạn Apps Script (nút ▶ Chạy). */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Hãy mở Apps Script từ trong Google Sheet: Tiện ích mở rộng → Apps Script.');
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());

  Object.keys(SCHEMA).forEach(function (name) {
    const s = sh_(name);
    // Định dạng văn bản thuần để Sheet không tự đổi "1/2" thành ngày, "007" thành 7...
    s.getRange(1, 1, s.getMaxRows(), SCHEMA[name].length).setNumberFormat('@');
  });

  const users = rows_('Users');
  if (!users.some(function (u) { return u.username === ADMIN_USERNAME; })) {
    const salt = Utilities.getUuid();
    append_('Users', {
      id: newId_('U'), username: ADMIN_USERNAME, passHash: hash_(ADMIN_PASSWORD, salt), salt: salt,
      fullName: ADMIN_FULLNAME, className: '', level: '', role: 'teacher', status: 'approved', createdAt: now_()
    });
  }

  if (rows_('Exercises').length === 0) seedSamples_();
  if (rows_('WordSets').length === 0) seedWordSet_();

  // Xoá trang tính trống mặc định nếu có
  ['Sheet1', 'Trang tính1'].forEach(function (n) {
    const s = ss.getSheetByName(n);
    if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
  });

  Logger.log('✅ Cài đặt xong! Đăng nhập bằng tài khoản: ' + ADMIN_USERNAME);
}


/** Quên mật khẩu admin / đổi ADMIN_PASSWORD sau khi đã chạy setup: chạy hàm này. */
function resetAdminPassword() {
  const u = rows_('Users').find(function (x) { return x.username === ADMIN_USERNAME; });
  if (!u) { setup(); return; }
  const salt = Utilities.getUuid();
  update_('Users', u._row, { passHash: hash_(ADMIN_PASSWORD, salt), salt: salt, role: 'teacher', status: 'approved' });
  Logger.log('✅ Đã đặt lại mật khẩu cho tài khoản ' + ADMIN_USERNAME);
}


// ===================== 5. CỔNG GỌI CHUNG TỪ TRANG WEB =====================
/** Trang web gọi: google.script.run.api('tên chức năng', dữ liệu, token) */
function api(action, payload, token) {
  try {
    const fn = ACTIONS[action];
    if (!fn) throw new Error('Không có chức năng: ' + action);
    return { ok: true, data: fn(payload || {}, token) };
  } catch (e) {
    const msg = String((e && e.message) || e);
    return { ok: false, error: msg === 'AUTH' ? 'AUTH' : msg };
  }
}

const ACTIONS = {
  // ---- Tài khoản ----
  config: publicConfig_,
  publicInfo: publicInfo_,
  register: register_,
  login: login_,
  me: function (p, token) { return publicUser_(currentUser_(token)); },
  logout: function (p, token) { if (token) CacheService.getScriptCache().remove('sess_' + token); return true; },
  changePassword: changePassword_,

  // ---- Học sinh luyện tập ----
  catalog: catalog_,
  getExercise: getExercise_,
  submit: submit_,
  myResults: myResults_,
  resultDetail: resultDetail_,

  // ---- Giáo viên quản trị ----
  overview: overview_,
  listUsers: listUsers_,
  setUserStatus: setUserStatus_,
  approveAll: approveAll_,
  setRole: setRole_,
  resetPassword: resetPassword_,
  listResults: listResults_,
  gradeResult: gradeResult_,
  listExercises: listExercises_,
  exerciseFull: exerciseFull_,
  saveExercise: saveExercise_,
  toggleExercise: toggleExercise_,
  deleteExercise: deleteExercise_,

  // ---- Trò chơi ôn tập ----
  wordSets: wordSets_,
  wordSet: wordSet_,
  saveScore: saveScore_,
  leaderboard: leaderboard_,
  listWordSets: listWordSets_,
  saveWordSet: saveWordSet_,
  importWordSets: importWordSets_,
  toggleWordSet: toggleWordSet_,
  deleteWordSet: deleteWordSet_,
  recentPlays: recentPlays_,

  // ---- Lớp học & giao bài ----
  listClasses: listClasses_,
  saveClass: saveClass_,
  deleteClass: deleteClass_,
  setClass: setClass_,
  assign: assign_,
  listAssignments: listAssignments_,
  assignmentDetail: assignmentDetail_,
  deleteAssignment: deleteAssignment_,

  // ---- Luyện đề ----
  examsList: examsList_,
  examGet: examGet_,
  examSubmit: examSubmit_,
  examMyResults: examMyResults_,
  examResultDetail: examResultDetail_,
  examsAdmin: examsAdmin_,
  examFull: examFull_,
  examSave: examSave_,
  examToggle: examToggle_,
  examRelease: examRelease_,
  examDelete: examDelete_,
  examResults: examResultsAdmin_
};


// ===================== 6. TÀI KHOẢN =====================
function register_(p) {
  const username = String(p.username || '').trim().toLowerCase();
  const password = String(p.password || '');
  const fullName = clean_(p.fullName, 80);
  const className = clean_(p.className, 30);
  const level = String(p.level || '');

  if (!/^[a-z0-9_.]{3,30}$/.test(username))
    throw new Error('Tên đăng nhập dài 3–30 ký tự, chỉ gồm chữ không dấu, số, dấu _ hoặc dấu chấm.');
  if (password.length < 6) throw new Error('Mật khẩu cần ít nhất 6 ký tự.');
  if (!fullName) throw new Error('Vui lòng nhập họ và tên.');
  if (!LEVELS.some(function (l) { return l.id === level; })) throw new Error('Vui lòng chọn cấp độ.');
  const classes = rows_('Classes');
  if (classes.length && !classes.some(function (c) { return c.name === className; })) throw new Error('Vui lòng chọn lớp của bạn.');

  return withLock_(function () {
    if (rows_('Users').some(function (u) { return u.username === username; }))
      throw new Error('Tên đăng nhập này đã có người dùng, hãy chọn tên khác.');
    const salt = Utilities.getUuid();
    append_('Users', {
      id: newId_('U'), username: username, passHash: hash_(password, salt), salt: salt,
      fullName: fullName, className: className, level: level, role: 'student', status: 'pending', createdAt: now_()
    });
    return { message: 'Đăng ký thành công! Vui lòng chờ giáo viên duyệt tài khoản.' };
  });
}

function login_(p) {
  const username = String(p.username || '').trim().toLowerCase();
  const u = rows_('Users').find(function (x) { return x.username === username; });
  if (!u || hash_(String(p.password || ''), u.salt) !== u.passHash)
    throw new Error('Sai tên đăng nhập hoặc mật khẩu.');
  if (u.status === 'pending') throw new Error('Tài khoản đang chờ giáo viên duyệt. Bạn quay lại sau nhé!');
  if (u.status === 'rejected') throw new Error('Tài khoản đã bị từ chối. Hãy liên hệ giáo viên.');
  if (u.status === 'locked') throw new Error('Tài khoản đang bị khoá. Hãy liên hệ giáo viên.');
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('sess_' + token, String(u.id), Math.min(SESSION_HOURS, 6) * 3600);
  return { token: token, user: publicUser_(u) };
}

function changePassword_(p, token) {
  const u = currentUser_(token);
  if (hash_(String(p.oldPassword || ''), u.salt) !== u.passHash) throw new Error('Mật khẩu cũ không đúng.');
  if (String(p.newPassword || '').length < 6) throw new Error('Mật khẩu mới cần ít nhất 6 ký tự.');
  const salt = Utilities.getUuid();
  update_('Users', u._row, { passHash: hash_(p.newPassword, salt), salt: salt });
  return true;
}


// ===================== 7. HỌC SINH LUYỆN TẬP =====================
function catalog_(p, token) {
  const u = currentUser_(token);
  const count = {};
  rows_('Questions').forEach(function (q) { count[q.exerciseId] = (count[q.exerciseId] || 0) + 1; });
  const best = {}, tries = {};
  rows_('Results').forEach(function (r) {
    if (r.userId !== u.id) return;
    tries[r.exerciseId] = (tries[r.exerciseId] || 0) + 1;
    if (r.percent === '') return;
    const pc = num_(r.percent);
    if (!(r.exerciseId in best) || pc > best[r.exerciseId]) best[r.exerciseId] = pc;
  });
  const exercises = rows_('Exercises')
    .filter(function (e) { return e.status === 'open'; })
    .map(function (e) {
      return {
        id: e.id, title: e.title, level: e.level, subLevel: e.subLevel, skill: e.skill,
        questionCount: count[e.id] || 0, hasAudio: !!e.audioUrl, hasPassage: !!e.passage,
        best: (e.id in best) ? best[e.id] : null, tries: tries[e.id] || 0
      };
    });
  return { exercises: exercises, assignments: myAssignments_(u) };
}

function getExercise_(p, token) {
  const u = currentUser_(token);
  const e = findExercise_(p.id);
  if (e.status !== 'open' && u.role !== 'teacher') throw new Error('Bài tập này đang đóng.');
  const questions = questionsOf_(e.id).map(function (q) {
    return { order: q.order, type: q.type, question: q.question, options: q.type === 'mcq' ? optionsOf_(q) : null, points: num_(q.points) || 1 };
  });
  return {
    id: e.id, title: e.title, level: e.level, subLevel: e.subLevel, skill: e.skill,
    passage: e.passage, audioUrl: audioSrc_(e.audioUrl), audioOriginal: e.audioUrl, questions: questions
  };
}

function submit_(p, token) {
  const u = currentUser_(token);
  const e = findExercise_(p.id);
  if (e.status !== 'open' && u.role !== 'teacher') throw new Error('Bài tập này đang đóng.');
  const qs = questionsOf_(e.id);
  if (!qs.length) throw new Error('Bài tập chưa có câu hỏi.');
  const answers = p.answers || {};

  let autoScore = 0, autoTotal = 0, essayTotal = 0;
  const detail = qs.map(function (q) {
    const key = String(q.order);
    const given = String(answers[key] == null ? '' : answers[key]).slice(0, 8000);
    const pts = num_(q.points) || 1;
    const item = {
      order: key, type: q.type, question: q.question, options: q.type === 'mcq' ? optionsOf_(q) : null,
      given: given, points: pts, explanation: q.explanation || '', answerText: answerText_(q), correct: null
    };
    if (q.type === 'essay') { essayTotal += pts; return item; }
    autoTotal += pts;
    item.correct = q.type === 'mcq'
      ? given.trim().toUpperCase() === String(q.answer).trim().toUpperCase()
      : fillMatch_(given, q.answer);
    if (item.correct) autoScore += pts;
    return item;
  });

  const needsReview = essayTotal > 0;
  const percent = needsReview
    ? (autoTotal > 0 ? Math.round(autoScore / autoTotal * 100) : '')
    : Math.round(autoScore / autoTotal * 100);

  const row = {
    id: newId_('R'), userId: u.id, username: u.username, fullName: u.fullName, className: u.className,
    exerciseId: e.id, title: e.title, level: e.level, subLevel: e.subLevel,
    autoScore: autoScore, autoTotal: autoTotal, essayScore: '', essayTotal: essayTotal,
    percent: percent, needsReview: needsReview ? 'TRUE' : 'FALSE',
    teacherComment: '', reviewedBy: '', answersJson: JSON.stringify(detail), submittedAt: now_()
  };
  withLock_(function () { append_('Results', row); });
  const out = buildResult_(row);
  out.passage = e.passage;
  return out;
}

function myResults_(p, token) {
  const u = currentUser_(token);
  return rows_('Results')
    .filter(function (r) { return r.userId === u.id; })
    .map(resultSummary_)
    .sort(byDateDesc_);
}

function resultDetail_(p, token) {
  const u = currentUser_(token);
  const r = rows_('Results').find(function (x) { return x.id === p.id; });
  if (!r) throw new Error('Không tìm thấy kết quả.');
  if (u.role !== 'teacher' && r.userId !== u.id) throw new Error('Bạn không có quyền xem kết quả này.');
  const out = buildResult_(r);
  const e = rows_('Exercises').find(function (x) { return x.id === r.exerciseId; });
  out.passage = e ? e.passage : '';
  return out;
}


// ===================== 8. GIÁO VIÊN QUẢN TRỊ =====================
function overview_(p, token) {
  requireTeacher_(token);
  const users = rows_('Users'), res = rows_('Results'), ex = rows_('Exercises');
  const weekAgo = Date.now() - 7 * 864e5;
  const graded = res.filter(function (r) { return r.percent !== ''; });
  const avg = graded.length ? Math.round(graded.reduce(function (s, r) { return s + num_(r.percent); }, 0) / graded.length) : 0;
  const byLevel = LEVELS.map(function (l) {
    const lx = ex.filter(function (e) { return e.level === l.id; });
    const lr = res.filter(function (r) { return r.level === l.id; });
    const lg = lr.filter(function (r) { return r.percent !== ''; });
    return {
      id: l.id, name: l.name, exercises: lx.length,
      open: lx.filter(function (e) { return e.status === 'open'; }).length,
      students: users.filter(function (u) { return u.role === 'student' && u.status === 'approved' && u.level === l.id; }).length,
      attempts: lr.length,
      avg: lg.length ? Math.round(lg.reduce(function (s, r) { return s + num_(r.percent); }, 0) / lg.length) : null
    };
  });
  return {
    pending: users.filter(function (u) { return u.status === 'pending'; }).length,
    students: users.filter(function (u) { return u.role === 'student' && u.status === 'approved'; }).length,
    week: res.filter(function (r) { return new Date(r.submittedAt).getTime() >= weekAgo; }).length,
    total: res.length,
    avg: avg,
    review: res.filter(function (r) { return isTrue_(r.needsReview); }).length,
    exercisesOpen: ex.filter(function (e) { return e.status === 'open'; }).length,
    exercisesTotal: ex.length,
    byLevel: byLevel,
    sheetUrl: db_().getUrl()
  };
}

function listUsers_(p, token) {
  requireTeacher_(token);
  const attempts = {};
  rows_('Results').forEach(function (r) { attempts[r.userId] = (attempts[r.userId] || 0) + 1; });
  return rows_('Users').map(function (u) {
    const o = publicUser_(u); o.attempts = attempts[u.id] || 0; return o;
  }).sort(byDateDesc_);
}

function setUserStatus_(p, token) {
  const me = requireTeacher_(token);
  if (['approved', 'rejected', 'locked', 'pending'].indexOf(p.status) < 0) throw new Error('Trạng thái không hợp lệ.');
  const u = findUser_(p.userId);
  if (u.id === me.id) throw new Error('Bạn không thể đổi trạng thái tài khoản của chính mình.');
  update_('Users', u._row, { status: p.status });
  return true;
}

function approveAll_(p, token) {
  requireTeacher_(token);
  let n = 0;
  rows_('Users').forEach(function (u) {
    if (u.status === 'pending') { update_('Users', u._row, { status: 'approved' }); n++; }
  });
  return n;
}

function setRole_(p, token) {
  const me = requireTeacher_(token);
  if (['student', 'teacher'].indexOf(p.role) < 0) throw new Error('Vai trò không hợp lệ.');
  const u = findUser_(p.userId);
  if (u.id === me.id) throw new Error('Bạn không thể đổi vai trò của chính mình.');
  update_('Users', u._row, { role: p.role, status: 'approved' });
  return true;
}

function resetPassword_(p, token) {
  requireTeacher_(token);
  if (String(p.newPassword || '').length < 6) throw new Error('Mật khẩu mới cần ít nhất 6 ký tự.');
  const u = findUser_(p.userId);
  const salt = Utilities.getUuid();
  update_('Users', u._row, { passHash: hash_(p.newPassword, salt), salt: salt });
  return true;
}

function listResults_(p, token) {
  requireTeacher_(token);
  return rows_('Results').map(resultSummary_).sort(byDateDesc_).slice(0, 1000);
}

function gradeResult_(p, token) {
  const me = requireTeacher_(token);
  const r = rows_('Results').find(function (x) { return x.id === p.id; });
  if (!r) throw new Error('Không tìm thấy kết quả.');
  const essayTotal = num_(r.essayTotal);
  const essayScore = Number(p.essayScore);
  if (essayTotal > 0 && (isNaN(essayScore) || essayScore < 0 || essayScore > essayTotal))
    throw new Error('Điểm phần tự luận phải từ 0 đến ' + essayTotal + '.');
  const total = num_(r.autoTotal) + essayTotal;
  const got = num_(r.autoScore) + (essayTotal > 0 ? essayScore : 0);
  update_('Results', r._row, {
    essayScore: essayTotal > 0 ? essayScore : '',
    percent: total ? Math.round(got / total * 100) : 0,
    needsReview: 'FALSE',
    teacherComment: clean_(p.comment, 3000),
    reviewedBy: me.fullName
  });
  return true;
}

function listExercises_(p, token) {
  requireTeacher_(token);
  const count = {}, attempts = {};
  rows_('Questions').forEach(function (q) { count[q.exerciseId] = (count[q.exerciseId] || 0) + 1; });
  rows_('Results').forEach(function (r) { attempts[r.exerciseId] = (attempts[r.exerciseId] || 0) + 1; });
  return rows_('Exercises').map(function (e) {
    return {
      id: e.id, title: e.title, level: e.level, subLevel: e.subLevel, skill: e.skill, status: e.status,
      createdBy: e.createdBy, updatedAt: e.updatedAt || e.createdAt,
      questionCount: count[e.id] || 0, attempts: attempts[e.id] || 0, hasAudio: !!e.audioUrl, hasPassage: !!e.passage
    };
  });
}

function exerciseFull_(p, token) {
  requireTeacher_(token);
  const e = findExercise_(p.id);
  return {
    exercise: { id: e.id, title: e.title, level: e.level, subLevel: e.subLevel, skill: e.skill, passage: e.passage, audioUrl: e.audioUrl, status: e.status },
    questions: questionsOf_(e.id).map(function (q) {
      return { type: q.type, question: q.question, A: q.A, B: q.B, C: q.C, D: q.D, answer: q.answer, explanation: q.explanation, points: num_(q.points) || 1 };
    })
  };
}

function saveExercise_(p, token) {
  const me = requireTeacher_(token);
  const x = p.exercise || {};
  const title = clean_(x.title, 200);
  if (!title) throw new Error('Bài tập cần có tên.');
  const lv = LEVELS.find(function (l) { return l.id === x.level; });
  if (!lv) throw new Error('Hãy chọn cấp độ.');
  if (lv.subs.indexOf(x.subLevel) < 0) throw new Error('Hãy chọn lớp/cấp nhỏ trong ' + lv.name + '.');
  const skill = SKILLS.indexOf(x.skill) >= 0 ? x.skill : 'Tổng hợp';

  const qs = (p.questions || []).map(function (q, i) {
    const type = ['mcq', 'fill', 'essay'].indexOf(q.type) >= 0 ? q.type : 'mcq';
    const n = i + 1;
    const out = {
      type: type, question: clean_(q.question, 3000), A: '', B: '', C: '', D: '',
      answer: '', explanation: clean_(q.explanation, 2000), points: Math.max(0.25, Number(q.points) || 1)
    };
    if (!out.question) throw new Error('Câu ' + n + ' chưa có nội dung.');
    if (type === 'mcq') {
      ['A', 'B', 'C', 'D'].forEach(function (k) { out[k] = clean_(q[k], 500); });
      out.answer = String(q.answer || '').trim().toUpperCase();
      if (!out.A || !out.B) throw new Error('Câu ' + n + ' cần ít nhất 2 lựa chọn A và B.');
      if (['A', 'B', 'C', 'D'].indexOf(out.answer) < 0 || !out[out.answer]) throw new Error('Câu ' + n + ' chưa chọn đáp án đúng.');
    } else if (type === 'fill') {
      out.answer = clean_(q.answer, 500);
      if (!out.answer) throw new Error('Câu ' + n + ' chưa có đáp án (nhiều đáp án ngăn bằng dấu | ).');
    }
    return out;
  });
  if (!qs.length) throw new Error('Bài tập cần ít nhất 1 câu hỏi.');

  return withLock_(function () {
    let id = x.id;
    const data = {
      title: title, level: lv.id, subLevel: x.subLevel, skill: skill,
      passage: clean_(x.passage, 40000), audioUrl: clean_(x.audioUrl, 500),
      status: x.status === 'closed' ? 'closed' : 'open', updatedAt: now_()
    };
    const old = id ? rows_('Exercises').find(function (e) { return e.id === id; }) : null;
    if (old) {
      update_('Exercises', old._row, data);
    } else {
      id = newId_('EX');
      data.id = id; data.createdBy = me.fullName; data.createdAt = now_();
      append_('Exercises', data);
    }
    replaceQuestions_(id, qs);
    return { id: id };
  });
}

function toggleExercise_(p, token) {
  requireTeacher_(token);
  const e = findExercise_(p.id);
  const status = e.status === 'open' ? 'closed' : 'open';
  update_('Exercises', e._row, { status: status });
  return status;
}

function deleteExercise_(p, token) {
  requireTeacher_(token);
  return withLock_(function () {
    const e = findExercise_(p.id);
    sh_('Exercises').deleteRow(e._row);
    replaceQuestions_(e.id, []);
    return true;
  });
}


// ===================== 8b. TRÒ CHƠI ÔN TẬP =====================
function itemsOf_(setId) {
  const words = [], sentences = [];
  rows_('Words')
    .filter(function (w) { return w.setId === setId; })
    .sort(function (a, b) { return num_(a.order) - num_(b.order); })
    .forEach(function (w) {
      if (w.kind === 'sentence') sentences.push({ text: w.text, meaning: w.meaning });
      else words.push({ word: w.text, meaning: w.meaning, example: w.example, image: w.image || '' });
    });
  return { words: words, sentences: sentences };
}

function findSet_(id) {
  const s = rows_('WordSets').find(function (x) { return x.id === id; });
  if (!s) throw new Error('Không tìm thấy bộ từ.');
  return s;
}

/** Học sinh: danh sách bộ từ đang mở + điểm cao nhất của mình */
function wordSets_(p, token) {
  const u = currentUser_(token);
  const cnt = {};
  rows_('Words').forEach(function (w) {
    const c = cnt[w.setId] || (cnt[w.setId] = { words: 0, sentences: 0, pictures: 0 });
    if (w.kind === 'sentence') c.sentences++; else { c.words++; if (w.image) c.pictures++; }
  });
  const best = {};
  rows_('GameScores').forEach(function (g) {
    if (g.userId !== u.id) return;
    const b = best[g.setId] || (best[g.setId] = {});
    if (!(g.game in b) || num_(g.score) > b[g.game]) b[g.game] = num_(g.score);
  });
  return rows_('WordSets')
    .filter(function (s) { return s.status === 'open'; })
    .map(function (s) {
      const c = cnt[s.id] || { words: 0, sentences: 0, pictures: 0 };
      return { id: s.id, title: s.title, level: s.level, subLevel: s.subLevel, words: c.words, sentences: c.sentences, pictures: c.pictures, best: best[s.id] || {} };
    });
}

function wordSet_(p, token) {
  const u = currentUser_(token);
  const s = findSet_(p.id);
  if (s.status !== 'open' && u.role !== 'teacher') throw new Error('Bộ từ này đang đóng.');
  const it = itemsOf_(s.id);
  return { id: s.id, title: s.title, level: s.level, subLevel: s.subLevel, status: s.status, words: it.words, sentences: it.sentences };
}

function clampInt_(v, lo, hi) { v = Math.round(Number(v) || 0); return Math.max(lo, Math.min(hi, v)); }

function saveScore_(p, token) {
  const u = currentUser_(token);
  if (!GAMES[p.game]) throw new Error('Trò chơi không hợp lệ.');
  const s = findSet_(p.setId);
  const total = clampInt_(p.total, 0, 500);
  withLock_(function () {
    append_('GameScores', {
      id: newId_('G'), userId: u.id, username: u.username, fullName: u.fullName, className: u.className,
      setId: s.id, setTitle: s.title, level: s.level, game: p.game,
      score: clampInt_(p.score, 0, total * ({ flashcard: 1, match: 100, scramble: 100, speed: 150, picture: 150 })[p.game]), correct: clampInt_(p.correct, 0, total), total: total,
      seconds: clampInt_(p.seconds, 0, 36000), playedAt: now_()
    });
  });
  return leaderboard_({ setId: s.id, game: p.game }, token);
}

/** Bảng xếp hạng: điểm cao nhất của mỗi học sinh (bằng điểm thì ai nhanh hơn xếp trên) */
function leaderboard_(p, token) {
  const u = currentUser_(token);
  const best = {};
  rows_('GameScores').forEach(function (g) {
    if (g.setId !== p.setId || g.game !== p.game) return;
    const cur = best[g.userId];
    const sc = num_(g.score), sec = num_(g.seconds);
    if (!cur || sc > cur.score || (sc === cur.score && sec < cur.seconds)) {
      best[g.userId] = { userId: g.userId, fullName: g.fullName, className: g.className, score: sc, seconds: sec, correct: num_(g.correct), total: num_(g.total) };
    }
  });
  const list = Object.keys(best).map(function (k) { return best[k]; })
    .sort(function (a, b) { return b.score - a.score || a.seconds - b.seconds; });
  list.forEach(function (r, i) { r.rank = i + 1; r.me = r.userId === u.id; });
  const mine = list.find(function (r) { return r.me; }) || null;
  return { top: list.slice(0, 10).map(stripId_), me: mine ? stripId_(mine) : null, players: list.length };
}
function stripId_(r) { const o = Object.assign({}, r); delete o.userId; return o; }

/** Giáo viên */
function listWordSets_(p, token) {
  requireTeacher_(token);
  const cnt = {}, plays = {};
  rows_('Words').forEach(function (w) {
    const c = cnt[w.setId] || (cnt[w.setId] = { words: 0, sentences: 0 });
    if (w.kind === 'sentence') c.sentences++; else c.words++;
  });
  rows_('GameScores').forEach(function (g) { plays[g.setId] = (plays[g.setId] || 0) + 1; });
  return rows_('WordSets').map(function (s) {
    const c = cnt[s.id] || { words: 0, sentences: 0 };
    return { id: s.id, title: s.title, level: s.level, subLevel: s.subLevel, status: s.status, createdBy: s.createdBy,
             updatedAt: s.updatedAt || s.createdAt, words: c.words, sentences: c.sentences, plays: plays[s.id] || 0 };
  });
}

/** Kiểm tra dữ liệu một bộ từ, trả về { data, items } */
function prepSet_(x, words, sentences, label) {
  const pre = label ? label + ': ' : '';
  const title = clean_(x.title, 200);
  if (!title) throw new Error(pre + 'Bộ từ cần có tên.');
  const lv = LEVELS.find(function (l) { return l.id === x.level; });
  if (!lv) throw new Error(pre + 'Hãy chọn cấp độ.');
  if (lv.subs.indexOf(x.subLevel) < 0) throw new Error(pre + 'Hãy chọn lớp/cấp nhỏ trong ' + lv.name + '.');
  const items = [];
  (words || []).forEach(function (w, i) {
    const t = clean_(w.word, 200), m = clean_(w.meaning, 300);
    if (!t || !m) throw new Error(pre + 'Từ vựng dòng ' + (i + 1) + ' cần có cả từ và nghĩa.');
    items.push({ kind: 'word', text: t, meaning: m, example: clean_(w.example, 500), image: clean_(w.image, 500) });
  });
  (sentences || []).forEach(function (c, i) {
    const t = clean_(c.text, 400).replace(/\s+/g, ' ');
    if (t.split(' ').length < 2) throw new Error(pre + 'Câu dòng ' + (i + 1) + ' cần ít nhất 2 từ.');
    items.push({ kind: 'sentence', text: t, meaning: clean_(c.meaning, 400), example: '', image: '' });
  });
  if (!items.length) throw new Error(pre + 'Bộ từ cần ít nhất 1 từ vựng hoặc 1 câu.');
  return { data: { title: title, level: lv.id, subLevel: x.subLevel, status: x.status === 'closed' ? 'closed' : 'open', updatedAt: now_() }, items: items };
}

function upsertSet_(id, prep, me) {
  const old = id ? rows_('WordSets').find(function (s) { return s.id === id; }) : null;
  if (old) update_('WordSets', old._row, prep.data);
  else {
    id = newId_('WS');
    append_('WordSets', Object.assign({ id: id, createdBy: me.fullName, createdAt: now_() }, prep.data));
  }
  replaceChildren_('Words', 'setId', id, prep.items);
  return id;
}

function saveWordSet_(p, token) {
  const me = requireTeacher_(token);
  const prep = prepSet_(p.set || {}, p.words, p.sentences);
  return withLock_(function () { return { id: upsertSet_((p.set || {}).id, prep, me) }; });
}

/** Nhập nhiều bộ từ cùng lúc. Bộ trùng tên + cấp độ + lớp sẽ được cập nhật (ghi đè). */
function importWordSets_(p, token) {
  const me = requireTeacher_(token);
  const sets = p.sets || [];
  if (!sets.length) throw new Error('Chưa có bộ từ nào để nhập.');
  if (sets.length > 50) throw new Error('Mỗi lần nhập tối đa 50 bộ.');
  const preps = sets.map(function (x, i) { return prepSet_(x, x.words, x.sentences, 'Bộ ' + (i + 1) + ' (' + (x.title || '') + ')'); });
  return withLock_(function () {
    const key = function (d) { return [String(d.title).trim().toLowerCase(), d.level, d.subLevel].join('|'); };
    const existing = {};
    rows_('WordSets').forEach(function (s) { existing[key(s)] = s.id; });
    let created = 0, updated = 0;
    preps.forEach(function (prep) {
      const id = existing[key(prep.data)];
      if (id) updated++; else created++;
      existing[key(prep.data)] = upsertSet_(id, prep, me);
    });
    return { created: created, updated: updated };
  });
}

function toggleWordSet_(p, token) {
  requireTeacher_(token);
  const s = findSet_(p.id);
  const status = s.status === 'open' ? 'closed' : 'open';
  update_('WordSets', s._row, { status: status });
  return status;
}

function deleteWordSet_(p, token) {
  requireTeacher_(token);
  return withLock_(function () {
    const s = findSet_(p.id);
    sh_('WordSets').deleteRow(s._row);
    replaceChildren_('Words', 'setId', s.id, []);
    return true;
  });
}

function recentPlays_(p, token) {
  requireTeacher_(token);
  return rows_('GameScores').map(function (g) {
    return { fullName: g.fullName, className: g.className, username: g.username, setTitle: g.setTitle, level: g.level,
             game: g.game, score: num_(g.score), correct: num_(g.correct), total: num_(g.total), seconds: num_(g.seconds), playedAt: g.playedAt };
  }).sort(function (a, b) { return String(b.playedAt).localeCompare(String(a.playedAt)); }).slice(0, 300);
}


// ===================== 8c. LỚP HỌC & GIAO BÀI =====================
/** Không cần đăng nhập: danh sách lớp cho ô chọn lớp khi đăng ký */
function publicInfo_() {
  return { classes: rows_('Classes').map(function (c) { return { name: c.name, level: c.level }; })
    .sort(function (a, b) { return a.name.localeCompare(b.name, 'vi', { numeric: true }); }) };
}

function listClasses_(p, token) {
  requireTeacher_(token);
  const users = rows_('Users');
  return rows_('Classes').map(function (c) {
    return { id: c.id, name: c.name, level: c.level,
             students: users.filter(function (u) { return u.role === 'student' && u.status === 'approved' && u.className === c.name; }).length };
  }).sort(function (a, b) { return a.name.localeCompare(b.name, 'vi', { numeric: true }); });
}

function saveClass_(p, token) {
  const me = requireTeacher_(token);
  const name = clean_(p.name, 30).replace(/\s+/g, '').toUpperCase();
  if (!name) throw new Error('Hãy nhập tên lớp, ví dụ 10A1.');
  const level = LEVELS.some(function (l) { return l.id === p.level; }) ? p.level : '';
  return withLock_(function () {
    if (rows_('Classes').some(function (c) { return c.name.toUpperCase() === name; })) throw new Error('Lớp ' + name + ' đã có.');
    append_('Classes', { id: newId_('C'), name: name, level: level, createdBy: me.fullName, createdAt: now_() });
    return { name: name };
  });
}

function deleteClass_(p, token) {
  requireTeacher_(token);
  return withLock_(function () {
    const c = rows_('Classes').find(function (x) { return x.id === p.id; });
    if (!c) throw new Error('Không tìm thấy lớp.');
    sh_('Classes').deleteRow(c._row);
    // xoá các bài đã giao cho lớp này (từ dưới lên để không lệch số dòng)
    rows_('Assignments').filter(function (a) { return a.classId === c.id; }).reverse()
      .forEach(function (a) { sh_('Assignments').deleteRow(a._row); });
    return true;
  });
}

function setClass_(p, token) {
  requireTeacher_(token);
  const u = findUser_(p.userId);
  const name = String(p.className || '');
  if (name && !rows_('Classes').some(function (c) { return c.name === name; })) throw new Error('Lớp không tồn tại.');
  update_('Users', u._row, { className: name });
  return true;
}

function assign_(p, token) {
  const me = requireTeacher_(token);
  const kind = ['wordset', 'exam'].indexOf(p.kind) >= 0 ? p.kind : 'exercise';
  const ref = kind === 'exercise' ? findExercise_(p.refId) : kind === 'exam' ? findExam_(p.refId) : findSet_(p.refId);
  const game = kind === 'wordset' && GAMES[p.game] ? p.game : '';
  const due = p.dueAt ? new Date(p.dueAt) : null;
  if (due && isNaN(due.getTime())) throw new Error('Hạn nộp không hợp lệ.');
  const classes = rows_('Classes').filter(function (c) { return (p.classIds || []).indexOf(c.id) >= 0; });
  if (!classes.length) throw new Error('Hãy chọn ít nhất một lớp.');
  return withLock_(function () {
    classes.forEach(function (c) {
      append_('Assignments', {
        id: newId_('A'), classId: c.id, className: c.name, kind: kind, refId: ref.id, refTitle: ref.title, level: ref.level || (ref.grade ? 'THPT' : ''),
        game: game, dueAt: due ? due.toISOString() : '', note: clean_(p.note, 300), createdBy: me.fullName, createdAt: now_()
      });
    });
    return classes.length;
  });
}

/** Tình trạng làm bài của một học sinh với một bài được giao */
function asgData_() { return { results: rows_('Results'), scores: rows_('GameScores'), exams: rows_('ExamResults') }; }
function asgStatus_(a, userId, data) {
  const results = data.results, scores = data.scores;
  let done = false, onTime = false, best = null, at = '';
  const due = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
  const consider = function (time, value) {
    done = true;
    if (new Date(time).getTime() <= due) onTime = true;
    if (!at || time < at) at = time;
    if (value !== null && (best === null || value > best)) best = value;
  };
  if (a.kind === 'exercise') {
    results.forEach(function (r) {
      if (r.userId === userId && r.exerciseId === a.refId && r.submittedAt >= a.createdAt) consider(r.submittedAt, r.percent === '' ? null : num_(r.percent));
    });
  } else if (a.kind === 'exam') {
    data.exams.forEach(function (r) {
      if (r.userId === userId && r.examId === a.refId && r.submittedAt >= a.createdAt) consider(r.submittedAt, num_(r.score));
    });
  } else {
    scores.forEach(function (g) {
      if (g.userId === userId && g.setId === a.refId && (!a.game || g.game === a.game) && g.playedAt >= a.createdAt) consider(g.playedAt, num_(g.score));
    });
  }
  return { done: done, late: done && !onTime, best: best, at: at };
}

function myAssignments_(u) {
  if (!u.className) return [];
  const data = asgData_();
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  return rows_('Assignments')
    .filter(function (a) { return a.className === u.className; })
    .map(function (a) {
      const st = asgStatus_(a, u.id, data);
      return { id: a.id, kind: a.kind, refId: a.refId, title: a.refTitle, level: a.level, game: a.game, dueAt: a.dueAt, note: a.note,
               createdBy: a.createdBy, done: st.done, late: st.late, best: st.best };
    })
    // ẩn bài đã làm xong và đã quá hạn hơn 7 ngày
    .filter(function (a) { return !a.done || !a.dueAt || a.dueAt >= weekAgo; })
    .sort(function (a, b) { return (a.done - b.done) || String(a.dueAt || '9').localeCompare(String(b.dueAt || '9')); });
}

function listAssignments_(p, token) {
  requireTeacher_(token);
  const users = rows_('Users').filter(function (u) { return u.role === 'student' && u.status === 'approved'; });
  const data = asgData_();
  return rows_('Assignments').map(function (a) {
    const studs = users.filter(function (u) { return u.className === a.className; });
    let done = 0, late = 0;
    studs.forEach(function (u) { const st = asgStatus_(a, u.id, data); if (st.done) { done++; if (st.late) late++; } });
    return { id: a.id, classId: a.classId, className: a.className, kind: a.kind, refId: a.refId, title: a.refTitle, level: a.level,
             game: a.game, dueAt: a.dueAt, note: a.note, createdBy: a.createdBy, createdAt: a.createdAt,
             students: studs.length, done: done, late: late };
  }).sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
}

function assignmentDetail_(p, token) {
  requireTeacher_(token);
  const a = rows_('Assignments').find(function (x) { return x.id === p.id; });
  if (!a) throw new Error('Không tìm thấy bài đã giao.');
  const data = asgData_();
  const rows = rows_('Users')
    .filter(function (u) { return u.role === 'student' && u.status === 'approved' && u.className === a.className; })
    .map(function (u) {
      const st = asgStatus_(a, u.id, data);
      return { fullName: u.fullName, username: u.username, done: st.done, late: st.late, best: st.best, at: st.at };
    })
    .sort(function (x, y) { return (x.done - y.done) || x.fullName.localeCompare(y.fullName, 'vi'); });
  return { id: a.id, className: a.className, kind: a.kind, title: a.refTitle, game: a.game, dueAt: a.dueAt, note: a.note, rows: rows };
}

function deleteAssignment_(p, token) {
  requireTeacher_(token);
  return withLock_(function () {
    const a = rows_('Assignments').find(function (x) { return x.id === p.id; });
    if (!a) throw new Error('Không tìm thấy bài đã giao.');
    sh_('Assignments').deleteRow(a._row);
    return true;
  });
}


// ===================== 8d. LUYỆN ĐỀ =====================
/*
  Mỗi đề gồm nhiều "phần nhỏ" (section), mỗi phần lưu thành 1 dòng JSON trong trang ExamParts:
  { part, title, instruction, passage, audioUrl, script: [[người nói, lời], …],
    questions: [{ type: 'mcq'|'fill', q, options: {A,B,C,D}, answer, explanation }] }
*/
function findExam_(id) {
  const e = rows_('Exams').find(function (x) { return x.id === id; });
  if (!e) throw new Error('Không tìm thấy đề.');
  return e;
}
function examSections_(id) {
  return rows_('ExamParts')
    .filter(function (r) { return r.examId === id; })
    .sort(function (a, b) { return num_(a.order) - num_(b.order); })
    .map(function (r) { try { return JSON.parse(r.json); } catch (e) { return null; } })
    .filter(Boolean);
}
function examMeta_(e) {
  return { id: e.id, title: e.title, grade: e.grade, examType: e.examType, duration: num_(e.duration) || 60,
           answerMode: e.answerMode === 'teacher' ? 'teacher' : 'instant', released: isTrue_(e.released),
           status: e.status, questionCount: num_(e.questionCount) };
}
function canSeeAnswers_(e, u) { return u.role === 'teacher' || e.answerMode !== 'teacher' || isTrue_(e.released); }

/** Học sinh: danh sách đề đang mở + điểm cao nhất của mình */
function examsList_(p, token) {
  const u = currentUser_(token);
  const best = {}, tries = {};
  rows_('ExamResults').forEach(function (r) {
    if (r.userId !== u.id) return;
    tries[r.examId] = (tries[r.examId] || 0) + 1;
    if (!(r.examId in best) || num_(r.score) > best[r.examId]) best[r.examId] = num_(r.score);
  });
  return rows_('Exams').filter(function (e) { return e.status === 'open'; }).map(function (e) {
    const m = examMeta_(e); m.best = (e.id in best) ? best[e.id] : null; m.tries = tries[e.id] || 0; return m;
  });
}

/** Lấy đề để làm: không kèm đáp án và giải thích */
function examGet_(p, token) {
  const u = currentUser_(token);
  const e = findExam_(p.id);
  if (e.status !== 'open' && u.role !== 'teacher') throw new Error('Đề này đang đóng.');
  let n = 0;
  const sections = examSections_(e.id).map(function (s) {
    return { part: s.part, title: s.title, instruction: s.instruction, passage: s.passage, audioUrl: audioSrc_(s.audioUrl),
             script: s.script || [],
             questions: (s.questions || []).map(function (q) { n++; return { n: n, type: q.type, q: q.q, options: q.options || null }; }) };
  });
  const m = examMeta_(e); m.sections = sections; return m;
}

function gradeExam_(sections, answers) {
  let n = 0, correct = 0, total = 0;
  const parts = {}, items = [];
  sections.forEach(function (s, si) {
    const key = s.part || 'Khác';
    const pt = parts[key] || (parts[key] = { part: key, correct: 0, total: 0 });
    (s.questions || []).forEach(function (q) {
      n++;
      const given = String(answers[String(n)] == null ? '' : answers[String(n)]).slice(0, 500);
      const ok = q.type === 'fill' ? fillMatch_(given, q.answer) : given.trim().toUpperCase() === String(q.answer).trim().toUpperCase();
      total++; pt.total++;
      if (ok) { correct++; pt.correct++; }
      items.push({ n: n, si: si, given: given, ok: ok });
    });
  });
  return { correct: correct, total: total, score: total ? Math.round(correct / total * 1000) / 100 : 0,
           parts: Object.keys(parts).map(function (k) { return parts[k]; }), items: items };
}

function examSubmit_(p, token) {
  const u = currentUser_(token);
  const e = findExam_(p.id);
  if (e.status !== 'open' && u.role !== 'teacher') throw new Error('Đề này đang đóng.');
  const secs = examSections_(e.id);
  const answers = p.answers || {};
  const g = gradeExam_(secs, answers);
  const clean = {};
  Object.keys(answers).forEach(function (k) { if (/^\d+$/.test(k)) clean[k] = String(answers[k]).slice(0, 500); });
  const row = {
    id: newId_('ER'), userId: u.id, username: u.username, fullName: u.fullName, className: u.className,
    examId: e.id, title: e.title, grade: e.grade, examType: e.examType,
    score: g.score, correct: g.correct, total: g.total, partsJson: JSON.stringify(g.parts), answersJson: JSON.stringify(clean),
    seconds: clampInt_(p.seconds, 0, (num_(e.duration) || 60) * 60 + 120), submittedAt: now_()
  };
  withLock_(function () { append_('ExamResults', row); });
  return examResultView_(row, e, secs, u);
}

/** Kết quả một lần làm đề; chỉ kèm đáp án khi được phép xem */
function examResultView_(r, e, secs, viewer) {
  let parts = [], answers = {};
  try { parts = JSON.parse(r.partsJson || '[]'); } catch (x) {}
  try { answers = JSON.parse(r.answersJson || '{}'); } catch (x) {}
  const out = {
    id: r.id, examId: r.examId, title: r.title, grade: r.grade, examType: r.examType, fullName: r.fullName, className: r.className,
    username: r.username, score: num_(r.score), correct: num_(r.correct), total: num_(r.total), seconds: num_(r.seconds),
    submittedAt: r.submittedAt, parts: parts, answerMode: e ? e.answerMode : '', canSee: false, sections: null
  };
  if (!e || !canSeeAnswers_(e, viewer)) return out;
  out.canSee = true;
  let n = 0;
  out.sections = secs.map(function (s) {
    return { part: s.part, title: s.title, instruction: s.instruction, passage: s.passage, script: s.script || [],
      items: (s.questions || []).map(function (q) {
        n++;
        const given = answers[String(n)] || '';
        const ok = q.type === 'fill' ? fillMatch_(given, q.answer) : String(given).toUpperCase() === String(q.answer).toUpperCase();
        return { n: n, type: q.type, question: q.q, options: q.options || null, given: given, correct: ok,
                 answerText: answerText_({ type: q.type, answer: q.answer }), explanation: q.explanation || '' };
      }) };
  });
  return out;
}

function examSummary_(r) {
  let parts = []; try { parts = JSON.parse(r.partsJson || '[]'); } catch (x) {}
  return { id: r.id, userId: r.userId, examId: r.examId, title: r.title, grade: r.grade, examType: r.examType, fullName: r.fullName,
           className: r.className, username: r.username, score: num_(r.score), correct: num_(r.correct), total: num_(r.total),
           seconds: num_(r.seconds), submittedAt: r.submittedAt, parts: parts };
}

function examMyResults_(p, token) {
  const u = currentUser_(token);
  return rows_('ExamResults').filter(function (r) { return r.userId === u.id; }).map(examSummary_).sort(byDateDesc_);
}

function examResultDetail_(p, token) {
  const u = currentUser_(token);
  const r = rows_('ExamResults').find(function (x) { return x.id === p.id; });
  if (!r) throw new Error('Không tìm thấy kết quả.');
  if (u.role !== 'teacher' && r.userId !== u.id) throw new Error('Bạn không có quyền xem kết quả này.');
  const e = rows_('Exams').find(function (x) { return x.id === r.examId; });
  return examResultView_(r, e || null, e ? examSections_(e.id) : [], u);
}

/** Giáo viên */
function examsAdmin_(p, token) {
  requireTeacher_(token);
  const stat = {};
  rows_('ExamResults').forEach(function (r) {
    const s = stat[r.examId] || (stat[r.examId] = { n: 0, sum: 0 });
    s.n++; s.sum += num_(r.score);
  });
  return rows_('Exams').map(function (e) {
    const m = examMeta_(e), s = stat[e.id];
    m.attempts = s ? s.n : 0; m.avg = s ? Math.round(s.sum / s.n * 100) / 100 : null;
    m.createdBy = e.createdBy; m.updatedAt = e.updatedAt || e.createdAt;
    return m;
  });
}

function examFull_(p, token) {
  requireTeacher_(token);
  const e = findExam_(p.id);
  const m = examMeta_(e); m.sections = examSections_(e.id); return m;
}

function examSave_(p, token) {
  const me = requireTeacher_(token);
  const x = p.exam || {};
  const title = clean_(x.title, 200);
  if (!title) throw new Error('Đề cần có tên.');
  if (EXAM_GRADES.indexOf(String(x.grade)) < 0) throw new Error('Hãy chọn khối.');
  if (!EXAM_TYPES[x.examType]) throw new Error('Hãy chọn loại đề.');
  const duration = clampInt_(x.duration, 5, 240);
  let count = 0;
  const secs = (p.sections || []).map(function (s, si) {
    const label = 'Phần ' + (si + 1) + (s.title ? ' (' + s.title + ')' : '');
    const qs = (s.questions || []).map(function (q) {
      count++;
      const type = q.type === 'fill' ? 'fill' : 'mcq';
      const o = { type: type, q: clean_(q.q, 3000), answer: clean_(q.answer, 300), explanation: clean_(q.explanation, 1500) };
      if (type === 'mcq') {
        o.options = {};
        ['A', 'B', 'C', 'D', 'E'].forEach(function (k) { if (q.options && String(q.options[k] || '').trim()) o.options[k] = clean_(q.options[k], 600); });
        o.answer = o.answer.toUpperCase();
        if (Object.keys(o.options).length < 2) throw new Error(label + ': câu ' + count + ' cần ít nhất 2 lựa chọn.');
        if (!o.options[o.answer]) throw new Error(label + ': câu ' + count + ' chưa có đáp án đúng.');
      } else if (!o.answer) throw new Error(label + ': câu ' + count + ' chưa có đáp án.');
      return o;
    });
    const script = (s.script || []).map(function (l) { return [clean_(l[0], 40), clean_(l[1], 3000)]; }).filter(function (l) { return l[1]; });
    const obj = { part: clean_(s.part, 120), title: clean_(s.title, 120), instruction: clean_(s.instruction, 1500),
                  passage: clean_(s.passage, 20000), audioUrl: clean_(s.audioUrl, 500), script: script, questions: qs };
    const json = JSON.stringify(obj);
    if (json.length > 45000) throw new Error(label + ' quá dài, hãy tách thành 2 phần nhỏ.');
    return { json: json };
  });
  if (!count) throw new Error('Đề cần ít nhất 1 câu hỏi.');
  return withLock_(function () {
    let id = x.id;
    const data = { title: title, grade: String(x.grade), examType: x.examType, duration: duration,
                   answerMode: x.answerMode === 'teacher' ? 'teacher' : 'instant', status: x.status === 'closed' ? 'closed' : 'open',
                   questionCount: count, updatedAt: now_() };
    const old = id ? rows_('Exams').find(function (e) { return e.id === id; }) : null;
    if (old) update_('Exams', old._row, data);
    else { id = newId_('EZ'); append_('Exams', Object.assign({ id: id, released: 'FALSE', createdBy: me.fullName, createdAt: now_() }, data)); }
    replaceChildren_('ExamParts', 'examId', id, secs);
    return { id: id, questions: count };
  });
}

function examToggle_(p, token) {
  requireTeacher_(token);
  const e = findExam_(p.id);
  const status = e.status === 'open' ? 'closed' : 'open';
  update_('Exams', e._row, { status: status });
  return status;
}

function examRelease_(p, token) {
  requireTeacher_(token);
  const e = findExam_(p.id);
  const v = !isTrue_(e.released);
  update_('Exams', e._row, { released: v ? 'TRUE' : 'FALSE' });
  return v;
}

function examDelete_(p, token) {
  requireTeacher_(token);
  return withLock_(function () {
    const e = findExam_(p.id);
    sh_('Exams').deleteRow(e._row);
    replaceChildren_('ExamParts', 'examId', e.id, []);
    return true;
  });
}

function examResultsAdmin_(p, token) {
  requireTeacher_(token);
  return rows_('ExamResults').filter(function (r) { return !p.examId || r.examId === p.examId; })
    .map(examSummary_).sort(function (a, b) { return b.score - a.score || a.seconds - b.seconds; });
}


// ===================== 9. CHẤM ĐIỂM & KẾT QUẢ =====================
/** Chuẩn hoá câu trả lời: chữ thường, bỏ khoảng trắng thừa, dấu câu cuối, thống nhất dấu nháy */
function norm_(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/^[\s"']+|[\s.!?,;:"']+$/g, '')
    .trim();
}

/** Đáp án điền từ có thể có nhiều phương án, ngăn bằng dấu |   ví dụ: has gone|went */
function fillMatch_(given, answer) {
  const g = norm_(given);
  if (!g) return false;
  return String(answer).split('|').some(function (a) { return norm_(a) === g; });
}

function answerText_(q) {
  if (q.type === 'mcq') return String(q.answer).trim().toUpperCase();
  if (q.type === 'fill') return String(q.answer).split('|').map(function (s) { return s.trim(); }).filter(String).join('  /  ');
  return '';
}

function buildResult_(r) {
  let items = [];
  try { items = JSON.parse(r.answersJson || '[]'); } catch (err) { items = []; }
  return {
    id: r.id, exerciseId: r.exerciseId, title: r.title, level: r.level, subLevel: r.subLevel,
    fullName: r.fullName, className: r.className, username: r.username,
    autoScore: num_(r.autoScore), autoTotal: num_(r.autoTotal),
    essayScore: r.essayScore === '' ? null : num_(r.essayScore), essayTotal: num_(r.essayTotal),
    percent: r.percent === '' ? null : num_(r.percent),
    needsReview: isTrue_(r.needsReview), teacherComment: r.teacherComment || '', reviewedBy: r.reviewedBy || '',
    submittedAt: r.submittedAt, items: items
  };
}

function resultSummary_(r) {
  const o = buildResult_(r);
  delete o.items;
  o.userId = r.userId;
  return o;
}


// ===================== 10. HÀM TIỆN ÍCH =====================
function db_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

const SHEET_OK_ = {};  // trang tính đã kiểm tra tiêu đề trong lần chạy này
function sh_(name) {
  const ss = db_();
  let s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.getRange(1, 1, 1, SCHEMA[name].length).setValues([SCHEMA[name]]).setFontWeight('bold').setBackground('#ede9fe');
    s.setFrozenRows(1);
  } else if (!SHEET_OK_[name]) {
    // Bản cập nhật có thêm cột mới (vd cột image của Words): tự thêm vào cuối, không đụng dữ liệu cũ
    const last = Math.max(s.getLastColumn(), 1);
    const head = s.getRange(1, 1, 1, last).getValues()[0].map(String);
    const missing = SCHEMA[name].filter(function (h) { return head.indexOf(h) < 0; });
    if (missing.length && head.some(String)) {
      const need = last + missing.length - s.getMaxColumns();
      if (need > 0) s.insertColumnsAfter(s.getMaxColumns(), need);
      s.getRange(1, last + 1, 1, missing.length).setValues([missing]).setFontWeight('bold').setBackground('#ede9fe');
      s.getRange(1, last + 1, s.getMaxRows(), missing.length).setNumberFormat('@');
    }
  }
  SHEET_OK_[name] = true;
  return s;
}

/** Đọc cả trang tính thành mảng đối tượng; _row là số dòng thật trong Sheet */
function rows_(name) {
  const values = sh_(name).getDataRange().getValues();
  if (values.length < 2) return [];
  const head = values[0].map(String);
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (r.every(function (v) { return v === '' || v === null; })) continue;
    const o = { _row: i + 1 };
    head.forEach(function (h, j) {
      let v = r[j];
      if (v instanceof Date) v = v.toISOString();
      else if (v === null || v === undefined) v = '';
      else if (typeof v !== 'string') v = String(v);
      o[h] = v;
    });
    out.push(o);
  }
  return out;
}

function header_(name) {
  const s = sh_(name);
  return s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String);
}

/** Chặn công thức: chuỗi bắt đầu bằng = + - @ sẽ được lưu dạng chữ */
function safe_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function append_(name, obj) {
  const head = header_(name);
  sh_(name).appendRow(head.map(function (h) { return safe_(obj[h]); }));
}

function update_(name, row, obj) {
  const s = sh_(name);
  const head = header_(name);
  const range = s.getRange(row, 1, 1, head.length);
  const cur = range.getValues()[0];
  range.setValues([head.map(function (h, j) { return Object.prototype.hasOwnProperty.call(obj, h) ? safe_(obj[h]) : cur[j]; })]);
}

/** Ghi lại các dòng con thuộc một mục cha (xoá cũ, thêm mới), ví dụ Words của một bộ từ */
function replaceChildren_(name, keyField, keyValue, objs) {
  const s = sh_(name);
  const head = header_(name);
  const all = s.getDataRange().getValues();
  const iKey = head.indexOf(keyField);
  const keep = all.slice(1).filter(function (r) { return String(r[iKey]) !== String(keyValue) && r.some(function (v) { return v !== ''; }); });
  const add = objs.map(function (o, i) {
    const row = Object.assign({ order: i + 1 }, o); row[keyField] = keyValue;
    return head.map(function (h) { return safe_(row[h]); });
  });
  const data = keep.concat(add);
  const oldRows = Math.max(all.length - 1, 0);
  if (oldRows > 0) s.getRange(2, 1, oldRows, head.length).clearContent();
  if (data.length) {
    const rng = s.getRange(2, 1, data.length, head.length);
    rng.setNumberFormat('@');
    rng.setValues(data);
  }
}

/** Ghi lại toàn bộ câu hỏi của một bài (xoá cũ, thêm mới) */
function replaceQuestions_(exerciseId, qs) {
  const s = sh_('Questions');
  const head = header_('Questions');
  const all = s.getDataRange().getValues();
  const iEx = head.indexOf('exerciseId');
  const keep = all.slice(1).filter(function (r) { return String(r[iEx]) !== String(exerciseId) && r.some(function (v) { return v !== ''; }); });
  const add = qs.map(function (q, i) {
    const o = Object.assign({ exerciseId: exerciseId, order: i + 1 }, q);
    return head.map(function (h) { return safe_(o[h]); });
  });
  const data = keep.concat(add);
  const oldRows = Math.max(all.length - 1, 0);
  if (oldRows > 0) s.getRange(2, 1, oldRows, head.length).clearContent();
  if (data.length) {
    const rng = s.getRange(2, 1, data.length, head.length);
    rng.setNumberFormat('@');
    rng.setValues(data);
  }
}

function questionsOf_(exerciseId) {
  return rows_('Questions')
    .filter(function (q) { return q.exerciseId === exerciseId; })
    .sort(function (a, b) { return num_(a.order) - num_(b.order); })
    .map(function (q) { q.type = ['mcq', 'fill', 'essay'].indexOf(q.type) >= 0 ? q.type : 'mcq'; return q; });
}

function optionsOf_(q) {
  const o = {};
  ['A', 'B', 'C', 'D'].forEach(function (k) { if (String(q[k] || '').trim()) o[k] = q[k]; });
  return o;
}

function findExercise_(id) {
  const e = rows_('Exercises').find(function (x) { return x.id === id; });
  if (!e) throw new Error('Không tìm thấy bài tập.');
  return e;
}

function findUser_(id) {
  const u = rows_('Users').find(function (x) { return x.id === id; });
  if (!u) throw new Error('Không tìm thấy tài khoản.');
  return u;
}

function currentUser_(token) {
  if (!token) throw new Error('AUTH');
  const id = CacheService.getScriptCache().get('sess_' + token);
  if (!id) throw new Error('AUTH');
  const u = rows_('Users').find(function (x) { return x.id === id; });
  if (!u || u.status !== 'approved') throw new Error('AUTH');
  return u;
}

function requireTeacher_(token) {
  const u = currentUser_(token);
  if (u.role !== 'teacher') throw new Error('Chức năng này chỉ dành cho giáo viên.');
  return u;
}

function publicUser_(u) {
  return { id: u.id, username: u.username, fullName: u.fullName, className: u.className, level: u.level, role: u.role, status: u.status, createdAt: u.createdAt };
}

/** Âm thanh trên Google Drive: đổi link chia sẻ thành link phát trực tiếp */
function audioSrc_(url) {
  url = String(url || '').trim();
  if (!url) return '';
  const m = url.match(/\/d\/([\w-]{20,})/) || url.match(/[?&]id=([\w-]{20,})/);
  if (m && /drive\.google\.com/.test(url)) return 'https://drive.google.com/uc?export=download&id=' + m[1];
  return url;
}

function hash_(password, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + password, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function newId_(prefix) { return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function now_() { return new Date().toISOString(); }
function num_(v) { const n = Number(v); return isNaN(n) ? 0 : n; }
function isTrue_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
function clean_(v, max) { return String(v == null ? '' : v).replace(/\r\n/g, '\n').trim().slice(0, max || 1000); }
function byDateDesc_(a, b) { return String(b.submittedAt || b.createdAt || '').localeCompare(String(a.submittedAt || a.createdAt || '')); }


// ===================== 11. BÀI MẪU (tạo khi chạy setup) =====================
function seedSamples_() {
  const samples = [
    {
      title: 'Present Simple – Thì hiện tại đơn', level: 'THCS', subLevel: 'Lớp 6', skill: 'Ngữ pháp',
      questions: [
        { type: 'mcq', question: 'She ___ to school every day.', A: 'go', B: 'goes', C: 'going', D: 'is go', answer: 'B', explanation: 'Chủ ngữ ngôi 3 số ít (She) → động từ thêm -es: goes.' },
        { type: 'mcq', question: 'My parents ___ coffee in the morning.', A: "doesn't drink", B: "don't drinks", C: "don't drink", D: 'not drink', answer: 'C', explanation: 'Chủ ngữ số nhiều → don’t + động từ nguyên mẫu.' },
        { type: 'mcq', question: '___ your brother play football?', A: 'Do', B: 'Does', C: 'Is', D: 'Are', answer: 'B', explanation: 'Your brother = ngôi 3 số ít → Does.' },
        { type: 'fill', question: 'Water ___ (boil) at 100 degrees Celsius.', answer: 'boils', explanation: 'Sự thật hiển nhiên → hiện tại đơn; ngôi 3 số ít → boils.' },
        { type: 'fill', question: 'Tom ___ (not / like) vegetables.', answer: "doesn't like|does not like", explanation: 'Phủ định ngôi 3 số ít: doesn’t + V.' }
      ]
    },
    {
      title: 'Word formation – Unit 1 Review', level: 'THPT', subLevel: 'Lớp 12', skill: 'Từ vựng',
      questions: [
        { type: 'fill', question: 'Her ___ (achieve) in science made her family proud.', answer: 'achievements|achievement', explanation: 'Sau tính từ sở hữu "Her" cần danh từ: achievement(s).' },
        { type: 'fill', question: 'He is a very ___ (determine) person who never gives up.', answer: 'determined', explanation: 'Trước danh từ "person" cần tính từ: determined.' },
        { type: 'mcq', question: 'The film was so ___ that everyone cried.', A: 'moved', B: 'moving', C: 'movement', D: 'move', answer: 'B', explanation: 'Tính từ đuôi -ing mô tả tính chất của sự vật (bộ phim gây xúc động).' },
        { type: 'mcq', question: 'She gave a ___ performance at the concert.', A: 'remark', B: 'remarkably', C: 'remarkable', D: 'remarking', answer: 'C', explanation: 'Trước danh từ "performance" cần tính từ: remarkable.' }
      ]
    },
    {
      title: 'Sentence transformation & Writing', level: 'HSG', subLevel: 'Cấp tỉnh', skill: 'Tổng hợp',
      questions: [
        { type: 'fill', question: 'Rewrite: "It is ages since I last saw him." → I haven\'t ...', answer: "I haven't seen him for ages|I have not seen him for ages", explanation: 'It is + thời gian + since + QKĐ = S + haven\'t + V3 + for + thời gian.' },
        { type: 'mcq', question: 'Hardly ___ the station when the train left.', A: 'I had reached', B: 'had I reached', C: 'I reached', D: 'did I reach', answer: 'B', explanation: 'Đảo ngữ với Hardly: Hardly + had + S + V3 + when + QKĐ.' },
        { type: 'essay', question: 'Write a paragraph (120–150 words) about the benefits of learning English online.', points: 4, explanation: 'GV chấm theo: nội dung, bố cục, từ vựng, ngữ pháp.' }
      ]
    },
    {
      title: 'Reading – City Gardens', level: 'IELTS', subLevel: 'Band 5.5–6.5', skill: 'Đọc hiểu',
      passage:
        'A  In many large cities, empty rooftops are being turned into small gardens. These gardens are often started by local residents who want fresh vegetables and a quiet place to relax.\n\n' +
        'B  Rooftop gardens also help buildings stay cooler in summer. Plants absorb sunlight that would otherwise heat the roof, so people inside use less air conditioning.\n\n' +
        'C  However, not every building is suitable. The roof must be strong enough to carry the weight of soil and water, and owners usually need permission from the city council before starting.',
      questions: [
        { type: 'mcq', question: 'Who usually starts rooftop gardens?', A: 'The city council', B: 'Local residents', C: 'Building engineers', D: 'Supermarkets', answer: 'B', explanation: 'Đoạn A: "often started by local residents".' },
        { type: 'mcq', question: 'TRUE / FALSE / NOT GIVEN: Rooftop gardens reduce the need for air conditioning.', A: 'TRUE', B: 'FALSE', C: 'NOT GIVEN', answer: 'A', explanation: 'Đoạn B: people inside use less air conditioning.' },
        { type: 'mcq', question: 'TRUE / FALSE / NOT GIVEN: Rooftop gardens are cheaper than ground-level gardens.', A: 'TRUE', B: 'FALSE', C: 'NOT GIVEN', answer: 'C', explanation: 'Bài không so sánh chi phí → NOT GIVEN.' },
        { type: 'fill', question: 'Owners usually need permission from the city ___ . (ONE WORD)', answer: 'council', explanation: 'Đoạn C: permission from the city council.' }
      ]
    }
  ];
  samples.forEach(function (s) {
    const id = newId_('EX');
    append_('Exercises', {
      id: id, title: s.title, level: s.level, subLevel: s.subLevel, skill: s.skill, passage: s.passage || '', audioUrl: '',
      status: 'open', createdBy: ADMIN_FULLNAME, createdAt: now_(), updatedAt: now_()
    });
    replaceQuestions_(id, s.questions.map(function (q) {
      return Object.assign({ A: '', B: '', C: '', D: '', answer: '', explanation: '', points: 1 }, q);
    }));
  });
}


/** Bộ từ mẫu (tạo khi chạy setup nếu chưa có bộ từ nào) */
function seedWordSet_() {
  const id = newId_('WS');
  append_('WordSets', { id: id, title: 'Unit 4 – For a better community', level: 'THPT', subLevel: 'Lớp 10', status: 'open',
                        createdBy: ADMIN_FULLNAME, createdAt: now_(), updatedAt: now_() });
  const words = [
    ['volunteer', 'tình nguyện viên; làm tình nguyện', 'She works as a volunteer at the local library.'],
    ['community', 'cộng đồng', 'Our community needs a new playground.'],
    ['donate', 'quyên góp, tặng', 'We donated old clothes to poor families.'],
    ['benefit', 'lợi ích; có lợi cho', 'Volunteering can benefit both you and others.'],
    ['disadvantaged', 'thiệt thòi, khó khăn', 'They teach English to disadvantaged children.'],
    ['remote', 'xa xôi, hẻo lánh', 'The village is in a remote area.'],
    ['raise money', 'gây quỹ, quyên tiền', 'The class held a fair to raise money.'],
    ['generous', 'hào phóng, rộng lượng', 'It was generous of him to help us.'],
    ['charity', 'tổ chức từ thiện; việc từ thiện', 'All the money will go to charity.'],
    ['responsible', 'có trách nhiệm', 'Volunteers become more responsible.']
  ];
  const sentences = [
    ['We have collected more than 200 books since May.', 'Chúng tôi đã quyên góp hơn 200 cuốn sách từ tháng Năm.'],
    ['She was cleaning the beach when it started to rain.', 'Cô ấy đang dọn bãi biển thì trời bắt đầu mưa.'],
    ['Volunteering helps students develop new skills.', 'Làm tình nguyện giúp học sinh phát triển kỹ năng mới.'],
    ['The money will be used to build a new school.', 'Số tiền sẽ được dùng để xây một ngôi trường mới.'],
    ['If you join our club, you will make many friends.', 'Nếu bạn tham gia câu lạc bộ, bạn sẽ có nhiều bạn mới.']
  ];
  replaceChildren_('Words', 'setId', id,
    words.map(function (w) { return { kind: 'word', text: w[0], meaning: w[1], example: w[2] }; })
      .concat(sentences.map(function (c) { return { kind: 'sentence', text: c[0], meaning: c[1], example: '' }; })));
}
