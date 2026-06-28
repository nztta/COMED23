// public/js/dashboard.js

// App State
let currentUser = null;
let activeTab = 'overview';
let charts = {}; // references to ApexCharts objects
let studentList = [];
let monthSettingsList = [];
let verificationQueue = [];

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

    // 4. Initial Load
    await switchTab('overview');
});

function updateProfileUI() {
    const userInitials = document.getElementById('user-avatar-initials');
    const userName = document.getElementById('user-full-name');
    const userRole = document.getElementById('user-role-name');

    // Extract initials
    const email = currentUser.email || 'Staff';
    const initials = email.substring(0, 2).toUpperCase();

    if (userInitials) userInitials.textContent = initials;
    if (userName) userName.textContent = email;
    // Note: Local role (Admin/Finance/Auditor/Viewer) will be queried from the checkAuthState session.
    // For simplicity, we decode JWT claims or fetch from localStorage
    const localRoleName = localStorage.getItem('user_role') || 'Viewer';
    if (userRole) userRole.textContent = localRoleName;

    // Toggle menu items based on role permission
    const currentRole = localRoleName;
    const auditMenuItem = document.querySelector('li[data-tab="audit"]');
    const settingsMenuItem = document.querySelector('li[data-tab="settings"]');
    const studentsMenuItem = document.querySelector('li[data-tab="students"]');
    const queueMenuItem = document.querySelector('li[data-tab="queue"]');

    // Auditor can ONLY see Overview and Audit Trail
    if (currentRole === 'Auditor') {
        if (settingsMenuItem) settingsMenuItem.style.display = 'none';
        if (studentsMenuItem) studentsMenuItem.style.display = 'none';
        if (queueMenuItem) queueMenuItem.style.display = 'none';
    } else if (currentRole === 'Viewer') {
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
    const currentTheme = localStorage.getItem('theme') || 'light';
    
    document.documentElement.setAttribute('data-theme', currentTheme);
    updateThemeToggleIcon(currentTheme);

    toggleBtn.addEventListener('click', () => {
        const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        updateThemeToggleIcon(theme);
        
        // Redraw charts with matching theme variables
        if (charts.monthlyTrend) redrawMonthlyChart();
        if (charts.weeklyTrend) redrawWeeklyChart();
    });
}

function updateThemeToggleIcon(theme) {
    const toggleBtn = document.getElementById('theme-toggle');
    toggleBtn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
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
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const conf = confirm('Do you want to log out of the dashboard?');
            if (conf) {
                await signOut();
            }
        });
    }
}

async function switchTab(tabId) {
    activeTab = tabId;

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
            await loadDashboardMetrics();
            break;
        case 'students':
            await loadStudentsList();
            break;
        case 'settings':
            await loadMonthSettings();
            break;
        case 'queue':
            await loadVerificationQueue();
            break;
        case 'audit':
            await loadAuditTrail();
            break;
        case 'reports':
            setupReportsPanel();
            break;
    }
}

// -----------------------------------------------------------------------------
// View 1: Overview & Metrics Dashboard
// -----------------------------------------------------------------------------
async function loadDashboardMetrics() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/dashboard.php`, {
            headers: getAuthHeaders()
        });
        const result = await response.json();

        if (result.status === 'success') {
            const data = result.data;
            
            // Render KPI cards
            document.getElementById('metric-budget').textContent = `${data.metrics.budget.toLocaleString()} THB`;
            document.getElementById('metric-collected').textContent = `${data.metrics.collected.toLocaleString()} THB`;
            document.getElementById('metric-outstanding').textContent = `${data.metrics.outstanding.toLocaleString()} THB`;
            document.getElementById('metric-pending').textContent = data.metrics.pending_verifications;
            document.getElementById('metric-rate').textContent = `${data.metrics.collection_rate}%`;

            // Draw Charts
            renderMonthlyChart(data.monthly_trend);
            renderWeeklyChart(data.weekly_trend);

            // Populate notifications list
            renderNotifications(data.notifications);

            // Populate activities list
            renderActivities(data.recent_activities);
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
    tableBody.innerHTML = '<tr><td colspan="7"><div class="skeleton" style="height: 150px;"></div></td></tr>';

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/students.php`, {
            headers: getAuthHeaders()
        });
        const result = await response.json();

        if (result.status === 'success') {
            studentList = result.data;
            renderStudentsTable(studentList);
        }
    } catch (e) {
        console.error('Error fetching students:', e);
    }
}

