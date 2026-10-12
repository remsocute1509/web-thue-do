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
  isAdmin: false,
  bookings: [
    {
      id: 1,
      orderId: '#MC-10291',
      character: 'Himmel (Sousou no Frieren)',
      size: 'XL',
      date: '10/10/2026',
      duration: '3 ngày (fes/shoot)',
      returnDate: '13/10/2026',
      customerName: 'Nguyễn Thảo Linh',
      phone: '0912345678',
      note: 'Giao trước 9h sáng tại Nhà thi đấu, kèm kiếm đạo cụ',
      pricing: { rentPrice: 150000, rentPriceFormatted: '150.000đ', deposit: 300000, depositFormatted: '300.000đ', totalToPay: 450000, totalToPayFormatted: '450.000đ' },
      status: 'Đã cọc thành công ✅'
    },
    {
      id: 2,
      orderId: '#MC-58204',
      character: 'Frieren (Sousou no Frieren)',
      size: 'M',
      date: '12/10/2026',
      duration: '3 ngày (test)',
      returnDate: '15/10/2026',
      customerName: 'Trần Quỳnh Anh',
      phone: '0988776655',
      note: 'Kèm trượng pháp sư và wig đã chải nếp sẵn',
      pricing: { rentPrice: 80000, rentPriceFormatted: '80.000đ', deposit: 200000, depositFormatted: '200.000đ', totalToPay: 280000, totalToPayFormatted: '280.000đ' },
      status: 'Chờ thanh toán cọc ⏳'
    }
  ],
  bgm: {
    isPlaying: false,
    currentTrackId: 'point_star',
    currentTrackName: '✨ Point the star ~ Chiều Gió Chill Mix',
    volume: 0.7,
    favorites: ['point_star', 'longaodance', 'sakura', 'kawaii', 'daydream'],
    activeTab: 'all'
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
  initCostumeCatalog();
  initBackgroundMusicPlayer();
  initAdminPortal();
  checkExpiredBookings();
  setInterval(checkExpiredBookings, 30000);
  syncCloudBookings();
  setInterval(syncCloudBookings, 4000);
});

async function syncCloudBookings() {
  try {
    const res = await fetch('/api/bookings');
    if (!res.ok) return;
    const cloudList = await res.json();
    if (Array.isArray(cloudList) && cloudList.length > 0) {
      const mergedMap = new Map();
      cloudList.forEach(b => {
        if (b.orderId) mergedMap.set(b.orderId, b);
      });
      (appState.bookings || []).forEach(b => {
        if (b.orderId && !mergedMap.has(b.orderId)) {
          mergedMap.set(b.orderId, b);
        }
      });
      appState.bookings = Array.from(mergedMap.values());
      try {
        localStorage.setItem('mochimoon_bookings', JSON.stringify(appState.bookings));
      } catch (e) { }
      renderBookedList();
      refreshAvailabilityUI();
      if (typeof renderAdminOrders === 'function' && appState.isAdmin) {
        renderAdminOrders();
      }
    }
  } catch (e) { }
}

async function saveCloudBookings(bookingsList) {
  try {
    fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingsList)
    });
  } catch (e) { }
}

