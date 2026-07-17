// public/js/portal.js

// JWT Token Decoder helper
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
}

// State variables for student session
let currentStudent = null;
let monthlyStatusData = [];
let currentStudentAdjustments = 0;
let currentStudentRefunds = 0;
let selectedMonthSetting = null;
let selectedWeeks = [];
let isUpdateMode = false;
let activeSubmissionId = null;
let compressedFile = null;
let currentStep = 1;
let paymentPolicyEnabled = false;
let paymentPolicyText = '';
let promptpayNumber = '0923797157';

// DOM Element References
const step1Section = document.getElementById('step-1-section');
const portalDashboard = document.getElementById('portal-dashboard');
const verificationForm = document.getElementById('verification-form');
const validateBtn = document.getElementById('validate-btn');
const studentIdInput = document.getElementById('student-id');
const fullNameInput = document.getElementById('full-name');

const studentNameDisplay = document.getElementById('student-name-display');
const studentNicknameDisplay = document.getElementById('student-nickname-display');
const studentIdDisplay = document.getElementById('student-id-display');
const studentEmailDisplay = document.getElementById('student-email-display');
const studentClassDisplay = document.getElementById('student-class-display');
const monthsTabContainer = document.getElementById('months-tab-container');
const weeksGridContainer = document.getElementById('weeks-grid-container');

const paymentDetailsSection = document.getElementById('payment-details-section');
const weekCheckboxesContainer = document.getElementById('week-checkboxes-container');

const fileInput = document.getElementById('slip-file');
const filePreviewContainer = document.getElementById('file-preview-container');
const submitSlipBtn = document.getElementById('submit-slip-btn');
const logoutPortalBtn = document.getElementById('logout-portal-btn');

// Toast Notification Helper
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${type === 'success' ? '✓' : '✗'}</span>
        <span class="toast-message">${message}</span>
    `;
    container.appendChild(toast);

    // Auto remove toast after 4s
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Auto-initialize student/guest session on student.html load
document.addEventListener('DOMContentLoaded', async () => {
    // Theme Toggle Handler
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
        const updateIcon = (theme) => {
            const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="theme-icon"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;
            const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="theme-icon"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
            toggleBtn.innerHTML = theme === 'dark' ? sunIcon : moonIcon;
        };
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        updateIcon(currentTheme);

        toggleBtn.addEventListener('click', () => {
            const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
            updateIcon(theme);
        });
    }

    // Toggle Password Visibility in Modal Fields
    document.querySelectorAll('.toggle-password-field-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const passwordInput = document.getElementById(targetId);
            const icon = btn.querySelector('i');
            if (passwordInput && icon) {
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    icon.className = 'far fa-eye-slash';
                } else {
                    passwordInput.type = 'password';
                    icon.className = 'far fa-eye';
                }
            }
        });
    });

    // Lightbox events
    const lightboxModal = document.getElementById('lightbox-modal');
    const lightboxClose = document.getElementById('lightbox-close-btn');
    const lightboxImg = document.getElementById('lightbox-image');

    if (lightboxClose && lightboxModal) {
        lightboxClose.onclick = () => {
            lightboxModal.style.display = 'none';
        };
        lightboxModal.onclick = (e) => {
            if (e.target === lightboxModal) {
                lightboxModal.style.display = 'none';
            }
        };
    }

    // Show back to admin button if user has a staff role session
    const userRole = localStorage.getItem('user_role');
    const backToAdminBtn = document.getElementById('back-to-admin-btn');
    if (userRole && backToAdminBtn) {
        backToAdminBtn.classList.remove('hidden');
    }

    let sessionData = localStorage.getItem('student_session');
    const token = localStorage.getItem('sb_access_token');
    
    // Auto-fetch student session by email if logged in as staff/admin
    if (!sessionData && token) {
        const payload = parseJwt(token);
        if (payload && payload.email) {
            try {
                const response = await fetch(`${CONFIG.API_BASE_URL}/students.php?email=${encodeURIComponent(payload.email)}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                if (response.ok) {
                    const result = await response.json();
                    if (result.status === 'success') {
                        localStorage.setItem('student_session', JSON.stringify(result.data));
                        sessionData = JSON.stringify(result.data);
                    }
                }
            } catch (e) {
                console.warn('Failed to auto-fetch student session by email:', e);
            }
        }
    }

    if (!sessionData) {
        window.location.href = 'index.html';
        return;
    }

    currentStudent = JSON.parse(sessionData);
    if (studentNameDisplay) studentNameDisplay.textContent = currentStudent.full_name;
    if (studentNicknameDisplay) studentNicknameDisplay.textContent = currentStudent.nickname ? `(${currentStudent.nickname})` : '';
    if (studentIdDisplay) studentIdDisplay.textContent = currentStudent.student_id;
    updateEmailUI();
    const avatarInitial = document.getElementById('student-avatar-initial');
    if (avatarInitial) {
        avatarInitial.textContent = (currentStudent.nickname || currentStudent.full_name || 'S').charAt(0).toUpperCase();
    }
    if (studentClassDisplay) studentClassDisplay.textContent = `ชั้นเรียน: ${currentStudent.class} | ปีการศึกษา: ${currentStudent.academic_year}`;

    // Load Student Payment Ledger
    if (monthsTabContainer) {
        await loadStudentLedger();
    }

    // Load Policy Settings
    await loadPolicySettings();

    // Initialize PR Dashboard
    initPRDashboard();

    // Load unread inbox count badge
    loadUnreadNotificationsCount();

    // Initialize Wizard Buttons
    setupWizardListeners();

    // Bind Policy Checkbox Change Event
    const policyCheckbox = document.getElementById('payment-policy-checkbox');
    if (policyCheckbox) {
        policyCheckbox.addEventListener('change', () => {
            updateSubmitButtonState();
        });
    }

    // Bind Policy Link to open modal
    const policyLink = document.getElementById('policy-link');
    const policyModal = document.getElementById('policy-details-modal');
    const closePolicyBtn = document.getElementById('close-policy-btn');
    const closePolicyModalBtn = document.getElementById('close-policy-modal-btn');

    if (policyLink && policyModal) {
        policyLink.addEventListener('click', (e) => {
            e.preventDefault();
            policyModal.classList.add('active');
        });

        const closePolicy = () => {
            policyModal.classList.remove('active');
        };

        if (closePolicyBtn) closePolicyBtn.addEventListener('click', closePolicy);
        if (closePolicyModalBtn) closePolicyModalBtn.addEventListener('click', closePolicy);
        
        policyModal.addEventListener('click', (e) => {
            if (e.target === policyModal) {
                closePolicy();
            }
        });
    }
    // Offline status detection & Banner rendering
    const offlineBanner = document.getElementById('offline-banner');
    const updateOnlineStatus = () => {
        if (navigator.onLine) {
            if (offlineBanner) offlineBanner.style.display = 'none';
        } else {
            if (offlineBanner) offlineBanner.style.display = 'flex';
        }
    };
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus(); // initial check
});



// Logout Portal
if (logoutPortalBtn) {
    logoutPortalBtn.addEventListener('click', () => {
        currentStudent = null;
        monthlyStatusData = [];
        selectedMonthSetting = null;
        selectedWeeks = [];

        localStorage.removeItem('student_session');
        localStorage.removeItem('guest_mode');
        showToast('ออกจากระบบเรียบร้อยแล้ว');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 800);
    });
}