function renderStudentsTable(students) {
    const tableBody = document.getElementById('students-table-body');
    tableBody.innerHTML = '';

    if (students.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No students in database.</td></tr>';
        return;
    }

    students.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${s.student_id}</strong></td>
            <td>${s.full_name}</td>
            <td>${s.nickname || '-'}</td>
            <td>${s.class}</td>
            <td>${s.academic_year}</td>
            <td><span class="badge badge-${s.status === 'Active' ? 'green' : 'gray'}">${s.status}</span></td>
            <td>
                <button class="btn btn-secondary btn-sm" onclick="openEditStudentModal('${s.id}')">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteStudent('${s.id}')">Delete</button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

// Student Search filter
const studentSearchInput = document.getElementById('student-search');
if (studentSearchInput) {
    studentSearchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = studentList.filter(s => 
            s.student_id.toLowerCase().includes(query) ||
            s.full_name.toLowerCase().includes(query) ||
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
        document.getElementById('student-modal-title').textContent = 'Add New Student';
        studentForm.reset();
        document.getElementById('form-student-id-field').value = '';
        studentModal.classList.add('active');
    });
}

function openEditStudentModal(id) {
    const student = studentList.find(s => s.id === id);
    if (!student) return;

    document.getElementById('student-modal-title').textContent = 'Edit Student Details';
    document.getElementById('form-student-id-field').value = student.id;
    document.getElementById('student-code').value = student.student_id;
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
            } else {
                alert(result.message);
            }
        } catch (error) {
            console.error(error);
        }
    });
}

async function deleteStudent(id) {
    if (!confirm('Are you sure you want to delete this student record? This action soft deletes their records.')) {
        return;
    }

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/students.php?id=${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        const result = await response.json();

        if (result.status === 'success') {
            await loadStudentsList();
        } else {
            alert(result.message);
        }
    } catch (e) {
        console.error(e);
    }
}


