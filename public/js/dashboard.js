// public/js/dashboard.js

// App State
let currentUser = null;
let activeTab = 'overview';
let charts = {}; // references to ApexCharts objects
let studentList = [];
let monthSettingsList = [];
let verificationQueue = [];
let html5QrcodeScanner = null;

// DOM Ready Handler
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Authenticate user session
    currentUser = await checkAuthState(true);
    if (!currentUser) return; // checkAuthState handles redirection

    // Update Profile UI
    updateProfileUI();

    // 2. Setup theme toggle
    setupThemeToggle();

    // 3. Setup Navigation Menu tabs
    setupTabNavigation();
    setupMobileSidebar();

    // 4. Initial Load
    const persistedTab = sessionStorage.getItem('admin_active_tab') || 'overview';
    await switchTab(persistedTab);

    // 5. Initialize Custom Date-Time Picker
    if (typeof CustomDateTimePicker !== 'undefined') {
        CustomDateTimePicker.init();
    }

    // 6. Setup Change Password Form
    setupChangePasswordForm();

    // 7. Setup Autocomplete Targeted Billing Selection
    setupAutocomplete();

    // 8. Setup System Policy Form
    setupPolicyForm();
});

function updateProfileUI() {
    const userName = document.getElementById('sidebar-user-email');
    const userRole = document.getElementById('sidebar-user-role');

    // Extract initials
    const email = currentUser.email || 'Staff';

    if (userName) userName.textContent = email;
    const localRoleName = localStorage.getItem('user_role') || 'Viewer';
    const roleTranslations = {
        'Admin': 'ผู้ดูแลระบบ (Admin)',
        'Finance': 'เจ้าหน้าที่การเงิน (Finance)',
        'Auditor': 'ผู้ตรวจสอบบัญชี (Auditor)',
        'Viewer': 'ผู้เข้าชมทั่วไป (Viewer)',
        'Student': 'นักศึกษา',
        'นักศึกษา': 'นักศึกษา'
    };
    if (userRole) userRole.textContent = `สิทธิ์: ${roleTranslations[localRoleName] || localRoleName}`;

    // Toggle menu items based on role permission
    const currentRole = localRoleName;
    const auditMenuItem = document.querySelector('li[data-tab="audit"]');
    const settingsMenuItem = document.querySelector('li[data-tab="settings"]');
    const studentsMenuItem = document.querySelector('li[data-tab="students"]');
    const queueMenuItem = document.querySelector('li[data-tab="queue"]');

    // Auditor can ONLY see Overview and Audit Trail
    if (currentRole === 'Auditor' || currentRole === 'รองหัวหน้า') {
        if (settingsMenuItem) settingsMenuItem.style.display = 'none';
        if (studentsMenuItem) studentsMenuItem.style.display = 'none';
        if (queueMenuItem) queueMenuItem.style.display = 'none';
    } else if (currentRole === 'Viewer' || currentRole === 'Student' || currentRole === 'นักศึกษา') {
        if (settingsMenuItem) settingsMenuItem.style.display = 'none';
        if (studentsMenuItem) studentsMenuItem.style.display = 'none';
        if (queueMenuItem) queueMenuItem.style.display = 'none';
        if (auditMenuItem) auditMenuItem.style.display = 'none';
    }
}

// -----------------------------------------------------------------------------
// Theme Management
// -----------------------------------------------------------------------------
function setupThemeToggle() {
    const toggleBtn = document.getElementById('theme-toggle');
    if (!toggleBtn) return;

    const applyTheme = (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        updateThemeToggleIcon(theme);

        // Redraw charts with matching theme variables
        if (typeof charts !== 'undefined') {
            if (charts.monthlyTrend) redrawMonthlyChart();
            if (charts.weeklyTrend) redrawWeeklyChart();
        }
    };

    // Initialize theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        applyTheme(savedTheme);
    } else {
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyTheme(systemPrefersDark ? 'dark' : 'light');
    }

    // Toggle button handler
    toggleBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const nextTheme = current === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', nextTheme);
        applyTheme(nextTheme);
    });

    // Listen to device preference changes (only if no manual preference is saved)
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('theme')) {
            applyTheme(e.matches ? 'dark' : 'light');
        }
    });
}

function updateThemeToggleIcon(theme) {
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
        const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="theme-icon"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;
        const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="theme-icon"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
        toggleBtn.innerHTML = theme === 'dark' ? sunIcon : moonIcon;
    }
}

// -----------------------------------------------------------------------------
// Tab Navigation Controller
// -----------------------------------------------------------------------------
function setupTabNavigation() {
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = item.getAttribute('data-tab');
            switchTab(tabId);
        });
    });

    // Handle logout button clicks
    const logoutBtn = document.getElementById('sign-out-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const conf = await showConfirm('ยืนยันการออกจากระบบ', 'คุณต้องการออกจากระบบการเงินผู้จัดการใช่หรือไม่?');
            if (conf) {
                await signOut();
            }
        });
    }
}

function setupMobileSidebar() {
    const hamburgerBtn = document.getElementById('admin-hamburger-btn');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (hamburgerBtn && sidebar && overlay) {
        hamburgerBtn.addEventListener('click', () => {
            sidebar.classList.add('open');
            overlay.style.display = 'block';
        });

        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.style.display = 'none';
        });

        // Close sidebar when clicking menu items on mobile
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('open');
                    overlay.style.display = 'none';
                }
            });
        });
    }
}