// -----------------------------------------------------------------------------
// Step 2 & 3: Render Months and Weeks Status Grid
// -----------------------------------------------------------------------------
async function loadStudentLedger() {
    if (!currentStudent) return;

    const cacheKey = `student_ledger_${currentStudent.id}`;
    const cachedDataStr = localStorage.getItem(cacheKey);
    let hasRenderedCache = false;

    if (cachedDataStr) {
        try {
            const cachedData = JSON.parse(cachedDataStr);
            const dataObj = typeof cachedData === 'object' && !Array.isArray(cachedData) 
                ? cachedData 
                : { months: cachedData, adjustments: 0, refunds: 0 };
            
            monthlyStatusData = dataObj.months || [];
            currentStudentAdjustments = parseFloat(dataObj.adjustments) || 0;
            currentStudentRefunds = parseFloat(dataObj.refunds) || 0;

            renderMonthsTabs();
            updateMiniPaymentStats();
            renderFinancialSummaries();

            // Auto-select month based on url param or default
            const urlParams = new URLSearchParams(window.location.search);
            const paySettingId = urlParams.get('pay_setting_id');
            let defaultMonth = null;
            if (paySettingId) {
                defaultMonth = monthlyStatusData.find(m => m.id === paySettingId);
            }
            if (!defaultMonth) {
                defaultMonth = monthlyStatusData.find(m => m.status === 'Open') || monthlyStatusData[monthlyStatusData.length - 1];
            }
            if (defaultMonth) {
                selectMonth(defaultMonth.id);
                if (paySettingId) {
                    setTimeout(() => {
                        const tabPayment = document.getElementById('tab-payment');
                        if (tabPayment) tabPayment.click();
                    }, 100);
                }
            }
            hasRenderedCache = true;
        } catch (e) {
            console.error("Error parsing cached ledger:", e);
        }
    }

    if (!hasRenderedCache) {
        if (monthsTabContainer) {
            monthsTabContainer.innerHTML = `
                <div style="display: flex; gap: 0.75rem; width: 100%;">
                    <div class="shimmer-loader" style="height: 60px; width: 120px; border-radius: var(--border-radius-sm);"></div>
                    <div class="shimmer-loader" style="height: 60px; width: 120px; border-radius: var(--border-radius-sm);"></div>
                    <div class="shimmer-loader" style="height: 60px; width: 120px; border-radius: var(--border-radius-sm);"></div>
                </div>
            `;
        }
        if (weeksGridContainer) {
            weeksGridContainer.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.25rem; width: 100%;">
                    <div class="shimmer-loader" style="height: 120px; border-radius: var(--border-radius-md);"></div>
                    <div class="shimmer-loader" style="height: 120px; border-radius: var(--border-radius-md);"></div>
                    <div class="shimmer-loader" style="height: 120px; border-radius: var(--border-radius-md);"></div>
                </div>
            `;
        }
    }

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/submissions.php?action=student_status&student_id=${currentStudent.id}`);
        
        if (response.status === 401 || response.status === 404 || response.status === 403) {
            localStorage.removeItem('student_session');
            window.location.href = 'login.html';
            return;
        }

        const result = await response.json();

        if (result.status === 'failed') {
            if (result.message && (result.message.includes('exist') || result.message.includes('inactive') || result.message.includes('Unauthorized') || result.message.includes('expired'))) {
                localStorage.removeItem('student_session');
                window.location.href = 'login.html';
                return;
            }
        }

        if (result.status === 'success') {
            const newDataStr = JSON.stringify(result.data);

            // Only re-render if data has changed or if we haven't rendered cache
            if (newDataStr !== cachedDataStr || !hasRenderedCache) {
                const dataObj = typeof result.data === 'object' && !Array.isArray(result.data) 
                    ? result.data 
                    : { months: result.data, adjustments: 0, refunds: 0 };
                
                monthlyStatusData = dataObj.months || [];
                currentStudentAdjustments = parseFloat(dataObj.adjustments) || 0;
                currentStudentRefunds = parseFloat(dataObj.refunds) || 0;

                localStorage.setItem(cacheKey, newDataStr);

                renderMonthsTabs();
                updateMiniPaymentStats();
                renderFinancialSummaries();

                const urlParams = new URLSearchParams(window.location.search);
                const paySettingId = urlParams.get('pay_setting_id');
                let defaultMonth = null;
                if (paySettingId) {
                    defaultMonth = monthlyStatusData.find(m => m.id === paySettingId);
                }
                if (!defaultMonth) {
                    defaultMonth = monthlyStatusData.find(m => m.status === 'Open') || monthlyStatusData[monthlyStatusData.length - 1];
                }

                if (defaultMonth) {
                    selectMonth(defaultMonth.id);
                    if (paySettingId) {
                        setTimeout(() => {
                            const tabPayment = document.getElementById('tab-payment');
                            if (tabPayment) tabPayment.click();
                        }, 100);
                    }
                }
            }
        } else {
            showToast(result.message || 'ล้มเหลวในการเรียกรายการข้อมูลบัญชีนักศึกษา', 'error');
        }
    } catch (e) {
        if (!hasRenderedCache) {
            showToast('เกิดข้อผิดพลาดเน็ตเวิร์กในการดึงประวัติการชำระเงิน', 'error');
        }
        console.error(e);
    }
}

async function loadPolicySettings() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/settings.php?action=get_system_settings`);
        const result = await response.json();
        if (result.status === 'success') {
            paymentPolicyEnabled = result.data.payment_policy_enabled === 'true';
            paymentPolicyText = result.data.payment_policy_text || '';
            promptpayNumber = result.data.promptpay_number || '0923797157';

            const consentContainer = document.getElementById('policy-consent-container');
            const checkbox = document.getElementById('payment-policy-checkbox');
            const modalBody = document.getElementById('modal-policy-body');
            const promptpayDisplay = document.getElementById('promptpay-number-display');

            if (modalBody) {
                modalBody.textContent = paymentPolicyText;
            }

            if (promptpayDisplay) {
                promptpayDisplay.textContent = promptpayNumber;
            }

            if (consentContainer) {
                if (paymentPolicyEnabled) {
                    consentContainer.classList.remove('hidden');
                    if (checkbox) {
                        checkbox.checked = false;
                    }
                } else {
                    consentContainer.classList.add('hidden');
                    if (checkbox) {
                        checkbox.checked = true;
                    }
                }
            }
        }
    } catch (e) {
        console.error('Failed to load policy settings:', e);
    }
}

function updateSubmitButtonState() {
    const count = selectedWeeks.length;
    const hasFile = !!compressedFile;
    let policyOk = true;

    if (paymentPolicyEnabled && !isUpdateMode) {
        const checkbox = document.getElementById('payment-policy-checkbox');
        policyOk = checkbox && checkbox.checked;
    }

    if (submitSlipBtn) {
        submitSlipBtn.disabled = !(count > 0 && hasFile && policyOk);
    }
}

function renderMonthsTabs() {
    if (!monthsTabContainer) return;
    monthsTabContainer.innerHTML = '';

    const monthNames = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];

    monthlyStatusData.forEach(m => {
        const tab = document.createElement('button');
        tab.className = `month-tab tab-color-${m.color}`;
        if (selectedMonthSetting && selectedMonthSetting.id === m.id) {
            tab.classList.add('active');
        }

        const displayTitle = m.title || `${monthNames[m.month - 1]}`;
        const displayYear = m.title ? `${monthNames[m.month - 1]} ${m.year}` : `${m.year}`;

        tab.innerHTML = `
            <div class="month-tab-info">
                <span class="month-tab-name" title="${displayTitle}">${displayTitle}</span>
                <span class="month-tab-year">${displayYear}</span>
            </div>
            <i class="status-dot ${m.color}"></i>
        `;
        tab.addEventListener('click', () => selectMonth(m.id));
        monthsTabContainer.appendChild(tab);
    });
}

function selectMonth(settingId) {
    selectedMonthSetting = monthlyStatusData.find(m => m.id === settingId);

    // Update active tab visual state
    document.querySelectorAll('.month-tab').forEach((tab, index) => {
        const monthData = monthlyStatusData[index];
        if (monthData && monthData.id === settingId) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // Update payment wizard billing title and description
    const titleEl = document.getElementById('wizard-billing-title');
    const descEl = document.getElementById('wizard-billing-desc');
    if (selectedMonthSetting) {
        if (titleEl) {
            titleEl.textContent = `รอบบิลที่ต้องชำระ: ${selectedMonthSetting.title || ''}`;
        }
        if (descEl) {
            if (selectedMonthSetting.number_of_weeks === 1) {
                descEl.textContent = selectedMonthSetting.description || `ยอดเรียกเก็บเงิน: ${selectedMonthSetting.weekly_fee} บาท`;
            } else {
                descEl.textContent = selectedMonthSetting.description || `อัตราค่าบำรุงห้องรายสัปดาห์: ${selectedMonthSetting.weekly_fee} บาท/สัปดาห์ (จำนวน ${selectedMonthSetting.number_of_weeks} สัปดาห์)`;
            }
        }
    }

    resetPaymentForm();
    renderWeeksGrid();
}

function renderWeeksGrid() {
    if (!weeksGridContainer) return;
    weeksGridContainer.innerHTML = '';

    if (!selectedMonthSetting) {
        weeksGridContainer.innerHTML = '<div class="text-center text-muted" style="padding: 2rem; color: var(--text-muted); font-size: 0.95rem;"><i class="fas fa-info-circle"></i> ยังไม่มีเกณฑ์จัดเก็บเงินที่กำหนดไว้ในขณะนี้</div>';
        return;
    }

    // Update grid card header dynamically based on whether it is weekly or single monthly billing
    const gridCard = weeksGridContainer.parentElement;
    if (gridCard) {
        gridCard.classList.remove('hidden');
    }
    const headerEl = gridCard ? gridCard.querySelector('h3') : null;
    if (headerEl) {
        if (selectedMonthSetting.number_of_weeks === 1) {
            headerEl.innerHTML = `<i class="fas fa-list-ul"></i> รายละเอียดรายการชำระเงิน`;
        } else {
            headerEl.innerHTML = `<i class="fas fa-list-ul"></i> สถานะการชำระเงินรายสัปดาห์`;
        }
    }

    const statusTranslations = {
        'Unpaid': 'ค้างชำระ',
        'Overdue': 'เกินกำหนดชำระ',
        'Pending': 'รอตรวจสอบสลิป',
        'Verified': 'ชำระเรียบร้อย'
    };

    selectedMonthSetting.weeks.forEach(w => {
        const card = document.createElement('div');
        card.className = `week-status-card border-color-${w.color}`;

        // Format Due Date
        const dueDateObj = new Date(w.due_date);
        const formattedDate = dueDateObj.toLocaleDateString('th-TH', { month: 'short', day: 'numeric', year: 'numeric' });
        const labelText = selectedMonthSetting.number_of_weeks === 1 ? (selectedMonthSetting.title || 'ยอดค้างจ่าย') : `สัปดาห์ที่ ${w.week_number}`;

        card.innerHTML = `
            <div class="week-number" style="font-family: var(--font-heading);">${labelText}</div>
            <div class="week-amount">${w.amount} บาท</div>
            <div class="week-due">กำหนดส่ง: ${formattedDate}</div>
            <span class="badge badge-${w.color}">${statusTranslations[w.status] || w.status}</span>
        `;

        weeksGridContainer.appendChild(card);
    });

    // Toggle Payment form state:
    const formContainer = document.getElementById('payment-form-card');
    const formMessage = document.getElementById('form-status-message');



    if (selectedMonthSetting.status === 'Archived') {
        formContainer.classList.add('hidden');
        formMessage.textContent = 'เดือนนี้ถูกบันทึกและล็อกประวัติถาวรแล้ว ปิดรับส่งสลิปชำระเงิน';
        formMessage.classList.remove('hidden');
    } else if (selectedMonthSetting.status === 'Closed') {
        formContainer.classList.add('hidden');
        formMessage.textContent = 'การจัดเก็บเงินสำหรับเดือนนี้ถูกปิดระบบชั่วคราว';
        formMessage.classList.remove('hidden');
    } else if (selectedMonthSetting.has_pending_slip) {
        formContainer.classList.add('hidden');
        formMessage.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 0.5rem;">คุณมีสลิปที่รอการอนุมัติสำหรับเดือนนี้อยู่แล้ว โปรดรอการตรวจสอบจากฝ่ายการเงิน</div>
            <button type="button" id="update-pending-slip-btn" class="btn btn-secondary btn-sm" style="margin: 0.5rem auto 0 auto; display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem;">
                <i class="fas fa-edit"></i> ต้องการเปลี่ยน/แก้ไขไฟล์สลิปใหม่
            </button>
        `;
        formMessage.classList.remove('hidden');

        // Setup pending slip replacement
        const updateBtn = document.getElementById('update-pending-slip-btn');
        if (updateBtn) {
            updateBtn.addEventListener('click', () => {
                isUpdateMode = true;
                activeSubmissionId = selectedMonthSetting.pending_submission_id;
                formContainer.classList.remove('hidden');
                formMessage.classList.add('hidden');

                // Select all weeks for this pending submission or default check
                selectedWeeks = selectedMonthSetting.weeks
                    .filter(w => w.status === 'Pending')
                    .map(w => w.week_number);

                goToWizardStep(3); // Skip details and QR, directly to upload
                updatePaymentCalculations();
            });
        }
    } else {
        const allPaid = selectedMonthSetting.weeks.every(w => w.color === 'green');
        if (allPaid) {
            formContainer.classList.add('hidden');
            formMessage.textContent = 'คุณชำระเงินสำหรับรอบบิลนี้ครบถ้วนเรียบร้อยแล้ว ยินดีด้วย!';
            formMessage.classList.remove('hidden');
        } else {
            formContainer.classList.remove('hidden');
            formMessage.classList.add('hidden');
            isUpdateMode = false;
            activeSubmissionId = null;
            goToWizardStep(1);
            setupPaymentFormOptions();
        }
    }
}