function loadSavedState() {
  const savedAdmin = localStorage.getItem('mochimoon_is_admin');
  appState.isAdmin = (savedAdmin === 'true');

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
      // Đảm bảo các đơn hàng đều có đủ tên và SĐT nếu tạo từ trước
      appState.bookings.forEach((b, idx) => {
        if (!b.customerName) b.customerName = idx === 0 ? 'Nguyễn Thảo Linh' : 'Trần Quỳnh Anh';
        if (!b.phone) b.phone = idx === 0 ? '0912345678' : '0988776655';
        if (!b.orderId) b.orderId = idx === 0 ? '#MC-10291' : '#MC-58204';
      });
    } catch (e) {
      console.error(e);
    }
  }

  const savedFavorites = localStorage.getItem('mochimoon_bgm_favorites');
  if (savedFavorites) {
    try {
      const parsedFavs = JSON.parse(savedFavorites);
      if (Array.isArray(parsedFavs)) {
        appState.bgm.favorites = parsedFavs;
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (!appState.bgm.favorites.includes('point_star')) {
    appState.bgm.favorites.unshift('point_star');
  }

  const savedCurrentTrack = localStorage.getItem('mochimoon_bgm_current_track');
  if (savedCurrentTrack && typeof bgmThemes !== 'undefined' && bgmThemes[savedCurrentTrack]) {
    appState.bgm.currentTrackId = savedCurrentTrack;
    appState.bgm.currentTrackName = bgmThemes[savedCurrentTrack].name;
  }

  const savedTheme = localStorage.getItem('jiu_theme');
  if (savedTheme) {
    document.body.className = savedTheme === 'pastel-dream' ? '' : `theme-${savedTheme}`;
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) themeSelect.value = savedTheme;
  }

  // Áp dụng logo mochimoon mới làm avatar chính
  if (localStorage.getItem('mochimoon_avatar_version') !== 'v_logo_mochi') {
    localStorage.removeItem('jiu_custom_avatar');
    localStorage.setItem('mochimoon_avatar_version', 'v_logo_mochi');
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

  // Avatar Upload listener (nếu chọn tệp từ máy)
  const avatarFileInput = document.getElementById('avatarFileInput');
  const userAvatar = document.getElementById('userAvatar');

  if (avatarFileInput) {
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
  'Himmel': {
    title: 'Himmel (Sousou no Frieren)',
    price: '150.000đ (Fes/Shoot) • 80.000đ (Test)',
    desc: 'Cost size XL kèm Wig tạo kiểu chuẩn nhân vật hiệp sĩ Himmel.',
    image: 'assets/costumes/costume_himmel.jpg',
    sizes: [
      { value: 'XL', label: 'Size XL' }
    ]
  },
  'Frieren': {
    title: 'Frieren (Sousou no Frieren)',
    price: '150.000đ (Fes/Shoot) • 80.000đ (Test)',
    desc: 'Cost size M kèm Wig chuẩn pháp sư Frieren.',
    image: 'assets/costumes/costume_frieren.jpg',
    sizes: [
      { value: 'M', label: 'Size M' }
    ]
  },
  'Kaito Kid': {
    title: 'Kaito Kid',
    price: '200.000đ (Fes/Shoot) • 80.000đ (Test)',
    desc: 'Cost size 2XL kèm Wig siêu đạo chích Kaito Kid (không kèm giày và vũ khí).',
    image: 'assets/costumes/costume_kaito_kid.jpg',
    sizes: [
      { value: '2XL', label: 'Size 2XL' }
    ]
  },
  'Flins': {
    title: 'Flins',
    price: '250.000đ (Fes/Shoot) • 100.000đ (Test)',
    desc: 'Cost size XL kèm Wig chuẩn Flins (không đèn và giày).',
    image: 'assets/costumes/costume_flins.jpg',
    sizes: [
      { value: 'XL', label: 'Size XL' }
    ]
  },
  'Kinosaki Mei': {
    title: 'Kinosaki Mei',
    price: '150.000đ (Fes/Shoot out) • 80.000đ (Test)',
    desc: 'Cost size M kèm Wig Kinosaki Mei. Có thể chọn kèm giày size 40.',
    image: 'assets/costumes/costume_kinosaki_mei.jpg',
    sizes: [
      { value: 'M', label: 'Size M' },
      { value: 'M + Giày 40', label: 'Size M + Giày size 40 (+30k)' }
    ]
  },
  'Kitagawa Marin Ver Shizuku': {
    title: 'Kitagawa Marin Ver Shizuku',
    price: '200.000đ (Fes/Shoot) • 100.000đ (Test)',
    desc: 'Cost size M kèm Wig Shizuku-tan. Có thể chọn kèm giày size 40.',
    image: 'assets/costumes/costume_marin_shizuku.jpg',
    sizes: [
      { value: 'M', label: 'Size M' },
      { value: 'M + Giày 40', label: 'Size M + Giày size 40 (+30k)' }
    ]
  }
};

// Aliases hỗ trợ tìm kiếm linh hoạt
costumeCatalog['Himmel (Sousou no Frieren)'] = costumeCatalog['Himmel'];
costumeCatalog['Frieren (Sousou no Frieren)'] = costumeCatalog['Frieren'];
costumeCatalog['Kitagawa Marin Ver Shizuku (My Dress-Up Darling)'] = costumeCatalog['Kitagawa Marin Ver Shizuku'];
costumeCatalog['himmel'] = costumeCatalog['Himmel'];
costumeCatalog['frieren'] = costumeCatalog['Frieren'];
costumeCatalog['kaito kid'] = costumeCatalog['Kaito Kid'];
costumeCatalog['flins'] = costumeCatalog['Flins'];

function findCostumeData(name) {
  if (!name) return null;
  if (costumeCatalog[name]) return costumeCatalog[name];
  const lower = name.toLowerCase().split('(')[0].trim();
  for (const key of Object.keys(costumeCatalog)) {
    const kLower = key.toLowerCase().split('(')[0].trim();
    if (kLower === lower || key.toLowerCase().includes(lower) || lower.includes(kLower)) {
      return costumeCatalog[key];
    }
  }
  return null;
}

function syncCostumeSize(characterName) {
  const sizeSelect = document.getElementById('bookingSize');
  if (!sizeSelect) return;

  const costume = findCostumeData(characterName);
  if (costume && costume.sizes && costume.sizes.length > 0) {
    sizeSelect.innerHTML = '';
    costume.sizes.forEach((sz, idx) => {
      const opt = document.createElement('option');
      opt.value = sz.value;
      opt.textContent = sz.label;
      if (idx === 0) opt.selected = true;
      sizeSelect.appendChild(opt);
    });
  } else {
    sizeSelect.innerHTML = `
      <option value="S">Size S (40 - 47kg)</option>
      <option value="M" selected>Size M (48 - 54kg)</option>
      <option value="L">Size L (55 - 62kg)</option>
      <option value="XL">Size XL (63 - 72kg)</option>
      <option value="2XL">Size 2XL (73 - 85kg)</option>
      <option value="Freesize">Freesize (Co giãn)</option>
    `;
  }
}

function isMyOrder(orderId) {
  if (!orderId) return false;
  try {
    const myOrders = JSON.parse(localStorage.getItem('mochimoon_my_orders') || '[]');
    return myOrders.includes(orderId) || (appState.currentPaymentBooking && appState.currentPaymentBooking.orderId === orderId);
  } catch (e) {
    return false;
  }
}

function checkExpiredBookings() {
  const HOLD_DURATION_MS = 20 * 60 * 1000; // Giữ slot chờ cọc trong 20 phút
  const now = Date.now();
  let changed = false;

  (appState.bookings || []).forEach(b => {
    if (b.status && b.status.includes('Chờ') && b.id && typeof b.id === 'number') {
      if (now - b.id > HOLD_DURATION_MS) {
        b.status = 'Đã hủy (Hết hạn giữ chỗ chờ cọc) ⌛';
        changed = true;
      }
    }
  });

  if (changed) {
    try {
      localStorage.setItem('mochimoon_bookings', JSON.stringify(appState.bookings));
    } catch (e) { }
    renderBookedList();
    refreshAvailabilityUI();
  }
}

function isCostumeBooked(characterName) {
  if (!characterName) return false;
  const targetClean = characterName.toLowerCase().split('(')[0].replace(/[^a-z0-9]/g, '');
  if (!targetClean || targetClean.length < 2) return false;
  return appState.bookings.some(b => {
    if (!b.character) return false;
    const st = (b.status || '').toLowerCase();
    if (st.includes('trả') || st.includes('hoàn tất') || st.includes('hủy') || st.includes('huỷ')) {
      return false;
    }
    const bookedClean = b.character.toLowerCase().split('(')[0].replace(/[^a-z0-9]/g, '');
    return bookedClean.includes(targetClean) || targetClean.includes(bookedClean);
  });
}

function refreshAvailabilityUI() {
  const charSelect = document.getElementById('bookingCharacter');
  if (charSelect) {
    for (let i = 0; i < charSelect.options.length; i++) {
      const opt = charSelect.options[i];
      const baseName = opt.value;
      const booked = isCostumeBooked(baseName);
      if (booked) {
        opt.textContent = `${baseName} (❌ Hết đồ)`;
      } else {
        opt.textContent = baseName;
      }
    }
    updateCostumePreview(charSelect.value);
  }

  // Cập nhật nhãn hết đồ trên từng thẻ trong mục Mẫu Đồ
  const cards = document.querySelectorAll('.costume-catalog-card');
  cards.forEach(card => {
    const charName = card.getAttribute('data-character') || '';
    const booked = isCostumeBooked(charName);
    const rentBtn = card.querySelector('.catalog-rent-btn');
    const imgWrap = card.querySelector('.catalog-img-wrap');
    let badge = card.querySelector('.catalog-stock-tag');

    if (booked) {
      if (!badge && imgWrap) {
        badge = document.createElement('span');
        badge.className = 'catalog-stock-tag out-of-stock';
        badge.textContent = '❌ Hết đồ';
        imgWrap.appendChild(badge);
      }
      if (rentBtn) {
        rentBtn.innerHTML = '<span>❌ Đã Hết Slot</span>';
        rentBtn.classList.add('btn-rent-disabled');
      }
    } else {
      badge?.remove();
      if (rentBtn) {
        rentBtn.innerHTML = '<span>👘 Đặt Thuê Ngay</span>';
        rentBtn.classList.remove('btn-rent-disabled');
      }
    }
  });
}

function updateCostumePreview(characterName) {
  const costume = findCostumeData(characterName);
  if (!costume) return;

  const previewName = document.getElementById('previewCostumeName');
  const previewPrice = document.querySelector('.costume-price .price-highlight');
  const previewDesc = document.getElementById('previewCostumeDesc');
  const previewImg = document.getElementById('costumePreviewImg');
  const stockBadge = document.getElementById('costumeStockBadge');
  const stockWarning = document.getElementById('bookingStockWarning');
  const submitBtn = document.getElementById('submitBookingBtn');

  if (previewName) previewName.textContent = costume.title;
  if (previewPrice) previewPrice.textContent = costume.price;
  if (previewDesc) previewDesc.textContent = costume.desc;
  if (previewImg && costume.image) previewImg.src = costume.image;

  const isBooked = isCostumeBooked(characterName);

  if (stockBadge) {
    if (isBooked) {
      stockBadge.className = 'costume-badge out-of-stock';
      stockBadge.innerHTML = '❌ HẾT ĐỒ (Đã có người đặt thuê)';
    } else {
      stockBadge.className = 'costume-badge in-stock';
      stockBadge.innerHTML = '✨ Còn đồ (Sẵn sàng cho thuê)';
    }
  }

  if (stockWarning) {
    if (isBooked) {
      stockWarning.classList.remove('hidden');
      const pendingBooking = (appState.bookings || []).find(b => {
        if (!b.character || !b.status || !b.status.includes('Chờ')) return false;
        const bookedClean = b.character.toLowerCase().split('(')[0].replace(/[^a-z0-9]/g, '');
        const targetClean = (characterName || '').toLowerCase().split('(')[0].replace(/[^a-z0-9]/g, '');
        return bookedClean.includes(targetClean) || targetClean.includes(bookedClean);
      });

      if (pendingBooking && isMyOrder(pendingBooking.orderId)) {
        // Chỉ hiển thị nút thanh toán cho ĐÚNG KHÁCH ĐÃ TẠO ĐƠN NÀY
        stockWarning.innerHTML = `
          📌 Bạn đang có đơn chờ cọc cho bộ <strong>${escapeHtml(characterName)}</strong> (Mã: <strong>${escapeHtml(pendingBooking.orderId || '')}</strong>).<br/>
          <div style="margin-top:6px;">
            <button type="button" class="btn-continue-pending-order" style="background: linear-gradient(135deg, #0284c7, #0ea5e9); color: #fff; border:none; border-radius: 8px; padding: 5px 12px; font-size: 11.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 6px rgba(2,132,199,0.25);">
              💳 Tiếp Tục Thanh Toán Cho Đơn Của Bạn ➔
            </button>
          </div>
        `;
        const btnContinue = stockWarning.querySelector('.btn-continue-pending-order');
        if (btnContinue) {
          btnContinue.addEventListener('click', (e) => {
            e.preventDefault();
            appState.currentPaymentBooking = pendingBooking;
            showPaymentStep(pendingBooking);
          });
        }
      } else if (pendingBooking) {
        // Đối với khách mới (Khách B): KHÔNG HIỂN THỊ NÚT THANH TOÁN
        stockWarning.innerHTML = `⏳ Bộ trang phục <strong>${escapeHtml(characterName)}</strong> hiện đang có khách giữ chỗ (Đang chờ chuyển khoản cọc trong 20 phút). Nếu khách không cọc, slot sẽ tự động mở lại cho bạn nhé! 🌸`;
      } else {
        stockWarning.innerHTML = `⚠️ Bộ trang phục <strong>${escapeHtml(characterName)}</strong> hiện đã có khách đặt thuê (Hết slot). Vui lòng chọn mẫu khác hoặc liên hệ shop nhé! 🌸`;
      }
    } else {
      stockWarning.classList.add('hidden');
    }
  }

  if (submitBtn) {
    if (isBooked) {
      submitBtn.disabled = true;
      submitBtn.classList.add('disabled');
      submitBtn.innerHTML = '<span>❌ Hết Đồ - Không Thể Cho Thuê (Hết Slot)</span>';
      submitBtn.title = 'Trang phục này hiện đã có người thuê, không thể đặt lúc này';
    } else {
      submitBtn.disabled = false;
      submitBtn.classList.remove('disabled');
      submitBtn.innerHTML = '<span>🌸 Xác Nhận Đặt Lịch Thuê</span>';
      submitBtn.title = 'Bấm để xác nhận đặt lịch thuê';
    }
  }
}

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
  if (charSelect) {
    charSelect.addEventListener('change', (e) => {
      const selected = e.target.value;
      updateCostumePreview(selected);
      syncCostumeSize(selected);
      playChime(540);
    });

    // Đồng bộ ngay khi khởi động trang
    syncCostumeSize(charSelect.value);
    refreshAvailabilityUI();
  }

  // Render initial booking list
  renderBookedList();

  // Booking Form Submission
  const bookingForm = document.getElementById('bookingForm');
  if (bookingForm) {
    bookingForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const character = document.getElementById('bookingCharacter')?.value || 'Trang phục Cosplay';

      if (isCostumeBooked(character)) {
        alert(`⚠️ Rất tiếc! Bộ trang phục "${character}" hiện đã có khách đặt thuê (Hết slot) nên không thể cho thuê thêm. Bạn vui lòng chọn mẫu khác nhé! 🌸`);
        return;
      }

      const size = document.getElementById('bookingSize')?.value || 'M';
      const dateVal = document.getElementById('bookingDateInput')?.value || '';
      const duration = document.getElementById('bookingDuration')?.value || '3 ngày (fes/shoot)';
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

      const returnDate = calculateReturnDate(displayDate, duration);
      const pricing = getRentalPricing(character, duration, size);
      const orderId = '#MC-' + (Math.floor(10000 + Math.random() * 90000));

      const newBooking = {
        id: Date.now(),
        orderId,
        character,
        size,
        date: displayDate,
        returnDate,
        duration,
        customerName,
        phone: customerPhone,
        note,
        pricing,
        status: 'Chờ thanh toán cọc ⏳'
      };

      appState.bookings.unshift(newBooking);
      appState.currentPaymentBooking = newBooking;
      try {
        localStorage.setItem('mochimoon_bookings', JSON.stringify(appState.bookings));
        const myOrders = JSON.parse(localStorage.getItem('mochimoon_my_orders') || '[]');
        if (!myOrders.includes(newBooking.orderId)) {
          myOrders.push(newBooking.orderId);
        }
        localStorage.setItem('mochimoon_my_orders', JSON.stringify(myOrders));
      } catch (err) {
        console.warn('Booking save error', err);
      }

      saveCloudBookings(appState.bookings);

      renderBookedList();
      refreshAvailabilityUI();
      playSuccessChime();

      // Chuyển qua bước thanh toán nhưng vẫn ở trang đặt thuê đồ!
      showPaymentStep(newBooking);
    });
  }

  // Setup Payment Panel Action Buttons & Copy Functions
  initPaymentActions();
}

function getRentalPricing(characterName, duration, size) {
  const isTest = String(duration).toLowerCase().includes('test');
  let rentPrice = 150000;
  const nameLower = (characterName || '').toLowerCase();

  if (nameLower.includes('himmel') || nameLower.includes('frieren')) {
    rentPrice = isTest ? 80000 : 150000;
  } else if (nameLower.includes('kaito')) {
    rentPrice = isTest ? 80000 : 200000;
  } else if (nameLower.includes('flins')) {
    rentPrice = isTest ? 100000 : 250000;
  } else if (nameLower.includes('kinosaki')) {
    rentPrice = isTest ? 80000 : 150000;
    if (String(size).includes('Giày')) rentPrice += 30000;
  } else if (nameLower.includes('marin') || nameLower.includes('shizuku')) {
    rentPrice = isTest ? 100000 : 200000;
    if (String(size).includes('Giày')) rentPrice += 30000;
  }

  return {
    rentPrice,
    rentPriceFormatted: rentPrice.toLocaleString('vi-VN') + 'đ',
    depositDesc: 'Cọc Thẻ học sinh / Khai sinh (hoặc cọc 200.000đ)',
    totalToPay: rentPrice,
    totalToPayFormatted: rentPrice.toLocaleString('vi-VN') + 'đ'
  };
}

