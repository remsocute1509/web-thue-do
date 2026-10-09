/* ========================================================
   MOCHIMOON - AESTHETIC DASHBOARD JAVASCRIPT LOGIC
   ======================================================== */

// Default State synchronized with real current date and time
const initialNow = new Date();

const appState = {
  selectedDate: initialNow, // Ngày hiện tại thực tế
  currentCalendarMonth: initialNow.getMonth(), // Tháng hiện tại thực tế
  currentCalendarYear: initialNow.getFullYear(), // Năm hiện tại thực tế
  clockMode: 'live', // Mặc định chạy giờ thực tế ('live')
  timeFormat: '24', // '24' hoặc '12'
  soundEnabled: true,
  tasks: [
    { id: 1, text: 'Faire les courses', completed: true },
    { id: 2, text: 'Travailler sur le projet', completed: true },
    { id: 3, text: 'Lire pendant 30 min', completed: true },
    { id: 4, text: 'Méditer 10 minutes', completed: true },
    { id: 5, text: 'Arroser les plantes 🌸', completed: false }
  ],
  bookings: [
    {
      id: 1,
      character: '⚡ Raiden Shogun (Genshin Impact)',
      customerName: 'Nguyễn Lan Anh',
      phone: '0912***456',
      date: '10/10/2026',
      duration: '2 ngày',
      status: 'Sẵn sàng lấy đồ 🌸'
    },
    {
      id: 2,
      character: '🪄 Frieren (Sousou no Frieren)',
      customerName: 'Trần Minh Quân',
      phone: '0988***789',
      date: '12/10/2026',
      duration: '1 ngày',
      status: 'Đã xác nhận ✨'
    }
  ],
  bgm: {
    isPlaying: false,
    currentTrackId: 'sakura',
    currentTrackName: '🌸 Sakura Chill Lofi',
    volume: 0.7,
    isCustomAudio: false,
    customAudioUrl: null,
    customAudioName: ''
  }
};

// ========================================================
// 1. INITIALIZATION & LOCAL STORAGE
// ========================================================
document.addEventListener('DOMContentLoaded', () => {
  loadSavedState();
  initSakuraPetals();
  initClock();
  initCalendar();
  renderTodoList();
  initEventListeners();
  initHealthTab();
  initCosplayBooking();
  initBackgroundMusicPlayer();
});

function loadSavedState() {
  const savedTasks = localStorage.getItem('jiu_tasks');
  if (savedTasks) {
    try {
      appState.tasks = JSON.parse(savedTasks);
    } catch (e) {
      console.error(e);
    }
  }

  const savedBookings = localStorage.getItem('mochimoon_bookings');
  if (savedBookings) {
    try {
      appState.bookings = JSON.parse(savedBookings);
    } catch (e) {
      console.error(e);
    }
  }

  const savedTheme = localStorage.getItem('jiu_theme');
  if (savedTheme) {
    document.body.className = savedTheme === 'pastel-dream' ? '' : `theme-${savedTheme}`;
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) themeSelect.value = savedTheme;
  }

  const savedAvatar = localStorage.getItem('jiu_custom_avatar');
  if (savedAvatar) {
    const userAvatar = document.getElementById('userAvatar');
    if (userAvatar) userAvatar.src = savedAvatar;
  }

  const savedClockMode = localStorage.getItem('jiu_clock_mode');
  if (savedClockMode) {
    appState.clockMode = savedClockMode;
  } else {
    appState.clockMode = 'live';
  }
  const clockSyncSelect = document.getElementById('clockSyncSelect');
  if (clockSyncSelect) clockSyncSelect.value = appState.clockMode;
}

function saveTasksState() {
  localStorage.setItem('jiu_tasks', JSON.stringify(appState.tasks));
}

// ========================================================
// 2. SAKURA PETALS BACKGROUND ANIMATION
// ========================================================
function initSakuraPetals() {
  const container = document.getElementById('sakuraContainer');
  if (!container) return;

  const petalCount = 18;
  for (let i = 0; i < petalCount; i++) {
    createPetal(container);
  }
}

function createPetal(container) {
  const petal = document.createElement('div');
  petal.classList.add('sakura-petal');

  const size = Math.random() * 9 + 8; // 8px - 17px
  const startLeft = Math.random() * 100;
  const duration = Math.random() * 9 + 8; // 8s - 17s
  const delay = Math.random() * 8;

  petal.style.width = `${size}px`;
  petal.style.height = `${size * 1.3}px`;
  petal.style.left = `${startLeft}%`;
  petal.style.animationDuration = `${duration}s`;
  petal.style.animationDelay = `${delay}s`;

  container.appendChild(petal);
}