function renderFinancialSummaries() {
    const sumPaid = document.getElementById('sum-paid');
    const sumPending = document.getElementById('sum-pending');
    const sumOutstanding = document.getElementById('sum-outstanding');
    const sumTotal = document.getElementById('sum-total');

    if (!sumPaid || !sumPending || !sumOutstanding || !sumTotal) return;

    let totalPaidSlips = 0;
    let totalPending = 0;
    let totalOutstandingRaw = 0;
    let totalAll = 0;

    monthlyStatusData.forEach(month => {
        month.weeks.forEach(w => {
            const amt = parseFloat(w.amount);
            totalAll += amt;
            if (w.status === 'Verified') {
                totalPaidSlips += amt;
            } else if (w.status === 'Pending') {
                totalPending += amt;
            } else {
                totalOutstandingRaw += amt;
            }
        });
    });

    const adjustments = typeof currentStudentAdjustments === 'number' ? currentStudentAdjustments : 0;
    const refunds = typeof currentStudentRefunds === 'number' ? currentStudentRefunds : 0;
    
    // Total Paid = Slips Paid + Cash Adjustments - Refunds
    const totalPaid = totalPaidSlips + adjustments - refunds;
    
    // Outstanding balance = Total - Paid - Pending (clamped to 0)
    const finalOutstanding = Math.max(0, totalAll - totalPaid - totalPending);

    sumPaid.textContent = `${totalPaid.toLocaleString('th-TH', { minimumFractionDigits: 2 })} THB`;
    sumPending.textContent = `${totalPending.toLocaleString('th-TH', { minimumFractionDigits: 2 })} THB`;
    sumOutstanding.textContent = `${finalOutstanding.toLocaleString('th-TH', { minimumFractionDigits: 2 })} THB`;
    sumTotal.textContent = `${totalAll.toLocaleString('th-TH', { minimumFractionDigits: 2 })} THB`;
}

// -----------------------------------------------------------------------------
// Step 4: Payment Form Selection Logic (Wizard Setup)
// -----------------------------------------------------------------------------
function resetPaymentForm() {
    selectedWeeks = [];
    compressedFile = null;
    if (fileInput) fileInput.value = '';
    const nameLabel = document.getElementById('loaded-filename');
    if (nameLabel) nameLabel.textContent = 'ยังไม่เลือกไฟล์';
    const actionsPanel = document.getElementById('slip-loaded-actions');
    if (actionsPanel) actionsPanel.classList.add('hidden');
    if (filePreviewContainer) {
        filePreviewContainer.innerHTML = `
            <div class="upload-icon" style="font-size: 2.5rem; margin-bottom: 0.5rem;">📤</div>
            <div style="font-weight: 600; font-size: 0.95rem;">คลิกที่นี่เพื่อเลือกอัปโหลดไฟล์หลักฐาน</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem;">สลิปโอนเงิน (รองรับ PNG, JPG, JPEG, PDF ไม่เกิน 5MB)</div>
        `;
    }
    
    const checkbox = document.getElementById('payment-policy-checkbox');
    if (checkbox) {
        checkbox.checked = paymentPolicyEnabled ? false : true;
    }
    updateSubmitButtonState();

    document.querySelectorAll('[id="total-amount-display"]').forEach(el => el.textContent = '0.00 THB');
    document.querySelectorAll('[id="selected-weeks-summary"]').forEach(el => el.textContent = 'ไม่มี');

    isUpdateMode = false;
    activeSubmissionId = null;
    goToWizardStep(1);
}

function setupPaymentFormOptions() {
    if (!weekCheckboxesContainer) return;
    weekCheckboxesContainer.innerHTML = '';
    selectedWeeks = [];

    if (!selectedMonthSetting) {
        weekCheckboxesContainer.innerHTML = '<div class="text-center text-muted" style="padding:1.5rem; color: var(--text-muted);"><i class="fas fa-exclamation-triangle"></i> ไม่พบหัวข้อชำระเงินที่เปิดบริการในขณะนี้</div>';
        return;
    }

    // Toggle header and checkbox container visibility based on billing type
    const selectionHeader = document.getElementById('wizard-selection-header');
    if (selectedMonthSetting.number_of_weeks === 1) {
        if (selectionHeader) selectionHeader.style.display = 'none';
        weekCheckboxesContainer.style.display = 'none';
    } else {
        if (selectionHeader) selectionHeader.style.display = 'block';
        weekCheckboxesContainer.style.display = 'grid';
    }

    // Hide or show the weekly billing mode selector depending on whether there is only 1 week (monthly bill)
    const modeSelectors = document.querySelector('.form-mode-selectors');
    if (modeSelectors) {
        if (selectedMonthSetting.number_of_weeks === 1) {
            modeSelectors.style.display = 'none';
        } else {
            modeSelectors.style.display = 'flex';
        }
    }

    // Filter weeks that are unpaid or overdue
    const payableWeeks = selectedMonthSetting.weeks.filter(w => w.color === 'gray' || w.color === 'red');

    // Default mode: Pay Remaining Weeks (Recommended / Auto select all)
    const isPayRemainingMode = selectedMonthSetting.number_of_weeks === 1 ? true : document.getElementById('mode-remaining').checked;

    payableWeeks.forEach(w => {
        const label = document.createElement('label');
        label.className = 'checkbox-label-card';

        const isChecked = isPayRemainingMode;
        if (isChecked) {
            selectedWeeks.push(w.week_number);
        }

        const dateObj = new Date(w.due_date);
        const formattedDate = dateObj.toLocaleDateString('th-TH', { month: 'short', day: 'numeric' });

        label.innerHTML = `
            <input type="checkbox" value="${w.week_number}" ${isChecked ? 'checked' : ''} 
                   ${isPayRemainingMode ? 'disabled' : ''}>
            <div class="checkbox-box">
                <span class="check-indicator">✓</span>
            </div>
            <div class="checkbox-text">
                <div class="checkbox-week" style="font-family: var(--font-heading);">สัปดาห์ที่ ${w.week_number}</div>
                <div class="checkbox-subtext">${w.color === 'red' ? 'เกินกำหนดชำระ!' : 'กำหนดชำระ ' + formattedDate}</div>
            </div>
        `;

        if (!isPayRemainingMode) {
            const checkbox = label.querySelector('input');
            checkbox.addEventListener('change', (e) => {
                const weekNum = parseInt(e.target.value);
                if (e.target.checked) {
                    selectedWeeks.push(weekNum);
                } else {
                    selectedWeeks = selectedWeeks.filter(id => id !== weekNum);
                }
                updatePaymentCalculations();
            });
        }

        weekCheckboxesContainer.appendChild(label);
    });

    updatePaymentCalculations();
}

