const DB_URL = 'https://awtnljsrywkxhvxtjwlo.supabase.co';
const DB_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3dG5sanNyeXdreGh2eHRqd2xvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5MzEwMjMsImV4cCI6MjA4NDUwNzAyM30.UacBpwAmEjmbGlM3eQwNolr7uRnTFU3Idq8dNPCOwYU';

let TARGET_BUILDING = localStorage.getItem('sakanTarget')
  ? parseInt(localStorage.getItem('sakanTarget'))
  : 500;
let currentPage = 0;
const PAGE_SIZE = 15;
let isLastPage = false;
let _supa = null;
let currentUser = null;
let localData = {};
let chartInstance = null;
let notifs = [];

function updateClock() {
  const n = new Date();
  const t = n.toLocaleTimeString('en-US', {
    hour12: true,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const d = n.toLocaleDateString('ar-EG');
  if (document.getElementById('loginClock'))
    document.getElementById('loginClock').innerText = t;
  if (document.getElementById('headTime'))
    document.getElementById('headTime').innerText = t;
  if (document.getElementById('headDate'))
    document.getElementById('headDate').innerText = d;
}
setInterval(updateClock, 1000);
updateClock();

function toggleTheme() {
  const b = document.body;
  b.dataset.theme = b.dataset.theme === 'light' ? 'dark' : 'light';
}

async function login() {
  const u = document.getElementById('userInput').value.trim().toLowerCase();
  const p = document.getElementById('passInput').value.trim();
  const btn = document.querySelector('.login-btn');
  const errDiv = document.getElementById('loginErr');

  if (!_supa) _supa = window.supabase.createClient(DB_URL, DB_KEY);

  btn.innerText = 'جاري التحقق...';
  errDiv.innerText = '';
  errDiv.style.display = 'none';

  const { data: user, error } = await _supa
    .from('app_users')
    .select('*')
    .eq('username', u)
    .eq('password', p)
    .single();

  if (user) {
    if (navigator.vibrate) navigator.vibrate(50);
    currentUser = {
      name: user.name,
      role: user.role,
      bId: user.building_id,
      username: user.username,
      id: user.id,
    };
    localStorage.setItem('sakanUser', JSON.stringify(currentUser));
    document.getElementById('loginScreen').style.display = 'none';
    //document.getElementById('app').style.display = 'block';
    // داخل دالة login (في حالة النجاح)
    // بدلاً من document.getElementById('app').style.display = 'block';
    // ضع:
    playEntryAnimation();
    document.getElementById('navBar').style.display = 'flex';
    document.getElementById('roleDisplay').innerText = user.name;
    document.getElementById('targetInput').value = TARGET_BUILDING;
    setupUIForUser();
    refreshData();
  } else {
    if (navigator.vibrate) navigator.vibrate([50, 50]);
    errDiv.innerText = 'اسم المستخدم أو كلمة المرور خطأ';
    errDiv.style.display = 'block';
    btn.innerText = 'دخول النظام';
  }
}

/* دالة الخروج السينمائية */
function logout() {
  // 1. تطبيق أنيميشن الاختفاء
  const app = document.getElementById('app');
  const nav = document.getElementById('navBar');

  // إضافة كلاس الخروج للعناصر
  if (app) app.classList.add('animate-exit');
  if (nav) nav.classList.add('animate-exit');

  // 2. الانتظار حتى ينتهي الأنيميشن (600ms) ثم التنفيذ الفعلي
  setTimeout(() => {
    // مسح البيانات
    localStorage.removeItem('sakanUser');
    sessionStorage.setItem('justLoggedOut', 'true');

    // إعادة تحميل الصفحة (ستظهر شاشة الدخول تلقائياً الآن)
    location.reload();
  }, 600);
}

function setupUIForUser() {
  if (currentUser.role === 'admin') {
    document.getElementById('addCard').style.display = 'block';
    document.getElementById('excelBtn').style.display = 'block';
    document.getElementById('adminBell').style.display = 'flex';
    document.getElementById('adminControlPanel').style.display = 'block';
    document.getElementById('donationCard').style.display = 'block';
    document.getElementById('userManagementCard').style.display = 'block';
    fillExpSelect();
    fillResetChecks();
  } else {
    document.getElementById('addCard').style.display = 'none';
    document.getElementById('excelBtn').style.display = 'none';
    document.getElementById('adminBell').style.display = 'none';
    document.getElementById('repControlPanel').style.display = 'block';
    document.getElementById('donationCard').style.display = 'none';
    document.getElementById('userManagementCard').style.display = 'none';
  }
}

async function refreshData() {
  loadPollResults();
  const { data: summary, error } = await _supa.rpc('get_financial_summary');
  if (error) console.error('RPC Error:', error);

  if (summary) {
    const safe = summary.safe_balance;
    const tInc = summary.total_income;
    const tExp = summary.total_expense;
    const bInc = summary.building_income;
    const totalRequired = 27 * TARGET_BUILDING;
    const debt = totalRequired - bInc;
    const totalDonations = tInc - bInc;

    document.getElementById('dSafe').innerText = safe.toLocaleString();
    document.getElementById('dDebt').innerText = debt.toLocaleString();
    document.getElementById('dDonations').innerText =
      totalDonations.toLocaleString();
    document.getElementById('dExpTotal').innerText = tExp.toLocaleString();
    document.getElementById('legInc').innerText = tInc.toLocaleString();
    document.getElementById('legExp').innerText = tExp.toLocaleString();
    document.getElementById('legDebt').innerText = debt.toLocaleString();
    renderChart(tInc, tExp, debt);
  }
  loadFinancialReport();
  refreshBuildingsStatus();
  if (currentUser && currentUser.role === 'admin') {
    const { data: alertsData } = await _supa
      .from('expense_transactions')
      .select('*')
      .eq('category', 'alert');
    notifs = alertsData || [];
    updateBell();
  }
}

/* =========================================
   📊 دالة التقرير المالي (بتنسيق التاريخ الذكي)
   ========================================= */
async function loadFinancialReport() {
  const tableBody = document.getElementById('expTable');
  const loadBtn = document.getElementById('loadMoreBtn');

  if (loadBtn) loadBtn.style.display = 'none';
  tableBody.innerHTML =
    '<tr><td colspan="3" class="text-center">جاري تجميع البيانات... ⏳</td></tr>';

  // 👇 التعديل الجوهري هنا: دالة تنسيق ذكية ومدمجة
  const formatSmartDate = (dateStr) => {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2); // نأخذ آخر رقمين فقط (26) بدلاً من 2026

    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;

    // النتيجة: التاريخ فوق بخط واضح، والوقت تحته بخط رمادي صغير
    return `
        <div class="d-flex flex-column align-items-center" style="line-height: 1.1;">
            <span style="font-weight: 700; font-size: 11px; font-family: monospace;">${day}-${month}-${year}</span>
            <span style="font-size: 9px; color: var(--text-sub); font-family: monospace;">${hours}:${minutes} ${ampm}</span>
        </div>
        `;
  };

  try {
    const { data: incomeList } = await _supa
      .from('income_transactions')
      .select('*')
      .order('created_at', { ascending: false });
    const { data: expenseList } = await _supa
      .from('expense_transactions')
      .select('*')
      .neq('category', 'alert')
      .order('created_at', { ascending: false });

    let html = '';
    let totalInc = 0;
    let totalExp = 0;

    // --- 1. قسم المساهمات ---
    if (incomeList && incomeList.length > 0) {
      html += `<tr style="background: rgba(48, 209, 88, 0.2)"><td colspan="3" class="fw-bold text-success text-center small">📥 ملخص التحصيل</td></tr>`;

      let buildingTotals = {};
      let externalDonations = [];

      incomeList.forEach((item) => {
        totalInc += item.amount;
        if (item.building_id) {
          if (!buildingTotals[item.building_id])
            buildingTotals[item.building_id] = 0;
          buildingTotals[item.building_id] += item.amount;
        } else {
          externalDonations.push(item);
        }
      });

      // العمارات
      const sortedBuildings = Object.keys(buildingTotals).sort(
        (a, b) => parseInt(a) - parseInt(b)
      );
      sortedBuildings.forEach((bId) => {
        if (buildingTotals[bId] > 0) {
          html += `
                    <tr>
                        <td style="vertical-align: middle;">
                            <span class="badge bg-secondary text-white" style="font-size: 9px;">تراكمي</span>
                        </td>
                        <td class="fw-bold small" style="vertical-align: middle;">تحصيل عمارة ${bId}</td>
                        <td class="text-success fw-bold text-end" dir="ltr" style="vertical-align: middle;">+${buildingTotals[
                          bId
                        ].toLocaleString()}</td>
                    </tr>`;
        }
      });

      // التبرعات (استخدام التنسيق الجديد)
      externalDonations.forEach((item) => {
        html += `
                <tr>
                    <td style="width: 80px; vertical-align: middle;">${formatSmartDate(
                      item.created_at
                    )}</td>
                    <td class="small" style="vertical-align: middle;">${
                      item.notes || 'تبرع'
                    }</td>
                    <td class="text-success fw-bold text-end" dir="ltr" style="vertical-align: middle;">+${item.amount.toLocaleString()}</td>
                </tr>`;
      });

      html += `<tr style="border-top: 2px solid var(--success)"><td colspan="2" class="fw-bold text-end small">الإجمالي:</td><td class="fw-bold text-success bg-glass-green text-end" dir="ltr">${totalInc.toLocaleString()}</td></tr><tr><td colspan="3" style="height: 10px;"></td></tr>`;
    }

    // --- 2. قسم المصروفات ---
    if (expenseList && expenseList.length > 0) {
      html += `<tr style="background: rgba(255, 69, 58, 0.2)"><td colspan="3" class="fw-bold text-danger text-center small">📤 المصروفات</td></tr>`;

      expenseList.forEach((item) => {
        totalExp += item.amount;
        html += `
                <tr>
                    <td style="width: 80px; vertical-align: middle;">${formatSmartDate(
                      item.created_at
                    )}</td>
                    <td class="small" style="vertical-align: middle;">${
                      item.description || 'مصروف'
                    }</td>
                    <td class="text-danger fw-bold text-end" dir="ltr" style="vertical-align: middle;">-${item.amount.toLocaleString()}</td>
                </tr>`;
      });

      html += `<tr style="border-top: 2px solid var(--danger)"><td colspan="2" class="fw-bold text-end small">الإجمالي:</td><td class="fw-bold text-danger bg-glass-red text-end" dir="ltr">${totalExp.toLocaleString()}</td></tr>`;
    }

    // --- الصافي ---
    const net = totalInc - totalExp;
    const netColor = net >= 0 ? 'text-success' : 'text-danger';
    html += `
        <tr style="border-top: 4px double var(--text-main); height: 40px; vertical-align: middle;">
            <td colspan="2" class="fw-bold text-center">💰 الصافي الحالي</td>
            <td class="fw-bold fs-6 text-end ${netColor}" dir="ltr">${net.toLocaleString()}</td>
        </tr>`;

    tableBody.innerHTML = html;
  } catch (err) {
    console.error(err);
    tableBody.innerHTML =
      '<tr><td colspan="3" class="text-danger text-center">حدث خطأ</td></tr>';
  }
}

async function refreshBuildingsStatus() {
  const { data: inc } = await _supa
    .from('income_transactions')
    .select('building_id, amount, notes')
    .not('building_id', 'is', null);
  let buildings = {};
  for (let i = 1; i <= 27; i++) buildings[i] = { id: i, paid: 0, units: {} };
  if (inc)
    inc.forEach((t) => {
      buildings[t.building_id].paid += t.amount;
      if (t.notes && t.notes.includes('unit_')) {
        const u = parseInt(t.notes.split('unit_')[1]);
        buildings[t.building_id].units[u] =
          (buildings[t.building_id].units[u] || 0) + t.amount;
      }
    });
  localData = buildings;
  renderLeaderboard(buildings);
  renderBuildings(buildings);
  if (currentUser && currentUser.role === 'rep')
    updateRepStats(buildings[currentUser.bId]);
}

function renderChart(inc, exp, debt) {
  const ctx = document.getElementById('chart').getContext('2d');
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['محصل', 'مصروف', 'مديونية'],
      datasets: [
        {
          data: [inc, exp, debt],
          backgroundColor: ['#30D158', '#FF453A', '#0A84FF'],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
    },
  });
}