async function switchTab(tabId) {
    // Stop camera scanner if active and we are switching away from activities
    if (activeTab === 'activities' && tabId !== 'activities') {
        stopActivitiesScanner();
    }

    activeTab = tabId;
    sessionStorage.setItem('admin_active_tab', tabId);

    // Toggle active menu selection
    document.querySelectorAll('.menu-item').forEach(item => {
        if (item.getAttribute('data-tab') === tabId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Hide all view wrappers, show active
    document.querySelectorAll('.view-panel').forEach(panel => {
        panel.classList.add('hidden');
    });
    document.getElementById(`${tabId}-panel`).classList.remove('hidden');

    // Trigger tab-specific loaders
    switch (tabId) {
        case 'overview':
            loadDashboardMetrics();
            break;
        case 'students':
            loadStudentsList();
            break;
        case 'settings':
            loadMonthSettings();
            break;
        case 'queue':
            loadVerificationQueue();
            break;
        case 'audit':
            loadAuditTrail();
            break;
        case 'reports':
            setupReportsPanel();
            break;
        case 'activities':
            initActivitiesScanner();
            break;
        case 'admin-settings':
            loadSystemSettings();
            break;
    }
}

// -----------------------------------------------------------------------------
// View 1: Overview & Metrics Dashboard
// -----------------------------------------------------------------------------
async function loadDashboardMetrics() {
    const cacheKey = 'dashboard_metrics';
    const cachedDataStr = localStorage.getItem(cacheKey);
    let hasRenderedCache = false;

    if (cachedDataStr) {
        try {
            const data = JSON.parse(cachedDataStr);
            document.getElementById('metric-budget').textContent = `${data.metrics.budget.toLocaleString()} THB`;
            document.getElementById('metric-collected').textContent = `${data.metrics.collected.toLocaleString()} THB`;
            document.getElementById('metric-outstanding').textContent = `${data.metrics.outstanding.toLocaleString()} THB`;
            document.getElementById('metric-pending').textContent = data.metrics.pending_verifications;
            document.getElementById('metric-rate').textContent = `${data.metrics.collection_rate}%`;

            renderMonthlyChart(data.monthly_trend);
            renderWeeklyChart(data.weekly_trend);
            renderNotifications(data.notifications);
            renderActivities(data.recent_activities);
            hasRenderedCache = true;
        } catch (e) {
            console.error('Error parsing cached dashboard metrics:', e);
        }
    }

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/dashboard.php`, {
            headers: getAuthHeaders()
        });
        const result = await response.json();

        if (result.status === 'success') {
            const newDataStr = JSON.stringify(result.data);
            if (newDataStr !== cachedDataStr || !hasRenderedCache) {
                const data = result.data;
                localStorage.setItem(cacheKey, newDataStr);

                document.getElementById('metric-budget').textContent = `${data.metrics.budget.toLocaleString()} THB`;
                document.getElementById('metric-collected').textContent = `${data.metrics.collected.toLocaleString()} THB`;
                document.getElementById('metric-outstanding').textContent = `${data.metrics.outstanding.toLocaleString()} THB`;
                document.getElementById('metric-pending').textContent = data.metrics.pending_verifications;
                document.getElementById('metric-rate').textContent = `${data.metrics.collection_rate}%`;

                renderMonthlyChart(data.monthly_trend);
                renderWeeklyChart(data.weekly_trend);
                renderNotifications(data.notifications);
                renderActivities(data.recent_activities);
            }
        }
    } catch (e) {
        console.error('Error fetching metrics data:', e);
    }
}

function renderNotifications(notifs) {
    const list = document.getElementById('notif-list-widget');
    if (!list) return;

    list.innerHTML = '';
    if (notifs.length === 0) {
        list.innerHTML = '<li class="muted-text-item">No recent notifications</li>';
        return;
    }

    notifs.forEach(n => {
        const li = document.createElement('li');
        li.className = 'notif-list-item';
        li.innerHTML = `
            <div class="notif-badge type-${n.type.toLowerCase()}"></div>
            <div class="notif-content">
                <div class="notif-title">${n.title}</div>
                <div class="notif-time">${new Date(n.created_at).toLocaleString()}</div>
            </div>
        `;
        list.appendChild(li);
    });
}

function renderActivities(acts) {
    const list = document.getElementById('activity-list-widget');
    if (!list) return;

    list.innerHTML = '';
    if (acts.length === 0) {
        list.innerHTML = '<li class="muted-text-item">No recent activities log</li>';
        return;
    }

    acts.forEach(a => {
        const li = document.createElement('li');
        li.className = 'activity-list-item';
        li.innerHTML = `
            <div class="activity-content">
                <strong>${a.user_email || 'System'}</strong> executed <span>${a.action.replace(/_/g, ' ')}</span>
                <div class="activity-time">${new Date(a.timestamp).toLocaleString()} | IP: ${a.ip_address}</div>
            </div>
        `;
        list.appendChild(li);
    });
}

// -----------------------------------------------------------------------------
// ApexCharts Plotting Helpers
// -----------------------------------------------------------------------------
function renderMonthlyChart(trendData) {
    const chartDiv = document.getElementById('monthly-trend-chart');
    if (!chartDiv) return;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textThemeColor = isDark ? '#94a3b8' : '#475569';

    const categories = trendData.map(t => t.month_name);
    const expectedSeries = trendData.map(t => t.expected);
    const collectedSeries = trendData.map(t => t.collected);

    const options = {
        series: [
            { name: 'Expected Budget', data: expectedSeries },
            { name: 'Collected Amount', data: collectedSeries }
        ],
        chart: {
            type: 'bar',
            height: '100%',
            background: 'transparent',
            toolbar: { show: false }
        },
        colors: ['#4f46e5', '#10b981'],
        plotOptions: {
            bar: {
                horizontal: false,
                columnWidth: '55%',
                borderRadius: 4
            }
        },
        dataLabels: { enabled: false },
        stroke: { show: true, width: 2, colors: ['transparent'] },
        xaxis: {
            categories: categories,
            labels: { style: { colors: textThemeColor } }
        },
        yaxis: {
            labels: { style: { colors: textThemeColor } }
        },
        fill: { opacity: 1 },
        tooltip: {
            theme: isDark ? 'dark' : 'light',
            y: { formatter: val => `${val.toLocaleString()} THB` }
        },
        legend: {
            labels: { colors: textThemeColor }
        }
    };

    if (charts.monthlyTrend) {
        charts.monthlyTrend.destroy();
    }

    charts.monthlyTrend = new ApexCharts(chartDiv, options);
    charts.monthlyTrend.render();
}

function renderWeeklyChart(weeklyTrend) {
    const chartDiv = document.getElementById('weekly-ratio-chart');
    if (!chartDiv) return;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textThemeColor = isDark ? '#94a3b8' : '#475569';

    const categories = weeklyTrend.map(wt => wt.week_name);
    const expectedSeries = weeklyTrend.map(wt => wt.expected);
    const collectedSeries = weeklyTrend.map(wt => wt.collected);

    const options = {
        series: [
            { name: 'Expected', data: expectedSeries },
            { name: 'Collected', data: collectedSeries }
        ],
        chart: {
            type: 'area',
            height: '100%',
            background: 'transparent',
            toolbar: { show: false }
        },
        colors: ['#818cf8', '#34d399'],
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth', width: 3 },
        xaxis: {
            categories: categories,
            labels: { style: { colors: textThemeColor } }
        },
        yaxis: {
            labels: { style: { colors: textThemeColor } }
        },
        tooltip: {
            theme: isDark ? 'dark' : 'light',
            y: { formatter: val => `${val.toLocaleString()} THB` }
        },
        legend: {
            labels: { colors: textThemeColor }
        }
    };

    if (charts.weeklyTrend) {
        charts.weeklyTrend.destroy();
    }

    charts.weeklyTrend = new ApexCharts(chartDiv, options);
    charts.weeklyTrend.render();
}

function redrawMonthlyChart() {
    if (charts.monthlyTrend) {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textThemeColor = isDark ? '#94a3b8' : '#475569';
        charts.monthlyTrend.updateOptions({
            xaxis: { labels: { style: { colors: textThemeColor } } },
            yaxis: { labels: { style: { colors: textThemeColor } } },
            legend: { labels: { colors: textThemeColor } },
            tooltip: { theme: isDark ? 'dark' : 'light' }
        });
    }
}

function redrawWeeklyChart() {
    if (charts.weeklyTrend) {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textThemeColor = isDark ? '#94a3b8' : '#475569';
        charts.weeklyTrend.updateOptions({
            xaxis: { labels: { style: { colors: textThemeColor } } },
            yaxis: { labels: { style: { colors: textThemeColor } } },
            legend: { labels: { colors: textThemeColor } },
            tooltip: { theme: isDark ? 'dark' : 'light' }
        });
    }
}


// -----------------------------------------------------------------------------
// View 2: Student Database CRUD
// -----------------------------------------------------------------------------
async function loadStudentsList() {
    const tableBody = document.getElementById('students-table-body');
    const cacheKey = 'admin_students_list';
    const cachedDataStr = localStorage.getItem(cacheKey);
    let hasRenderedCache = false;

    if (cachedDataStr) {
        try {
            studentList = JSON.parse(cachedDataStr);
            renderStudentsTable(studentList);
            hasRenderedCache = true;
        } catch (e) {
            console.error('Error parsing cached students:', e);
        }
    }

    if (!hasRenderedCache) {
        tableBody.innerHTML = '<tr><td colspan="7"><div class="skeleton" style="height: 150px;"></div></td></tr>';
    }

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/students.php`, {
            headers: getAuthHeaders()
        });
        const result = await response.json();

        if (result.status === 'success') {
            const newDataStr = JSON.stringify(result.data);
            if (newDataStr !== cachedDataStr || !hasRenderedCache) {
                studentList = result.data;
                localStorage.setItem(cacheKey, newDataStr);
                renderStudentsTable(studentList);
            }
        }
    } catch (e) {
        console.error('Error fetching students:', e);
    }
}

function renderStudentsTable(students) {
    const tableBody = document.getElementById('students-table-body');
    tableBody.innerHTML = '';

    if (students.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">ไม่พบข้อมูลรายชื่อนักศึกษาในฐานข้อมูล</td></tr>';
        return;
    }

    const limit = 50;
    const paginated = students.slice(0, limit);

    paginated.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${s.student_id}</strong></td>
            <td>${(s.prefix || '') + s.full_name}</td>
            <td>${s.nickname || '-'}</td>
            <td>${s.class}</td>
            <td>${s.academic_year}</td>
            <td><span class="badge badge-${s.status === 'Active' ? 'green' : 'gray'}">${s.status === 'Active' ? 'เปิดใช้งาน' : 'ระงับสิทธิ์'}</span></td>
            <td>
                <button class="btn btn-secondary btn-sm" onclick="openEditStudentModal('${s.id}')">แก้ไข</button>
                <button class="btn btn-danger btn-sm" onclick="deleteStudent('${s.id}')">ลบ</button>
            </td>
        `;
        tableBody.appendChild(tr);
    });

    if (students.length > limit) {
        const tr = document.createElement('tr');
        tr.id = 'students-load-more-row';
        tr.innerHTML = `
            <td colspan="7" class="text-center" style="padding: 1rem 0;">
                <button class="btn btn-secondary btn-sm" style="font-family: var(--font-heading);" onclick="showAllStudentsInTable()">
                    แสดงทั้งหมด (${students.length} คน)
                </button>
            </td>
        `;
        tableBody.appendChild(tr);
    }
}

window.showAllStudentsInTable = function () {
    const tableBody = document.getElementById('students-table-body');
    const loadMoreRow = document.getElementById('students-load-more-row');
    if (loadMoreRow) {
        loadMoreRow.remove();
    }

    const remaining = studentList.slice(50);
    remaining.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${s.student_id}</strong></td>
            <td>${(s.prefix || '') + s.full_name}</td>
            <td>${s.nickname || '-'}</td>
            <td>${s.class}</td>
            <td>${s.academic_year}</td>
            <td><span class="badge badge-${s.status === 'Active' ? 'green' : 'gray'}">${s.status === 'Active' ? 'เปิดใช้งาน' : 'ระงับสิทธิ์'}</span></td>
            <td>
                <button class="btn btn-secondary btn-sm" onclick="openEditStudentModal('${s.id}')">แก้ไข</button>
                <button class="btn btn-danger btn-sm" onclick="deleteStudent('${s.id}')">ลบ</button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
};

// Student Search filter
const studentSearchInput = document.getElementById('student-search');
if (studentSearchInput) {
    studentSearchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = studentList.filter(s =>
            s.student_id.toLowerCase().includes(query) ||
            ((s.prefix || '') + s.full_name).toLowerCase().includes(query) ||
            s.class.toLowerCase().includes(query)
        );
        renderStudentsTable(filtered);
    });
}

// Create/Edit Student Modals
const studentModal = document.getElementById('student-modal');
const studentForm = document.getElementById('student-form');
const addStudentBtn = document.getElementById('add-student-btn');

if (addStudentBtn) {
    addStudentBtn.addEventListener('click', () => {
        document.getElementById('student-modal-title').textContent = 'เพิ่มรายชื่อนักศึกษาใหม่';
        studentForm.reset();
        document.getElementById('form-student-id-field').value = '';
        studentModal.classList.add('active');
    });
}

function openEditStudentModal(id) {
    const student = studentList.find(s => s.id === id);
    if (!student) return;

    document.getElementById('student-modal-title').textContent = 'แก้ไขข้อมูลประวัตินักศึกษา';
    document.getElementById('form-student-id-field').value = student.id;
    document.getElementById('student-code').value = student.student_id;
    document.getElementById('student-prefix').value = student.prefix || 'นางสาว';
    document.getElementById('student-fullname').value = student.full_name;
    document.getElementById('student-nickname').value = student.nickname;
    document.getElementById('student-class').value = student.class;
    document.getElementById('student-year').value = student.academic_year;
    document.getElementById('student-status').value = student.status;

    studentModal.classList.add('active');
}

// Student form submission
if (studentForm) {
    studentForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const payload = {
            id: document.getElementById('form-student-id-field').value || null,
            student_id: document.getElementById('student-code').value.trim(),
            prefix: document.getElementById('student-prefix').value,
            full_name: document.getElementById('student-fullname').value.trim(),
            nickname: document.getElementById('student-nickname').value.trim(),
            class: document.getElementById('student-class').value.trim(),
            academic_year: document.getElementById('student-year').value.trim(),
            status: document.getElementById('student-status').value
        };

        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/students.php`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (result.status === 'success') {
                studentModal.classList.remove('active');
                await loadStudentsList();
                showToast('บันทึกข้อมูลนักศึกษาสำเร็จ', 'success');
            } else {
                showToast(result.message, 'error');
            }
        } catch (error) {
            console.error(error);
            showToast('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
        }
    });
}