// Handle Mode Toggle
const modeRemaining = document.getElementById('mode-remaining');
const modeIndividual = document.getElementById('mode-individual');
if (modeRemaining && modeIndividual) {
    [modeRemaining, modeIndividual].forEach(radio => {
        radio.addEventListener('change', () => {
            setupPaymentFormOptions();
        });
    });
}

function updatePaymentCalculations() {
    const count = selectedWeeks.length;
    const rate = selectedMonthSetting ? selectedMonthSetting.weekly_fee : 0;
    const total = count * rate;

    const formattedAmount = `${total.toFixed(2)} THB`;

    // Update all occurrences of total-amount-display in steps
    document.querySelectorAll('[id="total-amount-display"]').forEach(el => el.textContent = formattedAmount);
    const step3Display = document.getElementById('total-amount-display-step3');
    if (step3Display) step3Display.textContent = formattedAmount;

    const isOneWeek = selectedMonthSetting ? selectedMonthSetting.number_of_weeks === 1 : false;
    const summaryText = count > 0
        ? (isOneWeek ? (selectedMonthSetting.title || 'ยอดเงินเรียกเก็บ') : selectedWeeks.map(w => `สัปดาห์ที่ ${w}`).join(', '))
        : 'ไม่มี';
    document.querySelectorAll('[id="selected-weeks-summary"]').forEach(el => el.textContent = summaryText);

    updateSubmitButtonState();
}

// -----------------------------------------------------------------------------
// Step 5: Wizard Control Engine
// -----------------------------------------------------------------------------
function setupWizardListeners() {
    const next1 = document.getElementById('wizard-next-1');
    const next2 = document.getElementById('wizard-next-2');
    const back2 = document.getElementById('wizard-back-2');
    const back3 = document.getElementById('wizard-back-3');

    if (next1) {
        next1.onclick = () => {
            if (selectedWeeks.length === 0) {
                const isOneWeek = selectedMonthSetting.number_of_weeks === 1;
                const msg = isOneWeek ? 'กรุณาเลือกรายการที่จะชำระเงิน' : 'กรุณาเลือกสัปดาห์ที่จะชำระเงินอย่างน้อย 1 รายการ';
                showToast(msg, 'error');
                return;
            }
            if (paymentPolicyEnabled && !isUpdateMode) {
                const checkbox = document.getElementById('payment-policy-checkbox');
                if (!checkbox || !checkbox.checked) {
                    showToast('คุณต้องกดยินยอมและยอมรับในนโยบายก่อนดำเนินการต่อ', 'error');
                    return;
                }
            }
            goToWizardStep(2);

            // Build PromptPay QR dynamic URL
            const total = selectedWeeks.length * selectedMonthSetting.weekly_fee;
            const qrImg = document.getElementById('promptpay-qr-img');
            if (qrImg) {
                qrImg.src = `https://promptpay.io/${promptpayNumber}/${total.toFixed(2)}.png`;
            }
        };
    }

    if (next2) {
        next2.onclick = () => goToWizardStep(3);
    }

    if (back2) {
        back2.onclick = () => goToWizardStep(1);
    }

    if (back3) {
        back3.onclick = () => {
            if (isUpdateMode) {
                // If in slip replacement mode, going back closes/resets
                resetPaymentForm();
                renderWeeksGrid();
            } else {
                goToWizardStep(2);
            }
        };
    }
}

function goToWizardStep(step) {
    currentStep = step;

    // Update indicator states
    for (let i = 1; i <= 3; i++) {
        const stepIndicator = document.getElementById(`wstep-${i}`);
        if (stepIndicator) {
            const numEl = stepIndicator.querySelector('.step-num');
            const labelEl = stepIndicator.querySelector('span');

            if (i === step) {
                stepIndicator.classList.add('active');
                if (numEl) {
                    numEl.style.background = 'var(--accent)';
                    numEl.style.color = 'white';
                }
                if (labelEl) {
                    labelEl.style.color = 'var(--text-primary)';
                    labelEl.style.fontWeight = 'bold';
                }
            } else if (i < step) {
                stepIndicator.classList.add('active');
                if (numEl) {
                    numEl.style.background = 'var(--status-green-border)';
                    numEl.style.color = 'white';
                }
                if (labelEl) {
                    labelEl.style.color = 'var(--text-secondary)';
                    labelEl.style.fontWeight = 'normal';
                }
            } else {
                stepIndicator.classList.remove('active');
                if (numEl) {
                    numEl.style.background = 'var(--bg-secondary)';
                    numEl.style.color = 'var(--text-secondary)';
                }
                if (labelEl) {
                    labelEl.style.color = 'var(--text-secondary)';
                    labelEl.style.fontWeight = 'normal';
                }
            }
        }
    }

    // Update Progress Line
    const progressBar = document.getElementById('wizard-progress');
    if (progressBar) {
        progressBar.style.width = `${((step - 1) / 2) * 100}%`;
    }

    // Toggle view visibility
    for (let i = 1; i <= 3; i++) {
        const view = document.getElementById(`wstep-view-${i}`);
        if (view) {
            if (i === step) {
                view.classList.remove('hidden');
                view.classList.remove('animate-fade-scale');
                void view.offsetWidth; // force reflow
                view.classList.add('animate-fade-scale');
            } else {
                view.classList.add('hidden');
                view.classList.remove('animate-fade-scale');
            }
        }
    }

    if (step === 1) {
        const consentContainer = document.getElementById('policy-consent-container');
        if (consentContainer) {
            if (paymentPolicyEnabled && !isUpdateMode) {
                consentContainer.classList.remove('hidden');
            } else {
                consentContainer.classList.add('hidden');
            }
        }
    }
    updateSubmitButtonState();
}

// -----------------------------------------------------------------------------
// Step 6: File Upload, Compression, Lightbox and Replacement Action
// -----------------------------------------------------------------------------
function compressImage(file, quality = 0.7) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                const MAX_WIDTH = 1200;
                const MAX_HEIGHT = 1200;
                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    const compressed = new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    });
                    resolve(compressed);
                }, 'image/jpeg', quality);
            };
        };
    });
}

if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
        filePreviewContainer.innerHTML = '';
        const file = e.target.files[0];

        if (!file) {
            compressedFile = null;
            if (submitSlipBtn) submitSlipBtn.disabled = true;
            return;
        }

        // Validate formats
        if (!CONFIG.ALLOWED_MIME_TYPES.includes(file.type)) {
            showToast('ประเภทไฟล์ไม่ถูกต้อง กรุณาอัปโหลดสลิปเป็น PNG, JPG, JPEG หรือ PDF เท่านั้น', 'error');
            fileInput.value = '';
            compressedFile = null;
            if (submitSlipBtn) submitSlipBtn.disabled = true;
            return;
        }

        // Image compression vs direct PDF upload
        if (file.type.startsWith('image/')) {
            showToast('กำลังทำการบีบอัดรูปภาพสลิปเพื่อความรวดเร็ว...', 'info');
            compressedFile = await compressImage(file, 0.75);
        } else {
            compressedFile = file; // PDF files are uploaded as is
        }

        const sizeMb = compressedFile.size / (1024 * 1024);
        if (sizeMb > CONFIG.MAX_UPLOAD_SIZE_MB) {
            showToast(`ขนาดไฟล์เกินขีดจำกัดสูงสุด ${CONFIG.MAX_UPLOAD_SIZE_MB}MB`, 'error');
            fileInput.value = '';
            compressedFile = null;
            if (submitSlipBtn) submitSlipBtn.disabled = true;
            return;
        }

        // Render Preview
        if (compressedFile.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(compressedFile);
            img.className = 'slip-preview-img';
            img.style.maxWidth = '100%';
            img.style.maxHeight = '140px';
            img.style.borderRadius = 'var(--border-radius-sm)';
            img.onload = () => URL.revokeObjectURL(img.src);
            filePreviewContainer.appendChild(img);
        } else {
            const div = document.createElement('div');
            div.className = 'slip-preview-pdf';
            div.innerHTML = `
                <span class="pdf-icon" style="font-size: 2rem;">📄</span>
                <div style="font-weight:bold; margin-top:0.25rem;">${compressedFile.name}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">PDF (${sizeMb.toFixed(2)} MB)</div>
            `;
            filePreviewContainer.appendChild(div);
        }

        // Update actions panel
        const nameLabel = document.getElementById('loaded-filename');
        if (nameLabel) nameLabel.textContent = compressedFile.name;
        const actionsPanel = document.getElementById('slip-loaded-actions');
        if (actionsPanel) actionsPanel.classList.remove('hidden');

        updateSubmitButtonState();
    });
}