// ========================================================
// 3. CLOCK LOGIC (LIVE & MOCK)
// ========================================================
function initClock() {
  updateClockDisplay();
  setInterval(updateClockDisplay, 1000);
}

function updateClockDisplay() {
  const clockEl = document.getElementById('clockDisplay');
  const greetingEl = document.getElementById('greetingText');
  if (!clockEl) return;

  if (appState.clockMode === 'mock') {
    clockEl.textContent = '14:53';
    if (greetingEl) {
      greetingEl.innerHTML = `Welcome to mochimoon <span class="sakura-badge">🌸</span>`;
    }
    return;
  }

  const now = new Date();
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');

  // Greeting welcoming title
  if (greetingEl) {
    greetingEl.innerHTML = `Welcome to mochimoon <span class="sakura-badge">🌸</span>`;
  }

  if (appState.timeFormat === '12') {
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    clockEl.textContent = `${String(displayHours).padStart(2, '0')}:${minutes} ${ampm}`;
  } else {
    clockEl.textContent = `${String(hours).padStart(2, '0')}:${minutes}`;
  }

  const dateBadgeEl = document.getElementById('clockDateBadge');
  if (dateBadgeEl) {
    const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    const dayName = dayNames[now.getDay()];
    dateBadgeEl.textContent = `🌸 ${dayName}, ${d}/${m}/${y}`;
  }
}

// ========================================================
// 4. CALENDAR LOGIC
// ========================================================
const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function initCalendar() {
  renderCalendar();

  const prevBtn = document.getElementById('prevMonthBtn');
  const nextBtn = document.getElementById('nextMonthBtn');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      appState.currentCalendarMonth--;
      if (appState.currentCalendarMonth < 0) {
        appState.currentCalendarMonth = 11;
        appState.currentCalendarYear--;
      }
      playChime(420);
      renderCalendar();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      appState.currentCalendarMonth++;
      if (appState.currentCalendarMonth > 11) {
        appState.currentCalendarMonth = 0;
        appState.currentCalendarYear++;
      }
      playChime(520);
      renderCalendar();
    });
  }
}

function renderCalendar() {
  const monthYearEl = document.getElementById('calendarMonthYear');
  const daysContainer = document.getElementById('calendarDays');
  if (!monthYearEl || !daysContainer) return;

  const year = appState.currentCalendarYear;
  const month = appState.currentCalendarMonth;

  monthYearEl.textContent = `${monthNames[month]} ${year}`;
  daysContainer.innerHTML = '';

  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Empty leading slots
  for (let i = 0; i < firstDayIndex; i++) {
    const emptySlot = document.createElement('div');
    emptySlot.className = 'cal-day empty';
    daysContainer.appendChild(emptySlot);
  }

  // Days in month
  const today = new Date();
  for (let day = 1; day <= daysInMonth; day++) {
    const dayBtn = document.createElement('div');
    dayBtn.className = 'cal-day';
    dayBtn.textContent = day;

    // Check if this is the selected date
    const isSelected =
      appState.selectedDate.getDate() === day &&
      appState.selectedDate.getMonth() === month &&
      appState.selectedDate.getFullYear() === year;

    if (isSelected) {
      dayBtn.classList.add('active');
    }

    // Check if it's today
    if (
      today.getDate() === day &&
      today.getMonth() === month &&
      today.getFullYear() === year
    ) {
      dayBtn.classList.add('today');
    }

    dayBtn.addEventListener('click', () => {
      appState.selectedDate = new Date(year, month, day);
      updateSelectedDateDisplay();
      syncBookingDateInput(year, month, day);
      playChime(660);
      renderCalendar();
    });

    daysContainer.appendChild(dayBtn);
  }

  updateSelectedDateDisplay();
}

function updateSelectedDateDisplay() {
  const dateDisplay = document.getElementById('selectedDateDisplay');
  if (!dateDisplay) return;

  const d = String(appState.selectedDate.getDate()).padStart(2, '0');
  const m = String(appState.selectedDate.getMonth() + 1).padStart(2, '0');
  const y = appState.selectedDate.getFullYear();

  dateDisplay.textContent = `${d}/${m}/${y}`;
}