let bankPollingTimer = null;

function showPaymentStep(booking) {
  const form = document.getElementById('bookingForm');
  const paymentPanel = document.getElementById('bookingPaymentPanel');
  const stepPill1 = document.getElementById('stepPill1');
  const stepPill2 = document.getElementById('stepPill2');
  const stepConnector = document.getElementById('stepConnector');

  if (!paymentPanel || !booking) return;

  // Clean Order Code for Transfer
  const cleanCode = (booking.orderId || ('MC' + booking.id)).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const transferContent = `THUEDO ${cleanCode}`;

  // Fill in order details
  const orderIdEl = document.getElementById('payOrderId');
  if (orderIdEl) orderIdEl.textContent = booking.orderId || '#' + cleanCode;

  const costumeNameEl = document.getElementById('payCostumeName');
  if (costumeNameEl) costumeNameEl.textContent = booking.character;

  const costumeSizeEl = document.getElementById('payCostumeSize');
  if (costumeSizeEl) costumeSizeEl.textContent = `Size ${booking.size}`;

  const dateRangeEl = document.getElementById('payDateRange');
  if (dateRangeEl) dateRangeEl.textContent = `${booking.date} ➔ ${booking.returnDate}`;

  const durationTagEl = document.getElementById('payCostumeDurationTag');
  if (durationTagEl) durationTagEl.textContent = booking.duration;

  const customerInfoEl = document.getElementById('payCustomerInfo');
  if (customerInfoEl) customerInfoEl.textContent = `${booking.customerName} (${booking.phone})`;

  const noteRow = document.getElementById('payNoteRow');
  const noteText = document.getElementById('payNoteText');
  if (booking.note) {
    if (noteRow) noteRow.style.display = 'flex';
    if (noteText) noteText.textContent = booking.note;
  } else {
    if (noteRow) noteRow.style.display = 'none';
  }

  const pricing = booking.pricing || getRentalPricing(booking.character, booking.duration, booking.size);
  const payRentPriceEl = document.getElementById('payRentPrice');
  if (payRentPriceEl) payRentPriceEl.textContent = pricing.rentPriceFormatted;

  const payTotalAmountEl = document.getElementById('payTotalAmount');
  if (payTotalAmountEl) payTotalAmountEl.textContent = pricing.totalToPayFormatted;

  const bankTransferAmountEl = document.getElementById('bankTransferAmount');
  if (bankTransferAmountEl) bankTransferAmountEl.textContent = pricing.totalToPayFormatted;

  // Bank Info MB Bank 0377193835 - DUONG NAM PHONG
  const bankAccEl = document.getElementById('bankAccNumber');
  if (bankAccEl) bankAccEl.textContent = '0377193835';

  const bankOwnerEl = document.getElementById('bankAccOwner');
  if (bankOwnerEl) bankOwnerEl.textContent = 'DUONG NAM PHONG';

  const bankContentEl = document.getElementById('bankTransferContent');
  if (bankContentEl) bankContentEl.textContent = transferContent;

  const noticeCodeEl = document.getElementById('noticeOrderCode');
  if (noticeCodeEl) noticeCodeEl.textContent = transferContent;

  // VietQR Dynamic Image
  const vietQrImg = document.getElementById('vietQrImg');
  if (vietQrImg) {
    vietQrImg.src = `https://img.vietqr.io/image/MB-0377193835-compact2.png?amount=${pricing.totalToPay}&addInfo=${encodeURIComponent(transferContent)}&accountName=DUONG%20NAM%20PHONG`;
  }

  // Ensure VietQR is visible
  if (vietQrImg) {
    vietQrImg.classList.remove('hidden');
  }
  const qrScanHint = document.getElementById('qrScanHint');
  if (qrScanHint) {
    qrScanHint.textContent = '⚡ Quét mã VietQR tự động điền sẵn số tiền và nội dung đơn';
  }

  // Reset Confirmation Button State
  const confirmBtn = document.getElementById('btnConfirmPaid');
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = '<span>✨ Tôi Đã Chuyển Khoản Thành Công</span>';
  }
  const statusBadge = document.getElementById('payStatusBadge');
  if (statusBadge) {
    statusBadge.className = 'pay-status-pill';
    statusBadge.textContent = '⏳ Chờ thanh toán';
  }

  // Reset Live Listener Banner
  const listenBanner = document.getElementById('bankAutoListenBanner');
  const listenTitle = document.getElementById('listenTitle');
  const listenSub = document.getElementById('listenSub');
  if (listenBanner) listenBanner.classList.remove('approved');
  if (listenTitle) listenTitle.textContent = '🔄 Hệ thống đang chờ ngân hàng MB Bank báo nhận tiền...';
  if (listenSub) listenSub.innerHTML = `Khi tài khoản <strong>0377193835</strong> nhận được tiền đúng cú pháp, đơn hàng sẽ <strong>TỰ ĐỘNG DUYỆT</strong> ngay lập tức!`;

  // Switch View: Hide Form, Show Payment Step
  if (form) form.style.display = 'none';
  paymentPanel.classList.remove('hidden');

  // Steps Progress Bar Update
  if (stepPill1) {
    stepPill1.classList.remove('active');
    stepPill1.classList.add('completed');
  }
  if (stepPill2) {
    stepPill2.classList.add('active');
  }
  if (stepConnector) {
    stepConnector.classList.add('active');
  }

  // Scroll smoothly into view
  document.getElementById('bookingStepsBar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Start live bank payment listener
  startBankPaymentPolling(booking, cleanCode);
}

function startBankPaymentPolling(booking, cleanCode) {
  if (bankPollingTimer) {
    clearInterval(bankPollingTimer);
    bankPollingTimer = null;
  }

  const orderKey = cleanCode || (booking.orderId || '').replace(/[^a-zA-Z0-9]/g, '');

  bankPollingTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/check-payment?orderId=${encodeURIComponent(orderKey)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.paid) {
        clearInterval(bankPollingTimer);
        bankPollingTimer = null;
        onBankPaymentApproved(booking, data.transaction);
      }
    } catch (err) {
      // Polling network retry silently
    }
  }, 2500);
}

function onBankPaymentApproved(booking, txData) {
  const listenBanner = document.getElementById('bankAutoListenBanner');
  const listenTitle = document.getElementById('listenTitle');
  const listenSub = document.getElementById('listenSub');
  const statusBadge = document.getElementById('payStatusBadge');
  const confirmBtn = document.getElementById('btnConfirmPaid');

  if (listenBanner) listenBanner.classList.add('approved');
  if (listenTitle) listenTitle.innerHTML = '🎉 TÀI KHOẢN MB BANK ĐÃ NHẬN TIỀN THÀNH CÔNG!';
  if (listenSub) {
    const timeStr = txData?.time || 'Vừa xong';
    listenSub.innerHTML = `Hệ thống đã khớp lệnh biến động số dư lúc ${timeStr}. Đơn hàng <strong>${escapeHtml(booking.orderId)}</strong> đã được <strong>TỰ ĐỘNG DUYỆT HOÀN TẤT</strong>! 💕`;
  }

  if (statusBadge) {
    statusBadge.className = 'pay-status-pill paid';
    statusBadge.textContent = '✅ Đã tự động duyệt qua MB Bank';
  }

  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span>✅ Đã Tự Động Duyệt Thành Công</span>';
  }

  // Update State & LocalStorage
  booking.status = 'Đã thanh toán (Tự động duyệt qua MB Bank) 🌸';
  const found = appState.bookings.find(b => b.id === booking.id || b.orderId === booking.orderId);
  if (found) {
    found.status = 'Đã thanh toán (Tự động duyệt qua MB Bank) 🌸';
  }
  try {
    localStorage.setItem('mochimoon_bookings', JSON.stringify(appState.bookings));
  } catch (e) { }

  renderBookedList();
  playSuccessChime();
  playLofiMelody();

  alert(`🎉 TING TING! Tài khoản MB Bank (0377193835) của DUONG NAM PHONG đã nhận được tiền!\n\nĐơn thuê: "${booking.character}" (${booking.orderId})\nTrạng thái: ĐÃ TỰ ĐỘNG DUYỆT HOÀN TẤT! ✨\nCảm ơn bạn đã ủng hộ shop nhé! 💕`);
}