// Lightbox Preview Trigger
const previewLoadedBtn = document.getElementById('preview-loaded-btn');
if (previewLoadedBtn) {
    previewLoadedBtn.onclick = () => {
        if (compressedFile && compressedFile.type.startsWith('image/')) {
            const lightboxModal = document.getElementById('lightbox-modal');
            const lightboxImg = document.getElementById('lightbox-image');
            if (lightboxModal && lightboxImg) {
                lightboxImg.src = URL.createObjectURL(compressedFile);
                lightboxModal.style.display = 'flex';
            }
        } else {
            showToast('ไฟล์ PDF ไม่รองรับการแสดงผลตัวอย่างรูปภาพเต็มจอ', 'info');
        }
    };
}

// File Replacement Action
const replaceLoadedBtn = document.getElementById('replace-loaded-btn');
if (replaceLoadedBtn) {
    replaceLoadedBtn.onclick = () => {
        if (fileInput) fileInput.click();
    };
}

// -----------------------------------------------------------------------------
// Step 7: Submit or Update Slip
// -----------------------------------------------------------------------------
if (submitSlipBtn) {
    submitSlipBtn.addEventListener('click', async () => {
        if (!currentStudent || !selectedMonthSetting || selectedWeeks.length === 0) return;

        if (!compressedFile) {
            showToast('โปรดเลือกไฟล์สลิปหลักฐานการชำระเงิน', 'error');
            return;
        }

        // Early payment warn checks
        const todayStr = dateToYmdString(new Date());
        let hasEarlyPayment = false;
        selectedWeeks.forEach(wNum => {
            const wInfo = selectedMonthSetting.weeks.find(x => x.week_number === wNum);
            if (wInfo && wInfo.due_date > todayStr) {
                hasEarlyPayment = true;
            }
        });

        if (hasEarlyPayment && !isUpdateMode) {
            const confirmEarly = await showConfirm(
                'ยืนยันชำระเงินล่วงหน้า',
                "สัปดาห์บางส่วนที่คุณเลือกชำระเงิน ยังไม่ถึงกำหนดเวลาเก็บเงินอย่างเป็นทางการ คุณต้องการยืนยันการชำระเงินค่าเทอมล่วงหน้าหรือไม่?"
            );
            if (!confirmEarly) return;
        }

        submitSlipBtn.disabled = true;
        submitSlipBtn.textContent = 'กำลังส่งหลักฐาน...';

        const formData = new FormData();
        formData.append('slip', compressedFile);

        let endpointUrl = `${CONFIG.API_BASE_URL}/submissions.php?action=submit`;
        if (isUpdateMode && activeSubmissionId) {
            endpointUrl = `${CONFIG.API_BASE_URL}/submissions.php?action=update_slip`;
            formData.append('submission_id', activeSubmissionId);
        } else {
            formData.append('student_id', currentStudent.id);
            formData.append('month_setting_id', selectedMonthSetting.id);
            formData.append('weeks', JSON.stringify(selectedWeeks));
            formData.append('policy_accepted', paymentPolicyEnabled ? 'true' : 'false');
            if (paymentPolicyEnabled) {
                formData.append('policy_text_accepted', paymentPolicyText);
            }
        }

        Loading.show('กำลังนำส่งหลักฐานสลิปโอนเงิน...');
        try {
            const response = await fetch(endpointUrl, {
                method: 'POST',
                body: formData
            });
            const result = await response.json();

            if (result.status === 'success') {
                if (isUpdateMode) {
                    showToast('แก้ไขและอัปเดตไฟล์สลิปชำระเงินสำเร็จ!', 'success');
                    resetPaymentForm();
                } else {
                    // Trigger Success Modal Receipt
                    showSuccessModal(result.data);
                }

                // Reload Student Ledger
                await loadStudentLedger();
            } else {
                showToast(result.message || 'การส่งสลิปล้มเหลว', 'error');
                submitSlipBtn.disabled = false;
                submitSlipBtn.textContent = 'ยืนยันและนำส่งสลิปโอนเงิน';
            }
        } catch (e) {
            showToast('ระบบเน็ตเวิร์กขัดข้องชั่วคราวในการจัดส่งหลักฐาน', 'error');
            submitSlipBtn.disabled = false;
            submitSlipBtn.textContent = 'ยืนยันและนำส่งสลิปโอนเงิน';
            console.error(e);
        } finally {
            Loading.hide();
        }
    });
}

function showSuccessModal(data) {
    const modal = document.getElementById('success-modal');

    document.getElementById('modal-receipt-id').textContent = data.submission_id.substring(0, 12).toUpperCase();
    document.getElementById('modal-receipt-amount').textContent = `${data.amount} บาท`;
    document.getElementById('modal-receipt-weeks').textContent = data.weeks.map(w => `สัปดาห์ที่ ${w}`).join(', ');
    document.getElementById('modal-receipt-time').textContent = new Date().toLocaleString('th-TH');

    modal.classList.add('active');

    // Close Modal Handler
    const closeBtn = document.getElementById('modal-close-btn');
    const dismissBtn = document.getElementById('modal-dismiss-btn');

    const closeModal = () => {
        modal.classList.remove('active');
        resetPaymentForm();
    };

    closeBtn.onclick = closeModal;
    dismissBtn.onclick = closeModal;
}