// ========================================================
// 5. TO-DO LIST & PROGRESS BAR
// ========================================================
function renderTodoList(filterText = '') {
  const listEl = document.getElementById('todoList');
  if (!listEl) return;

  listEl.innerHTML = '';

  const filteredTasks = appState.tasks.filter(t =>
    t.text.toLowerCase().includes(filterText.toLowerCase())
  );

  if (filteredTasks.length === 0) {
    const emptyMsg = document.createElement('li');
    emptyMsg.style.textAlign = 'center';
    emptyMsg.style.padding = '12px';
    emptyMsg.style.color = 'var(--text-subtle)';
    emptyMsg.style.fontSize = '13.5px';
    emptyMsg.textContent = 'Không có nhiệm vụ nào 🌸';
    listEl.appendChild(emptyMsg);
  }

  filteredTasks.forEach(task => {
    const li = document.createElement('li');
    li.className = `todo-item ${task.completed ? 'completed' : ''}`;

    li.innerHTML = `
      <div class="todo-left" data-id="${task.id}">
        <div class="custom-checkbox">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <span class="todo-text">${escapeHtml(task.text)}</span>
      </div>
      <div class="todo-actions">
        <span class="todo-check-indicator">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </span>
        <button class="todo-delete-btn" data-id="${task.id}" title="Xóa nhiệm vụ" aria-label="Xóa">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;

    // Toggle Task
    const leftEl = li.querySelector('.todo-left');
    leftEl.addEventListener('click', () => {
      toggleTask(task.id);
    });

    // Delete Task
    const delBtn = li.querySelector('.todo-delete-btn');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTask(task.id);
    });

    listEl.appendChild(li);
  });

  updateProgressCalculations();
}

function toggleTask(id) {
  const task = appState.tasks.find(t => t.id === id);
  if (task) {
    task.completed = !task.completed;
    saveTasksState();
    if (task.completed) {
      playSuccessChime();
    } else {
      playChime(350);
    }
    renderTodoList(document.getElementById('searchInput')?.value || '');
  }
}

function deleteTask(id) {
  appState.tasks = appState.tasks.filter(t => t.id !== id);
  saveTasksState();
  playChime(280);
  renderTodoList(document.getElementById('searchInput')?.value || '');
}

function updateProgressCalculations() {
  const total = appState.tasks.length;
  const completed = appState.tasks.filter(t => t.completed).length;

  let percent = 0;
  if (total > 0) {
    percent = Math.round((completed / total) * 100);
  }

  // Update Summary on To-do Card footer
  const summaryText = document.getElementById('todoSummaryPercent');
  if (summaryText) {
    summaryText.textContent = `${percent}% completed`;
  }

  // Update Progress Card Bar & Label
  const fillBar = document.getElementById('progressBarFill');
  const percentLabel = document.getElementById('progressBarPercent');

  if (fillBar) {
    fillBar.style.width = `${percent}%`;
  }

  if (percentLabel) {
    percentLabel.textContent = `${percent}% completed`;
  }
}

// ========================================================
// 6. EVENT LISTENERS
// ========================================================
function initEventListeners() {
  // To-do Form Submit
  const todoForm = document.getElementById('todoForm');
  const todoInput = document.getElementById('todoInput');

  if (todoForm && todoInput) {
    todoForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = todoInput.value.trim();
      if (!val) return;

      const newTask = {
        id: Date.now(),
        text: val,
        completed: false
      };

      appState.tasks.push(newTask);
      saveTasksState();
      todoInput.value = '';
      playSuccessChime();
      renderTodoList();
    });
  }

  // Search Bar Filter
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderTodoList(e.target.value);
    });
  }

  // Sidebar Nav Tabs
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      const targetTab = item.getAttribute('data-tab');
      tabPanes.forEach(pane => {
        pane.classList.remove('active');
      });

      if (targetTab === 'tracker') {
        document.getElementById('tabDailyTracker')?.classList.add('active');
      } else if (targetTab === 'health') {
        document.getElementById('tabHealth')?.classList.add('active');
      } else if (targetTab === 'hobbies') {
        document.getElementById('tabHobbies')?.classList.add('active');
      } else if (targetTab === 'wardrobe') {
        document.getElementById('tabWardrobe')?.classList.add('active');
      }

      playChime(480);
    });
  });

  // Notification Dropdown Toggle & Notification Switch
  const notifBtn = document.getElementById('notifBtn');
  const notifDropdown = document.getElementById('notifDropdown');
  const clearNotifs = document.getElementById('clearNotifs');
  const closeNotifBtn = document.getElementById('closeNotifBtn');
  const notifSwitchToggle = document.getElementById('notifSwitchToggle');
  const notifBadge = document.getElementById('notifBadge');

  if (notifBtn && notifDropdown) {
    // Toggle on bell click
    notifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isClosed = notifDropdown.classList.contains('hidden');
      if (isClosed) {
        notifDropdown.classList.remove('hidden');
        playChime(560);
      } else {
        notifDropdown.classList.add('hidden');
        playChime(420);
      }
    });

    // Close button
    if (closeNotifBtn) {
      closeNotifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notifDropdown.classList.add('hidden');
        playChime(380);
      });
    }

    // Don't close when clicking inside the dropdown
    notifDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!notifDropdown.contains(e.target) && !notifBtn.contains(e.target)) {
        notifDropdown.classList.add('hidden');
      }
    });

    if (clearNotifs) {
      clearNotifs.addEventListener('click', () => {
        document.querySelectorAll('.notif-item').forEach(i => i.classList.remove('unread'));
        if (notifBadge) notifBadge.style.display = 'none';
        playSuccessChime();
      });
    }

    // Switch toggle on/off notifications
    if (notifSwitchToggle) {
      const savedPref = localStorage.getItem('jiu_notif_enabled');
      if (savedPref !== null) {
        const isEnabled = savedPref === 'true';
        notifSwitchToggle.checked = isEnabled;
        if (notifBadge) notifBadge.style.display = isEnabled ? 'block' : 'none';
      }

      notifSwitchToggle.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        localStorage.setItem('jiu_notif_enabled', isEnabled);
        if (notifBadge) notifBadge.style.display = isEnabled ? 'block' : 'none';
        playChime(isEnabled ? 660 : 330);
      });
    }
  }

  // Avatar Upload from Computer
  const userProfileBtn = document.getElementById('userProfileBtn');
  const avatarFileInput = document.getElementById('avatarFileInput');
  const userAvatar = document.getElementById('userAvatar');

  if (userProfileBtn && avatarFileInput) {
    userProfileBtn.addEventListener('click', () => {
      avatarFileInput.click();
    });

    avatarFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        if (!file.type.startsWith('image/')) {
          alert('Vui lòng chọn một tệp hình ảnh hợp lệ (PNG, JPG, WebP...)');
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          const base64Data = event.target.result;
          if (userAvatar) {
            userAvatar.src = base64Data;
          }
          try {
            localStorage.setItem('jiu_custom_avatar', base64Data);
          } catch (err) {
            console.warn('Image size too large for localStorage', err);
          }
          playSuccessChime();
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Settings Modal
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');

  if (settingsBtn && settingsModal) {
    settingsBtn.addEventListener('click', () => {
      settingsModal.classList.remove('hidden');
      playChime(500);
    });

    if (closeSettingsBtn) {
      closeSettingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
      });
    }

    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) {
        settingsModal.classList.add('hidden');
      }
    });

    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', () => {
        const theme = document.getElementById('themeSelect').value;
        const clockMode = document.getElementById('clockSyncSelect').value;
        const timeFormat = document.getElementById('timeFormatSelect').value;
        const soundChecked = document.getElementById('soundToggleCheck').checked;

        document.body.className = theme === 'pastel-dream' ? '' : `theme-${theme}`;
        localStorage.setItem('jiu_theme', theme);

        appState.clockMode = clockMode;
        appState.timeFormat = timeFormat;
        appState.soundEnabled = soundChecked;
        localStorage.setItem('jiu_clock_mode', clockMode);

        updateClockDisplay();
        settingsModal.classList.add('hidden');
        playSuccessChime();
      });
    }
  }

  // Audio Toggle Button
  const audioBtn = document.getElementById('audioToggleBtn');
  if (audioBtn) {
    audioBtn.addEventListener('click', () => {
      appState.soundEnabled = !appState.soundEnabled;
      const icon = document.getElementById('audioIcon');
      if (icon) {
        icon.textContent = appState.soundEnabled ? '✨' : '🔇';
      }
      if (appState.soundEnabled) {
        playSuccessChime();
      }
    });
  }

  // Play Lo-fi demo melody
  const lofiBtn = document.getElementById('playLofiDemo');
  if (lofiBtn) {
    lofiBtn.addEventListener('click', () => {
      playLofiMelody();
    });
  }
}

// ========================================================
// 7. HEALTH TAB DEMO INTERACTION
// ========================================================
function initHealthTab() {
  const glassesContainer = document.getElementById('waterGlasses');
  const waterStat = document.getElementById('waterStat');
  if (!glassesContainer) return;

  const totalGlasses = 8;
  let filledCount = 6;

  function renderGlasses() {
    glassesContainer.innerHTML = '';
    for (let i = 1; i <= totalGlasses; i++) {
      const g = document.createElement('div');
      g.className = `glass-item ${i <= filledCount ? 'full' : ''}`;
      g.textContent = '💧';
      g.addEventListener('click', () => {
        filledCount = i === filledCount ? i - 1 : i;
        if (waterStat) {
          waterStat.textContent = `${filledCount} / ${totalGlasses} ly hôm nay (${(filledCount * 0.25).toFixed(1)}L)`;
        }
        playChime(400 + filledCount * 40);
        renderGlasses();
      });
      glassesContainer.appendChild(g);
    }
  }

  renderGlasses();

  // Mood buttons
  const moodBtns = document.querySelectorAll('.mood-btn');
  moodBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      moodBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      playSuccessChime();
    });
  });

  // Mood pills
  const moodPills = document.querySelectorAll('.mood-pill');
  moodPills.forEach(pill => {
    pill.addEventListener('click', () => {
      moodPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      playChime(600);
    });
  });
}

// ========================================================
// 8. PASTEL AUDIO SYNTHESIZER (WEB AUDIO API)
// ========================================================
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playChime(freq = 520) {
  if (!appState.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch (err) {
    // Audio context may require user interaction first
  }
}

function playSuccessChime() {
  if (!appState.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.07);

      gain.gain.setValueAtTime(0.06, ctx.currentTime + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.07 + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + idx * 0.07);
      osc.stop(ctx.currentTime + idx * 0.07 + 0.3);
    });
  } catch (err) { }
}

function playLofiMelody() {
  if (!appState.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const chord = [392.00, 493.88, 587.33, 739.99]; // G maj7
    chord.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);

      gain.gain.setValueAtTime(0.07, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 1.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 1.2);
    });
  } catch (err) { }
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g,
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// ========================================================
// 9. COSPLAY RENTAL BOOKING (MOCHIMOON)
// ========================================================
const costumeCatalog = {
  'Raiden Shogun (Genshin Impact)': {
    title: 'Raiden Shogun (Genshin Impact)',
    price: '180.000đ - 250.000đ / ngày',
    desc: 'Bao gồm trang phục chi tiết cao cấp, giáp vai kim loại, hoa cài đầu và tóc giả đã dập xù vào nếp chuẩn nhân vật.'
  },
  'Hu Tao (Genshin Impact)': {
    title: 'Hu Tao (Genshin Impact)',
    price: '170.000đ - 240.000đ / ngày',
    desc: 'Set áo khoác đen thêu chỉ hoa mai, nón đính cành hoa đào, nhẫn ngón tay và Trượng Hộ Ma sắc nét.'
  },
  'Furina (Genshin Impact)': {
    title: 'Furina (Genshin Impact)',
    price: '190.000đ - 260.000đ / ngày',
    desc: 'Bộ dạ phục quý tộc Fontaine cao cấp, nón đính lông vũ, gậy chỉ huy và wig hai màu ombre cực chuẩn.'
  },
  'Frieren (Sousou no Frieren)': {
    title: 'Frieren (Pháp Sư Tiễn Biệt)',
    price: '160.000đ - 220.000đ / ngày',
    desc: 'Áo choàng trắng viền vàng, váy xếp ly, tai yêu tinh silicon mềm và trượng phép thuật phát sáng.'
  },
  'Marin Kitagawa (My Dress-Up Darling)': {
    title: 'Marin Kitagawa (My Dress-Up Darling)',
    price: '150.000đ - 210.000đ / ngày',
    desc: 'Set đồng phục nữ sinh phong cách Gyaru / Shizuku-tan maid ren bồng bềnh, vòng cổ choker cá tính.'
  },
  'Nezuko Kamado (Kimetsu no Yaiba)': {
    title: 'Nezuko Kamado (Kimetsu no Yaiba)',
    price: '140.000đ - 190.000đ / ngày',
    desc: 'Kimono hoa văn asanoha hồng phấn, áo haori đen tuyền, ống tre ngậm miệng và nơ cài tóc đáng yêu.'
  },
  'Hatsune Miku (Vocaloid Sakura)': {
    title: 'Hatsune Miku (Sakura Miku)',
    price: '160.000đ - 230.000đ / ngày',
    desc: 'Phiên bản hoa anh đào hồng phấn, tai nghe đính hoa sakura, wig twin-tail bồng bềnh cực kỳ tôn dáng.'
  }
};

function syncBookingDateInput(year, month, day) {
  const dateInput = document.getElementById('bookingDateInput');
  if (dateInput) {
    const mStr = String(month + 1).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    dateInput.value = `${year}-${mStr}-${dStr}`;
  }
}

function initCosplayBooking() {
  // Set default date to today
  const dateInput = document.getElementById('bookingDateInput');
  if (dateInput && !dateInput.value) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${y}-${m}-${d}`;
  }

  // Character Select Change Handler
  const charSelect = document.getElementById('bookingCharacter');
  const previewName = document.getElementById('previewCostumeName');
  const previewPrice = document.querySelector('.costume-price .price-highlight');
  const previewDesc = document.getElementById('previewCostumeDesc');

  if (charSelect) {
    charSelect.addEventListener('change', (e) => {
      const selected = e.target.value;
      const costume = costumeCatalog[selected];
      if (costume) {
        if (previewName) previewName.textContent = costume.title;
        if (previewPrice) previewPrice.textContent = costume.price;
        if (previewDesc) previewDesc.textContent = costume.desc;
        playChime(540);
      }
    });
  }

  // Render initial booking list
  renderBookedList();

  // Booking Form Submission
  const bookingForm = document.getElementById('bookingForm');
  if (bookingForm) {
    bookingForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const character = document.getElementById('bookingCharacter')?.value || 'Trang phục Cosplay';
      const size = document.getElementById('bookingSize')?.value || 'M';
      const dateVal = document.getElementById('bookingDateInput')?.value || '';
      const duration = document.getElementById('bookingDuration')?.value || '2 ngày';
      const customerName = document.getElementById('customerName')?.value.trim() || '';
      const customerPhone = document.getElementById('customerPhone')?.value.trim() || '';
      const note = document.getElementById('bookingNote')?.value.trim() || '';

      // Format date for display
      let displayDate = dateVal;
      if (dateVal) {
        const parts = dateVal.split('-');
        if (parts.length === 3) {
          displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }

      const newBooking = {
        id: Date.now(),
        character,
        size,
        date: displayDate,
        duration,
        customerName,
        phone: customerPhone,
        note,
        status: 'Chờ nhận đồ 🌸'
      };

      appState.bookings.unshift(newBooking);
      try {
        localStorage.setItem('mochimoon_bookings', JSON.stringify(appState.bookings));
      } catch (err) {
        console.warn('Booking save error', err);
      }

      renderBookedList();
      playSuccessChime();

      alert(`🌸 Cảm ơn bạn ${customerName}! Lịch hẹn thuê "${character}" vào ngày ${displayDate} tại mochimoon đã được ghi nhận thành công! ✨`);

      // Reset customer fields
      document.getElementById('customerName').value = '';
      document.getElementById('customerPhone').value = '';
      if (document.getElementById('bookingNote')) {
        document.getElementById('bookingNote').value = '';
      }
    });
  }
}