function renderBuildings(bData) {
  let h = '';
  for (let i = 1; i <= 27; i++) {
    const b = bData[i];
    const pct = (b.paid / TARGET_BUILDING) * 100;
    let color = 'text-muted',
      msg = 'بداية موفقة 🌱';
    if (pct >= 100) {
      color = 'text-success fw-bold';
      msg = 'ممتاز! 🏆';
    } else if (pct > 50) {
      color = 'text-warning fw-bold';
      msg = 'شد حيلك 💪';
    }
    const myClass =
      currentUser.role === 'rep' && currentUser.bId === i ? 'my-b' : '';
    const dot = pct >= 100 ? 'dot-green' : 'dot-red';
    h += `<div class="b-item ${myClass}" onclick="openB(${i})"><div class="mb-1"><span class="status-dot ${dot}"></span></div><div class="fw-bold">ع ${i}</div><div class="small fw-bold mt-1">${(
      b.paid / 1000
    ).toFixed(
      1
    )}k</div><div style="font-size:9px" class="${color} mt-1">${msg}</div></div>`;
  }
  document.getElementById('bGrid').innerHTML = h;
}

function renderLeaderboard(buildings) {
  const sorted = Object.values(buildings).sort((a, b) => b.paid - a.paid);
  let h = '';
  sorted.forEach((b, idx) => {
    let icon = `<span class="badge bg-secondary rounded-circle" style="width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:10px">${
      idx + 1
    }</span>`;
    if (idx === 0) icon = '🥇';
    if (idx === 1) icon = '🥈';
    if (idx === 2) icon = '🥉';
    const amtColor = idx < 3 ? 'text-warning' : 'text-primary';
    h += `<tr><td style="width:30px">${icon}</td><td>عمارة ${
      b.id
    }</td><td class="text-end fw-bold ${amtColor}">${b.paid.toLocaleString()}</td></tr>`;
  });
  document.getElementById('leaderboard').innerHTML = h;
}