async function deleteStudent(id) {
    const isConfirmed = await showConfirm(
        'ยืนยันการลบประวัตินักศึกษา',
        'คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลประวัตินักศึกษาคนนี้?\nการลบนี้จะเป็นการระงับและลบประวัติแบบถาวร'
    );
    if (!isConfirmed) {
        return;
    }

    Loading.show('กำลังลบข้อมูลนักศึกษา...');
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/students.php?id=${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const result = await response.json();

        if (result.status === 'success') {
            await loadStudentsList();
            showToast('ลบข้อมูลนักศึกษาสำเร็จ', 'success');
        } else {
            showToast(result.message, 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('เกิดข้อผิดพลาดในการลบข้อมูลนักศึกษา', 'error');
    } finally {
        Loading.hide();
    }
}


// -----------------------------------------------------------------------------
// View 3: Month settings Configuration
// -----------------------------------------------------------------------------
async function loadMonthSettings() {
    const grid = document.getElementById('settings-grid');
    const cacheKey = 'admin_month_settings';
    const cachedDataStr = localStorage.getItem(cacheKey);
    let hasRenderedCache = false;

    if (cachedDataStr) {
        try {
            monthSettingsList = JSON.parse(cachedDataStr);
            renderSettingsGrid(monthSettingsList);
            hasRenderedCache = true;
        } catch (e) {
            console.error('Error parsing cached settings:', e);
        }
    }

    if (!hasRenderedCache) {
        grid.innerHTML = `
            <div class="shimmer-loader" style="height: 240px; border-radius: var(--border-radius-md);"></div>
            <div class="shimmer-loader" style="height: 240px; border-radius: var(--border-radius-md);"></div>
            <div class="shimmer-loader" style="height: 240px; border-radius: var(--border-radius-md);"></div>
        `;
    }

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/settings.php`, {
            headers: getAuthHeaders()
        });
        const result = await response.json();

        if (result.status === 'success') {
            const newDataStr = JSON.stringify(result.data);
            if (newDataStr !== cachedDataStr || !hasRenderedCache) {
                monthSettingsList = result.data;
                localStorage.setItem(cacheKey, newDataStr);
                renderSettingsGrid(monthSettingsList);
            }
        }
    } catch (e) {
        console.error(e);
    }
}

function renderSettingsGrid(settings) {
    const grid = document.getElementById('settings-grid');
    grid.innerHTML = '';

    const monthNames = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];

    const statusTranslations = {
        'Open': 'เปิดระบบชำระ',
        'Closed': 'ปิดรับชั่วคราว',
        'Archived': 'ล็อกประวัติถาวร'
    };

    if (settings.length === 0) {
        grid.innerHTML = '<div class="text-center text-muted col-span-3">ยังไม่มีการกำหนดเกณฑ์จัดเก็บเงินของสัปดาห์ คลิกปุ่มตั้งเกณฑ์ด้านบนเพื่อเริ่มต้น</div>';
        return;
    }

    settings.forEach(s => {
        const card = document.createElement('div');
        card.className = `card setting-card status-${s.status.toLowerCase()}`;

        const displayTitle = s.title || `${monthNames[s.month - 1]} ${s.year}`;
        const subtitleHtml = s.title ? `<div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;">รอบบิลเดือน ${monthNames[s.month - 1]} ${s.year}</div>` : '';
        const weeksHtml = s.number_of_weeks > 1 ? `<div class="setting-item"><strong>จำนวนสัปดาห์เก็บเงิน:</strong> ${s.number_of_weeks} สัปดาห์</div>` : '';
        const amountLabel = s.number_of_weeks > 1 ? 'ค่าบำรุงรายสัปดาห์:' : 'ยอดเงินเรียกเก็บ:';

        card.innerHTML = `
            <div class="setting-card-header" style="flex-direction: column; align-items: flex-start; gap: 0.25rem;">
                <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                    <h3 style="margin: 0; font-size: 1.1rem;">${displayTitle}</h3>
                    <span class="badge badge-${s.status === 'Open' ? 'green' : (s.status === 'Closed' ? 'yellow' : 'gray')}">${statusTranslations[s.status] || s.status}</span>
                </div>
                ${subtitleHtml}
            </div>
            <div class="setting-card-body">
                <div class="setting-item"><strong>${amountLabel}</strong> ${s.weekly_fee} บาท</div>
                ${weeksHtml}
                <div class="setting-item"><strong>วันที่เปิดระบบ:</strong> ${s.open_date}</div>
                <div class="setting-item"><strong>วันที่ปิดระบบ:</strong> ${s.close_date}</div>
            </div>
            <div class="setting-card-footer" style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                <button class="btn btn-secondary btn-sm" onclick="openEditSettingModal('${s.id}')">แก้ไขเกณฑ์</button>
                <button class="btn btn-danger btn-sm" onclick="deleteSetting('${s.id}')">ลบประกาศ</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Delete Monthly Setting
async function deleteSetting(id) {
    const isConfirmed = await showConfirm(
        "🚨 คำเตือนสำคัญ!",
        "คุณยืนยันที่จะลบประกาศและเกณฑ์การเก็บเงินรอบบิลนี้ใช่หรือไม่?\n\n" +
        "การดำเนินการนี้จะ:\n" +
        "1. ลบ/ยกเลิกเกณฑ์ชำระเงินของรอบบิลนี้ออกจากการแสดงผลทั้งหมด\n" +
        "2. ยกเลิกรายการแจ้งเตือนค้างชำระของนักศึกษาทุกคนสำหรับบิลนี้ เพื่อป้องกันการชำระเงินผิดพลาด\n" +
        "3. ส่งข้อความแจ้งยกเลิกไปยังกล่องข้อความนักศึกษาและ Discord\n\n" +
        "คุณต้องการดำเนินการต่อหรือไม่?"
    );

    if (!isConfirmed) return;

    Loading.show('กำลังลบประกาศและยกเลิกเกณฑ์การชำระเงิน...');
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/settings.php?id=${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const result = await response.json();

        if (result.status === 'success') {
            showToast('ลบประกาศและยกเลิกเกณฑ์การชำระเงินเรียบร้อยแล้ว!', 'success');
            await loadMonthSettings(); // Reload settings list
        } else {
            showToast('ไม่สามารถลบรายการได้: ' + result.message, 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('เครือข่ายขัดข้อง ไม่สามารถติดต่อระบบจัดการเกณฑ์ได้', 'error');
    } finally {
        Loading.hide();
    }
}

// Config Modal
const settingModal = document.getElementById('setting-modal');
const settingForm = document.getElementById('setting-form');
const addSettingBtn = document.getElementById('add-setting-btn');
const numberWeeksInput = document.getElementById('setting-weeks');
const dueDatesContainer = document.getElementById('due-dates-dynamic-fields');

if (addSettingBtn) {
    addSettingBtn.addEventListener('click', () => {
        document.getElementById('setting-modal-title').textContent = 'สร้างรายการเก็บเงิน';
        settingForm.reset();
        document.getElementById('form-setting-id-field').value = '';
        document.getElementById('setting-targets-select').value = 'all';
        document.getElementById('custom-targets-container').classList.add('hidden');

        // Prefill default current month and year
        const today = new Date();
        document.getElementById('setting-month').value = today.getMonth() + 1;
        document.getElementById('setting-year').value = today.getFullYear();
        document.getElementById('setting-weeks').value = 1;

        recalculateAutoDates();
        settingModal.classList.add('active');
    });
}

const targetsSelect = document.getElementById('setting-targets-select');
const customTargetsContainer = document.getElementById('custom-targets-container');

if (targetsSelect) {
    targetsSelect.addEventListener('change', (e) => {
        if (e.target.value === 'custom') {
            customTargetsContainer.classList.remove('hidden');
            renderSelectedTargetsCards();
        } else {
            customTargetsContainer.classList.add('hidden');
        }
    });
}

let selectedCustomMemberIds = [];

function renderSelectedTargetsCards() {
    const container = document.getElementById('selected-targets-cards-container');
    if (!container) return;
    container.innerHTML = '';

    if (selectedCustomMemberIds.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 1.5rem; font-size: 0.8rem;"><i class="fas fa-info-circle"></i> ยังไม่ได้เลือกสมาชิก</div>';
        return;
    }

    selectedCustomMemberIds.forEach(id => {
        const s = studentList.find(item => item.id === id);
        if (!s) return;

        const card = document.createElement('div');
        card.className = 'selected-target-card';
        card.style.cssText = 'background: var(--bg-secondary); border: 1px solid var(--border-glass); border-radius: var(--border-radius-sm); padding: 0.4rem 0.6rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; box-shadow: var(--shadow-sm);';
        
        card.innerHTML = `
            <div style="display: flex; flex-direction: column; overflow: hidden; gap: 0.1rem; flex: 1;">
                <span style="font-weight: 700; font-size: 0.8rem; color: var(--accent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${s.nickname || '-'}</span>
                <span style="font-size: 0.75rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500;">${s.full_name}</span>
                <span style="font-size: 0.68rem; color: var(--text-secondary); font-family: monospace;">${s.student_id}</span>
            </div>
            <button type="button" style="background: transparent; border: none; color: var(--status-red-text); cursor: pointer; padding: 0.2rem; font-size: 0.95rem; display: flex; align-items: center; transition: transform 0.15s;" onclick="removeTargetMember('${s.id}')">
                <i class="fas fa-times-circle"></i>
            </button>
        `;

        const removeBtn = card.querySelector('button');
        removeBtn.addEventListener('mouseenter', () => removeBtn.style.transform = 'scale(1.15)');
        removeBtn.addEventListener('mouseleave', () => removeBtn.style.transform = 'scale(1)');

        container.appendChild(card);
    });
}

window.removeTargetMember = function(studentId) {
    selectedCustomMemberIds = selectedCustomMemberIds.filter(id => id !== studentId);
    renderSelectedTargetsCards();
};

function renderCustomMembersCheckboxes(selectedIds = []) {
    selectedCustomMemberIds = [...selectedIds];
    renderSelectedTargetsCards();
}

function recalculateAutoDates() {
    const monthSelect = document.getElementById('setting-month');
    const yearInput = document.getElementById('setting-year');
    const weeksInput = document.getElementById('setting-weeks');
    const openDateInput = document.getElementById('setting-open');
    const closeDateInput = document.getElementById('setting-close');

    if (!monthSelect || !yearInput || !weeksInput) return;

    let month = parseInt(monthSelect.value);
    const year = parseInt(yearInput.value);
    let numWeeks = parseInt(weeksInput.value) || 4;

    if (isNaN(month) || isNaN(year)) return;

    // Limit February to 4 weeks maximum
    if (month === 2) {
        if (numWeeks > 4) {
            numWeeks = 4;
            weeksInput.value = 4;
        }
        weeksInput.setAttribute('max', '4');
    } else {
        weeksInput.setAttribute('max', '5');
    }

    // Set Open Date to the 1st of the selected month (YYYY-MM-01)
    const formattedMonth = String(month).padStart(2, '0');
    const openDateVal = `${year}-${formattedMonth}-01`;
    if (openDateInput) {
        openDateInput.value = openDateVal;
    }

    // Set Close Date to a far future date (never closes)
    if (closeDateInput) {
        closeDateInput.value = '2099-12-31';
    }

    // Generate calculated due dates
    const autoDates = [];
    for (let w = 1; w <= numWeeks; w++) {
        const dayNum = 1 + (w - 1) * 7;
        const formattedDay = String(dayNum).padStart(2, '0');
        autoDates.push(`${year}-${formattedMonth}-${formattedDay}`);
    }

    generateDueDatesFields(numWeeks, autoDates);
}

// Register auto-calculation event listeners
const monthSelectEl = document.getElementById('setting-month');
const yearInputEl = document.getElementById('setting-year');

if (monthSelectEl) {
    monthSelectEl.addEventListener('change', recalculateAutoDates);
}
if (yearInputEl) {
    yearInputEl.addEventListener('input', recalculateAutoDates);
}
if (numberWeeksInput) {
    numberWeeksInput.addEventListener('change', () => {
        recalculateAutoDates();
    });
}

function generateDueDatesFields(numWeeks, existingDates = []) {
    dueDatesContainer.innerHTML = '';

    for (let w = 1; w <= numWeeks; w++) {
        const div = document.createElement('div');
        div.className = 'form-group';

        const dateVal = existingDates[w - 1] || '';
        const label = numWeeks === 1 ? 'วันครบกำหนดชำระเงิน' : `วันครบกำหนดชำระ สัปดาห์ที่ ${w} (คำนวณอัตโนมัติ)`;
        const readonlyAttr = numWeeks === 1 ? '' : 'readonly';

        div.innerHTML = `
            <label>${label}</label>
            <input type="date" class="form-control due-date-input" value="${dateVal}" ${readonlyAttr} required>
        `;
        dueDatesContainer.appendChild(div);
    }
}

function openEditSettingModal(id) {
    const setting = monthSettingsList.find(s => s.id === id);
    if (!setting) return;

    document.getElementById('setting-modal-title').textContent = 'แก้ไขเกณฑ์เก็บเงินรายเดือน';
    document.getElementById('form-setting-id-field').value = setting.id;
    document.getElementById('setting-month').value = setting.month;
    document.getElementById('setting-year').value = setting.year;
    document.getElementById('setting-fee').value = setting.weekly_fee;
    document.getElementById('setting-weeks').value = setting.number_of_weeks;
    document.getElementById('setting-open').value = setting.open_date;
    document.getElementById('setting-close').value = (setting.close_date && setting.close_date !== '-') ? setting.close_date : '2099-12-31';
    document.getElementById('setting-status-select').value = setting.status;
    document.getElementById('setting-title').value = setting.title || '';
    document.getElementById('setting-desc').value = setting.description || '';

    const customTargetsContainer = document.getElementById('custom-targets-container');
    if (setting.custom_members) {
        let members = [];
        try {
            members = typeof setting.custom_members === 'string' ? JSON.parse(setting.custom_members) : setting.custom_members;
        } catch (e) {
            console.error(e);
        }

        document.getElementById('setting-targets-select').value = 'custom';
        if (customTargetsContainer) customTargetsContainer.classList.remove('hidden');
        renderCustomMembersCheckboxes(members);
    } else {
        document.getElementById('setting-targets-select').value = 'all';
        if (customTargetsContainer) customTargetsContainer.classList.add('hidden');
    }

    generateDueDatesFields(setting.number_of_weeks, setting.due_dates);

    settingModal.classList.add('active');
}

// Save Setting Submit
if (settingForm) {
    settingForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Compile due dates array
        const dueDates = [];
        document.querySelectorAll('.due-date-input').forEach(input => {
            dueDates.push(input.value);
        });

        // Compile custom members autocomplete selections
        let customMembers = null;
        if (document.getElementById('setting-targets-select').value === 'custom') {
            customMembers = selectedCustomMemberIds;
        }

        const payload = {
            id: document.getElementById('form-setting-id-field').value || null,
            month: parseInt(document.getElementById('setting-month').value),
            year: parseInt(document.getElementById('setting-year').value),
            weekly_fee: parseFloat(document.getElementById('setting-fee').value),
            number_of_weeks: parseInt(document.getElementById('setting-weeks').value),
            open_date: document.getElementById('setting-open').value,
            close_date: document.getElementById('setting-close').value || '2099-12-31',
            status: document.getElementById('setting-status-select').value,
            title: document.getElementById('setting-title').value.trim(),
            description: document.getElementById('setting-desc').value.trim(),
            custom_members: customMembers,
            due_dates: dueDates
        };

        Loading.show('กำลังบันทึกเกณฑ์การจัดเก็บเงิน...');
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/settings.php`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (result.status === 'success') {
                settingModal.classList.remove('active');
                await loadMonthSettings();
                showToast('บันทึกเกณฑ์การจัดเก็บเงินเรียบร้อยแล้ว!', 'success');
            } else {
                showToast(result.message, 'error');
            }
        } catch (error) {
            console.error(error);
            showToast('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
        } finally {
            Loading.hide();
        }
    });
}