// -----------------------------------------------------------------------------
// View 3: Month settings Configuration
// -----------------------------------------------------------------------------
async function loadMonthSettings() {
    const grid = document.getElementById('settings-grid');
    grid.innerHTML = '<div class="skeleton" style="height: 200px; width: 100%;"></div>';

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/settings.php`, {
            headers: getAuthHeaders()
        });
        const result = await response.json();

        if (result.status === 'success') {
            monthSettingsList = result.data;
            renderSettingsGrid(monthSettingsList);
        }
    } catch (e) {
        console.error(e);
    }
}

function renderSettingsGrid(settings) {
    const grid = document.getElementById('settings-grid');
    grid.innerHTML = '';

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    if (settings.length === 0) {
        grid.innerHTML = '<div class="text-center text-muted col-span-3">No configurations set. Click create config.</div>';
        return;
    }

    settings.forEach(s => {
        const card = document.createElement('div');
        card.className = `card setting-card status-${s.status.toLowerCase()}`;
        
        card.innerHTML = `
            <div class="setting-card-header">
                <h3>${monthNames[s.month - 1]} ${s.year}</h3>
                <span class="badge badge-${s.status === 'Open' ? 'green' : (s.status === 'Closed' ? 'yellow' : 'gray')}">${s.status}</span>
            </div>
            <div class="setting-card-body">
                <div class="setting-item"><strong>Weekly Fee:</strong> ${s.weekly_fee} THB</div>
                <div class="setting-item"><strong>Number of Weeks:</strong> ${s.number_of_weeks}</div>
                <div class="setting-item"><strong>Open Date:</strong> ${s.open_date}</div>
                <div class="setting-item"><strong>Close Date:</strong> ${s.close_date}</div>
            </div>
            <div class="setting-card-footer">
                <button class="btn btn-secondary btn-sm" onclick="openEditSettingModal('${s.id}')">Edit</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Config Modal
const settingModal = document.getElementById('setting-modal');
const settingForm = document.getElementById('setting-form');
const addSettingBtn = document.getElementById('add-setting-btn');
const numberWeeksInput = document.getElementById('setting-weeks');
const dueDatesContainer = document.getElementById('due-dates-dynamic-fields');

if (addSettingBtn) {
    addSettingBtn.addEventListener('click', () => {
        document.getElementById('setting-modal-title').textContent = 'Create Month Config';
        settingForm.reset();
        document.getElementById('form-setting-id-field').value = '';
        generateDueDatesFields(4); // default
        settingModal.classList.add('active');
    });
}

if (numberWeeksInput) {
    numberWeeksInput.addEventListener('change', (e) => {
        const num = parseInt(e.target.value);
        generateDueDatesFields(num);
    });
}

function generateDueDatesFields(numWeeks, existingDates = []) {
    dueDatesContainer.innerHTML = '';
    
    for (let w = 1; w <= numWeeks; w++) {
        const div = document.createElement('div');
        div.className = 'form-group';
        
        const dateVal = existingDates[w - 1] || '';
        
        div.innerHTML = `
            <label>Week ${w} Due Date</label>
            <input type="date" class="form-control due-date-input" value="${dateVal}" required>
        `;
        dueDatesContainer.appendChild(div);
    }
}

function openEditSettingModal(id) {
    const setting = monthSettingsList.find(s => s.id === id);
    if (!setting) return;

    document.getElementById('setting-modal-title').textContent = 'Edit Monthly Configuration';
    document.getElementById('form-setting-id-field').value = setting.id;
    document.getElementById('setting-month').value = setting.month;
    document.getElementById('setting-year').value = setting.year;
    document.getElementById('setting-fee').value = setting.weekly_fee;
    document.getElementById('setting-weeks').value = setting.number_of_weeks;
    document.getElementById('setting-open').value = setting.open_date;
    document.getElementById('setting-close').value = setting.close_date;
    document.getElementById('setting-status-select').value = setting.status;

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

        const payload = {
            id: document.getElementById('form-setting-id-field').value || null,
            month: parseInt(document.getElementById('setting-month').value),
            year: parseInt(document.getElementById('setting-year').value),
            weekly_fee: parseFloat(document.getElementById('setting-fee').value),
            number_of_weeks: parseInt(document.getElementById('setting-weeks').value),
            open_date: document.getElementById('setting-open').value,
            close_date: document.getElementById('setting-close').value,
            status: document.getElementById('setting-status-select').value,
            due_dates: dueDates
        };

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
            } else {
                alert(result.message);
            }
        } catch (error) {
            console.error(error);
        }
    });
}