function showBookingFormStep() {
  if (bankPollingTimer) {
    clearInterval(bankPollingTimer);
    bankPollingTimer = null;
  }

  const form = document.getElementById('bookingForm');
  const paymentPanel = document.getElementById('bookingPaymentPanel');
  const stepPill1 = document.getElementById('stepPill1');
  const stepPill2 = document.getElementById('stepPill2');
  const stepConnector = document.getElementById('stepConnector');

  if (paymentPanel) paymentPanel.classList.add('hidden');
  if (form) form.style.display = 'flex';

  if (stepPill1) {
    stepPill1.classList.add('active');
    stepPill1.classList.remove('completed');
  }
  if (stepPill2) {
    stepPill2.classList.remove('active');
  }
  if (stepConnector) {
    stepConnector.classList.remove('active');
  }

  document.getElementById('bookingStepsBar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function initPaymentActions() {
  // 1. Nút "Tôi Đã Chuyển Khoản Thành Công"
  const btnConfirmPaid = document.getElementById('btnConfirmPaid');
  if (btnConfirmPaid) {
    btnConfirmPaid.addEventListener('click', () => {
      if (appState.currentPaymentBooking) {
        onBankPaymentApproved(appState.currentPaymentBooking, { time: 'Khách xác nhận', gateway: 'MBBank' });
      } else {
        btnConfirmPaid.disabled = true;
        btnConfirmPaid.innerHTML = '<span>✅ Đã Ghi Nhận Thanh Toán</span>';
        playSuccessChime();
      }
    });
  }

  // 2. Nút "Thử Nghiệm: Giả Lập Nhận Tiền Ngân Hàng"
  const btnSimulate = document.getElementById('btnSimulatePayment');
  if (btnSimulate) {
    btnSimulate.addEventListener('click', async () => {
      const current = appState.currentPaymentBooking;
      if (!current) {
        alert('Vui lòng tạo một đơn thuê trước để thử nghiệm tính năng tự duyệt nhé!');
        return;
      }
      btnSimulate.disabled = true;
      btnSimulate.textContent = '⏳ Đang giả lập ting ting...';

      try {
        const res = await fetch('/api/simulate-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: current.orderId,
            amount: current.pricing?.totalToPay || 200000
          })
        });
        const data = await res.json();
        console.log('Simulate payment response:', data);
      } catch (err) {
        console.warn('Simulation error:', err);
        // Fallback local trigger
        onBankPaymentApproved(current, { time: 'Giả lập test', gateway: 'MBBank 0377193835' });
      }

      setTimeout(() => {
        btnSimulate.disabled = false;
        btnSimulate.textContent = '⚡ Thử Nghiệm: Giả Lập Nhận Tiền';
      }, 1500);
    });
  }

  // 3. QR Switcher Tabs (Cinnamoroll Shop QR vs Dynamic VietQR)
  const tabQrCustom = document.getElementById('tabQrCustom');
  const tabQrVietqr = document.getElementById('tabQrVietqr');
  const customQrImg = document.getElementById('customQrCardImg');
  const vietQrImg = document.getElementById('vietQrImg');
  const qrScanHint = document.getElementById('qrScanHint');

  if (tabQrCustom && tabQrVietqr) {
    tabQrCustom.addEventListener('click', () => {
      tabQrCustom.classList.add('active');
      tabQrVietqr.classList.remove('active');
      customQrImg?.classList.remove('hidden');
      vietQrImg?.classList.add('hidden');
      if (qrScanHint) qrScanHint.textContent = '🐰 Quét mã thẻ QR chính chủ DUONG NAM PHONG (MB Bank)';
      playChime(520);
    });

    tabQrVietqr.addEventListener('click', () => {
      tabQrVietqr.classList.add('active');
      tabQrCustom.classList.remove('active');
      vietQrImg?.classList.remove('hidden');
      customQrImg?.classList.add('hidden');
      if (qrScanHint) qrScanHint.textContent = '⚡ Quét mã VietQR tự động điền sẵn số tiền và nội dung đơn';
      playChime(580);
    });
  }

  // 4. Webhook Guide Modal
  const guideModal = document.getElementById('webhookGuideModal');
  const btnOpenGuide = document.getElementById('btnOpenWebhookGuide');
  const closeGuideBtn = document.getElementById('closeWebhookGuideBtn');
  const closeGuideBtn2 = document.getElementById('closeWebhookGuideBtn2');
  const copyWebhookBtn = document.getElementById('btnCopyWebhookUrl');

  if (btnOpenGuide && guideModal) {
    btnOpenGuide.addEventListener('click', () => {
      guideModal.classList.remove('hidden');
      playChime(600);
    });
  }

  [closeGuideBtn, closeGuideBtn2].forEach(btn => {
    btn?.addEventListener('click', () => {
      guideModal?.classList.add('hidden');
    });
  });

  if (guideModal) {
    guideModal.addEventListener('click', (e) => {
      if (e.target === guideModal) guideModal.classList.add('hidden');
    });
  }

  if (copyWebhookBtn) {
    copyWebhookBtn.addEventListener('click', () => {
      const urlText = `${window.location.origin}/api/webhook/bank`;
      navigator.clipboard.writeText(urlText).then(() => {
        copyWebhookBtn.textContent = '✓ Đã chép URL';
        playChime(680);
        setTimeout(() => { copyWebhookBtn.textContent = '📋 Copy URL'; }, 2000);
      });
    });
  }

  // 5. Nút "Đặt Thêm Lịch Mới / Chỉnh Sửa"
  const btnBack = document.getElementById('btnBackToBooking');
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      showBookingFormStep();
      const nameInput = document.getElementById('customerName');
      const phoneInput = document.getElementById('customerPhone');
      const noteInput = document.getElementById('bookingNote');
      if (nameInput) nameInput.value = '';
      if (phoneInput) phoneInput.value = '';
      if (noteInput) noteInput.value = '';
    });
  }

  // 6. Click chuyển qua lại giữa các bước tiến trình
  document.getElementById('stepPill1')?.addEventListener('click', () => {
    showBookingFormStep();
  });
  document.getElementById('stepPill2')?.addEventListener('click', () => {
    if (appState.currentPaymentBooking) {
      showPaymentStep(appState.currentPaymentBooking);
    } else {
      const pending = (appState.bookings || []).find(b => b.status && b.status.includes('Chờ'));
      if (pending) {
        appState.currentPaymentBooking = pending;
        showPaymentStep(pending);
      } else {
        alert('Hiện tại chưa có đơn hàng nào đang chờ thanh toán cọc nhé! 🌸');
      }
    }
  });

  // 7. Copy Buttons
  function setupCopyBtn(btnId, targetFn) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', () => {
      const text = targetFn();
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        const orig = btn.textContent;
        btn.textContent = '✓ Đã chép';
        btn.classList.add('copied');
        playChime(680);
        setTimeout(() => {
          btn.textContent = orig;
          btn.classList.remove('copied');
        }, 1800);
      }).catch(() => {
        prompt('Sao chép nội dung:', text);
      });
    });
  }

  setupCopyBtn('btnCopyAcc', () => document.getElementById('bankAccNumber')?.textContent.trim() || '0377193835');
  setupCopyBtn('btnCopyAmount', () => {
    const txt = document.getElementById('bankTransferAmount')?.textContent || '';
    return txt.replace(/[^0-9]/g, '');
  });
  setupCopyBtn('btnCopyContent', () => document.getElementById('bankTransferContent')?.textContent.trim() || '');
}

function calculateReturnDate(startDateStr, durationStr) {
  if (!startDateStr) return 'Đang cập nhật';
  const parts = startDateStr.split('/');
  if (parts.length !== 3) return startDateStr;
  const d = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const y = parseInt(parts[2], 10);
  const startDate = new Date(y, m, d);
  if (isNaN(startDate.getTime())) return startDateStr;

  let days = 3;
  const match = String(durationStr).match(/(\d+)\s*ngày/i);
  if (match) {
    days = parseInt(match[1], 10);
  } else if (String(durationStr).toLowerCase().includes('tuần')) {
    days = 7;
  }

  const retDate = new Date(startDate);
  retDate.setDate(retDate.getDate() + days);

  const retD = String(retDate.getDate()).padStart(2, '0');
  const retM = String(retDate.getMonth() + 1).padStart(2, '0');
  const retY = retDate.getFullYear();
  return `${retD}/${retM}/${retY}`;
}