// Verification Queue Loader
async function loadVerificationQueue() {
    const tableBody = document.getElementById('queue-table-body');
    const filterVal = document.getElementById('queue-status-filter')?.value || 'Pending';
    const cacheKey = `admin_verification_queue_${filterVal}`;
    const cachedDataStr = localStorage.getItem(cacheKey);
    let hasRenderedCache = false;

    if (cachedDataStr) {
        try {
            verificationQueue = JSON.parse(cachedDataStr);
            renderQueueTable(verificationQueue);
            hasRenderedCache = true;
        } catch (e) {
            console.error('Error parsing cached verification queue:', e);
        }
    }

    if (!hasRenderedCache) {
        tableBody.innerHTML = '<tr><td colspan="7"><div class="skeleton" style="height: 150px;"></div></td></tr>';
    }

    try {
        const statusParam = filterVal === 'All' ? '' : `status=${filterVal}`;
        const response = await fetch(`${CONFIG.API_BASE_URL}/submissions.php?${statusParam}`, {
            headers: getAuthHeaders()
        });
        const result = await response.json();

        if (result.status === 'success') {
            const newDataStr = JSON.stringify(result.data);
            if (newDataStr !== cachedDataStr || !hasRenderedCache) {
                verificationQueue = result.data;
                localStorage.setItem(cacheKey, newDataStr);
                renderQueueTable(verificationQueue);
            }
        }
    } catch (e) {
        console.error(e);
    }
}

// Bind filter listener
document.addEventListener('DOMContentLoaded', () => {
    const queueFilter = document.getElementById('queue-status-filter');
    if (queueFilter) {
        queueFilter.addEventListener('change', () => {
            loadVerificationQueue();
        });
    }
});

function renderQueueTable(submissions) {
    const tableBody = document.getElementById('queue-table-body');
    tableBody.innerHTML = '';

    const monthNames = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];

    if (submissions.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">ไม่มีสลิปการโอนที่รอการตรวจสอบความถูกต้องในขณะนี้!</td></tr>';
        return;
    }

    const limit = 50;
    const paginated = submissions.slice(0, limit);

    paginated.forEach(s => {
        const tr = document.createElement('tr');
        const formattedWeeks = s.weeks.map(w => `สัปดาห์ที่ ${w}`).join(', ');
        const submittedDate = new Date(s.submitted_at).toLocaleString('th-TH');

        tr.innerHTML = `
            <td><strong>#${s.id.substring(0, 8).toUpperCase()}</strong></td>
            <td>${s.student_code} - ${s.student_name}</td>
            <td>${monthNames[s.month - 1]} ${s.year}</td>
            <td>${formattedWeeks}</td>
            <td><strong>${s.amount} บาท</strong></td>
            <td>${submittedDate}</td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="openVerifyDialog('${s.id}')">ตรวจสอบสลิป</button>
            </td>
        `;
        tableBody.appendChild(tr);
    });

    if (submissions.length > limit) {
        const tr = document.createElement('tr');
        tr.id = 'queue-load-more-row';
        tr.innerHTML = `
            <td colspan="7" class="text-center" style="padding: 1rem 0;">
                <button class="btn btn-secondary btn-sm" style="font-family: var(--font-heading);" onclick="showAllQueueInTable()">
                    แสดงทั้งหมด (${submissions.length} รายการ)
                </button>
            </td>
        `;
        tableBody.appendChild(tr);
    }
}

window.showAllQueueInTable = function () {
    const tableBody = document.getElementById('queue-table-body');
    const loadMoreRow = document.getElementById('queue-load-more-row');
    if (loadMoreRow) {
        loadMoreRow.remove();
    }

    const monthNames = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];

    const remaining = verificationQueue.slice(50);
    remaining.forEach(s => {
        const tr = document.createElement('tr');
        const formattedWeeks = s.weeks.map(w => `สัปดาห์ที่ ${w}`).join(', ');
        const submittedDate = new Date(s.submitted_at).toLocaleString('th-TH');

        tr.innerHTML = `
            <td><strong>#${s.id.substring(0, 8).toUpperCase()}</strong></td>
            <td>${s.student_code} - ${s.student_name}</td>
            <td>${monthNames[s.month - 1]} ${s.year}</td>
            <td>${formattedWeeks}</td>
            <td><strong>${s.amount} บาท</strong></td>
            <td>${submittedDate}</td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="openVerifyDialog('${s.id}')">ตรวจสอบสลิป</button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
};

// Verify Dialogue Modal Actions
const verifyModal = document.getElementById('verify-modal');
const verifySubmitBtn = document.getElementById('verify-submit-btn');
let activeSubId = null;

function openVerifyDialog(id) {
    const sub = verificationQueue.find(s => s.id === id);
    if (!sub) return;

    activeSubId = id;

    document.getElementById('verify-student-name').textContent = sub.student_name;
    document.getElementById('verify-student-code').textContent = sub.student_code;
    document.getElementById('verify-amount').textContent = `${sub.amount} บาท`;
    document.getElementById('verify-weeks').textContent = sub.weeks.map(w => `สัปดาห์ที่ ${w}`).join(', ');
    document.getElementById('verify-comments').value = '';

    // Handle slip preview (Check if it's image or PDF)
    const previewContainer = document.getElementById('verify-slip-preview');
    previewContainer.innerHTML = '';

    // Standardize URL check (Support local uploads or public web URLs)
    const slipUrl = sub.slip_url.startsWith('http') ? sub.slip_url : sub.slip_url;

    if (sub.slip_url.toLowerCase().endsWith('.pdf')) {
        previewContainer.innerHTML = `
            <div style="padding: 1.5rem; text-align: center; border: 1px solid var(--border-glass); border-radius: var(--border-radius-sm);">
                <div style="font-size: 3rem; margin-bottom: 0.5rem;">📄</div>
                <div>หลักฐานการโอนเงินรูปแบบไฟล์ PDF</div>
                <a href="${slipUrl}" target="_blank" class="btn btn-secondary btn-sm" style="margin-top: 1rem;">เปิดเอกสาร PDF ในหน้าต่างใหม่</a>
            </div>
        `;
    } else {
        previewContainer.innerHTML = `
            <img src="${slipUrl}" alt="Payment Slip" style="max-width: 100%; border-radius: var(--border-radius-sm); border: 1px solid var(--border-glass);">
        `;
    }

    // Download Button setup
    const downloadBtn = document.getElementById('verify-download-btn');
    if (downloadBtn) {
        downloadBtn.href = slipUrl;
        const ext = sub.slip_url.split('.').pop().split('?')[0] || 'png';
        downloadBtn.download = `slip_${sub.student_code}_${sub.id.substring(0, 8)}.${ext}`;
        downloadBtn.target = '_blank';
    }

    // Update queue position indicators
    const currentIndex = verificationQueue.findIndex(s => s.id === id);
    const totalCount = verificationQueue.length;
    const posIndicator = document.getElementById('queue-position-indicator');
    if (posIndicator) {
        posIndicator.textContent = `${currentIndex + 1} / ${totalCount}`;
    }

    const prevBtn = document.getElementById('prev-queue-btn');
    const nextBtn = document.getElementById('next-queue-btn');
    if (prevBtn) prevBtn.disabled = (currentIndex === 0);
    if (nextBtn) nextBtn.disabled = (currentIndex === totalCount - 1);

    verifyModal.classList.add('active');
}

function navigateVerifyQueue(direction) {
    if (!activeSubId || !verificationQueue.length) return;
    const currentIndex = verificationQueue.findIndex(s => s.id === activeSubId);
    if (currentIndex === -1) return;

    const nextIndex = currentIndex + direction;
    if (nextIndex >= 0 && nextIndex < verificationQueue.length) {
        openVerifyDialog(verificationQueue[nextIndex].id);
    }
}

// Handle decision trigger (Approve / Reject / Revert)
document.querySelectorAll('.decision-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        const action = e.currentTarget.getAttribute('data-action'); // 'Approve', 'Reject', 'Pending', 'RequestInfo'
        const comments = document.getElementById('verify-comments').value.trim();

        if (!activeSubId) return;

        if (action === 'Reject' && comments === '') {
            showToast('จำเป็นต้องกรอกรายละเอียดคำชี้แจงเพื่ออธิบายการปฏิเสธอนุมัติสลิปนี้', 'warning');
            return;
        }

        const actionNames = {
            'Approve': 'อนุมัติผ่านสลิป',
            'Reject': 'ปฏิเสธคำขอการส่งสลิป',
            'Pending': 'ย้อนสถานะตรวจสอบเป็นรอนำส่งใหม่',
            'RequestInfo': 'ส่งความเห็นแจ้งข้อมูลเพิ่มเติม'
        };
        const confirmText = `คุณยืนยันที่จะทำรายการ "${actionNames[action]}" สำหรับหลักฐานสลิปโอนเงินนี้ใช่หรือไม่?`;
        const isConfirmed = await showConfirm('ยืนยันรายการสลิป', confirmText);
        if (!isConfirmed) return;

        Loading.show('กำลังบันทึกผลการตรวจสอบสลิป...');
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/submissions.php`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    submission_id: activeSubId,
                    action: action,
                    comments: comments
                })
            });
            const result = await response.json();

            if (result.status === 'success') {
                const oldIndex = verificationQueue.findIndex(s => s.id === activeSubId);

                // Load updated queue in background
                await loadVerificationQueue();

                // If item is still in queue (e.g. filter is 'All'), next index is oldIndex + 1
                // Otherwise (item removed), next index is the same oldIndex (which points to next item)
                const isItemStillInQueue = verificationQueue.some(s => s.id === activeSubId);
                let nextIndex = oldIndex;
                if (isItemStillInQueue) {
                    nextIndex = oldIndex + 1;
                }

                if (verificationQueue.length > 0) {
                    const safeIndex = Math.max(0, Math.min(nextIndex, verificationQueue.length - 1));
                    openVerifyDialog(verificationQueue[safeIndex].id);
                } else {
                    verifyModal.classList.remove('active');
                    showToast('ตรวจเอกสารคำขอที่ค้างทั้งหมดเรียบร้อยแล้ว!', 'success');
                }
            } else {
                showToast(result.message, 'error');
            }
        } catch (error) {
            console.error(error);
            showToast('เกิดข้อผิดพลาดในการส่งข้อมูลตรวจสอบ', 'error');
        } finally {
            Loading.hide();
        }
    });
});