function openB(id) {
  if (currentUser.role !== 'admin' && currentUser.bId !== id) {
    if (navigator.vibrate) navigator.vibrate(100);
    return alert('⛔ غير مسموح لك بدخول هذه العمارة');
  }
  const b = localData[id];
  document.getElementById('mTitle').innerText = 'عمارة ' + id;
  const TARGET_UNIT = TARGET_BUILDING / 24;
  let grid = '';
  for (let u = 1; u <= 24; u++) {
    const paid = b.units[u] || 0;
    const remaining = Math.max(0, TARGET_UNIT - paid);
    let cls = 'bg-red',
      txt = `عليه ${Math.ceil(remaining)}`;
    if (paid >= TARGET_UNIT - 0.5) {
      cls = 'bg-green';
      txt = 'خالص ✅';
    } else if (paid > 0) {
      cls = 'bg-yellow';
      txt = `باقي ${Math.ceil(remaining)}`;
    }
    grid += `<div class="unit-box ${cls}" onclick="pay(${id}, ${u})"><span>${u}</span><span class="u-txt">${txt}</span></div>`;
  }
  document.getElementById('mGrid').innerHTML = grid;
  const repAction = document.getElementById('repAction');
  if (currentUser.role === 'rep') repAction.style.display = 'block';
  else repAction.style.display = 'none';
  document.getElementById('notifyMsg').style.display = 'none';
  new bootstrap.Modal(document.getElementById('bModal')).show();
}