function renderBookedList() {
  const container = document.getElementById('bookedContainer');
  const countBadge = document.getElementById('bookedCount');
  if (!container) return;

  container.innerHTML = '';
  if (countBadge) {
    countBadge.textContent = `${appState.bookings.length} lịch hẹn`;
  }

  if (appState.bookings.length === 0) {
    container.innerHTML = '<p style="text-align:center; padding:12px; font-size:13px; color:var(--text-muted);">Chưa có lịch hẹn thuê nào 🌸</p>';
    return;
  }

  appState.bookings.forEach(b => {
    const item = document.createElement('div');
    item.className = 'booked-card-item';
    item.innerHTML = `
      <div class="booked-card-title-row">
        <span class="booked-card-char">${escapeHtml(b.character.split('(')[0].trim())}</span>
        <span class="booked-card-status">${escapeHtml(b.status || 'Đã xác nhận')}</span>
      </div>
      <div class="booked-card-meta">
        Khách: <strong>${escapeHtml(b.customerName)}</strong> • Ngày hẹn: <strong>${escapeHtml(b.date)}</strong> (${escapeHtml(b.duration)})
      </div>
    `;
    container.appendChild(item);
  });
}

// ========================================================
// 10. BACKGROUND MUSIC PLAYER (MOCHIMOON BGM)
// ========================================================
let bgmSynthInterval = null;
let bgmMasterGain = null;