// Notifications count badge
async function loadUnreadNotificationsCount() {
    const badge = document.getElementById('admin-inbox-badge');
    if (!badge) return;

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/notifications.php?action=unread_count`, {
            headers: getAuthHeaders()
        });
        const result = await response.json();
        if (result.status === 'success') {
            const count = result.data.unread_count;
            if (count > 0) {
                badge.textContent = count;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    } catch (e) {
        console.error(e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadUnreadNotificationsCount();

    // Register Verification Queue Navigation Button Click Handlers
    const prevBtn = document.getElementById('prev-queue-btn');
    const nextBtn = document.getElementById('next-queue-btn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            navigateVerifyQueue(-1);
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            navigateVerifyQueue(1);
        });
    }

    // Register Keyboard Arrow Key Listeners for Modal Navigation
    document.addEventListener('keydown', (e) => {
        const verifyModal = document.getElementById('verify-modal');
        if (verifyModal && verifyModal.classList.contains('active')) {
            // Check if user is typing in comments box to prevent accidental navigation
            if (document.activeElement === document.getElementById('verify-comments')) {
                return;
            }
            if (e.key === 'ArrowLeft') {
                navigateVerifyQueue(-1);
            } else if (e.key === 'ArrowRight') {
                navigateVerifyQueue(1);
            }
        }
    });
});


// -----------------------------------------------------------------------------
// View 5: Audit Trail Logs Viewer
// -----------------------------------------------------------------------------
async function loadAuditTrail() {
    const tableBody = document.getElementById('audit-table-body');
    const cacheKey = 'admin_audit_trail';
    const cachedDataStr = localStorage.getItem(cacheKey);
    let hasRenderedCache = false;

    if (cachedDataStr) {
        try {
            const data = JSON.parse(cachedDataStr);
            renderAuditTable(data);
            hasRenderedCache = true;
        } catch (e) {
            console.error('Error parsing cached audit trail:', e);
        }
    }

    if (!hasRenderedCache) {
        tableBody.innerHTML = '<tr><td colspan="6"><div class="skeleton" style="height: 150px;"></div></td></tr>';
    }

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/audit.php`, {
            headers: getAuthHeaders()
        });
        const result = await response.json();

        if (result.status === 'success') {
            const newDataStr = JSON.stringify(result.data);
            if (newDataStr !== cachedDataStr || !hasRenderedCache) {
                localStorage.setItem(cacheKey, newDataStr);
                renderAuditTable(result.data);
            }
        }
    } catch (e) {
        console.error(e);
    }
}

function renderAuditTable(logs) {
    const tableBody = document.getElementById('audit-table-body');
    tableBody.innerHTML = '';

    if (logs.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">ไม่พบประวัติบันทึกกิจกรรมการใช้งานระบบ</td></tr>';
        return;
    }

    const actionTranslations = {
        'LOGIN': 'เข้าสู่ระบบ',
        'LOGOUT': 'ออกจากระบบ',
        'CREATE_STUDENT': 'เพิ่มนักศึกษา',
        'UPDATE_STUDENT': 'แก้ไขข้อมูลนักศึกษา',
        'DELETE_STUDENT': 'ลบข้อมูลนักศึกษา',
        'CREATE_SETTING': 'สร้างเกณฑ์เดือน',
        'UPDATE_SETTING': 'แก้ไขเกณฑ์เดือน',
        'SUBMIT_SLIP': 'ส่งสลิปชำระเงิน',
        'VERIFY_SLIP': 'อนุมัติ/ตรวจสอบสลิป'
    };

    logs.forEach(l => {
        const tr = document.createElement('tr');
        const timestamp = new Date(l.timestamp).toLocaleString('th-TH');

        // Format action name nicely
        const cleanAction = l.action.toUpperCase();
        const displayAction = actionTranslations[cleanAction] || cleanAction.replace(/_/g, ' ');

        tr.innerHTML = `
            <td>${timestamp}</td>
            <td><strong>${l.user_email || 'ระบบ/ผู้เข้าชมทั่วไป'}</strong></td>
            <td><span class="badge badge-gray">${displayAction}</span></td>
            <td>${l.table_name || '-'}</td>
            <td>${l.device} (${l.browser})</td>
            <td><code>${l.ip_address}</code></td>
        `;
        tableBody.appendChild(tr);
    });
}


// -----------------------------------------------------------------------------
// View 6: Report Center Exports Panel
// -----------------------------------------------------------------------------
function setupReportsPanel() {
    // Populate month selection in reports filters
    const reportMonthSelect = document.getElementById('report-month-setting');
    if (!reportMonthSelect) return;

    reportMonthSelect.innerHTML = '<option value="">เลือกเดือน</option>';

    const monthNames = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];

    // Load available settings
    // Since settings list is already synced, load options
    monthSettingsList.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${monthNames[s.month - 1]} ${s.year}`;
        reportMonthSelect.appendChild(opt);
    });
}

// Trigger Report Export Trigger
function triggerReportExport(reportType) {
    const monthSettingId = document.getElementById('report-month-setting').value;

    if (reportType === 'monthly' && empty(monthSettingId)) {
        showToast('โปรดเลือกเดือนที่ต้องการจากรายการตัวเลือกก่อนส่งออกรายงานนี้', 'warning');
        return;
    }

    // Build URL endpoint
    let url = `${CONFIG.API_BASE_URL}/reports.php?type=${reportType}&format=csv`;
    if (reportType === 'monthly') {
        url += `&month_setting_id=${monthSettingId}`;
    }

    // Call authorization check
    const token = localStorage.getItem('sb_access_token');

    // To download directly via standard link with Bearer token, we can use window.open or fetch.
    // Fetch and download helper is better to keep headers correct:
    fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to generate report export');
            }

            // Extract filename from disposition header
            const disposition = response.headers.get('Content-Disposition');
            let filename = `${reportType}_report.csv`;
            if (disposition && disposition.indexOf('attachment') !== -1) {
                const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                const matches = filenameRegex.exec(disposition);
                if (matches != null && matches[1]) {
                    filename = matches[1].replace(/['"]/g, '');
                }
            }

            return response.blob().then(blob => ({ blob, filename }));
        })
        .then(({ blob, filename }) => {
            const urlBlob = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = urlBlob;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(urlBlob);
        })
        .catch(e => {
            showToast('Error: ' + e.message, 'error');
        });
}

// Global modal helpers
window.openModal = function (modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        if (modalId === 'activity-create-modal') {
            const startInput = document.getElementById('activity-start-time');
            const endInput = document.getElementById('activity-end-time');

            const now = new Date();
            let startHours = now.getHours();
            let startMinutes = Math.round(now.getMinutes() / 30) * 30;
            if (startMinutes === 60) {
                startHours += 1;
                startMinutes = 0;
            }
            if (startHours >= 24) {
                startHours = 23;
                startMinutes = 30;
            }

            const startDateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHours, startMinutes);
            const startY = startDateObj.getFullYear();
            const startM = String(startDateObj.getMonth() + 1).padStart(2, '0');
            const startD = String(startDateObj.getDate()).padStart(2, '0');
            const startHStr = String(startDateObj.getHours()).padStart(2, '0');
            const startMinStr = String(startDateObj.getMinutes()).padStart(2, '0');

            if (startInput) {
                startInput.value = `${startY}-${startM}-${startD} ${startHStr}:${startMinStr}`;
            }

            if (endInput) {
                // Default to +2 hours
                const endDateObj = new Date(startDateObj.getTime() + (2 * 60 * 60 * 1000));
                const endY = endDateObj.getFullYear();
                const endM = String(endDateObj.getMonth() + 1).padStart(2, '0');
                const endD = String(endDateObj.getDate()).padStart(2, '0');
                const endHStr = String(endDateObj.getHours()).padStart(2, '0');
                const endMinStr = String(endDateObj.getMinutes()).padStart(2, '0');

                endInput.value = `${endY}-${endM}-${endD} ${endHStr}:${endMinStr}`;
            }
        }
    }
};
window.closeModal = function (modalId) {
    document.getElementById(modalId).classList.remove('active');
};

function empty(val) {
    return val === null || val === undefined || val === '';
}

// -----------------------------------------------------------------------------
// View 7: Activity Attendance QR Scanner
// -----------------------------------------------------------------------------
let scannerRunning = false;
let currentSelectedActivity = null;
let scannerFacingMode = 'environment';

function initActivitiesScanner() {
    const toggleBtn = document.getElementById('toggle-scanner-btn');
    const refreshBtn = document.getElementById('refresh-attendance-btn');
    const flipBtn = document.getElementById('flip-scanner-btn');

    if (toggleBtn) {
        toggleBtn.replaceWith(toggleBtn.cloneNode(true));
        const newToggleBtn = document.getElementById('toggle-scanner-btn');
        newToggleBtn.addEventListener('click', toggleActivitiesScanner);
    }

    if (refreshBtn) {
        refreshBtn.replaceWith(refreshBtn.cloneNode(true));
        const newRefreshBtn = document.getElementById('refresh-attendance-btn');
        newRefreshBtn.addEventListener('click', loadActivitiesAttendanceList);
    }

    if (flipBtn) {
        flipBtn.replaceWith(flipBtn.cloneNode(true));
        const newFlipBtn = document.getElementById('flip-scanner-btn');
        newFlipBtn.addEventListener('click', flipActivitiesScanner);
    }

    // Reset state
    currentSelectedActivity = null;
    document.getElementById('selected-activity-bar').innerHTML = `
        <p style="margin: 0; color: var(--text-secondary); font-size: 0.9rem;">สถานะ: <span style="font-weight: bold; color: var(--accent);">ยังไม่ได้เลือกกิจกรรม</span></p>
        <p style="margin: 0.25rem 0 0 0; font-size: 0.8rem; color: var(--text-muted);">กรุณากดปุ่ม <b>"เลือกเช็คชื่อ"</b> ในรายการกิจกรรมเพื่อเปิดกล้อง</p>
    `;
    document.getElementById('scanner-actions-area').style.display = 'none';
    document.getElementById('attendance-list-card').style.display = 'none';

    // Load lists
    loadActivitiesList();
}

function parseAsLocalDateTime(dateStr) {
    if (!dateStr) return null;
    let cleanStr = dateStr.replace(' ', 'T');
    if (cleanStr.includes('+')) {
        cleanStr = cleanStr.split('+')[0];
    }
    if (cleanStr.includes('Z')) {
        cleanStr = cleanStr.split('Z')[0];
    }
    return new Date(cleanStr);
}

async function loadActivitiesList() {
    const listBody = document.getElementById('activities-list-body');
    if (!listBody) return;

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/activities.php?action=list_activities&_t=${Date.now()}`, {
            headers: getAuthHeaders()
        });
        const result = await response.json();

        if (result.status === 'success') {
            const list = result.data || [];
            if (list.length === 0) {
                listBody.innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center text-muted" style="padding: 2rem;">ยังไม่มีกิจกรรมในระบบ กดปุ่ม "เพิ่มกิจกรรมใหม่" เพื่อเริ่มสร้าง</td>
                    </tr>
                `;
                return;
            }

            listBody.innerHTML = list.map(a => {
                const parsedStart = parseAsLocalDateTime(a.check_in_start);
                const parsedEnd = parseAsLocalDateTime(a.check_in_end);
                const startStr = parsedStart ? parsedStart.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : 'ไม่กำหนด';
                const endStr = parsedEnd ? parsedEnd.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : 'ไม่กำหนด';

                const statusBadge = a.status === 'Open'
                    ? `<span class="badge" style="background: rgba(34, 197, 94, 0.1); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.2); border-radius: 12px; padding: 0.25rem 0.5rem; font-size: 0.8rem; font-weight: 600;">(Open)</span>`
                    : `<span class="badge" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 12px; padding: 0.25rem 0.5rem; font-size: 0.8rem; font-weight: 600;">(Closed)</span>`;

                const isSelected = currentSelectedActivity && currentSelectedActivity.id === a.id;
                const selectBtnStyle = isSelected
                    ? `background: var(--accent); color: white; border-color: var(--accent);`
                    : `background: transparent; color: var(--text-primary); border: 1px solid var(--border-glass);`;

                return `
                    <tr>
                        <td style="font-weight: 700; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${a.name}</td>
                        <td>${statusBadge}</td>
                        <td style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.3;">
                            เริ่ม: ${startStr}<br>สิ้นสุด: ${endStr}
                        </td>
                        <td style="font-weight: bold; text-align: center;">${a.attendance_count} คน</td>
                        <td>
                            <div style="display: flex; gap: 0.5rem;">
                                <button class="btn btn-secondary" style="font-size: 0.8rem; padding: 0.4rem 0.75rem; font-family: var(--font-heading); ${selectBtnStyle}" 
                                    onclick="selectActivityForCheckIn('${a.id}', '${encodeURIComponent(a.name)}', '${a.status}', '${a.check_in_start || ''}', '${a.check_in_end || ''}')">
                                    ${isSelected ? '<i class="fas fa-check"></i> เลือกแล้ว' : 'เลือกเช็คชื่อ'}
                                </button>
                                <button class="btn btn-secondary toggle-act-btn" style="font-size: 0.8rem; padding: 0.4rem 0.75rem; font-family: var(--font-heading);" 
                                    onclick="toggleActivityStatus('${a.id}')">
                                    เปิด/ปิด
                                </button>
                                <button class="btn btn-secondary delete-act-btn" style="font-size: 0.8rem; padding: 0.4rem 0.75rem; font-family: var(--font-heading); color: #ef4444;" 
                                    onclick="deleteActivity('${a.id}', '${encodeURIComponent(a.name)}')">
                                    ลบ
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            listBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">${result.message}</td></tr>`;
        }
    } catch (e) {
        listBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">เกิดข้อผิดพลาดในการโหลดรายการกิจกรรม</td></tr>`;
        console.error(e);
    }
}