async function pay(bId, uId) {
  const amt = prompt(`دفع للشقة ${uId} (عمارة ${bId}):`);
  if (!amt) return;
  const note = `unit_${uId} - (${currentUser.name})`;
  await _supa
    .from('income_transactions')
    .insert({ building_id: bId, amount: amt, notes: note });
  alert('تم الحفظ!');
  refreshData();
  bootstrap.Modal.getInstance(document.getElementById('bModal')).hide();
}

async function markAllPaid() {
  if (!currentUser) return;
  const bId =
    currentUser.role === 'rep'
      ? currentUser.bId
      : parseInt(
          document.getElementById('mTitle').innerText.replace('عمارة ', '')
        );
  if (!confirm(`⚠️ هل أنت متأكد من تسجيل سداد كامل لشقق العمارة ${bId}؟`))
    return;
  const unitTarget = TARGET_BUILDING / 24;
  const buildingData = localData[bId];
  let transactions = [];
  for (let u = 1; u <= 24; u++) {
    const currentPaid = buildingData.units[u] || 0;
    const remaining = unitTarget - currentPaid;
    if (remaining > 0) {
      transactions.push({
        building_id: bId,
        amount: Math.ceil(remaining),
        notes: `unit_${u} - سداد كلي (${currentUser.name})`,
      });
    }
  }
  if (transactions.length === 0)
    return alert('✅ العمارة مسددة بالكامل بالفعل!');
  const { error } = await _supa
    .from('income_transactions')
    .insert(transactions);
  if (error) alert('حدث خطأ أثناء التسجيل');
  else {
    alert(`تم تسجيل ${transactions.length} عملية بنجاح!`);
    bootstrap.Modal.getInstance(document.getElementById('bModal')).hide();
    refreshData();
  }
}

async function saveDonation() {
  const desc = document.getElementById('donDesc').value;
  const amt = document.getElementById('donAmt').value;
  if (!desc || !amt) return alert('أكمل البيانات');
  const fullDesc = `تبرع/إيراد: ${desc} (${currentUser.name})`;
  await _supa
    .from('income_transactions')
    .insert({ building_id: null, amount: amt, notes: fullDesc });
  alert('تم إضافة الإيراد! 💰');
  document.getElementById('donDesc').value = '';
  document.getElementById('donAmt').value = '';
  refreshData();
}

async function saveExp() {
  const desc = document.getElementById('exDesc').value;
  const amt = document.getElementById('exAmt').value;
  const type = document.getElementById('exType').value;
  const fullDesc = `${desc} (${currentUser.name})`;
  let pl = { description: fullDesc, amount: amt, category: 'تشغيل' };
  if (type === 'general') pl.is_general = true;
  else {
    pl.is_general = false;
    pl.building_id = type;
  }
  await _supa.from('expense_transactions').insert(pl);
  alert('تم!');
  refreshData();
}

function fillExpSelect() {
  let h = '<option value="general">🌍 عام</option>';
  for (let i = 1; i <= 27; i++) h += `<option value="${i}">عمارة ${i}</option>`;
  document.getElementById('exType').innerHTML = h;
}

async function sendNotify() {
  const msg = `🔔 عمارة ${currentUser.bId} تبلغ بتمام التحصيل!`;
  await _supa.from('expense_transactions').insert({
    amount: 0,
    description: msg,
    category: 'alert',
    is_general: true,
  });
  document.getElementById('notifyMsg').style.display = 'block';
}

function updateBell() {
  const cnt = notifs.length;
  const b = document.getElementById('notifBadge');
  if (cnt > 0) {
    b.innerText = cnt;
    b.style.display = 'flex';
    document.getElementById('adminBell').classList.add('shake');
  } else {
    b.style.display = 'none';
    document.getElementById('adminBell').classList.remove('shake');
  }
}

window.showNotifs = async function () {
  if (notifs.length === 0) return alert('لا تنبيهات');
  let msg = '📢 التنبيهات:\n';
  notifs.forEach((n) => (msg += `- ${n.description}\n`));
  if (confirm(msg + '\n\n هل تريد مسح جميع التنبيهات؟')) {
    await _supa.from('expense_transactions').delete().eq('category', 'alert');
    alert('تم المسح');
    refreshData();
  }
};