// -----------------------------------------------------------------------------
// View 4: Slip Verification Queue
// -----------------------------------------------------------------------------
async function loadVerificationQueue() {
    const tableBody = document.getElementById('queue-table-body');
    tableBody.innerHTML = '<tr><td colspan="7"><div class="skeleton" style="height: 150px;"></div></td></tr>';

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/submissions.php?status=Pending`, {
            headers: getAuthHeaders()
        });
        const result = await response.json();

        if (result.status === 'success') {
            verificationQueue = result.data;
            renderQueueTable(verificationQueue);
        }
    } catch (e) {
        console.error(e);
    }
}

function renderQueueTable(submissions) {
    const tableBody = document.getElementById('queue-table-body');
    tableBody.innerHTML = '';

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    if (submissions.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No pending slips in queue! Great job.</td></tr>';
        return;
    }

    submissions.forEach(s => {
        const tr = document.createElement('tr');
        const formattedWeeks = s.weeks.map(w => `Week ${w}`).join(', ');
        const submittedDate = new Date(s.submitted_at).toLocaleString();

        tr.innerHTML = `
            <td><strong>#${s.id.substring(0, 8)}</strong></td>
            <td>${s.student_code} - ${s.student_name}</td>
            <td>${monthNames[s.month - 1]} ${s.year}</td>
            <td>${formattedWeeks}</td>
            <td><strong>${s.amount} THB</strong></td>
            <td>${submittedDate}</td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="openVerifyDialog('${s.id}')">Verify</button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

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
    document.getElementById('verify-amount').textContent = `${sub.amount} THB`;
    document.getElementById('verify-weeks').textContent = sub.weeks.map(w => `Week ${w}`).join(', ');
    document.getElementById('verify-comments').value = '';

    // Handle slip preview (Check if it's image or PDF)
    const previewContainer = document.getElementById('verify-slip-preview');
    previewContainer.innerHTML = '';

    // Standardize URL check (Support local uploads or public web URLs)
    const slipUrl = sub.slip_url.startsWith('http') ? sub.slip_url : `./public/${sub.slip_url}`;

    if (sub.slip_url.toLowerCase().endsWith('.pdf')) {
        previewContainer.innerHTML = `
            <div style="padding: 1.5rem; text-align: center; border: 1px solid var(--border-glass); border-radius: var(--border-radius-sm);">
                <div style="font-size: 3rem; margin-bottom: 0.5rem;">📄</div>
                <div>PDF Document Payment Slip</div>
                <a href="${slipUrl}" target="_blank" class="btn btn-secondary btn-sm" style="margin-top: 1rem;">Open PDF in New Tab</a>
            </div>
        `;
    } else {
        previewContainer.innerHTML = `
            <img src="${slipUrl}" alt="Payment Slip" style="max-width: 100%; border-radius: var(--border-radius-sm); border: 1px solid var(--border-glass);">
        `;
    }

    // Download Button setup
    document.getElementById('verify-download-btn').href = slipUrl;

    verifyModal.classList.add('active');
}

// Handle decision trigger (Approve / Reject)
document.querySelectorAll('.decision-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        const action = e.target.getAttribute('data-action'); // 'Approve', 'Reject', 'RequestInfo'
        const comments = document.getElementById('verify-comments').value.trim();

        if (!activeSubId) return;

        if (action === 'Reject' && empty(comments)) {
            alert('A comment explaining the rejection is required.');
            return;
        }

        const confirmText = `Are you sure you want to ${action === 'Approve' ? 'approve' : (action === 'Reject' ? 'reject' : 'request information for')} this slip submission?`;
        if (!confirm(confirmText)) return;

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
                verifyModal.classList.remove('active');
                await loadVerificationQueue();
            } else {
                alert(result.message);
            }
        } catch (error) {
            console.error(error);
        }
    });
});


// -----------------------------------------------------------------------------
// View 5: Audit Trail Logs Viewer
// -----------------------------------------------------------------------------
async function loadAuditTrail() {
    const tableBody = document.getElementById('audit-table-body');
    tableBody.innerHTML = '<tr><td colspan="6"><div class="skeleton" style="height: 150px;"></div></td></tr>';

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/audit.php`, {
            headers: getAuthHeaders()
        });
        const result = await response.json();

        if (result.status === 'success') {
            renderAuditTable(result.data);
        }
    } catch (e) {
        console.error(e);
    }
}

function renderAuditTable(logs) {
    const tableBody = document.getElementById('audit-table-body');
    tableBody.innerHTML = '';

    if (logs.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No audit logs found.</td></tr>';
        return;
    }

    logs.forEach(l => {
        const tr = document.createElement('tr');
        const timestamp = new Date(l.timestamp).toLocaleString();
        
        // Format action name nicely
        const cleanAction = l.action.replace(/_/g, ' ').toUpperCase();

        tr.innerHTML = `
            <td>${timestamp}</td>
            <td><strong>${l.user_email || 'System/Public'}</strong></td>
            <td><span class="badge badge-gray">${cleanAction}</span></td>
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

    reportMonthSelect.innerHTML = '<option value="">Select Month</option>';
    
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
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
        alert('Please select a Month from the dropdown first to export this report.');
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
        alert('Error: ' + e.message);
    });
}

// Global modal helpers
window.closeModal = function(modalId) {
    document.getElementById(modalId).classList.remove('active');
};

function empty(val) {
    return val === null || val === undefined || val === '';
}