async function handleCreateActivitySubmit() {
    const name = document.getElementById('activity-name').value.trim();
    const start = document.getElementById('activity-start-time').value;
    const end = document.getElementById('activity-end-time').value;
    const status = document.getElementById('activity-status').value;

    if (!name) {
        showToast('กรุณาระบุชื่อกิจกรรม', 'warning');
        return;
    }

    Loading.show('กำลังสร้างกิจกรรมใหม่...');
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/activities.php?action=create_activity`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ name, check_in_start: start, check_in_end: end, status })
        });
        const result = await response.json();

        if (result.status === 'success') {
            showToast('สร้างกิจกรรมสำเร็จ', 'success');
            closeModal('activity-create-modal');
            document.getElementById('activity-create-form').reset();
            loadActivitiesList();
        } else {
            showToast('ล้มเหลว: ' + result.message, 'error');
        }
    } catch (e) {
        showToast('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
        console.error(e);
    } finally {
        Loading.hide();
    }
}

async function selectActivityForCheckIn(id, nameEscaped, status, start, end) {
    const name = decodeURIComponent(nameEscaped);
    currentSelectedActivity = { id, name, status, start, end };

    // Update active row highlighting
    await loadActivitiesList();

    // Update scanner panel
    const statusText = status === 'Open'
        ? `<span style="color: #22c55e; font-weight: bold;">เปิดเช็คชื่อ</span>`
        : `<span style="color: #ef4444; font-weight: bold;">ปิดเช็คชื่อ</span>`;

    let timeLimits = '';
    if (start || end) {
        const parsedStart = start ? parseAsLocalDateTime(start) : null;
        const parsedEnd = end ? parseAsLocalDateTime(end) : null;
        const startStr = parsedStart ? parsedStart.toLocaleString('th-TH') : 'ไม่จำกัด';
        const endStr = parsedEnd ? parsedEnd.toLocaleString('th-TH') : 'ไม่จำกัด';
        timeLimits = `<br><span style="font-size: 0.8rem; color: var(--text-muted);">ช่วงเวลาสแกน: ${startStr} - ${endStr}</span>`;
    }

    document.getElementById('selected-activity-bar').innerHTML = `
        <p style="margin: 0; color: var(--text-primary); font-size: 1rem; font-weight: 700;">กิจกรรม: ${name}</p>
        <p style="margin: 0.25rem 0 0 0; font-size: 0.9rem; color: var(--text-secondary);">สถานะ: ${statusText}${timeLimits}</p>
    `;

    document.getElementById('scanner-actions-area').style.display = 'block';
    document.getElementById('attendance-list-card').style.display = 'block';
    document.getElementById('scan-feedback').style.display = 'none';

    // Stop scanner if already running
    if (scannerRunning) {
        stopActivitiesScanner();
    }

    loadActivitiesAttendanceList();
}

async function toggleActivityStatus(activityId) {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/activities.php?action=toggle_activity_status`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ activity_id: activityId })
        });
        const result = await response.json();

        if (result.status === 'success') {
            if (currentSelectedActivity && currentSelectedActivity.id === activityId) {
                // Refresh selection details (which also re-renders the list)
                const actName = currentSelectedActivity.name;
                const actStart = currentSelectedActivity.start;
                const actEnd = currentSelectedActivity.end;
                await selectActivityForCheckIn(activityId, encodeURIComponent(actName), result.data.status, actStart, actEnd);
            } else {
                await loadActivitiesList();
            }
        } else {
            showToast('ข้อผิดพลาด: ' + result.message, 'error');
        }
    } catch (e) {
        showToast('เกิดข้อผิดพลาดในการเปลี่ยนสถานะกิจกรรม', 'error');
        console.error(e);
    }
}

async function deleteActivity(activityId, nameEscaped) {
    const name = decodeURIComponent(nameEscaped);
    const isConfirmed = await showConfirm(
        'ยืนยันการลบกิจกรรม',
        `คุณต้องการลบกิจกรรม "${name}" และบันทึกการเช็คชื่อทั้งหมดหรือไม่?\n(การดำเนินการนี้ไม่สามารถย้อนกลับได้)`
    );
    if (!isConfirmed) {
        return;
    }

    Loading.show('กำลังลบกิจกรรม...');
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/activities.php?action=delete_activity`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ activity_id: activityId })
        });
        const result = await response.json();

        if (result.status === 'success') {
            showToast('ลบกิจกรรมสำเร็จ', 'success');
            if (currentSelectedActivity && currentSelectedActivity.id === activityId) {
                initActivitiesScanner();
            } else {
                await loadActivitiesList();
            }
        } else {
            showToast('ล้มเหลว: ' + result.message, 'error');
        }
    } catch (e) {
        showToast('เกิดข้อผิดพลาดในการลบข้อมูล', 'error');
        console.error(e);
    } finally {
        Loading.hide();
    }
}

// Bind to window to guarantee global scope accessibility
window.selectActivityForCheckIn = selectActivityForCheckIn;
window.toggleActivityStatus = toggleActivityStatus;
window.deleteActivity = deleteActivity;

function toggleActivitiesScanner() {
    if (!currentSelectedActivity) {
        showToast('กรุณาเลือกกิจกรรมก่อน', 'warning');
        return;
    }

    if (scannerRunning) {
        stopActivitiesScanner();
    } else {
        startActivitiesScanner();
    }
}

function startActivitiesScanner() {
    const readerContainer = document.getElementById('qr-reader-container');
    const toggleBtn = document.getElementById('toggle-scanner-btn');
    const statusText = document.getElementById('scanner-status-text');
    const flipBtn = document.getElementById('flip-scanner-btn');

    if (!toggleBtn || !statusText || !readerContainer) return;

    readerContainer.style.display = 'block';
    toggleBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
        ปิดกล้องสแกน
    `;
    toggleBtn.className = 'btn btn-secondary';
    statusText.textContent = 'กล้องกำลังสแกน...';
    scannerRunning = true;

    if (flipBtn) {
        flipBtn.style.display = 'inline-flex';
    }

    html5QrcodeScanner = new Html5Qrcode("qr-reader");

    const qrCodeSuccessCallback = async (decodedText, decodedResult) => {
        stopActivitiesScanner();
        await handleActivityCheckIn(decodedText, currentSelectedActivity.id);

        setTimeout(() => {
            if (activeTab === 'activities' && !scannerRunning && currentSelectedActivity) {
                startActivitiesScanner();
            }
        }, 2500);
    };

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    const readerEl = document.getElementById('qr-reader');
    if (readerEl) {
        if (scannerFacingMode === 'user') {
            readerEl.classList.add('mirror-mode');
        } else {
            readerEl.classList.remove('mirror-mode');
        }
    }

    html5QrcodeScanner.start(
        { facingMode: scannerFacingMode },
        config,
        qrCodeSuccessCallback
    ).catch(err => {
        console.error("Unable to start scanner: ", err);
        statusText.textContent = 'ไม่สามารถเข้าถึงกล้องถ่ายรูปได้';
        stopActivitiesScanner();
    });
}

function stopActivitiesScanner() {
    const readerContainer = document.getElementById('qr-reader-container');
    const toggleBtn = document.getElementById('toggle-scanner-btn');
    const statusText = document.getElementById('scanner-status-text');
    const flipBtn = document.getElementById('flip-scanner-btn');

    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            html5QrcodeScanner = null;
        }).catch(err => {
            console.warn("Error stopping scanner: ", err);
            html5QrcodeScanner = null;
        });
    }

    if (readerContainer) readerContainer.style.display = 'none';
    if (toggleBtn) {
        toggleBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            เปิดกล้องสแกน QR Code
        `;
        toggleBtn.className = 'btn btn-primary';
    }
    if (flipBtn) {
        flipBtn.style.display = 'none';
    }
    if (statusText) statusText.textContent = 'กล้องปิดอยู่';
    scannerRunning = false;
}

async function flipActivitiesScanner() {
    if (!html5QrcodeScanner || !scannerRunning) return;

    scannerFacingMode = scannerFacingMode === 'environment' ? 'user' : 'environment';
    Loading.show('กำลังสลับกล้อง...');

    try {
        await html5QrcodeScanner.stop();
        html5QrcodeScanner = null;

        html5QrcodeScanner = new Html5Qrcode("qr-reader");
        const config = { fps: 10, qrbox: { width: 250, height: 250 } };

        const qrCodeSuccessCallback = async (decodedText, decodedResult) => {
            stopActivitiesScanner();
            await handleActivityCheckIn(decodedText, currentSelectedActivity.id);

            setTimeout(() => {
                if (activeTab === 'activities' && !scannerRunning && currentSelectedActivity) {
                    startActivitiesScanner();
                }
            }, 2500);
        };

        const readerEl = document.getElementById('qr-reader');
        if (readerEl) {
            if (scannerFacingMode === 'user') {
                readerEl.classList.add('mirror-mode');
            } else {
                readerEl.classList.remove('mirror-mode');
            }
        }

        await html5QrcodeScanner.start(
            { facingMode: scannerFacingMode },
            config,
            qrCodeSuccessCallback
        );
    } catch (err) {
        console.error("Error switching camera: ", err);
        showToast('ไม่สามารถเปิดใช้งานกล้องสลับได้', 'error');
        stopActivitiesScanner();
    } finally {
        Loading.hide();
    }
}

async function handleActivityCheckIn(studentId, activityId) {
    const feedback = document.getElementById('scan-feedback');
    const icon = document.getElementById('scan-feedback-icon');
    const title = document.getElementById('scan-feedback-title');
    const msg = document.getElementById('scan-feedback-msg');

    if (!feedback || !icon || !title || !msg) return;

    feedback.style.display = 'block';
    feedback.style.borderLeftColor = 'var(--accent)';
    icon.innerHTML = '⏳';
    title.textContent = 'กำลังเช็คชื่อ...';
    msg.textContent = `รหัสนักศึกษา: ${studentId}`;

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/activities.php?action=check_in`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ student_id: studentId, activity_id: activityId })
        });

        const result = await response.json();

        if (result.status === 'success') {
            feedback.style.borderLeftColor = '#22c55e';
            icon.innerHTML = '✅';
            title.textContent = 'เช็คชื่อสำเร็จ';
            msg.textContent = `${result.data.student_name} (${result.data.student_id}) ห้อง ${result.data.student_class} เช็คชื่อเสร็จสิ้น`;

            await loadActivitiesAttendanceList();
            await loadActivitiesList(); // Update counts
        } else {
            feedback.style.borderLeftColor = '#ef4444';
            icon.innerHTML = '❌';
            title.textContent = 'เช็คชื่อล้มเหลว';
            msg.textContent = result.message || 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์';
        }
    } catch (e) {
        feedback.style.borderLeftColor = '#ef4444';
        icon.innerHTML = '❌';
        title.textContent = 'เช็คชื่อล้มเหลว';
        msg.textContent = 'เกิดข้อผิดพลาดในการติดต่อฐานข้อมูล';
        console.error(e);
    }
}