// استبدل دالة loadPolls القديمة بهذه
async function loadPolls() {
  document.getElementById('votingSection').style.display = 'block';
  const container = document.getElementById('activePolls');

  const now = new Date().toISOString();
  const { data: polls } = await _supa
    .from('polls')
    .select('*')
    .eq('is_active', true)
    .gt('expires_at', now);

  if (!polls || polls.length === 0) {
    container.innerHTML =
      '<div class="text-center text-muted small">لا توجد تصويتات نشطة</div>';
    return;
  }

  let h = '';
  for (const poll of polls) {
    // نجلب اختيار المستخدم الحالي (إن وجد)
    const myChoice = await getMyVote(poll.id);

    h += `<div class="mb-3 pb-3 border-bottom" style="border-color:var(--border-glass)">
            <div class="fw-bold mb-3">${poll.question}</div>
            <div class="d-flex gap-2 justify-content-center flex-wrap">`;

    // رسم الأزرار
    poll.options.forEach((opt) => {
      // تحديد هل هذا الزر هو ما اختاره المستخدم؟
      let btnClass = 'btn-outline-primary';
      let icon = '';

      if (opt === myChoice) {
        btnClass = 'btn-primary shadow'; // تمييز الاختيار الحالي
        icon = '<i class="fas fa-check-circle me-1"></i>';
      } else if (opt === 'ممتنع') {
        btnClass = 'btn-outline-secondary'; // لون مختلف للممتنع
      }

      h += `<button onclick="castVote(${poll.id}, '${opt}')" 
              class="btn btn-sm ${btnClass} px-3 rounded-pill transition-all">
              ${icon}${opt}
            </button>`;
    });

    h += `</div>`;

    // رسالة توضيحية
    if (myChoice) {
      h += `<div class="text-center mt-2 small text-success">
                لقد اخترت: <b>${myChoice}</b> (يمكنك التغيير بالضغط على خيار آخر)
              </div>`;
    }

    h += `</div>`;
  }
  container.innerHTML = h;
}

// 👇 استبدل دالة getMyVote الحالية بهذه النسخة المصححة 👇
async function getMyVote(pollId) {
  if (!currentUser) return null;

  // تصحيح: لو أدمن نستخدم 0، لو مندوب نستخدم رقمه
  const safeBId = currentUser.role === 'admin' ? 0 : currentUser.bId;

  const { data } = await _supa
    .from('votes')
    .select('choice')
    .eq('poll_id', pollId)
    .eq('building_id', safeBId)
    .maybeSingle();

  return data ? data.choice : null;
}

// استبدل دالة castVote القديمة بهذه
// 👇 استبدل دالة castVote الحالية بهذه النسخة المعدلة 👇
// 👇 استبدل دالة castVote الحالية بهذه النسخة المصححة 👇
async function castVote(pollId, choice) {
  // تصحيح: لو أدمن نستخدم 0، لو مندوب نستخدم رقمه
  const safeBId = currentUser.role === 'admin' ? 0 : currentUser.bId;

  // 1. البحث هل صوتت من قبل؟
  const { data: existingVote } = await _supa
    .from('votes')
    .select('id')
    .eq('poll_id', pollId)
    .eq('building_id', safeBId)
    .maybeSingle();

  let error;

  if (existingVote) {
    // 🔄 سيناريو التغيير (Update)
    if (!confirm(`هل تريد تغيير تصويتك السابق إلى "${choice}"؟`)) return;

    const res = await _supa
      .from('votes')
      .update({ choice: choice })
      .eq('id', existingVote.id);
    error = res.error;
  } else {
    // ➕ سيناريو جديد (Insert)
    if (!confirm(`تأكيد اختيارك: "${choice}"؟`)) return;

    const res = await _supa.from('votes').insert({
      poll_id: pollId,
      building_id: safeBId, // هنا نضمن إرسال 0 للأدمن بدلاً من null
      unit_id: 0,
      choice: choice,
    });
    error = res.error;
  }

  if (error) {
    console.error(error);
    alert('حدث خطأ أثناء التصويت، حاول مجدداً');
  } else {
    alert('✅ تم تسجيل صوتك بنجاح!');
    loadPolls(); // تحديث الأزرار
    loadPollResults(); // تحديث النتائج
  }
}

// استبدل دالة createNewPoll القديمة بهذه
async function createNewPoll() {
  const q = document.getElementById('newPollQ').value;
  const hours = parseInt(document.getElementById('pollDuration').value);

  if (!q) return alert('اكتب السؤال أولاً');
  if (!confirm('نشر التصويت؟')) return;

  const expiryDate = new Date();
  expiryDate.setHours(expiryDate.getHours() + hours);

  // إغلاق القديم
  await _supa.from('polls').update({ is_active: false }).neq('id', 0);

  // نشر الجديد مع خيار "ممتنع"
  const { error } = await _supa.from('polls').insert({
    question: q,
    // 👇 هنا تمت الإضافة
    options: ['نعم', 'لا', 'ممتنع'],
    is_active: true,
    expires_at: expiryDate.toISOString(),
  });

  if (error) alert('خطأ في النشر');
  else {
    alert('✅ تم نشر التصويت مع خيار الامتناع');
    document.getElementById('newPollQ').value = '';
    refreshData();
  }
}