const bgmThemes = {
  sakura: {
    name: '🌸 Sakura Chill Lofi',
    speed: 2600,
    chords: [
      [261.63, 329.63, 392.00, 493.88], // Cmaj7
      [220.00, 261.63, 329.63, 392.00], // Am7
      [293.66, 349.23, 440.00, 523.25], // Dm7
      [196.00, 246.94, 293.66, 349.23, 440.00]  // G9
    ],
    wave: 'sine'
  },
  moonlight: {
    name: '🌙 Moonlit Serenade',
    speed: 3000,
    chords: [
      [220.00, 261.63, 329.63, 493.88], // Am9
      [174.61, 220.00, 261.63, 329.63], // Fmaj7
      [146.83, 220.00, 261.63, 349.23], // Dm7
      [164.81, 196.00, 246.94, 329.63]  // Em7
    ],
    wave: 'triangle'
  },
  kawaii: {
    name: '🎀 Kawaii Cafe Theme',
    speed: 2200,
    chords: [
      [349.23, 440.00, 523.25, 659.25], // Fmaj7
      [392.00, 493.88, 587.33, 659.25], // G6
      [329.63, 392.00, 493.88, 587.33], // Em7
      [440.00, 523.25, 659.25, 783.99]  // Am7
    ],
    wave: 'sine'
  },
  zen: {
    name: '🍵 Zen Garden Melodies',
    speed: 2800,
    chords: [
      [220.00, 293.66, 329.63, 440.00], // A sus
      [196.00, 261.63, 293.66, 392.00], // G sus
      [174.61, 261.63, 349.23, 440.00], // F lydian
      [164.81, 220.00, 293.66, 329.63]  // E modal
    ],
    wave: 'sine'
  }
};