function renderBookedList() {
  const container = document.getElementById('bookedContainer');
  const countBadge = document.getElementById('bookedCount');
  if (!container) return;

  // Tự động lọc: Chỉ hiển thị các lịch thuê ĐANG HOẠT ĐỘNG (chưa trả đồ)
  // Các đơn sau khi khách đã trả đồ (trạng thái chứa 'trả' hoặc 'hoàn tất') sẽ TỰ ĐỘNG XÓA KHỎI danh sách này!
  const activeBookings = (appState.bookings || []).filter(b => {
    if (!b.status) return true;
    const st = b.status.toLowerCase();
    return !st.includes('trả') && !st.includes('hoàn tất') && !st.includes('hủy') && !st.includes('huỷ');
  });

  container.innerHTML = '';
  if (countBadge) {
    countBadge.textContent = `${activeBookings.length} lịch hẹn`;
  }

  if (activeBookings.length === 0) {
    container.innerHTML = '<p style="text-align:center; padding:12px; font-size:13px; color:var(--text-muted);">Chưa có lịch hẹn thuê nào 🌸</p>';
    return;
  }

  activeBookings.forEach(b => {
    const item = document.createElement('div');
    const returnDate = b.returnDate || calculateReturnDate(b.date, b.duration);
    const st = b.status || 'Đang có người thuê 🌸';
    const isPending = st.includes('Chờ');
    const isPaid = st.includes('Đã') || st.includes('✅') || st.includes('duyệt');
    const isMine = isMyOrder(b.orderId);

    item.className = `booked-card-item ${isPending ? 'is-pending' : ''}`;

    item.innerHTML = `
      <div class="booked-card-title-row">
        <span class="booked-card-char">👘 ${escapeHtml(b.character.split('(')[0].trim())}</span>
        <span class="booked-card-status ${isPaid ? 'paid' : (isPending ? 'pending' : '')}">
          ${isMine && isPending ? '⏳ Đơn của bạn (Chờ cọc)' : escapeHtml(st)}
        </span>
      </div>
      <div class="booked-card-meta">
        <span class="booked-meta-tag">🗓️ Thuê: <strong>${escapeHtml(b.date)}</strong></span>
        <span class="booked-meta-tag">➔</span>
        <span class="booked-meta-tag booked-return-highlight">🔄 Ngày trả: <strong>${escapeHtml(returnDate)}</strong></span>
        <span class="booked-meta-tag"><em>(${escapeHtml(b.duration)})</em></span>
      </div>
      ${isPending && isMine ? `
        <div class="booked-resume-row" style="margin-top: 6px; display:flex; justify-content: flex-end;">
          <button type="button" class="btn-resume-pay" data-id="${b.id}" style="background: linear-gradient(135deg, #0284c7, #0ea5e9); color: #fff; border:none; border-radius: 12px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 6px rgba(2,132,199,0.25);">
            💳 Tiếp Tục Thanh Toán ➔
          </button>
        </div>
      ` : ''}
    `;

    if (isPending && isMine) {
      item.style.cursor = 'pointer';
      item.title = 'Bấm để mở lại mã QR tiếp tục thanh toán đơn này';
      item.addEventListener('click', (e) => {
        if (e.target.closest('.btn-quick-returned') || e.target.closest('a')) return;
        appState.currentPaymentBooking = b;
        showPaymentStep(b);
      });
    }

    // Nếu Admin đang đăng nhập: Hiển thị thêm thông tin khách hàng bí mật ngay trên thẻ kèm nút "Đã trả đồ" nhanh
    if (appState.isAdmin) {
      const adminSecretBar = document.createElement('div');
      adminSecretBar.className = 'booked-admin-secret-bar';
      adminSecretBar.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; flex-wrap:wrap; gap:4px;">
          <span>👑 [Admin] Khách: <strong>${escapeHtml(b.customerName || 'Khách đặt trước')}</strong> • 📞 <a href="tel:${escapeHtml(b.phone || '')}" style="color:#1d4ed8; text-decoration:none;">${escapeHtml(b.phone || 'Chưa có')}</a></span>
          <button type="button" class="btn-quick-returned" data-id="${b.id}" style="background:var(--primary, #ec4899); color:#fff; border:none; border-radius:12px; padding:3px 8px; font-size:11px; font-weight:700; cursor:pointer;" title="Bấm khi khách đã trả đồ để tự động xóa khỏi danh sách này">🌸 Khách Đã Trả Đồ</button>
        </div>
      `;

      const quickBtn = adminSecretBar.querySelector('.btn-quick-returned');
      if (quickBtn) {
        quickBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          updateAdminBookingStatus(b.id, 'Đã hoàn tất / Đã trả 🌸');
        });
      }

      item.appendChild(adminSecretBar);
    }

    container.appendChild(item);
  });
}

// ========================================================
// 9. COSTUME CATALOG & LIGHTBOX
// ========================================================
function initCostumeCatalog() {
  const costumeInfoModal = document.getElementById('costumeInfoModal');
  const closeCostumeInfoBtn = document.getElementById('closeCostumeInfoBtn');
  const modalCostumeImg = document.getElementById('modalCostumeImg');
  const modalCostumeTitle = document.getElementById('modalCostumeTitle');
  const modalCostumeInfoList = document.getElementById('modalCostumeInfoList');
  const modalCostumePriceList = document.getElementById('modalCostumePriceList');
  const modalRentNowBtn = document.getElementById('modalRentNowBtn');

  let currentActiveCharName = '';

  // Xử lý nút "Thông tin" trên từng thẻ trang phục
  const infoBtns = document.querySelectorAll('.catalog-info-btn');
  infoBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const charName = btn.getAttribute('data-char') || '';
      const fullName = btn.getAttribute('data-fullname') || charName;
      const imgSrc = btn.getAttribute('data-img') || '';
      const rawInfo = btn.getAttribute('data-info') || '';
      const rawPrices = btn.getAttribute('data-prices') || '';

      currentActiveCharName = fullName;

      if (modalCostumeImg) modalCostumeImg.src = imgSrc;
      if (modalCostumeTitle) modalCostumeTitle.textContent = charName;

      // Render danh sách Thông Tin (size cho vào thông tin, không cần mô tả)
      if (modalCostumeInfoList) {
        modalCostumeInfoList.innerHTML = '';
        const items = rawInfo.split('|').filter(s => s.trim());
        items.forEach(item => {
          const li = document.createElement('li');
          li.textContent = item.trim();
          modalCostumeInfoList.appendChild(li);
        });
      }

      // Render danh sách Giá Thuê
      if (modalCostumePriceList) {
        modalCostumePriceList.innerHTML = '';
        const prices = rawPrices.split('|').filter(s => s.trim());
        prices.forEach(item => {
          const li = document.createElement('li');
          li.textContent = item.trim();
          modalCostumePriceList.appendChild(li);
        });
      }

      // Kiểm tra tình trạng slot của bộ đồ trong modal
      if (modalRentNowBtn) {
        if (isCostumeBooked(fullName)) {
          modalRentNowBtn.innerHTML = '<span>❌ Đã Hết Slot (Đang có người thuê)</span>';
          modalRentNowBtn.classList.add('btn-rent-disabled');
        } else {
          modalRentNowBtn.innerHTML = '<span>👘 Đặt Thuê Ngay Bộ Này</span>';
          modalRentNowBtn.classList.remove('btn-rent-disabled');
        }
      }

      if (costumeInfoModal) {
        costumeInfoModal.classList.remove('hidden');
      }
      playChime(640);
    });
  });

  // Đóng modal thông tin chi tiết
  if (closeCostumeInfoBtn && costumeInfoModal) {
    closeCostumeInfoBtn.addEventListener('click', () => {
      costumeInfoModal.classList.add('hidden');
    });

    costumeInfoModal.addEventListener('click', (e) => {
      if (e.target === costumeInfoModal) {
        costumeInfoModal.classList.add('hidden');
      }
    });
  }

  // Nút "Đặt Thuê Ngay Bộ Này" trong modal thông tin
  if (modalRentNowBtn) {
    modalRentNowBtn.addEventListener('click', () => {
      if (costumeInfoModal) {
        costumeInfoModal.classList.add('hidden');
      }
      triggerRentCharacter(currentActiveCharName);
    });
  }

  // Hàm chuyển sang tab đặt lịch và chọn sẵn nhân vật
  function triggerRentCharacter(charName) {
    const navHealth = document.getElementById('navHealth');
    if (navHealth) {
      navHealth.click();
    }

    const selectChar = document.getElementById('bookingCharacter');
    if (selectChar && charName) {
      const targetClean = charName.toLowerCase().split('(')[0].trim();
      let matchedIndex = -1;
      for (let i = 0; i < selectChar.options.length; i++) {
        const optVal = selectChar.options[i].value.toLowerCase().split('(')[0].trim();
        const optTxt = selectChar.options[i].textContent.toLowerCase().split('(')[0].trim();
        if (optVal === targetClean || optTxt === targetClean || optVal.includes(targetClean) || targetClean.includes(optVal)) {
          matchedIndex = i;
          break;
        }
      }
      if (matchedIndex !== -1) {
        selectChar.selectedIndex = matchedIndex;
      }
      // Kích hoạt sự kiện change để đồng bộ size và cập nhật xem trước thẻ đặt lịch
      selectChar.dispatchEvent(new Event('change'));
    }

    const bookingCard = document.getElementById('bookingCard');
    if (bookingCard) {
      bookingCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (isCostumeBooked(charName)) {
      alert(`⚠️ Bộ trang phục "${charName}" hiện đã có khách đặt thuê (Hết slot). Bạn vui lòng chọn mẫu khác nhé! 🌸`);
    } else {
      playSuccessChime();
    }
  }

  // Nút "Đặt Thuê Ngay" trực tiếp trên thẻ
  const rentBtns = document.querySelectorAll('.catalog-rent-btn');
  rentBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const charName = btn.getAttribute('data-char');
      triggerRentCharacter(charName);
    });
  });

  refreshAvailabilityUI();

  // Hỗ trợ kéo trượt chuột lên xuống trong khung mẫu đồ (Drag to scroll)
  const scrollWrapper = document.getElementById('costumesScrollWrapper');
  if (scrollWrapper) {
    let isDown = false;
    let startY = 0;
    let scrollStart = 0;

    scrollWrapper.addEventListener('mousedown', (e) => {
      if (e.target.closest('.catalog-rent-btn') || e.target.closest('.catalog-img-wrap')) return;
      isDown = true;
      startY = e.pageY - scrollWrapper.offsetTop;
      scrollStart = scrollWrapper.scrollTop;
      scrollWrapper.style.cursor = 'grabbing';
      scrollWrapper.style.userSelect = 'none';
    });

    window.addEventListener('mouseup', () => {
      if (isDown) {
        isDown = false;
        if (scrollWrapper) {
          scrollWrapper.style.cursor = '';
          scrollWrapper.style.removeProperty('user-select');
        }
      }
    });

    scrollWrapper.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const y = e.pageY - scrollWrapper.offsetTop;
      const walk = (y - startY) * 1.4;
      scrollWrapper.scrollTop = scrollStart - walk;
    });
  }
}

// ========================================================
// 10. BACKGROUND MUSIC PLAYER (MOCHIMOON BGM)
// ========================================================
const bgmThemes = {
  longaodance: {
    id: 'longaodance',
    name: '🔥 Em Nói Là Đâu Có ~ longaodance Remix',
    src: 'assets/audio/hen-ho-voi-anh-ta.m4a',
    desc: 'Hẹn Hò Với Anh Ta • longaodance remix siêu cuốn',
    icon: '🔥'
  },
  point_star: {
    id: 'point_star',
    name: '✨ Point the star ~ Chiều Gió Chill Mix',
    src: 'assets/audio/point-the-star.mp3',
    desc: 'Nhạc chính • 24:42 thong thả ngồi chill gió',
    icon: '🎶'
  },
  sakura: {
    id: 'sakura',
    name: '🌸 Sakura Chill Lofi',
    src: 'assets/audio/sakura-chill.mp3',
    desc: 'Giai điệu piano & acoustic êm dịu',
    icon: '🌸'
  },
  moonlight: {
    id: 'moonlight',
    name: '🌙 Moonlit Serenade',
    src: 'assets/audio/moonlit-serenade.mp3',
    desc: 'Anime night piano ngọt ngào',
    icon: '🌙'
  },
  kawaii: {
    id: 'kawaii',
    name: '🎀 Kawaii Cafe Theme',
    src: 'assets/audio/kawaii-cafe.mp3',
    desc: 'Trong trẻo, tươi vui phong cách pastel',
    icon: '🎀'
  },
  zen: {
    id: 'zen',
    name: '🍵 Zen Garden Melodies',
    src: 'assets/audio/zen-garden.mp3',
    desc: 'Thư giãn sâu, hòa tấu sáo & đàn Koto',
    icon: '🍵'
  },
  daydream: {
    id: 'daydream',
    name: '☁️ Window Seat Daydream',
    src: 'assets/audio/daydream.mp3',
    desc: 'Mộng mơ bên khung cửa sổ ngày nắng',
    icon: '☁️'
  },
  coffee: {
    id: 'coffee',
    name: '☕ Morning Coffee Vibes',
    src: 'assets/audio/coffee-vibes.mp3',
    desc: 'Hương cà phê sáng & lofi chill ấm áp',
    icon: '☕'
  },
  autumn: {
    id: 'autumn',
    name: '🍂 Autumn Window Rain',
    src: 'assets/audio/autumn-rain.mp3',
    desc: 'Tiếng mưa thu gõ nhẹ bên ô kính',
    icon: '🍂'
  },
  starlight: {
    id: 'starlight',
    name: '⭐ Starlight Dreams',
    src: 'assets/audio/starlight.mp3',
    desc: 'Vũ điệu ánh sao đêm lung linh tĩnh lặng',
    icon: '⭐'
  }
};

const bgmTrackKeys = Object.keys(bgmThemes);
let isSeekingBgm = false;
let bgmPrevVolume = 0.7;

function isBgmTrackFavorited(trackId) {
  return appState.bgm.favorites && appState.bgm.favorites.includes(trackId);
}

function toggleBgmFavorite(trackId) {
  if (!appState.bgm.favorites) appState.bgm.favorites = [];
  const idx = appState.bgm.favorites.indexOf(trackId);
  if (idx > -1) {
    appState.bgm.favorites.splice(idx, 1);
  } else {
    appState.bgm.favorites.push(trackId);
  }

  try {
    localStorage.setItem('mochimoon_bgm_favorites', JSON.stringify(appState.bgm.favorites));
  } catch (err) {
    console.error(err);
  }

  updateBgmUIState();
  renderMusicPlaylist();
  playChime(660);
}

function getVisibleTrackKeys() {
  if (appState.bgm.activeTab === 'fav') {
    const favs = bgmTrackKeys.filter(k => isBgmTrackFavorited(k));
    return favs.length > 0 ? favs : bgmTrackKeys;
  }
  return bgmTrackKeys;
}

function formatBgmTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function startBgmPlayback() {
  const audioElement = document.getElementById('bgmAudioPlayer');
  if (!audioElement) return;

  const theme = bgmThemes[appState.bgm.currentTrackId] || bgmThemes.point_star;
  const currentSrc = audioElement.getAttribute('src');
  if (!currentSrc || !currentSrc.includes(theme.src)) {
    audioElement.src = theme.src;
  }

  audioElement.muted = false;
  audioElement.volume = appState.bgm.volume;

  const playPromise = audioElement.play();
  if (playPromise !== undefined) {
    playPromise.then(() => {
      appState.bgm.isPlaying = true;
      updateBgmUIState();
    }).catch(err => {
      console.log('Audio playback waiting for user gesture:', err);
      appState.bgm.isPlaying = false;
      updateBgmUIState();
    });
  }
}

function stopBgmPlayback() {
  const audioElement = document.getElementById('bgmAudioPlayer');
  if (audioElement) {
    audioElement.pause();
  }
  appState.bgm.isPlaying = false;
  updateBgmUIState();
}

function switchBgmTrack(trackId) {
  if (!bgmThemes[trackId]) return;

  appState.bgm.currentTrackId = trackId;
  appState.bgm.currentTrackName = bgmThemes[trackId].name;

  try {
    localStorage.setItem('mochimoon_bgm_current_track', trackId);
  } catch (err) { }

  const audioElement = document.getElementById('bgmAudioPlayer');
  if (audioElement) {
    audioElement.src = bgmThemes[trackId].src;
    audioElement.currentTime = 0;
  }

  renderMusicPlaylist();
  startBgmPlayback();
  playSuccessChime();
}

function nextBgmTrack() {
  const visible = getVisibleTrackKeys();
  const currentIdx = visible.indexOf(appState.bgm.currentTrackId);
  const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % visible.length;
  switchBgmTrack(visible[nextIdx]);
}

function prevBgmTrack() {
  const visible = getVisibleTrackKeys();
  const currentIdx = visible.indexOf(appState.bgm.currentTrackId);
  const prevIdx = currentIdx === -1 ? 0 : (currentIdx - 1 + visible.length) % visible.length;
  switchBgmTrack(visible[prevIdx]);
}

function updateBgmUIState() {
  const audioElement = document.getElementById('bgmAudioPlayer');
  const isPlaying = audioElement ? (!audioElement.paused && !audioElement.ended) : appState.bgm.isPlaying;
  appState.bgm.isPlaying = isPlaying;

  const musicBtn = document.getElementById('musicPlayerBtn');
  const badge = document.getElementById('musicNoteBadge');
  const playIcon = document.getElementById('bgmPlayIcon');
  const playText = document.getElementById('bgmPlayText');
  const eqBars = document.getElementById('musicEqBars');
  const titleEl = document.getElementById('nowPlayingTitle');
  const npFavIcon = document.getElementById('npFavIcon');
  const npFavBtn = document.getElementById('npFavToggleBtn');

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

  const isCurrentFav = isBgmTrackFavorited(appState.bgm.currentTrackId);
  if (npFavIcon) {
    npFavIcon.textContent = isCurrentFav ? '❤️' : '🤍';
  }
  if (npFavBtn) {
    npFavBtn.title = isCurrentFav ? 'Đã yêu thích (Bấm để bỏ)' : 'Thêm vào danh sách yêu thích';
  }
}

function renderMusicPlaylist() {
  const playlistContainer = document.getElementById('musicPlaylist');
  if (!playlistContainer) return;

  playlistContainer.innerHTML = '';

  const activeTab = appState.bgm.activeTab || 'all';
  let tracksToDisplay = bgmTrackKeys;
  if (activeTab === 'fav') {
    tracksToDisplay = bgmTrackKeys.filter(id => isBgmTrackFavorited(id));
  }

  // Update counter badges
  const countAll = document.getElementById('countAllMusic');
  const countFav = document.getElementById('countFavMusic');
  if (countAll) countAll.textContent = `(${bgmTrackKeys.length})`;
  if (countFav) countFav.textContent = `(${appState.bgm.favorites.length})`;

  // Update Tab buttons active state
  const tabAll = document.getElementById('tabAllMusic');
  const tabFav = document.getElementById('tabFavMusic');
  if (tabAll) tabAll.classList.toggle('active', activeTab === 'all');
  if (tabFav) tabFav.classList.toggle('active', activeTab === 'fav');

  // Handle empty favorites state
  if (activeTab === 'fav' && tracksToDisplay.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'empty-favorites-msg';
    emptyEl.innerHTML = `
      <span class="empty-favorites-icon">💖</span>
      <span><strong>Chưa có bài hát yêu thích nào!</strong></span>
      <small>Nhấp vào biểu tượng ❤️ ở bài hát bất kỳ để thêm vào danh sách này nhé ✨</small>
    `;
    playlistContainer.appendChild(emptyEl);
  } else {
    tracksToDisplay.forEach(trackId => {
      const theme = bgmThemes[trackId];
      if (!theme) return;
      const isCurrent = appState.bgm.currentTrackId === trackId;
      const isFav = isBgmTrackFavorited(trackId);

      const item = document.createElement('div');
      item.className = `music-track-item ${isCurrent ? 'active' : ''}`;
      item.innerHTML = `
        <span class="track-icon">${theme.icon}</span>
        <div class="track-info">
          <span class="track-name">${theme.name}</span>
          <span class="track-desc">${theme.desc}</span>
        </div>
        <button class="track-fav-btn ${isFav ? 'is-fav' : ''}" title="${isFav ? 'Bỏ yêu thích' : 'Yêu thích'}" data-track="${trackId}">
          ${isFav ? '❤️' : '🤍'}
        </button>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.track-fav-btn')) return;
        switchBgmTrack(trackId);
        playChime(640);
      });

      const favBtn = item.querySelector('.track-fav-btn');
      if (favBtn) {
        favBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleBgmFavorite(trackId);
        });
      }

      playlistContainer.appendChild(item);
    });
  }
}