async function loadActivitiesAttendanceList() {
    const tableBody = document.getElementById('attendance-table-body');
    const tableTitle = document.getElementById('attendance-table-title');

    if (!tableBody || !currentSelectedActivity) return;

    if (tableTitle) tableTitle.textContent = `รายชื่อผู้เช็คชื่อกิจกรรม: ${currentSelectedActivity.name}`;

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/activities.php?action=list_attendance&activity_id=${currentSelectedActivity.id}`, {
            headers: getAuthHeaders()
        });
        const result = await response.json();

        if (result.status === 'success') {
            const list = result.data || [];
            if (list.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center text-muted" style="padding: 2rem;">ยังไม่มีผู้เช็คชื่อเข้าร่วมกิจกรรม '${currentSelectedActivity.name}'</td>
                    </tr>
                `;
                return;
            }

            tableBody.innerHTML = list.map(item => {
                const formattedDate = new Date(item.checked_in_at).toLocaleString('th-TH');
                return `
                    <tr>
                        <td>${formattedDate}</td>
                        <td style="font-weight: 700;">${item.student_id}</td>
                        <td>${item.student_name}</td>
                        <td>${item.student_class} (ปี ${item.academic_year})</td>
                        <td>
                            <span class="badge" style="background: rgba(249, 115, 22, 0.1); color: var(--accent); border: 1px solid rgba(249, 115, 22, 0.2); border-radius: 12px; font-weight: 600; padding: 0.2rem 0.6rem; font-size: 0.8rem;">
                                ${item.checked_in_by_name || 'ระบบอัตโนมัติ'}
                            </span>
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted" style="padding: 2rem; color: #ef4444;">ล้มเหลวในการโหลดรายชื่อ: ${result.message}</td>
                </tr>
            `;
        }
    } catch (e) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-muted" style="padding: 2rem; color: #ef4444;">เกิดข้อผิดพลาดในการโหลดข้อมูล</td>
            </tr>
        `;
        console.error(e);
    }
}

// -----------------------------------------------------------------------------
// Custom Date-Time Picker Controller
// -----------------------------------------------------------------------------
const CustomDateTimePicker = {
    activeInput: null,
    selectedDate: null, // Date object (only date part)
    selectedTime: "10:00 AM",
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),

    init() {
        const startInput = document.getElementById('activity-start-time');
        const endInput = document.getElementById('activity-end-time');

        if (startInput) {
            startInput.addEventListener('click', (e) => {
                e.stopPropagation();
                this.open(startInput);
            });
            const wrapper1 = startInput.closest('.custom-dt-input-wrapper');
            if (wrapper1) {
                wrapper1.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.open(startInput);
                });
            }
        }
        if (endInput) {
            endInput.addEventListener('click', (e) => {
                e.stopPropagation();
                this.open(endInput);
            });
            const wrapper2 = endInput.closest('.custom-dt-input-wrapper');
            if (wrapper2) {
                wrapper2.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.open(endInput);
                });
            }
        }

        const cancelBtn = document.getElementById('dtpicker-cancel-btn');
        const confirmBtn = document.getElementById('dtpicker-confirm-btn');
        const prevMonthBtn = document.getElementById('dtpicker-prev-month-btn');
        const nextMonthBtn = document.getElementById('dtpicker-next-month-btn');

        if (cancelBtn) cancelBtn.addEventListener('click', () => this.close());
        if (confirmBtn) confirmBtn.addEventListener('click', () => this.confirm());
        if (prevMonthBtn) prevMonthBtn.addEventListener('click', () => this.changeMonth(-1));
        if (nextMonthBtn) nextMonthBtn.addEventListener('click', () => this.changeMonth(1));

        const modal = document.getElementById('custom-datetime-picker-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.close();
            });
        }
    },

    open(inputElement) {
        this.activeInput = inputElement;

        const val = inputElement.value; // expected: "YYYY-MM-DDTHH:mm"
        let dateObj = new Date();
        if (val) {
            // Check if there's a 'T' in it, otherwise replace space with T
            const formattedVal = val.includes('T') ? val : val.replace(' ', 'T');
            const parsed = new Date(formattedVal);
            if (!isNaN(parsed.getTime())) {
                dateObj = parsed;
            }
        }

        this.selectedDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());

        let hours = dateObj.getHours();
        let minutes = dateObj.getMinutes();
        // round to nearest 30 mins
        minutes = Math.round(minutes / 30) * 30;
        if (minutes === 60) {
            hours += 1;
            minutes = 0;
        }
        if (hours >= 24) {
            hours = 23;
            minutes = 30;
        }

        this.selectedTime = this.formatTime12h(hours, minutes);
        this.currentMonth = this.selectedDate.getMonth();
        this.currentYear = this.selectedDate.getFullYear();

        this.render();
        const modal = document.getElementById('custom-datetime-picker-modal');
        if (modal) {
            modal.classList.add('active');
        }
    },

    close() {
        const modal = document.getElementById('custom-datetime-picker-modal');
        if (modal) {
            modal.classList.remove('active');
        }
        this.activeInput = null;
    },

    confirm() {
        if (!this.activeInput) return;

        const timeParts = this.parseTime12h(this.selectedTime);
        const finalDate = new Date(
            this.selectedDate.getFullYear(),
            this.selectedDate.getMonth(),
            this.selectedDate.getDate(),
            timeParts.hours,
            timeParts.minutes
        );

        const yyyy = finalDate.getFullYear();
        const mm = String(finalDate.getMonth() + 1).padStart(2, '0');
        const dd = String(finalDate.getDate()).padStart(2, '0');
        const hh = String(finalDate.getHours()).padStart(2, '0');
        const min = String(finalDate.getMinutes()).padStart(2, '0');

        // Write the standard format back
        this.activeInput.value = `${yyyy}-${mm}-${dd} ${hh}:${min}`;
        this.activeInput.dispatchEvent(new Event('change'));
        this.close();
    },

    changeMonth(dir) {
        this.currentMonth += dir;
        if (this.currentMonth < 0) {
            this.currentMonth = 11;
            this.currentYear -= 1;
        } else if (this.currentMonth > 11) {
            this.currentMonth = 0;
            this.currentYear += 1;
        }
        this.renderCalendar();
    },

    formatTime12h(hours, minutes) {
        const ampm = hours >= 12 ? 'PM' : 'AM';
        let h = hours % 12;
        h = h ? h : 12;
        const m = String(minutes).padStart(2, '0');
        return `${h}:${m} ${ampm}`;
    },

    parseTime12h(timeStr) {
        const parts = timeStr.split(' ');
        const ampm = parts[1];
        const timeParts = parts[0].split(':');
        let hours = parseInt(timeParts[0]);
        const minutes = parseInt(timeParts[1]);

        if (ampm === 'PM' && hours < 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;

        return { hours, minutes };
    },

    getMonthName(monthIndex) {
        const months = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];
        return months[monthIndex];
    },

    getMonthNameShort(monthIndex) {
        const months = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
        ];
        return months[monthIndex];
    },

    render() {
        this.renderCalendar();
        this.renderTimeList();
        this.updateDisplayValue();
    },

    updateDisplayValue() {
        const displayInput = document.getElementById('dtpicker-display-val');
        if (displayInput && this.selectedDate) {
            const month = this.getMonthNameShort(this.selectedDate.getMonth());
            const day = this.selectedDate.getDate();
            const year = this.selectedDate.getFullYear();
            displayInput.value = `${month} ${day}, ${year}`;
        }
    },

    renderCalendar() {
        const monthYearLabel = document.getElementById('dtpicker-month-year');
        if (monthYearLabel) {
            monthYearLabel.textContent = `${this.getMonthName(this.currentMonth)} ${this.currentYear}`;
        }

        const grid = document.getElementById('dtpicker-days-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const firstDayOfMonth = new Date(this.currentYear, this.currentMonth, 1);
        let startDayIndex = firstDayOfMonth.getDay() - 1;
        if (startDayIndex < 0) startDayIndex = 6; // Sunday is 6, Monday is 0

        const totalDaysInMonth = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
        const totalDaysInPrevMonth = new Date(this.currentYear, this.currentMonth, 0).getDate();

        // Prev Month Days
        for (let i = startDayIndex - 1; i >= 0; i--) {
            const dayNum = totalDaysInPrevMonth - i;
            const prevMonthIdx = this.currentMonth === 0 ? 11 : this.currentMonth - 1;
            const prevYearVal = this.currentMonth === 0 ? this.currentYear - 1 : this.currentYear;

            const dayEl = document.createElement('div');
            dayEl.className = 'dtpicker-day other-month';
            dayEl.textContent = dayNum;
            dayEl.addEventListener('click', () => {
                this.selectedDate = new Date(prevYearVal, prevMonthIdx, dayNum);
                this.currentMonth = prevMonthIdx;
                this.currentYear = prevYearVal;
                this.render();
            });
            grid.appendChild(dayEl);
        }

        // Current Month Days
        const today = new Date();
        for (let dayNum = 1; dayNum <= totalDaysInMonth; dayNum++) {
            const dayEl = document.createElement('div');
            dayEl.className = 'dtpicker-day';
            dayEl.textContent = dayNum;

            const dateVal = new Date(this.currentYear, this.currentMonth, dayNum);

            if (this.selectedDate &&
                this.selectedDate.getDate() === dayNum &&
                this.selectedDate.getMonth() === this.currentMonth &&
                this.selectedDate.getFullYear() === this.currentYear) {
                dayEl.classList.add('selected');
            }

            if (today.getDate() === dayNum &&
                today.getMonth() === this.currentMonth &&
                today.getFullYear() === this.currentYear) {
                dayEl.classList.add('today');
            }

            dayEl.addEventListener('click', () => {
                this.selectedDate = dateVal;
                this.renderCalendar();
                this.updateDisplayValue();
            });
            grid.appendChild(dayEl);
        }

        // Next Month Days
        const totalCellsUsed = startDayIndex + totalDaysInMonth;
        const totalCellsNeeded = 42;
        const nextMonthDaysNeeded = totalCellsNeeded - totalCellsUsed;

        const nextMonthIdx = this.currentMonth === 11 ? 0 : this.currentMonth + 1;
        const nextYearVal = this.currentMonth === 11 ? this.currentYear + 1 : this.currentYear;

        for (let dayNum = 1; dayNum <= nextMonthDaysNeeded; dayNum++) {
            const dayEl = document.createElement('div');
            dayEl.className = 'dtpicker-day other-month';
            dayEl.textContent = dayNum;
            dayEl.addEventListener('click', () => {
                this.selectedDate = new Date(nextYearVal, nextMonthIdx, dayNum);
                this.currentMonth = nextMonthIdx;
                this.currentYear = nextYearVal;
                this.render();
            });
            grid.appendChild(dayEl);
        }
    },

    renderTimeList() {
        const container = document.getElementById('dtpicker-time-list');
        if (!container) return;
        container.innerHTML = '';

        const timeList = [];
        for (let h = 0; h < 24; h++) {
            timeList.push(this.formatTime12h(h, 0));
            timeList.push(this.formatTime12h(h, 30));
        }

        let selectedItemEl = null;

        timeList.forEach(timeStr => {
            const item = document.createElement('div');
            item.className = 'dtpicker-time-item';
            item.textContent = timeStr;

            if (timeStr === this.selectedTime) {
                item.classList.add('selected');
                selectedItemEl = item;
            }

            item.addEventListener('click', () => {
                this.selectedTime = timeStr;
                container.querySelectorAll('.dtpicker-time-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
            });

            container.appendChild(item);
        });
    }
};

/**
 * Display a custom toast notification in the bottom right corner
 * @param {string} message - Notification text
 * @param {string} type - 'success', 'error', or 'warning'
 */
function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconClass = 'fa-circle-check';
    let iconColor = 'var(--status-green-text)';
    if (type === 'error') {
        iconClass = 'fa-circle-xmark';
        iconColor = 'var(--status-red-text)';
    } else if (type === 'warning') {
        iconClass = 'fa-circle-exclamation';
        iconColor = 'var(--accent)';
    }

    toast.innerHTML = `
        <i class="fa-solid ${iconClass}" style="color: ${iconColor}; font-size: 1.25rem;"></i>
        <div style="font-size: 0.95rem; font-weight: 500; font-family: var(--font-body);">${message}</div>
    `;

    container.appendChild(toast);

    // Auto-remove after 3 seconds
    setTimeout(() => {
        toast.classList.add('fade-out');
        toast.addEventListener('animationend', () => {
            toast.remove();
            if (container.children.length === 0) {
                container.remove();
            }
        });
    }, 3000);
}

/**
 * Display a custom confirmation modal returning a promise (true/false)
 * @param {string} title - Title of the confirm dialog
 * @param {string} message - Question/message details
 * @returns {Promise<boolean>}
 */
function showConfirm(title, message) {
    return new Promise((resolve) => {
        const modalId = 'custom-confirm-modal';
        let modalEl = document.getElementById(modalId);
        if (modalEl) modalEl.remove();

        modalEl = document.createElement('div');
        modalEl.id = modalId;
        modalEl.className = 'modal-backdrop';
        modalEl.style.zIndex = '20000';

        modalEl.innerHTML = `
            <div class="modal-content" style="background-color: var(--modal-bg); max-width: 400px; width: 100%; box-shadow: var(--shadow-xl); border: 1px solid var(--border-glass);">
                <div class="modal-header" style="border-bottom: none; padding-bottom: 0.5rem;">
                    <h3 style="font-family: var(--font-heading); margin: 0; color: var(--text-primary); font-size: 1.2rem;">${title}</h3>
                </div>
                <div class="modal-body" style="padding-top: 0.5rem; padding-bottom: 1.5rem;">
                    <p style="margin: 0; font-size: 0.95rem; color: var(--text-secondary); line-height: 1.5; white-space: pre-line;">${message}</p>
                </div>
                <div class="modal-footer" style="margin-top: 0; border-top: none; padding-top: 0; gap: 0.75rem; justify-content: flex-end; display: flex;">
                    <button type="button" id="confirm-cancel-btn" class="btn btn-secondary" style="padding: 0.5rem 1rem;">ยกเลิก</button>
                    <button type="button" id="confirm-ok-btn" class="btn btn-primary" style="padding: 0.5rem 1rem; background-color: var(--accent); color: white; border: none;">ตกลง</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalEl);

        // Force reflow and add active class for transition
        modalEl.offsetHeight;
        modalEl.classList.add('active');

        const cancelBtn = modalEl.querySelector('#confirm-cancel-btn');
        const okBtn = modalEl.querySelector('#confirm-ok-btn');

        const cleanUp = (value) => {
            modalEl.classList.remove('active');
            setTimeout(() => {
                modalEl.remove();
            }, 300);
            resolve(value);
        };

        cancelBtn.addEventListener('click', () => cleanUp(false));
        okBtn.addEventListener('click', () => cleanUp(true));

        // Clicking backdrop triggers cancel
        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl) {
                cleanUp(false);
            }
        });
    });
}