async function loadPollResults() {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 24);
  const { data: polls } = await _supa
    .from('polls')
    .select('*')
    .eq('is_active', true)
    .gt('expires_at', cutoff.toISOString())
    .limit(1);
  if (!polls || polls.length === 0) {
    document.getElementById('pollResultsCard').style.display = 'none';
    return;
  }
  const poll = polls[0];
  document.getElementById('pollResultsCard').style.display = 'block';
  document.getElementById('pollQuestionTitle').innerText = poll.question;
  const isExpired = new Date(poll.expires_at) < new Date();
  const header = document.getElementById('pollHeader');
  const action = document.getElementById('pollActionArea');
  if (isExpired) {
    header.innerHTML = `<h6 class="fw-bold text-muted">تصويت منتهي 🏁</h6>`;
    action.style.display = 'none';
  } else {
    header.innerHTML = `<h6 class="fw-bold"><i class="fas fa-vote-yea me-2 text-primary"></i>تصويت المجتمع <span class="badge bg-danger">مباشر 🔴</span></h6>`;
    action.style.display = 'block';
  }
  const { data: votes } = await _supa
    .from('votes')
    .select('choice')
    .eq('poll_id', poll.id);
  const total = votes.length;
  let counts = {};
  poll.options.forEach((opt) => (counts[opt] = 0));
  votes.forEach((v) => (counts[v.choice] = (counts[v.choice] || 0) + 1));
  let h = '';
  poll.options.forEach((opt) => {
    const c = counts[opt] || 0;
    const pct = total === 0 ? 0 : Math.round((c / total) * 100);
    const color = opt === 'نعم' ? 'bg-success' : 'bg-danger';
    h += `<div class="mb-2" style="opacity:${
      isExpired ? 0.6 : 1
    }"><div class="d-flex justify-content-between small mb-1"><span>${opt}</span><span class="fw-bold">${pct}% (${c})</span></div><div class="progress" style="height:8px"><div class="progress-bar ${color}" style="width:${pct}%"></div></div></div>`;
  });
  document.getElementById('pollBarsSpace').innerHTML = h;
}

async function deleteCurrentPoll() {
  if (!confirm('حذف السؤال الحالي نهائياً؟')) return;
  const { data } = await _supa
    .from('polls')
    .select('id')
    .eq('is_active', true)
    .limit(1);
  if (!data || data.length === 0) return alert('لا يوجد سؤال نشط');
  await _supa.from('votes').delete().eq('poll_id', data[0].id);
  await _supa.from('polls').delete().eq('id', data[0].id);
  alert('تم الحذف');
  refreshData();
  loadPolls();
}

async function promptChangePassword() {
  if (!currentUser) return;
  const newPass = prompt('أدخل كلمة المرور الجديدة:');
  if (!newPass || newPass.length < 3) return alert('كلمة المرور ضعيفة');
  const { error } = await _supa
    .from('app_users')
    .update({ password: newPass })
    .eq('id', currentUser.id);
  if (error) alert('خطأ');
  else alert('✅ تم التغيير');
}

window.toggleBIdField = function () {
  const role = document.getElementById('newRole').value;
  const field = document.getElementById('newBId');
  if (role === 'admin') {
    field.style.display = 'none';
    field.value = 0;
  } else field.style.display = 'block';
};

async function addNewUser() {
  const u = document.getElementById('newUsername').value.trim().toLowerCase();
  const p = document.getElementById('newPassword').value.trim();
  const name = document.getElementById('newName').value.trim();
  const role = document.getElementById('newRole').value;
  let bId = document.getElementById('newBId').value;
  if (!u || !p || !name) return alert('أكمل البيانات');
  if (role === 'rep' && !bId) return alert('حدد رقم العمارة');
  const { data: exist } = await _supa
    .from('app_users')
    .select('id')
    .eq('username', u);
  if (exist.length > 0) return alert('اسم المستخدم موجود بالفعل');
  const { error } = await _supa.from('app_users').insert({
    username: u,
    password: p,
    name: name,
    role: role,
    building_id: bId ? parseInt(bId) : null,
  });
  if (error) alert('خطأ');
  else {
    alert(`✅ تم إضافة: ${name}`);
    document.getElementById('newUsername').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('newName').value = '';
  }
}

function updateTarget() {
  const val = document.getElementById('targetInput').value;
  if (!val) return;
  if (confirm(`تغيير المستهدف لـ ${val}؟`)) {
    localStorage.setItem('sakanTarget', val);
    TARGET_BUILDING = parseInt(val);
    alert('✅ تم التحديث');
    refreshData();
  }
}

/* =========================================
   📥 تصدير الإكسيل (مطابق للتقرير التجميعي + تواريخ إنجليزي)
   ========================================= */