function initBackgroundMusicPlayer() {
  const musicBtn = document.getElementById('musicPlayerBtn');
  const musicDropdown = document.getElementById('musicDropdown');
  const closeBtn = document.getElementById('closeMusicBtn');
  const playToggleBtn = document.getElementById('bgmPlayToggleBtn');
  const prevBtn = document.getElementById('bgmPrevBtn');
  const nextBtn = document.getElementById('bgmNextBtn');
  const progressBar = document.getElementById('bgmProgressBar');
  const currTimeEl = document.getElementById('bgmCurrentTime');
  const durationEl = document.getElementById('bgmDuration');
  const volumeSlider = document.getElementById('bgmVolumeSlider');
  const volIcon = document.getElementById('volIcon');
  const npFavBtn = document.getElementById('npFavToggleBtn');
  const tabAll = document.getElementById('tabAllMusic');
  const tabFav = document.getElementById('tabFavMusic');
  const audioElement = document.getElementById('bgmAudioPlayer');

  // Pre-load default track into audio element
  if (audioElement) {
    const defaultTheme = bgmThemes[appState.bgm.currentTrackId] || bgmThemes.sakura;
    const currentSrc = audioElement.getAttribute('src');
    if (!currentSrc || !currentSrc.includes(defaultTheme.src)) {
      audioElement.src = defaultTheme.src;
    }
    audioElement.volume = appState.bgm.volume;

    audioElement.addEventListener('play', () => {
      appState.bgm.isPlaying = true;
      updateBgmUIState();
    });

    audioElement.addEventListener('pause', () => {
      appState.bgm.isPlaying = false;
      updateBgmUIState();
    });

    audioElement.addEventListener('error', () => {
      console.warn('Audio playback error:', audioElement.error);
      appState.bgm.isPlaying = false;
      updateBgmUIState();
    });

    audioElement.addEventListener('loadedmetadata', () => {
      if (durationEl && !isNaN(audioElement.duration)) {
        durationEl.textContent = formatBgmTime(audioElement.duration);
      }
    });

    audioElement.addEventListener('timeupdate', () => {
      if (isSeekingBgm) return;
      const curr = audioElement.currentTime;
      const dur = audioElement.duration;
      if (currTimeEl) {
        currTimeEl.textContent = formatBgmTime(curr);
      }
      if (dur && !isNaN(dur) && durationEl) {
        durationEl.textContent = formatBgmTime(dur);
        if (progressBar) {
          progressBar.value = (curr / dur) * 100;
        }
      }
    });

    audioElement.addEventListener('ended', () => {
      nextBgmTrack();
    });
  }

  // Progress Bar Seek
  if (progressBar) {
    progressBar.addEventListener('input', () => {
      isSeekingBgm = true;
      if (audioElement && !isNaN(audioElement.duration) && currTimeEl) {
        const seekTime = (parseFloat(progressBar.value) / 100) * audioElement.duration;
        currTimeEl.textContent = formatBgmTime(seekTime);
      }
    });

    progressBar.addEventListener('change', () => {
      if (audioElement && !isNaN(audioElement.duration)) {
        audioElement.currentTime = (parseFloat(progressBar.value) / 100) * audioElement.duration;
      }
      isSeekingBgm = false;
    });
  }

  // Dropdown toggle
  if (musicBtn && musicDropdown) {
    musicBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = musicDropdown.classList.contains('hidden');
      if (isHidden) {
        musicDropdown.classList.remove('hidden');
        playChime(580);
        // Khi mở bảng điều khiển nhạc, nếu đang dừng thì chủ động phát
        if (audioElement && audioElement.paused) {
          startBgmPlayback();
        }
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
      if (audioElement && !audioElement.paused) {
        stopBgmPlayback();
        playChime(320);
      } else {
        startBgmPlayback();
        playSuccessChime();
      }
    });
  }

  // Previous & Next Track
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      prevBgmTrack();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      nextBgmTrack();
    });
  }

  // Favorite toggle on Now Playing card
  if (npFavBtn) {
    npFavBtn.addEventListener('click', () => {
      toggleBgmFavorite(appState.bgm.currentTrackId);
    });
  }

  // Tab switching: All vs Favorites
  if (tabAll) {
    tabAll.addEventListener('click', () => {
      appState.bgm.activeTab = 'all';
      renderMusicPlaylist();
      playChime(500);
    });
  }

  if (tabFav) {
    tabFav.addEventListener('click', () => {
      appState.bgm.activeTab = 'fav';
      renderMusicPlaylist();
      playChime(560);
    });
  }

  // Volume slider & Mute toggle
  function updateVolIcon(val) {
    if (!volIcon) return;
    volIcon.textContent = val === 0 ? '🔇' : val < 0.5 ? '🔉' : '🔊';
  }

  if (volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) / 100;
      appState.bgm.volume = val;
      if (audioElement) audioElement.volume = val;
      updateVolIcon(val);
    });
  }

  if (volIcon) {
    volIcon.addEventListener('click', () => {
      if (appState.bgm.volume > 0) {
        bgmPrevVolume = appState.bgm.volume;
        appState.bgm.volume = 0;
        if (volumeSlider) volumeSlider.value = 0;
      } else {
        appState.bgm.volume = bgmPrevVolume > 0 ? bgmPrevVolume : 0.7;
        if (volumeSlider) volumeSlider.value = appState.bgm.volume * 100;
      }
      if (audioElement) audioElement.volume = appState.bgm.volume;
      updateVolIcon(appState.bgm.volume);
    });
  }

  renderMusicPlaylist();
  updateBgmUIState();

  // Bấm vào bất kỳ đâu trên trang web có thể phát nhạc
  setupClickAnywhereToPlay();
}