// Date helper
function dateToYmdString(date) {
    const d = new Date(date);
    const month = '' + (d.getMonth() + 1);
    const day = '' + d.getDate();
    const year = d.getFullYear();

    return [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
}

// -----------------------------------------------------------------------------
// Change Password Modal Handler
// -----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    const openChangePwBtn = document.getElementById('open-change-pw-btn');
    const changePwModal = document.getElementById('change-pw-modal');
    const closePwModalBtn = document.getElementById('close-pw-modal-btn');
    const cancelPwBtn = document.getElementById('cancel-pw-btn');
    const changePwForm = document.getElementById('change-pw-form');
    const submitPwBtn = document.getElementById('submit-pw-btn');

    if (openChangePwBtn && changePwModal) {
        openChangePwBtn.addEventListener('click', () => {
            changePwModal.classList.add('active');
            changePwForm.reset();
        });

        const closePwModal = () => {
            changePwModal.classList.remove('active');
        };

        closePwModalBtn.addEventListener('click', closePwModal);
        cancelPwBtn.addEventListener('click', closePwModal);

        changePwForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const oldPassword = document.getElementById('old-password').value;
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            if (newPassword !== confirmPassword) {
                showToast('รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน', 'error');
                return;
            }

            if (newPassword.length < 6) {
                showToast('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร', 'error');
                return;
            }

            submitPwBtn.disabled = true;
            submitPwBtn.textContent = 'กำลังดำเนินการ...';

            try {
                const response = await fetch(`${CONFIG.API_BASE_URL}/students.php?action=change_password`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        student_id: currentStudent.student_id,
                        old_password: oldPassword,
                        new_password: newPassword
                    })
                });

                const result = await response.json();

                if (result.status === 'success') {
                    showToast('เปลี่ยนรหัสผ่านสำเร็จแล้ว! กรุณาใช้รหัสผ่านใหม่ในการเข้าระบบครั้งถัดไป', 'success');
                    closePwModal();
                } else {
                    showToast(result.message || 'เปลี่ยนรหัสผ่านล้มเหลว กรุณาตรวจสอบข้อมูล', 'error');
                }
            } catch (err) {
                showToast('ระบบเครือข่ายขัดข้อง ไม่สามารถเปลี่ยนรหัสผ่านได้', 'error');
                console.error(err);
            } finally {
                submitPwBtn.disabled = false;
                submitPwBtn.textContent = 'ยืนยันการเปลี่ยน';
            }
        });
    }

    // -----------------------------------------------------------------------------
    // Profile settings Modal Handler
    // -----------------------------------------------------------------------------
    const addEmailBtn = document.getElementById('add-email-btn');
    const addNicknameBtn = document.getElementById('add-nickname-btn');
    const editProfileBtn = document.getElementById('edit-profile-btn');
    const updateEmailModal = document.getElementById('update-email-modal');
    const closeEmailModalBtn = document.getElementById('close-email-modal-btn');
    const cancelEmailBtn = document.getElementById('cancel-email-btn');
    const updateEmailForm = document.getElementById('update-email-form');
    const submitEmailBtn = document.getElementById('submit-email-btn');

    const openProfileModal = (mode = 'all') => {
        if (!updateEmailModal) return;
        updateEmailModal.classList.add('active');

        // Prefill existing details
        const emailInput = document.getElementById('new-student-email');
        const nickInput = document.getElementById('new-student-nickname');
        const engFirstInput = document.getElementById('new-student-eng-first');
        const engLastInput = document.getElementById('new-student-eng-last');
        const engNickInput = document.getElementById('new-student-eng-nick');
        const ageInput = document.getElementById('new-student-age');

        if (emailInput) emailInput.value = currentStudent.email || '';
        if (nickInput) nickInput.value = currentStudent.nickname || '';
        if (engFirstInput) engFirstInput.value = currentStudent.english_first_name || '';
        if (engLastInput) engLastInput.value = currentStudent.english_last_name || '';
        if (engNickInput) engNickInput.value = currentStudent.english_nickname || '';
        if (ageInput) ageInput.value = currentStudent.age || '';

        // Toggling form groups and required attributes dynamically
        const groupNickname = document.getElementById('group-nickname');
        const groupEmail = document.getElementById('group-email');
        const groupEngFirst = document.getElementById('group-eng-first');
        const groupEngLast = document.getElementById('group-eng-last');
        const groupEngNick = document.getElementById('group-eng-nick');
        const groupAge = document.getElementById('group-age');
        const modalTitle = document.getElementById('profile-modal-title');

        if (mode === 'nickname') {
            if (modalTitle) modalTitle.textContent = 'เพิ่มชื่อเล่น';
            if (groupNickname) groupNickname.style.display = 'flex';
            if (groupEmail) groupEmail.style.display = 'none';
            if (groupEngFirst) groupEngFirst.style.display = 'none';
            if (groupEngLast) groupEngLast.style.display = 'none';
            if (groupEngNick) groupEngNick.style.display = 'none';
            if (groupAge) groupAge.style.display = 'none';
            if (emailInput) emailInput.removeAttribute('required');
        } else if (mode === 'email') {
            if (modalTitle) modalTitle.textContent = 'เพิ่มอีเมล';
            if (groupNickname) groupNickname.style.display = 'none';
            if (groupEmail) groupEmail.style.display = 'flex';
            if (groupEngFirst) groupEngFirst.style.display = 'none';
            if (groupEngLast) groupEngLast.style.display = 'none';
            if (groupEngNick) groupEngNick.style.display = 'none';
            if (groupAge) groupAge.style.display = 'none';
            if (emailInput) emailInput.setAttribute('required', 'required');
        } else {
            // mode === 'all'
            if (modalTitle) modalTitle.textContent = 'แก้ไขข้อมูลส่วนตัว';
            if (groupNickname) groupNickname.style.display = 'flex';
            if (groupEmail) groupEmail.style.display = 'flex';
            if (groupEngFirst) groupEngFirst.style.display = 'flex';
            if (groupEngLast) groupEngLast.style.display = 'flex';
            if (groupEngNick) groupEngNick.style.display = 'flex';
            if (groupAge) groupAge.style.display = 'flex';
            if (emailInput) emailInput.setAttribute('required', 'required');
        }
    };

    if (addEmailBtn) addEmailBtn.addEventListener('click', () => openProfileModal('email'));
    if (addNicknameBtn) addNicknameBtn.addEventListener('click', () => openProfileModal('nickname'));
    if (editProfileBtn) editProfileBtn.addEventListener('click', () => openProfileModal('all'));

    if (updateEmailModal) {
        const closeEmailModal = () => {
            updateEmailModal.classList.remove('active');
        };

        if (closeEmailModalBtn) closeEmailModalBtn.addEventListener('click', closeEmailModal);
        if (cancelEmailBtn) cancelEmailBtn.addEventListener('click', closeEmailModal);

        if (updateEmailForm) {
            updateEmailForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                const emailInput = document.getElementById('new-student-email');
                const isEmailRequired = emailInput && emailInput.hasAttribute('required');
                const newEmail = emailInput ? emailInput.value.trim() : '';

                const nicknameInput = document.getElementById('new-student-nickname');
                const isNicknameVisible = nicknameInput && nicknameInput.closest('.form-group').style.display !== 'none';
                const newNickname = nicknameInput ? nicknameInput.value.trim() : '';

                const engFirst = document.getElementById('new-student-eng-first').value.trim();
                const engLast = document.getElementById('new-student-eng-last').value.trim();
                const engNick = document.getElementById('new-student-eng-nick').value.trim();
                const age = parseInt(document.getElementById('new-student-age').value) || null;

                if (isEmailRequired && !newEmail) {
                    showToast('กรุณากรอกที่อยู่อีเมล', 'error');
                    return;
                }

                if (isNicknameVisible && !newNickname) {
                    showToast('กรุณากรอกชื่อเล่นภาษาไทย', 'error');
                    return;
                }

                submitEmailBtn.disabled = true;
                submitEmailBtn.textContent = 'กำลังบันทึก...';

                try {
                    const response = await fetch(`${CONFIG.API_BASE_URL}/students.php?action=update_profile`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            student_id: currentStudent.student_id,
                            email: newEmail,
                            nickname: newNickname,
                            english_first_name: engFirst,
                            english_last_name: engLast,
                            english_nickname: engNick,
                            age: age
                        })
                    });

                    const result = await response.json();

                    if (result.status === 'success') {
                        showToast('บันทึกข้อมูลส่วนตัวสำเร็จแล้ว!', 'success');

                        // Update session state in memory & localStorage
                        currentStudent.email = newEmail;
                        currentStudent.nickname = newNickname;
                        currentStudent.english_first_name = engFirst;
                        currentStudent.english_last_name = engLast;
                        currentStudent.english_nickname = engNick;
                        currentStudent.age = age;

                        localStorage.setItem('student_session', JSON.stringify(currentStudent));

                        // Update frontend presentation
                        updateEmailUI();

                        // Dynamically update welcome heading if it exists
                        const welcomeName = document.getElementById('welcome-name');
                        if (welcomeName) {
                            welcomeName.textContent = currentStudent.nickname || currentStudent.full_name;
                        }

                        // Dynamically update avatar initials
                        const avatarInitial = document.getElementById('student-avatar-initial');
                        if (avatarInitial) {
                            avatarInitial.textContent = (currentStudent.nickname || currentStudent.full_name || 'S').charAt(0).toUpperCase();
                        }

                        closeEmailModal();
                    } else {
                        showToast(result.message || 'บันทึกข้อมูลล้มเหลว', 'error');
                    }
                } catch (err) {
                    showToast('ระบบเครือข่ายขัดข้อง ไม่สามารถบันทึกข้อมูลได้', 'error');
                    console.error(err);
                } finally {
                    submitEmailBtn.disabled = false;
                    submitEmailBtn.textContent = 'บันทึกข้อมูลส่วนตัว';
                }
            });
        }
    }
});

// Update Profile & Badges display state globally
function updateEmailUI() {
    const studentEmailDisplay = document.getElementById('student-email-display');
    const studentEmailDivider = document.getElementById('student-email-divider');
    const studentNicknameDisplay = document.getElementById('student-nickname-display');
    const addEmailBtn = document.getElementById('add-email-btn');
    const addNicknameBtn = document.getElementById('add-nickname-btn');
    const editProfileBtn = document.getElementById('edit-profile-btn');

    if (!currentStudent) return;

    let hasMissingField = false;

    // 1. Handle Nickname Display
    if (studentNicknameDisplay) {
        if (currentStudent.nickname && currentStudent.nickname.trim() !== '') {
            studentNicknameDisplay.textContent = `(${currentStudent.nickname})`;
            studentNicknameDisplay.style.display = 'inline';
            if (addNicknameBtn) addNicknameBtn.style.display = 'none';
        } else {
            studentNicknameDisplay.style.display = 'none';
            if (addNicknameBtn) addNicknameBtn.style.display = 'inline-flex';
            hasMissingField = true;
        }
    }

    // 2. Handle Email Display
    if (studentEmailDisplay) {
        if (currentStudent.email && currentStudent.email.trim() !== '') {
            studentEmailDisplay.textContent = currentStudent.email;
            studentEmailDisplay.style.display = 'inline';
            if (studentEmailDivider) studentEmailDivider.style.display = 'inline';
            if (addEmailBtn) addEmailBtn.style.display = 'none';
        } else {
            studentEmailDisplay.style.display = 'none';
            if (studentEmailDivider) studentEmailDivider.style.display = 'none';
            if (addEmailBtn) addEmailBtn.style.display = 'inline-flex';
            hasMissingField = true;
        }
    }

    // 3. Handle Edit Profile Button Visibility
    if (editProfileBtn) {
        if (!hasMissingField) {
            editProfileBtn.style.display = 'inline-flex';
        } else {
            editProfileBtn.style.display = 'none';
        }
    }
}

// -----------------------------------------------------------------------------
// PR Dashboard Implementation
// -----------------------------------------------------------------------------

// Announcements Dataset
let announcementsData = [];

function initPRDashboard() {
    if (!currentStudent) return;

    // 1. Set Welcome Name
    const welcomeName = document.getElementById('welcome-name');
    if (welcomeName) {
        welcomeName.textContent = currentStudent.nickname || currentStudent.full_name;
    }

    // 2. Start Live Clock
    startLiveClock();

    // 3. Initialize Tabs navigation
    initTabs();

    // 4. Fetch and render announcements
    loadAnnouncements();

    // 5. Initialize Category Filters
    const filterButtons = document.querySelectorAll('.pr-filters .filter-btn');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const category = btn.getAttribute('data-category');
            renderAnnouncements(category);
        });
    });

    // 6. Initialize Ledger Filters
    initLedgerFilters();

    // 7. Load Ledger Data
    loadClassroomLedger();
}