/**
 * Global Loading Overlay Helper
 */
const Loading = {
    show(message = 'กำลังโหลดข้อมูล...') {
        let overlay = document.getElementById('global-loading-overlay');
        if (overlay) overlay.remove();

        overlay = document.createElement('div');
        overlay.id = 'global-loading-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background-color: rgba(9, 13, 22, 0.7);
            backdrop-filter: blur(8px);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            gap: 1.5rem;
            z-index: 99999;
            opacity: 0;
            transition: opacity 0.2s ease;
        `;

        overlay.innerHTML = `
            <div class="loading-spinner" style="
                width: 50px;
                height: 50px;
                border: 4px solid rgba(255, 255, 255, 0.1);
                border-top: 4px solid var(--accent, #f97316);
                border-radius: 50%;
                animation: spin 1s linear infinite;
            "></div>
            <div style="
                color: #ffffff;
                font-family: var(--font-body);
                font-size: 1.1rem;
                font-weight: 500;
                letter-spacing: 0.5px;
            ">${message}</div>
        `;

        // Add keyframes dynamically if not exists
        if (!document.getElementById('loading-spin-style')) {
            const style = document.createElement('style');
            style.id = 'loading-spin-style';
            style.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(overlay);

        // Force reflow and transition
        overlay.offsetHeight;
        overlay.style.opacity = '1';
    },

    hide() {
        const overlay = document.getElementById('global-loading-overlay');
        if (!overlay) return;

        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.remove();
        }, 200);
    }
};

/**
 * Setup Admin Change Password form listener and submission handler
 */
function setupChangePasswordForm() {
    const form = document.getElementById('admin-change-password-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const currentPassword = document.getElementById('admin-current-password').value;
        const newPassword = document.getElementById('admin-new-password').value;
        const confirmPassword = document.getElementById('admin-confirm-password').value;

        if (newPassword !== confirmPassword) {
            showToast('รหัสผ่านใหม่และรหัสผ่านยืนยันไม่ตรงกัน', 'warning');
            return;
        }

        if (newPassword.length < 6) {
            showToast('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร', 'warning');
            return;
        }

        const conf = await showConfirm(
            'ยืนยันการเปลี่ยนรหัสผ่าน',
            'คุณต้องการบันทึกการเปลี่ยนรหัสผ่านใหม่ของผู้ดูแลระบบนี้ใช่หรือไม่?'
        );
        if (!conf) return;

        Loading.show('กำลังตรวจสอบสิทธิ์และเปลี่ยนรหัสผ่าน...');
        try {
            const client = getSupabaseClient();
            if (!client) throw new Error('Supabase client not initialized');

            // 1. Re-authenticate to verify current password
            const email = currentUser.email;
            const { error: signInError } = await client.auth.signInWithPassword({
                email: email,
                password: currentPassword
            });

            if (signInError) {
                showToast('รหัสผ่านปัจจุบันไม่ถูกต้อง', 'error');
                return;
            }

            // 2. Update user password in Supabase
            const { error: updateError } = await client.auth.updateUser({
                password: newPassword
            });

            if (updateError) {
                showToast('ไม่สามารถเปลี่ยนรหัสผ่านได้: ' + updateError.message, 'error');
                return;
            }

            // 3. Log to audit database via local PHP API
            try {
                await fetch(`${CONFIG.API_BASE_URL}/auth.php?action=log_password_change`, {
                    method: 'POST',
                    headers: getAuthHeaders()
                });
            } catch (auditError) {
                console.error('Failed to log password change audit:', auditError);
            }

            // Success
            showToast('เปลี่ยนรหัสผ่านใหม่เรียบร้อยแล้ว!', 'success');
            form.reset();

        } catch (error) {
            console.error(error);
            showToast('เกิดข้อผิดพลาดไม่คาดคิดในระบบ', 'error');
        } finally {
            Loading.hide();
        }
    });
}

function setupAutocomplete() {
    const searchInput = document.getElementById('target-search-input');
    const suggestionsList = document.getElementById('target-autocomplete-list');
    if (!searchInput || !suggestionsList) return;

    // Handle search input events
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        if (!query) {
            suggestionsList.innerHTML = '';
            suggestionsList.classList.add('hidden');
            return;
        }

        // Filter student list
        const matches = studentList.filter(s => {
            const idMatch = s.student_id && s.student_id.toLowerCase().includes(query);
            const nameMatch = s.full_name && s.full_name.toLowerCase().includes(query);
            const nickMatch = s.nickname && s.nickname.toLowerCase().includes(query);
            
            // Not already selected
            const isNotSelected = !selectedCustomMemberIds.includes(s.id);
            
            return (idMatch || nameMatch || nickMatch) && isNotSelected;
        });

        // Render suggestions list
        suggestionsList.innerHTML = '';
        if (matches.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.style.cssText = 'padding: 0.6rem 0.8rem; font-size: 0.8rem; color: var(--text-muted); text-align: center;';
            emptyEl.innerHTML = '<i class="fas fa-info-circle"></i> ไม่พบรายชื่อนักศึกษา';
            suggestionsList.appendChild(emptyEl);
        } else {
            matches.slice(0, 10).forEach(s => {
                const sugg = document.createElement('div');
                sugg.style.cssText = 'padding: 0.5rem 0.8rem; cursor: pointer; border-bottom: 1px solid var(--border-glass); display: flex; flex-direction: column; gap: 0.1rem; font-size: 0.8rem; color: var(--text-primary); transition: background 0.15s; background: transparent;';
                sugg.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 700; color: var(--accent);">${s.nickname || '-'}</span>
                        <span style="font-size: 0.72rem; color: var(--text-secondary); font-family: monospace;">${s.student_id}</span>
                    </div>
                    <span style="font-size: 0.75rem; color: var(--text-primary); font-weight: 500;">${s.full_name}</span>
                `;

                sugg.addEventListener('mouseenter', () => sugg.style.background = 'var(--bg-glass-hover)');
                sugg.addEventListener('mouseleave', () => sugg.style.background = 'transparent');
                
                sugg.addEventListener('click', () => {
                    selectedCustomMemberIds.push(s.id);
                    searchInput.value = '';
                    suggestionsList.innerHTML = '';
                    suggestionsList.classList.add('hidden');
                    renderSelectedTargetsCards();
                });

                suggestionsList.appendChild(sugg);
            });
        }
        suggestionsList.classList.remove('hidden');
    });

    // Close recommendations list on document click
    document.addEventListener('click', (e) => {
        if (e.target !== searchInput && e.target !== suggestionsList && !suggestionsList.contains(e.target)) {
            suggestionsList.classList.add('hidden');
        }
    });

    // Toggle container on dropdown change
    const selectEl = document.getElementById('setting-targets-select');
    if (selectEl) {
        selectEl.addEventListener('change', (e) => {
            const customTargetsContainer = document.getElementById('custom-targets-container');
            if (customTargetsContainer) {
                if (e.target.value === 'custom') {
                    customTargetsContainer.classList.remove('hidden');
                    renderSelectedTargetsCards();
                } else {
                    customTargetsContainer.classList.add('hidden');
                }
            }
        });
    }
}

async function loadSystemSettings() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/settings.php?action=get_system_settings`, {
            headers: getAuthHeaders()
        });
        const result = await response.json();
        if (result.status === 'success') {
            const toggle = document.getElementById('policy-enabled-toggle');
            const input = document.getElementById('policy-text-input');
            if (toggle) toggle.checked = (result.data.payment_policy_enabled === 'true');
            if (input) input.value = result.data.payment_policy_text || '';
        }
    } catch (e) {
        console.error(e);
        showToast('ไม่สามารถดึงค่านโยบายระบบได้', 'error');
    }
}

function setupPolicyForm() {
    const form = document.getElementById('admin-policy-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const toggle = document.getElementById('policy-enabled-toggle');
        const input = document.getElementById('policy-text-input');
        
        const payload = {
            payment_policy_enabled: toggle ? toggle.checked.toString() : 'false',
            payment_policy_text: input ? input.value.trim() : ''
        };

        const conf = await showConfirm(
            'ยืนยันการตั้งค่านโยบาย',
            'คุณต้องการบันทึกการตั้งค่านโยบายและข้อตกลงการชำระเงินใหม่ใช่หรือไม่?'
        );
        if (!conf) return;

        Loading.show('กำลังบันทึกตั้งค่านโยบาย...');
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/settings.php?action=save_system_settings`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (result.status === 'success') {
                showToast('บันทึกการตั้งค่านโยบายเรียบร้อยแล้ว!', 'success');
            } else {
                showToast('บันทึกไม่สำเร็จ: ' + result.message, 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
        } finally {
            Loading.hide();
        }
    });
}