function setupClickAnywhereToPlay() {
  const audioElement = document.getElementById('bgmAudioPlayer');
  if (!audioElement) return;

  const targetTheme = bgmThemes[appState.bgm.currentTrackId] || bgmThemes.point_star;
  const currentSrc = audioElement.getAttribute('src');
  if (!currentSrc || !currentSrc.includes(targetTheme.src)) {
    audioElement.src = targetTheme.src;
  }
  audioElement.muted = false;
  audioElement.volume = appState.bgm.volume;

  // Thử phát ngay nếu trình duyệt cho phép
  const initialPlay = audioElement.play();
  if (initialPlay !== undefined) {
    initialPlay.then(() => {
      appState.bgm.isPlaying = true;
      updateBgmUIState();
    }).catch(() => {
      appState.bgm.isPlaying = false;
      updateBgmUIState();
      attachGlobalClickTrigger();
    });
  } else {
    attachGlobalClickTrigger();
  }

  function attachGlobalClickTrigger() {
    const triggerEvents = ['click', 'pointerdown', 'touchstart'];
    const onFirstClickAnywhere = () => {
      // Khi người dùng bấm vào bất kì đâu trên màn hình
      if (audioElement && audioElement.paused) {
        startBgmPlayback();
      }
      triggerEvents.forEach(evt => {
        window.removeEventListener(evt, onFirstClickAnywhere, true);
        document.removeEventListener(evt, onFirstClickAnywhere, true);
      });
    };

    triggerEvents.forEach(evt => {
      window.addEventListener(evt, onFirstClickAnywhere, { capture: true });
      document.addEventListener(evt, onFirstClickAnywhere, { capture: true });
    });
  }
}

// ========================================================
// 11. ADMIN AUTHENTICATION & FULL CUSTOMER MANAGEMENT PORTAL
// ========================================================
function initAdminPortal() {
  const userProfileBtn = document.getElementById('userProfileBtn');
  const brandPill = document.getElementById('brandPill');
  const adminHeaderBadge = document.getElementById('adminHeaderBadge');

  const adminLoginModal = document.getElementById('adminLoginModal');
  const closeAdminLoginBtn = document.getElementById('closeAdminLoginBtn');
  const cancelAdminLoginBtn = document.getElementById('cancelAdminLoginBtn');
  const adminLoginForm = document.getElementById('adminLoginForm');
  const adminUsernameInput = document.getElementById('adminUsername');
  const adminPasswordInput = document.getElementById('adminPassword');
  const btnTogglePwd = document.getElementById('btnTogglePwd');
  const adminLoginAlert = document.getElementById('adminLoginAlert');

  const adminDashboardModal = document.getElementById('adminDashboardModal');
  const closeAdminDashBtn = document.getElementById('closeAdminDashBtn');
  const closeAdminDashBtn2 = document.getElementById('closeAdminDashBtn2');
  const btnAdminLogout = document.getElementById('btnAdminLogout');
  const btnAdminRefresh = document.getElementById('btnAdminRefresh');
  const adminSearchInput = document.getElementById('adminSearchInput');
  const adminStatusFilter = document.getElementById('adminStatusFilter');

  // Khởi tạo trạng thái giao diện ban đầu
  updateAdminUIState();

  // Bấm vào Logo Mochimoon ở Header hoặc Sidebar
  function handleLogoClick(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (appState.isAdmin) {
      openAdminDashboard();
    } else {
      openAdminLoginModal();
    }
  }
  window.handleAdminLogoClick = handleLogoClick;

  if (userProfileBtn) {
    userProfileBtn.addEventListener('click', handleLogoClick);
  }
  if (brandPill) {
    brandPill.addEventListener('click', handleLogoClick);
  }

  // Toggle ẩn/hiện mật khẩu
  if (btnTogglePwd && adminPasswordInput) {
    btnTogglePwd.addEventListener('click', () => {
      const isPwd = adminPasswordInput.getAttribute('type') === 'password';
      adminPasswordInput.setAttribute('type', isPwd ? 'text' : 'password');
      btnTogglePwd.textContent = isPwd ? '🙈' : '👁️';
    });
  }

  // Đóng Modal Đăng Nhập
  if (closeAdminLoginBtn) closeAdminLoginBtn.addEventListener('click', closeAdminLoginModal);
  if (cancelAdminLoginBtn) cancelAdminLoginBtn.addEventListener('click', closeAdminLoginModal);
  if (adminLoginModal) {
    adminLoginModal.addEventListener('click', (e) => {
      if (e.target === adminLoginModal) closeAdminLoginModal();
    });
  }

  // Xử lý Form Đăng Nhập Admin
  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const u = (adminUsernameInput?.value || '').trim().toLowerCase();
      const p = (adminPasswordInput?.value || '').trim();

      // Cho phép đăng nhập với: admin / admin123 hoặc admin / mochimoon hoặc mochimoon / mochimoon2026
      const isValid = (u === 'admin' && (p === 'admin123' || p === 'mochimoon' || p === 'admin')) ||
        (u === 'mochimoon' && (p === 'admin123' || p === 'mochimoon2026' || p === 'mochimoon'));

      if (isValid) {
        appState.isAdmin = true;
        try {
          localStorage.setItem('mochimoon_is_admin', 'true');
        } catch (err) { }

        if (adminLoginAlert) adminLoginAlert.classList.add('hidden');
        closeAdminLoginModal();
        updateAdminUIState();
        renderBookedList();
        playSuccessChime();

        // Mở ngay Bảng Quản Trị Khách Hàng
        setTimeout(() => {
          openAdminDashboard();
        }, 200);
      } else {
        if (adminLoginAlert) {
          adminLoginAlert.textContent = '❌ Sai tài khoản hoặc mật khẩu! Gợi ý: admin / admin123';
          adminLoginAlert.classList.remove('hidden');
        }
        playChime(320);
      }
    });
  }

  // Đóng Modal Bảng Quản Trị
  if (closeAdminDashBtn) closeAdminDashBtn.addEventListener('click', closeAdminDashboard);
  if (closeAdminDashBtn2) closeAdminDashBtn2.addEventListener('click', closeAdminDashboard);
  if (adminDashboardModal) {
    adminDashboardModal.addEventListener('click', (e) => {
      if (e.target === adminDashboardModal) closeAdminDashboard();
    });
  }

  // Nút Đăng Xuất Admin
  if (btnAdminLogout) {
    btnAdminLogout.addEventListener('click', () => {
      if (confirm('Bạn có muốn đăng xuất khỏi tài khoản Quản trị viên không? 🌸')) {
        appState.isAdmin = false;
        try {
          localStorage.removeItem('mochimoon_is_admin');
        } catch (err) { }

        closeAdminDashboard();
        updateAdminUIState();
        renderBookedList();
        playChime(440);
      }
    });
  }

  // Tìm kiếm & Lọc trên Dashboard
  if (adminSearchInput) {
    adminSearchInput.addEventListener('input', () => {
      renderAdminDashboard();
    });
  }
  if (adminStatusFilter) {
    adminStatusFilter.addEventListener('change', () => {
      renderAdminDashboard();
    });
  }
  if (btnAdminRefresh) {
    btnAdminRefresh.addEventListener('click', () => {
      renderAdminDashboard();
      playChime(520);
    });
  }
}

// Cập nhật trạng thái Admin trên Header & Logo
function updateAdminUIState() {
  const userProfileBtn = document.getElementById('userProfileBtn');
  const adminHeaderBadge = document.getElementById('adminHeaderBadge');

  if (appState.isAdmin) {
    if (adminHeaderBadge) adminHeaderBadge.classList.remove('hidden');
    if (userProfileBtn) {
      userProfileBtn.classList.add('is-admin');
      userProfileBtn.setAttribute('title', '👑 Quản trị viên Mochimoon - Nhấp để xem Bảng Quản Trị & Khách Hàng');
    }
  } else {
    if (adminHeaderBadge) adminHeaderBadge.classList.add('hidden');
    if (userProfileBtn) {
      userProfileBtn.classList.remove('is-admin');
      userProfileBtn.setAttribute('title', 'Logo tiệm mochimoon - Nhấp để Đăng nhập Quản trị viên');
    }
  }
}

function openAdminLoginModal() {
  const modal = document.getElementById('adminLoginModal');
  const alertEl = document.getElementById('adminLoginAlert');
  const uInput = document.getElementById('adminUsername');
  const pInput = document.getElementById('adminPassword');

  if (alertEl) alertEl.classList.add('hidden');
  if (uInput) uInput.value = 'admin';
  if (pInput) pInput.value = '';

  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    playChime(500);
    setTimeout(() => {
      if (pInput) pInput.focus();
    }, 150);
  }
}