let currentBgmChordIndex = 0;

function playBgmSynthChord() {
  if (!appState.bgm.isPlaying || appState.bgm.isCustomAudio) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (!bgmMasterGain) {
      bgmMasterGain = ctx.createGain();
      bgmMasterGain.connect(ctx.destination);
    }
    bgmMasterGain.gain.setValueAtTime(appState.bgm.volume * 0.12, ctx.currentTime);

    const theme = bgmThemes[appState.bgm.currentTrackId] || bgmThemes.sakura;
    const chord = theme.chords[currentBgmChordIndex % theme.chords.length];
    currentBgmChordIndex++;

    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();

      osc.type = theme.wave;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);

      // Low-pass filter for cozy lofi warmth
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, ctx.currentTime);

      noteGain.gain.setValueAtTime(0.001, ctx.currentTime + idx * 0.08);
      noteGain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + idx * 0.08 + 0.3);
      noteGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 2.2);

      osc.connect(filter);
      filter.connect(noteGain);
      noteGain.connect(bgmMasterGain);

      osc.start(ctx.currentTime + idx * 0.08);
      osc.stop(ctx.currentTime + idx * 0.08 + 2.3);
    });

    // Gentle sparkle chime accent
    if (Math.random() > 0.4) {
      const chimeFreq = chord[Math.floor(Math.random() * chord.length)] * 2;
      const chimeOsc = ctx.createOscillator();
      const chimeGain = ctx.createGain();
      chimeOsc.type = 'triangle';
      chimeOsc.frequency.setValueAtTime(chimeFreq, ctx.currentTime + 0.6);
      chimeGain.gain.setValueAtTime(0.03, ctx.currentTime + 0.6);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.6);
      chimeOsc.connect(chimeGain);
      chimeGain.connect(bgmMasterGain);
      chimeOsc.start(ctx.currentTime + 0.6);
      chimeOsc.stop(ctx.currentTime + 1.6);
    }
  } catch (err) { }
}