window.exportXLS = async function () {
  if (!confirm('تحميل تقرير إكسيل مطابق للمعروض؟')) return;

  // 1. جلب البيانات
  const { data: incomeList } = await _supa
    .from('income_transactions')
    .select('*')
    .order('created_at', { ascending: false });
  const { data: expenseList } = await _supa
    .from('expense_transactions')
    .select('*')
    .neq('category', 'alert')
    .order('created_at', { ascending: false });

  // 2. تجهيز البيانات للتجميع
  let buildingTotals = {};
  let externalDonations = [];
  let finalData = [];

  // دالة لتنسيق التاريخ والوقت بالشكل المطلوب (إنجليزي)
  // Format: 23-01-2026 2:48 PM
  const formatDateTimeEn = (dateStr) => {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // الساعة 0 تكون 12

    return `${day}-${month}-${year} ${hours}:${minutes} ${ampm}`;
  };

  // --- معالجة المساهمات (Income) ---
  if (incomeList) {
    incomeList.forEach((item) => {
      if (item.building_id) {
        // تجميع العمارات
        if (!buildingTotals[item.building_id]) {
          buildingTotals[item.building_id] = 0;
        }
        buildingTotals[item.building_id] += item.amount;
      } else {
        // التبرعات الخارجية تبقى منفصلة
        externalDonations.push(item);
      }
    });
  }

  // أ) إضافة العمارات المجمعة لملف الإكسيل
  // نستخدم تاريخ اليوم ووقت التحميل لأنه "تجميعي"
  const currentDateTime = formatDateTimeEn(new Date());
  const sortedBuildings = Object.keys(buildingTotals).sort(
    (a, b) => parseInt(a) - parseInt(b)
  );

  sortedBuildings.forEach((bId) => {
    finalData.push({
      'Date & Time': currentDateTime, // تاريخ التحميل لأنه رصيد تراكمي
      Category: 'تجميعي عمارات',
      Description: `إجمالي تحصيل عمارة ${bId}`,
      Amount: buildingTotals[bId],
      Type: 'Income',
    });
  });

  // ب) إضافة التبرعات الخارجية (بتواريخها الأصلية)
  externalDonations.forEach((item) => {
    finalData.push({
      'Date & Time': formatDateTimeEn(item.created_at),
      Category: 'تبرع خارجي',
      Description: item.notes || 'تبرع',
      Amount: item.amount,
      Type: 'Income',
    });
  });

  // ج) إضافة المصروفات (Expenses)
  if (expenseList) {
    expenseList.forEach((item) => {
      finalData.push({
        'Date & Time': formatDateTimeEn(item.created_at),
        Category: 'مصروفات',
        Description: item.description,
        Amount: -item.amount, // بالسالب
        Type: 'Expense',
      });
    });
  }

  // 3. إنشاء الملف
  const ws = XLSX.utils.json_to_sheet(finalData);

  // تنسيق عرض الأعمدة (اختياري لتحسين الشكل)
  const wscols = [
    { wch: 25 }, // Date width
    { wch: 15 }, // Category
    { wch: 40 }, // Description
    { wch: 15 }, // Amount
    { wch: 10 }, // Type
  ];
  ws['!cols'] = wscols;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Financial Report');

  // اسم الملف مع التاريخ الإنجليزي
  const fileNameDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  XLSX.writeFile(wb, `SakanMiser8_Report_${fileNameDate}.xlsx`);
};

function fillResetChecks() {
  let h = '';
  for (let i = 1; i <= 27; i++) {
    h += `<div class="check-item"><input type="checkbox" value="${i}" class="reset-check"><label>ع ${i}</label></div>`;
  }
  document.getElementById('resetCheckGrid').innerHTML = h;
}

async function resetSystem() {
  if (
    !confirm('تحذير: مسح النظام بالكامل؟') ||
    prompt("اكتب 'تأكيد'") !== 'تأكيد'
  )
    return;
  await _supa.from('income_transactions').delete().neq('id', 0);
  await _supa.from('expense_transactions').delete().neq('id', 0);
  alert('تم التصفير');
  refreshData();
}

async function resetSelected() {
  const checks = document.querySelectorAll('.reset-check:checked');
  if (checks.length === 0) return alert('اختر عمارات');
  if (!confirm(`تصفير ${checks.length} عمارات؟`)) return;
  const ids = Array.from(checks).map((c) => parseInt(c.value));
  await _supa.from('income_transactions').delete().in('building_id', ids);
  alert('تم');
  refreshData();
}

async function resetMyBuilding() {
  if (!confirm('تصفير عمارتك؟')) return;
  await _supa
    .from('income_transactions')
    .delete()
    .eq('building_id', currentUser.bId);
  alert('تم');
  refreshData();
}

async function backupSystem() {
  if (!confirm('تحميل نسخة؟')) return;
  const { data: inc } = await _supa.from('income_transactions').select('*');
  const { data: exp } = await _supa.from('expense_transactions').select('*');
  const blob = new Blob(
    [JSON.stringify({ income: inc, expense: exp, date: new Date() })],
    { type: 'application/json' }
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}

async function restoreSystem(input) {
  if (!input.files[0] || !confirm('استبدال البيانات؟')) return;
  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      const d = JSON.parse(e.target.result);
      await _supa.from('income_transactions').delete().neq('id', 0);
      await _supa.from('expense_transactions').delete().neq('id', 0);
      if (d.income.length)
        await _supa
          .from('income_transactions')
          .insert(d.income.map(({ id, ...r }) => r));
      if (d.expense.length)
        await _supa
          .from('expense_transactions')
          .insert(d.expense.map(({ id, ...r }) => r));
      alert('تمت الاستعادة');
      location.reload();
    } catch (err) {
      alert('ملف تالف');
    }
  };
  reader.readAsText(input.files[0]);
}