function closeAdminLoginModal() {
  const modal = document.getElementById('adminLoginModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

function openAdminDashboard() {
  const modal = document.getElementById('adminDashboardModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    renderAdminDashboard();
    playChime(540);
  }
}

function closeAdminDashboard() {
  const modal = document.getElementById('adminDashboardModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

// Expose on window for direct access from HTML
window.openAdminLoginModal = openAdminLoginModal;
window.closeAdminLoginModal = closeAdminLoginModal;
window.openAdminDashboard = openAdminDashboard;
window.closeAdminDashboard = closeAdminDashboard;

// Render dữ liệu Full Thông Tin Khách Hàng trên Admin Dashboard
function renderAdminDashboard() {
  const container = document.getElementById('adminOrdersContainer');
  const kpiTotal = document.getElementById('adminKpiTotalOrders');
  const kpiPending = document.getElementById('adminKpiPendingOrders');
  const kpiApproved = document.getElementById('adminKpiApprovedOrders');
  const kpiRevenue = document.getElementById('adminKpiTotalRevenue');

  const searchVal = (document.getElementById('adminSearchInput')?.value || '').trim().toLowerCase();
  const filterVal = document.getElementById('adminStatusFilter')?.value || 'all';

  if (!container) return;

  const bookings = appState.bookings || [];

  // Tính toán KPI
  let totalCount = bookings.length;
  let pendingCount = 0;
  let approvedCount = 0;
  let totalMoney = 0;

  bookings.forEach(b => {
    const st = (b.status || '').toLowerCase();
    if (st.includes('chờ') || st.includes('cọc ⏳')) {
      pendingCount++;
    } else {
      approvedCount++;
    }

    if (b.pricing && b.pricing.totalToPay) {
      totalMoney += Number(b.pricing.totalToPay) || 0;
    } else {
      totalMoney += 450000; // Giá ước tính nếu chưa có
    }
  });

  if (kpiTotal) kpiTotal.textContent = `${totalCount} đơn`;
  if (kpiPending) kpiPending.textContent = `${pendingCount} đơn`;
  if (kpiApproved) kpiApproved.textContent = `${approvedCount} đơn`;
  if (kpiRevenue) kpiRevenue.textContent = `${totalMoney.toLocaleString('vi-VN')}đ`;

  // Lọc và Tìm kiếm
  let filtered = bookings.filter(b => {
    // Lọc theo trạng thái
    const st = (b.status || '').toLowerCase();
    if (filterVal === 'pending' && !st.includes('chờ')) return false;
    if (filterVal === 'approved' && !st.includes('đã cọc')) return false;
    if (filterVal === 'renting' && !st.includes('thuê đồ') && !st.includes('đang')) return false;
    if (filterVal === 'completed' && !st.includes('hoàn tất') && !st.includes('đã trả')) return false;

    // Tìm kiếm theo từ khóa
    if (searchVal) {
      const matchText = [
        b.orderId || '',
        b.customerName || '',
        b.phone || '',
        b.character || '',
        b.note || ''
      ].join(' ').toLowerCase();

      if (!matchText.includes(searchVal)) return false;
    }
    return true;
  });

  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:40px 20px; color:#888ca8;">
        <span style="font-size:36px; display:block; margin-bottom:8px;">🌸</span>
        <p style="font-size:15px; font-weight:600;">Không tìm thấy khách hàng nào phù hợp với bộ lọc!</p>
      </div>
    `;
    return;
  }

  filtered.forEach(b => {
    const card = document.createElement('div');
    const st = b.status || 'Chờ thanh toán cọc ⏳';

    // Xác định class trạng thái
    let statusClass = 'status-pending';
    let statusPillClass = 'status-pill-pending';
    if (st.includes('Đã cọc')) {
      statusClass = 'status-approved';
      statusPillClass = 'status-pill-approved';
    } else if (st.includes('thuê') || st.includes('Đang')) {
      statusClass = 'status-renting';
      statusPillClass = 'status-pill-renting';
    } else if (st.includes('trả') || st.includes('hoàn tất')) {
      statusClass = 'status-completed';
      statusPillClass = 'status-pill-completed';
    }

    card.className = `admin-order-card ${statusClass}`;

    const orderId = b.orderId || ('#MC-' + (b.id ? String(b.id).slice(-5) : '88888'));
    const custName = b.customerName || 'Khách đặt trước (Hẹn tại shop)';
    const custPhone = b.phone || '0377193835';
    const rentDate = b.date || 'Chưa rõ';
    const returnDate = b.returnDate || calculateReturnDate(b.date, b.duration);
    const duration = b.duration || '3 ngày';
    const character = b.character || 'Trang phục cosplay';
    const size = b.size || 'M';

    // Giá tiền
    const rentPriceFmt = (b.pricing && b.pricing.rentPriceFormatted) || '150.000đ';
    const depositFmt = (b.pricing && b.pricing.depositFormatted) || '300.000đ';
    const totalToPayFmt = (b.pricing && b.pricing.totalToPayFormatted) || '450.000đ';

    card.innerHTML = `
      <!-- Dòng tiêu đề mã đơn & trạng thái -->
      <div class="admin-order-top-row">
        <div class="admin-order-id-badge">
          <span>📦 Đơn: <strong>${escapeHtml(orderId)}</strong></span>
          <span class="admin-size-badge">Size ${escapeHtml(size)}</span>
        </div>
        <div>
          <span class="admin-status-pill ${statusPillClass}">${escapeHtml(st)}</span>
        </div>
      </div>

      <!-- Lưới Full Thông Tin Khách Hàng -->
      <div class="admin-order-details-grid">
        <!-- Cột 1: Thông tin khách hàng -->
        <div class="admin-detail-col">
          <span class="admin-detail-label">👤 Khách Hàng:</span>
          <span class="admin-cust-name">${escapeHtml(custName)}</span>
          <div class="admin-cust-phone-row">
            <span>📞</span>
            <a href="tel:${escapeHtml(custPhone)}" class="admin-phone-link" title="Nhấp để gọi điện">${escapeHtml(custPhone)}</a>
            <button type="button" class="btn-copy-mini-phone" data-phone="${escapeHtml(custPhone)}" title="Sao chép SĐT">📋 Chép</button>
          </div>
        </div>

        <!-- Cột 2: Trang phục & Ngày thuê -->
        <div class="admin-detail-col">
          <span class="admin-detail-label">👘 Trang Phục Thuê:</span>
          <span class="admin-costume-tag">${escapeHtml(character)}</span>
          <div style="margin-top:3px;">
            <span class="admin-date-range">🗓️ ${escapeHtml(rentDate)} ➔ ${escapeHtml(returnDate)}</span>
            <div class="admin-duration-text">(${escapeHtml(duration)})</div>
          </div>
        </div>

        <!-- Cột 3: Bảng Tiền Thuê & Cọc -->
        <div class="admin-detail-col">
          <span class="admin-detail-label">💰 Tiền Thuê & Cọc:</span>
          <div class="admin-price-line">Tiền thuê: <strong>${escapeHtml(rentPriceFmt)}</strong></div>
          <div class="admin-price-line">Tiền cọc: <strong class="admin-deposit-highlight">${escapeHtml(depositFmt)}</strong></div>
          <div class="admin-price-line">Tổng đơn: <strong class="admin-total-highlight">${escapeHtml(totalToPayFmt)}</strong></div>
        </div>
      </div>

      <!-- Ghi chú nếu có -->
      ${b.note ? `
        <div class="admin-cust-note-box">
          <strong>📝 Ghi chú của khách:</strong> ${escapeHtml(b.note)}
        </div>
      ` : ''}

      <!-- Thanh công cụ cập nhật trạng thái & Xóa -->
      <div class="admin-order-bottom-bar">
        <div class="admin-quick-actions">
          <span style="font-size:12px; font-weight:700; color:#64748b; margin-right:4px;">Chuyển trạng thái:</span>
          <button type="button" class="btn-status-change ${st.includes('Chờ') ? 'active' : ''}" data-id="${b.id}" data-status="Chờ thanh toán cọc ⏳">⏳ Chờ Cọc</button>
          <button type="button" class="btn-status-change ${st.includes('Đã cọc') ? 'active' : ''}" data-id="${b.id}" data-status="Đã cọc thành công ✅">✅ Đã Cọc</button>
          <button type="button" class="btn-status-change ${st.includes('thuê') && !st.includes('Chờ') ? 'active' : ''}" data-id="${b.id}" data-status="Đang thuê đồ 👘">👘 Đang Thuê</button>
          <button type="button" class="btn-status-change ${st.includes('trả') ? 'active' : ''}" data-id="${b.id}" data-status="Đã hoàn tất / Đã trả 🌸">🌸 Đã Trả</button>
        </div>
        <div>
          <button type="button" class="btn-delete-order" data-id="${b.id}" title="Xóa đơn hàng này">🗑️ Xóa đơn</button>
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  // Gắn sự kiện cho các nút trên từng Card
  container.querySelectorAll('.btn-copy-mini-phone').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const phone = btn.getAttribute('data-phone');
      if (phone) {
        navigator.clipboard.writeText(phone).then(() => {
          const oldText = btn.textContent;
          btn.textContent = '✓ Đã chép!';
          setTimeout(() => { btn.textContent = oldText; }, 1500);
        }).catch(() => {
          alert(`Số điện thoại: ${phone}`);
        });
      }
    });
  });

  container.querySelectorAll('.btn-status-change').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const bId = Number(btn.getAttribute('data-id'));
      const newStatus = btn.getAttribute('data-status');
      updateAdminBookingStatus(bId, newStatus);
    });
  });

  container.querySelectorAll('.btn-delete-order').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const bId = Number(btn.getAttribute('data-id'));
      if (confirm('Bạn có chắc chắn muốn xóa đơn đặt này khỏi danh sách không? 🌸')) {
        deleteAdminBooking(bId);
      }
    });
  });
}

function updateAdminBookingStatus(bookingId, newStatus) {
  const target = appState.bookings.find(b => b.id === bookingId);
  if (target) {
    target.status = newStatus;
    try {
      localStorage.setItem('mochimoon_bookings', JSON.stringify(appState.bookings));
    } catch (err) { }

    renderAdminDashboard();
    renderBookedList();
    refreshAvailabilityUI();
    saveCloudBookings(appState.bookings);
    playSuccessChime();

    const stLower = newStatus.toLowerCase();
    if (stLower.includes('trả') || stLower.includes('hoàn tất')) {
      alert(`🎉 Đã xác nhận khách trả đồ thành công!\n\n✨ Lịch thuê đơn "${target.character}" (${target.orderId || ''}) đã được TỰ ĐỘNG XÓA khỏi danh sách "Lịch Thuê Gần Đây", và trang phục đã SẴN SÀNG để khách khác tiếp tục thuê! 🌸`);
    }
  }
}

function deleteAdminBooking(bookingId) {
  appState.bookings = appState.bookings.filter(b => b.id !== bookingId);
  try {
    localStorage.setItem('mochimoon_bookings', JSON.stringify(appState.bookings));
  } catch (err) { }

  renderAdminDashboard();
  renderBookedList();
  refreshAvailabilityUI();
  saveCloudBookings(appState.bookings);
  playChime(380);
}