function startBgmPlayback() {
  appState.bgm.isPlaying = true;
  updateBgmUIState();

  const audioElement = document.getElementById('bgmAudioPlayer');

  if (appState.bgm.isCustomAudio && audioElement && appState.bgm.customAudioUrl) {
    if (bgmSynthInterval) {
      clearInterval(bgmSynthInterval);
      bgmSynthInterval = null;
    }
    audioElement.volume = appState.bgm.volume;
    audioElement.play().catch(e => console.log('Audio autoplay prevented:', e));
  } else {
    if (audioElement) audioElement.pause();
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
    const theme = bgmThemes[appState.bgm.currentTrackId] || bgmThemes.sakura;
    if (bgmSynthInterval) clearInterval(bgmSynthInterval);
    playBgmSynthChord();
    bgmSynthInterval = setInterval(playBgmSynthChord, theme.speed);
  }
}

function stopBgmPlayback() {
  appState.bgm.isPlaying = false;
  updateBgmUIState();

  if (bgmSynthInterval) {
    clearInterval(bgmSynthInterval);
    bgmSynthInterval = null;
  }

  const audioElement = document.getElementById('bgmAudioPlayer');
  if (audioElement) {
    audioElement.pause();
  }
}

function updateBgmUIState() {
  const isPlaying = appState.bgm.isPlaying;
  const musicBtn = document.getElementById('musicPlayerBtn');
  const badge = document.getElementById('musicNoteBadge');
  const playIcon = document.getElementById('bgmPlayIcon');
  const playText = document.getElementById('bgmPlayText');
  const eqBars = document.getElementById('musicEqBars');
  const titleEl = document.getElementById('nowPlayingTitle');

  if (musicBtn) {
    musicBtn.classList.toggle('playing', isPlaying);
  }
  if (badge) {
    badge.classList.toggle('hidden', !isPlaying);
  }
  if (playIcon) {
    playIcon.textContent = isPlaying ? '⏸' : '▶';
  }
  if (playText) {
    playText.textContent = isPlaying ? 'Tạm dừng' : 'Phát nhạc';
  }
  if (eqBars) {
    eqBars.classList.toggle('paused', !isPlaying);
  }
  if (titleEl) {
    titleEl.textContent = appState.bgm.currentTrackName;
  }
}