function goTab(tId, btn) {
  document
    .querySelectorAll('[id^="tab-"]')
    .forEach((d) => (d.style.display = 'none'));
  document
    .querySelectorAll('.tab-item')
    .forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-' + tId).style.display = 'block';
}

function updateRepStats(bData) {
  let unitsArr = [];
  for (let u = 1; u <= 24; u++)
    unitsArr.push({ u: u, paid: bData.units[u] || 0 });
  unitsArr.sort((a, b) => b.paid - a.paid);
  let topH = '';
  unitsArr
    .slice(0, 5)
    .forEach(
      (x) =>
        (topH += `<tr><td>شقة ${x.u}</td><td class="text-success fw-bold">${x.paid}</td></tr>`)
    );
  document.getElementById('topUnits').innerHTML = topH;
  unitsArr.sort((a, b) => a.paid - b.paid);
  let lazyH = '';
  unitsArr
    .slice(0, 5)
    .forEach(
      (x) =>
        (lazyH += `<tr><td>شقة ${x.u}</td><td class="text-danger fw-bold">${x.paid}</td></tr>`)
    );
  document.getElementById('lazyUnits').innerHTML = lazyH;
}
/* =========================================
   🚀 كود الدخول الأوتوماتيكي بالبصمة
   ضعه في نهاية ملف script.js
   ========================================= */

// 1. استرجاع الدخول السابق (عشان مخرجش لو عملت ريفريش)
// 1. استرجاع الدخول السابق (تم التصحيح لتشغيل الأنيميشن بسلاسة)
window.addEventListener('load', () => {
  const savedUser = localStorage.getItem('sakanUser');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    if (!_supa) _supa = window.supabase.createClient(DB_URL, DB_KEY);

    // 👇 لاحظ هنا: لقد حذفت الأسطر التي كانت تظهر التطبيق والناف بار يدوياً
    // (app.style.display = 'block' و navBar.style.display = 'flex')
    // لأننا لا نريد ظهورهم فوراً، بل نريدهم أن يظهروا من خلال الأنيميشن

    document.getElementById('roleDisplay').innerText = currentUser.name;
    document.getElementById('targetInput').value = TARGET_BUILDING;

    // 👇 هذا السطر هو "المايسترو" الجديد الذي سيظهر التطبيق بشكل سينمائي
    playEntryAnimation();

    setupUIForUser();
    refreshData();
  }
});

// 2. مراقبة البصمة للدخول التلقائي
const passField = document.getElementById('passInput');
const userField = document.getElementById('userInput');
let autoLoginTimer;

// هل خرجنا للتو؟
const isJustLoggedOut = sessionStorage.getItem('justLoggedOut');

if (passField) {
  // لو إحنا لسه خارجين، هنمسح العلامة عشان المرة الجاية يدخل عادي
  // لكن المرة دي مش هنعمل Auto Login
  if (isJustLoggedOut) {
    sessionStorage.removeItem('justLoggedOut');
  } else {
    // الكود الطبيعي: أي تغيير في الباسورد (كتابة أو بصمة) يدخلنا
    ['input', 'change'].forEach((evt) =>
      passField.addEventListener(evt, () => {
        clearTimeout(autoLoginTimer);
        if (userField.value && passField.value.length > 1) {
          const btn = document.querySelector('.login-btn');
          if (btn) btn.innerText = 'جاري الدخول... 🔓';
          autoLoginTimer = setTimeout(() => login(), 800);
        }
      })
    );

    // فحص إضافي للآيفون (لو مش خارجين للتو)
    setTimeout(() => {
      if (userField.value && passField.value) login();
    }, 1000);
  }
}
function playEntryAnimation() {
  const splash = document.getElementById('splashScreen');
  const app = document.getElementById('app');
  const nav = document.getElementById('navBar');

  // إخفاء شاشة الدخول وإظهار شاشة التحميل
  document.getElementById('loginScreen').style.display = 'none';
  splash.style.display = 'flex';

  // تحضير التطبيق (مخفي)
  app.style.display = 'block';
  nav.style.display = 'flex';
  app.classList.add('animate-enter');
  nav.classList.add('animate-enter');

  // بعد 0.8 ثانية.. ابدأ الدخول
  setTimeout(() => {
    splash.style.opacity = '0'; // اخفاء اللوجو
    setTimeout(() => {
      splash.style.display = 'none'; // حذف اللوجو

      // دخول التطبيق
      app.classList.add('animate-visible');
      app.classList.remove('animate-enter');

      // دخول الشريط بتأخير بسيط
      setTimeout(() => {
        nav.classList.add('animate-visible');
        nav.classList.remove('animate-enter');
      }, 150);
    }, 500);
  }, 800);
}