function startLiveClock() {
    const clockEl = document.getElementById('live-clock');
    const dateEl = document.getElementById('live-date');
    if (!clockEl || !dateEl) return;

    const updateTime = () => {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString('th-TH', { hour12: false });

        dateEl.textContent = now.toLocaleDateString('th-TH', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        });
    };
    updateTime();
    setInterval(updateTime, 1000);
}

async function loadAnnouncements() {
    const cacheKey = `student_announcements_${currentStudent ? currentStudent.id : 'guest'}`;
    const cachedDataStr = localStorage.getItem(cacheKey);
    let hasRenderedCache = false;

    if (cachedDataStr) {
        try {
            announcementsData = JSON.parse(cachedDataStr);
            renderAnnouncements('all');
            hasRenderedCache = true;
        } catch (e) {
            console.error("Error parsing cached announcements:", e);
        }
    }

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/notifications.php?action=my_notifications`);
        const result = await response.json();
        if (result.status === 'success') {
            const mappedData = result.data.map(n => ({
                id: n.id,
                title: n.title,
                content: n.message,
                category: n.type === 'BudgetChange' || n.type === 'Approval' || n.type === 'Rejection' ? 'การเงิน' : 'กิจกรรม',
                date: new Date(n.created_at).toLocaleDateString('th-TH', { month: 'short', day: 'numeric', year: 'numeric' }),
                is_cancelled: n.is_cancelled,
                setting_id: n.setting_id
            }));

            const newDataStr = JSON.stringify(mappedData);
            if (newDataStr !== cachedDataStr || !hasRenderedCache) {
                announcementsData = mappedData;
                localStorage.setItem(cacheKey, newDataStr);
                renderAnnouncements('all');
            }
        }
    } catch (e) {
        console.error('Failed to load announcements', e);
    }
}

function renderAnnouncements(categoryFilter = 'all') {
    const container = document.getElementById('announcements-container');
    if (!container) return;

    container.innerHTML = '';

    const filtered = categoryFilter === 'all'
        ? announcementsData
        : announcementsData.filter(a => a.category === categoryFilter);

    if (filtered.length === 0) {
        container.innerHTML = `<div class="card text-center text-muted" style="padding: 2.5rem; background: var(--bg-secondary);">ไม่มีรายการประชาสัมพันธ์ในหมวดหมู่นี้</div>`;
        return;
    }

    const categoryTags = {
        'การเงิน': 'tag-finance',
        'การเรียน': 'tag-study',
        'กิจกรรม': 'tag-activity'
    };

    filtered.forEach(a => {
        const card = document.createElement('div');
        card.className = 'announcement-card';
        if (a.is_cancelled) {
            card.style.borderLeft = '4px solid var(--status-red-border)';
        }

        card.innerHTML = `
            <div class="announcement-header">
                <div class="announcement-meta">
                    <span class="announcement-tag ${categoryTags[a.category] || 'tag-study'}">${a.category}</span>
                    <span class="announcement-date"><i class="far fa-clock"></i> ${a.date}</span>
                    ${a.is_cancelled ? '<span class="badge badge-red" style="font-size:0.65rem; margin-left:0.5rem;">ยกเลิกแล้ว</span>' : ''}
                </div>
                <i class="fas fa-chevron-right text-muted" style="font-size: 0.8rem;"></i>
            </div>
            <h3 class="announcement-title" style="${a.is_cancelled ? 'text-decoration: line-through; color: var(--text-muted);' : ''}">${a.title}</h3>
            <p class="announcement-excerpt">${a.content}</p>
            <div class="announcement-footer">
                <span>อ่านรายละเอียดทั้งหมด</span>
                <i class="fas fa-arrow-right"></i>
            </div>
        `;

        card.addEventListener('click', () => {
            showAnnouncementModal(a);
            // Mark read
            markNotificationAsRead(a.id);
        });
        container.appendChild(card);
    });
}

async function markNotificationAsRead(id) {
    try {
        await fetch(`${CONFIG.API_BASE_URL}/notifications.php?action=mark_read`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id: id })
        });
        // Update unread count badge
        loadUnreadNotificationsCount();
    } catch (e) {
        console.error(e);
    }
}

async function loadUnreadNotificationsCount() {
    const badge = document.getElementById('inbox-badge');
    if (!badge) return;

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/notifications.php?action=unread_count`);
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
        console.error('Failed to load unread count', e);
    }
}

function showAnnouncementModal(announcement) {
    const modal = document.getElementById('announcement-modal');
    const titleEl = document.getElementById('modal-announcement-title');
    const dateEl = document.getElementById('modal-announcement-date');
    const tagEl = document.getElementById('modal-announcement-tag');
    const bodyEl = document.getElementById('modal-announcement-body');

    if (!modal) return;

    const categoryTags = {
        'การเงิน': 'tag-finance',
        'การเรียน': 'tag-study',
        'กิจกรรม': 'tag-activity'
    };

    titleEl.textContent = announcement.title;
    dateEl.textContent = announcement.date;
    tagEl.textContent = announcement.category;
    tagEl.className = `announcement-tag ${categoryTags[announcement.category] || 'tag-study'}`;

    bodyEl.textContent = announcement.content;

    modal.classList.add('active');

    const closeButtons = [
        document.getElementById('close-announcement-modal-btn'),
        document.getElementById('close-announcement-btn')
    ];

    const closeModal = () => modal.classList.remove('active');
    closeButtons.forEach(btn => {
        if (btn) btn.onclick = closeModal;
    });
}

function initTabs() {
    const tabPR = document.getElementById('tab-pr');
    const tabPayment = document.getElementById('tab-payment');
    const tabActivity = document.getElementById('tab-activity');
    const viewPaymentDetailsBtn = document.getElementById('view-payment-details-btn');

    const prSection = document.getElementById('pr-dashboard-section');
    const paymentSection = document.getElementById('payment-dashboard-section');
    const activitySection = document.getElementById('activity-dashboard-section');

    const switchTab = (tabName) => {
        // Reset active classes
        [tabPR, tabPayment, tabActivity].forEach(btn => { if (btn) btn.classList.remove('active'); });
        // Hide all sections
        [prSection, paymentSection, activitySection].forEach(sec => { if (sec) sec.classList.add('hidden'); });

        if (tabName === 'pr') {
            if (tabPR) tabPR.classList.add('active');
            if (prSection) prSection.classList.remove('hidden');
        } else if (tabName === 'payment') {
            if (tabPayment) tabPayment.classList.add('active');
            if (paymentSection) paymentSection.classList.remove('hidden');
        } else if (tabName === 'activity') {
            if (tabActivity) tabActivity.classList.add('active');
            if (activitySection) activitySection.classList.remove('hidden');
            loadStudentActivityData();
        }
    };

    if (tabPR) tabPR.addEventListener('click', () => switchTab('pr'));
    if (tabPayment) tabPayment.addEventListener('click', () => switchTab('payment'));
    if (tabActivity) tabActivity.addEventListener('click', () => switchTab('activity'));
    if (viewPaymentDetailsBtn) viewPaymentDetailsBtn.addEventListener('click', () => switchTab('payment'));
}

function updateMiniPaymentStats() {
    const miniUnpaidStatus = document.getElementById('mini-unpaid-status');
    const miniUnpaidAmount = document.getElementById('mini-unpaid-amount');
    const miniPaidWeb = document.getElementById('mini-paid-web');
    const miniPaidCash = document.getElementById('mini-paid-cash');

    // Unhide the card now that we have data
    const paymentStatsBox = document.getElementById('view-payment-details-btn')?.closest('.card');
    if (paymentStatsBox) {
        paymentStatsBox.style.display = 'block';
    }

    let totalUnpaidRaw = 0;
    let totalPaidWebRaw = 0;
    monthlyStatusData.forEach(month => {
        month.weeks.forEach(week => {
            if (week.status === 'Unpaid' || week.status === 'Overdue') {
                totalUnpaidRaw += parseFloat(week.amount);
            } else if (week.status === 'Verified') {
                totalPaidWebRaw += parseFloat(week.amount);
            }
        });
    });

    const adjustments = typeof currentStudentAdjustments === 'number' ? currentStudentAdjustments : 0;
    const refunds = typeof currentStudentRefunds === 'number' ? currentStudentRefunds : 0;
    
    // Net cash/adjustments credits
    const netCash = adjustments - refunds;

    // Actual unpaid balance considering cash payments
    const finalUnpaid = Math.max(0, totalUnpaidRaw - netCash);

    if (miniUnpaidAmount) {
        miniUnpaidAmount.textContent = `${finalUnpaid.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`;
    }

    if (miniPaidWeb) {
        miniPaidWeb.textContent = `${totalPaidWebRaw.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`;
    }

    if (miniPaidCash) {
        miniPaidCash.textContent = `${adjustments.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`;
    }

    if (miniUnpaidStatus) {
        if (finalUnpaid > 0) {
            miniUnpaidStatus.textContent = 'มียอดค้างชำระ';
            miniUnpaidStatus.className = 'status-badge-red';
        } else {
            miniUnpaidStatus.textContent = 'ชำระครบแล้ว';
            miniUnpaidStatus.className = 'status-badge-green';
        }
    }
}