function initBackgroundMusicPlayer() {
  const musicBtn = document.getElementById('musicPlayerBtn');
  const musicDropdown = document.getElementById('musicDropdown');
  const closeBtn = document.getElementById('closeMusicBtn');
  const playToggleBtn = document.getElementById('bgmPlayToggleBtn');
  const volumeSlider = document.getElementById('bgmVolumeSlider');
  const volIcon = document.getElementById('volIcon');
  const uploadBtn = document.getElementById('uploadMusicBtn');
  const fileInput = document.getElementById('bgmCustomFileInput');
  const audioElement = document.getElementById('bgmAudioPlayer');
  const playlistContainer = document.getElementById('musicPlaylist');

  // Dropdown toggle
  if (musicBtn && musicDropdown) {
    musicBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = musicDropdown.classList.contains('hidden');
      if (isHidden) {
        musicDropdown.classList.remove('hidden');
        playChime(580);
      } else {
        musicDropdown.classList.add('hidden');
      }
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        musicDropdown.classList.add('hidden');
      });
    }

    musicDropdown.addEventListener('click', (e) => e.stopPropagation());

    document.addEventListener('click', (e) => {
      if (!musicDropdown.contains(e.target) && !musicBtn.contains(e.target)) {
        musicDropdown.classList.add('hidden');
      }
    });
  }

  // Play / Pause toggle
  if (playToggleBtn) {
    playToggleBtn.addEventListener('click', () => {
      if (appState.bgm.isPlaying) {
        stopBgmPlayback();
        playChime(320);
      } else {
        startBgmPlayback();
        playSuccessChime();
      }
    });
  }

  // Volume slider
  if (volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) / 100;
      appState.bgm.volume = val;
      if (audioElement) audioElement.volume = val;
      if (bgmMasterGain) {
        const ctx = getAudioContext();
        if (ctx) bgmMasterGain.gain.setValueAtTime(val * 0.12, ctx.currentTime);
      }
      if (volIcon) {
        volIcon.textContent = val === 0 ? '🔇' : val < 0.5 ? '🔉' : '🔊';
      }
    });
  }

  // Preset track selection
  if (playlistContainer) {
    const trackItems = playlistContainer.querySelectorAll('.music-track-item');
    trackItems.forEach(item => {
      item.addEventListener('click', () => {
        const trackId = item.getAttribute('data-track-id');
        trackItems.forEach(t => t.classList.remove('active'));
        item.classList.add('active');

        appState.bgm.isCustomAudio = false;
        appState.bgm.currentTrackId = trackId;
        appState.bgm.currentTrackName = bgmThemes[trackId]?.name || '🌸 Sakura Chill Lofi';

        startBgmPlayback();
        playSuccessChime();
      });
    });
  }

  // Upload Custom Music from computer
  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        const fileName = file.name;
        const objectUrl = URL.createObjectURL(file);

        appState.bgm.isCustomAudio = true;
        appState.bgm.customAudioUrl = objectUrl;
        appState.bgm.customAudioName = `🎶 ${fileName}`;
        appState.bgm.currentTrackName = `🎶 ${fileName}`;

        if (audioElement) {
          audioElement.src = objectUrl;
          audioElement.loop = true;
          audioElement.volume = appState.bgm.volume;
        }

        // Add or update custom track item in playlist
        let customItem = document.getElementById('customTrackItem');
        if (!customItem) {
          customItem = document.createElement('div');
          customItem.id = 'customTrackItem';
          customItem.className = 'music-track-item active';
          playlistContainer.appendChild(customItem);
        }

        // Deselect preset items
        playlistContainer.querySelectorAll('.music-track-item').forEach(t => t.classList.remove('active'));
        customItem.classList.add('active');

        customItem.innerHTML = `
          <span class="track-icon">📁</span>
          <div class="track-meta">
            <span class="track-name">${escapeHtml(fileName)}</span>
            <small>Nhạc từ máy tính của bạn</small>
          </div>
          <span class="track-check">✓</span>
        `;

        customItem.addEventListener('click', () => {
          playlistContainer.querySelectorAll('.music-track-item').forEach(t => t.classList.remove('active'));
          customItem.classList.add('active');
          appState.bgm.isCustomAudio = true;
          appState.bgm.currentTrackName = `🎶 ${fileName}`;
          startBgmPlayback();
        });

        startBgmPlayback();
        playSuccessChime();
        alert(`🌸 Đã nạp bài hát "${fileName}" làm nhạc nền thành công! Đang phát... ✨`);
      }
    });
  }

  updateBgmUIState();
}