// -----------------------------------------------------------------------------
// Classroom Financial Ledger Operations
// -----------------------------------------------------------------------------

let currentLedgerType = ''; // empty string represents 'all'
let currentLedgerMonth = '';
let currentLedgerSearch = '';

async function loadClassroomLedger() {
    const container = document.getElementById('ledger-list-container');
    if (!container) return;

    container.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 2rem; font-family: var(--font-body);">กำลังโหลดประวัติการเงิน...</td></tr>`;

    try {
        const url = `${CONFIG.API_BASE_URL}/ledger.php?month=${encodeURIComponent(currentLedgerMonth)}&type=${encodeURIComponent(currentLedgerType)}&search=${encodeURIComponent(currentLedgerSearch)}`;
        const response = await fetch(url);
        const result = await response.json();

        if (result.status === 'success') {
            let data = result.data || [];

            // Calculate stats for recipt.html
            const totalBalanceEl = document.getElementById('stats-total-balance');
            const totalIncomeEl = document.getElementById('stats-total-income');
            const totalExpenseEl = document.getElementById('stats-total-expense');

            if (totalBalanceEl || totalIncomeEl || totalExpenseEl) {
                let sumIncome = 0;
                let sumExpense = 0;

                data.forEach(item => {
                    const amt = parseFloat(item.amount);
                    if (item.type === 'Income') {
                        sumIncome += amt;
                    } else if (item.type === 'Expense') {
                        sumExpense += amt;
                    }
                });

                const balance = sumIncome - sumExpense;

                if (totalBalanceEl) totalBalanceEl.textContent = `${balance.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`;
                if (totalIncomeEl) totalIncomeEl.textContent = `${sumIncome.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`;
                if (totalExpenseEl) totalExpenseEl.textContent = `${sumExpense.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท`;
            }

            // Limit to 5 items if on the dashboard preview page
            const isDashboardPreview = !document.getElementById('filter-ledger-search');
            if (isDashboardPreview) {
                data = data.slice(0, 5);
            }

            if (data.length === 0) {
                container.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding: 2.5rem; font-family: var(--font-body);">ไม่มีประวัติการทำธุรกรรมเงินห้องเรียนที่สอดคล้อง</td></tr>`;
                return;
            }

            container.innerHTML = '';

            const thaiMonths = [
                'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
            ];

            data.forEach(item => {
                const tr = document.createElement('tr');

                const dateObj = new Date(item.created_at);
                const formattedDate = `${dateObj.getDate()} ${thaiMonths[dateObj.getMonth()]} ${dateObj.getFullYear() + 543}`;

                const isIncome = item.type === 'Income';
                const sign = isIncome ? '+' : '-';
                const amountColor = isIncome ? 'var(--status-green-text)' : 'var(--status-red-text)';
                const amountText = `${sign}${parseFloat(Math.abs(item.amount)).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
                const icon = isIncome
                    ? `<i class="fas fa-arrow-circle-up" style="color: var(--status-green-text); margin-right: 0.5rem;"></i>`
                    : `<i class="fas fa-arrow-circle-down" style="color: var(--status-red-text); margin-right: 0.5rem;"></i>`;

                const statusBadge = item.status === 'Pending'
                    ? `<span class="badge badge-yellow">กำลังดำเนินการ</span>`
                    : `<span class="badge badge-green">เสร็จสิ้น</span>`;

                tr.innerHTML = `
                    <td style="padding: 0.75rem 1rem; font-weight: 600; color: var(--text-primary);">
                        <div style="display: flex; align-items: center;">
                            ${icon}
                            <span>${item.title}</span>
                        </div>
                    </td>
                    <td style="padding: 0.75rem 1rem; color: var(--text-secondary);">${item.person_name}</td>
                    <td style="padding: 0.75rem 1rem; text-align: right; font-weight: 700; color: ${amountColor}; font-family: monospace;">${amountText}</td>
                    <td style="padding: 0.75rem 1rem; text-align: center; color: var(--text-muted);">${formattedDate}</td>
                    <td style="padding: 0.75rem 1rem; text-align: center;">${statusBadge}</td>
                `;

                container.appendChild(tr);
            });
        } else {
            container.innerHTML = `<tr><td colspan="5" class="text-center text-red" style="padding: 2rem; font-family: var(--font-body);">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>`;
        }
    } catch (err) {
        container.innerHTML = `<tr><td colspan="5" class="text-center text-red" style="padding: 2rem; font-family: var(--font-body);">ไม่สามารถเชื่อมต่อเครื่องแม่ข่ายการเงินได้</td></tr>`;
        console.error(err);
    }
}

function initLedgerFilters() {
    const btnAll = document.getElementById('filter-ledger-all');
    const btnIncome = document.getElementById('filter-ledger-income');
    const btnExpense = document.getElementById('filter-ledger-expense');
    const selectMonth = document.getElementById('filter-ledger-month');
    const searchInput = document.getElementById('filter-ledger-search');

    if (!btnAll || !btnIncome || !btnExpense || !selectMonth || !searchInput) return;

    const setTabActive = (activeBtn) => {
        [btnAll, btnIncome, btnExpense].forEach(btn => btn.classList.remove('active'));
        activeBtn.classList.add('active');
    };

    btnAll.addEventListener('click', () => {
        setTabActive(btnAll);
        currentLedgerType = '';
        loadClassroomLedger();
    });

    btnIncome.addEventListener('click', () => {
        setTabActive(btnIncome);
        currentLedgerType = 'Income';
        loadClassroomLedger();
    });

    btnExpense.addEventListener('click', () => {
        setTabActive(btnExpense);
        currentLedgerType = 'Expense';
        loadClassroomLedger();
    });

    selectMonth.addEventListener('change', () => {
        currentLedgerMonth = selectMonth.value;
        loadClassroomLedger();
    });

    let searchTimeout = null;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentLedgerSearch = searchInput.value;
            loadClassroomLedger();
        }, 300);
    });
}

async function loadStudentActivityData() {
    if (!currentStudent) return;

    // Set student details
    const qrName = document.getElementById('qrcode-student-name');
    const qrId = document.getElementById('qrcode-student-id');
    if (qrName) qrName.textContent = currentStudent.full_name + (currentStudent.nickname ? ` (${currentStudent.nickname})` : '');
    if (qrId) qrId.textContent = 'รหัสประจำตัว: ' + currentStudent.student_id;

    // Load QR Code
    const qrContainer = document.getElementById('student-qrcode-container');
    if (qrContainer) {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(currentStudent.student_id)}`;
        qrContainer.innerHTML = `<img src="${qrUrl}" alt="Student QR Code" style="width: 250px; height: 250px; border-radius: 8px;">`;
    }

    // Load Attendance History
    const historyContainer = document.getElementById('student-activity-history-container');
    const countBadge = document.getElementById('activity-count-badge');
    if (!historyContainer) return;

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/activities.php?action=my_attendance`);
        const result = await response.json();

        if (result.status === 'success') {
            const list = result.data || [];
            if (countBadge) {
                countBadge.textContent = `${list.length} กิจกรรม`;
            }

            if (list.length === 0) {
                historyContainer.innerHTML = `
                    <div class="text-center text-muted" style="padding: 3rem 1rem;">
                        <i class="fas fa-qrcode" style="font-size: 2.5rem; margin-bottom: 1rem; color: var(--text-secondary); opacity: 0.5;"></i>
                        <p>ยังไม่มีประวัติการเข้าร่วมกิจกรรม</p>
                        <p style="font-size: 0.85rem;">แสดง QR Code ให้เจ้าหน้าที่สแกนเพื่อเช็คชื่อเข้ากิจกรรม</p>
                    </div>
                `;
                return;
            }

            historyContainer.innerHTML = list.map(item => {
                const formattedDate = new Date(item.checked_in_at).toLocaleString('th-TH', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                return `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: var(--border-radius-sm); margin-bottom: 0.75rem;">
                        <div>
                            <h4 style="margin: 0; font-family: var(--font-heading); color: var(--text-primary); font-size: 1rem; font-weight: 700;">${item.activity_name}</h4>
                            <span style="font-size: 0.8rem; color: var(--text-secondary);"><i class="far fa-clock" style="margin-right: 0.25rem;"></i>${formattedDate}</span>
                        </div>
                        <span class="badge" style="background: rgba(34, 197, 94, 0.1); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.2); font-size: 0.8rem; padding: 0.3rem 0.6rem; border-radius: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 0.25rem;">
                            <i class="fas fa-check-circle" style="font-size: 0.85rem;"></i> เช็คชื่อแล้ว
                        </span>
                    </div>
                `;
            }).join('');

        } else {
            historyContainer.innerHTML = `<div class="text-center text-muted" style="padding: 3rem 1rem;">โหลดข้อมูลล้มเหลว: ${result.message}</div>`;
        }
    } catch (e) {
        historyContainer.innerHTML = '<div class="text-center text-muted" style="padding: 3rem 1rem;">เกิดข้อผิดพลาดในการโหลดประวัติกิจกรรม</div>';
        console.error(e);
    }
}

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
