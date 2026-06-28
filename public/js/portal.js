// public/js/portal.js

// State variables for student session
let currentStudent = null;
let monthlyStatusData = [];
let selectedMonthSetting = null;
let selectedWeeks = [];

// DOM Element References
const step1Section = document.getElementById('step-1-section');
const portalDashboard = document.getElementById('portal-dashboard');
const verificationForm = document.getElementById('verification-form');
const validateBtn = document.getElementById('validate-btn');
const studentIdInput = document.getElementById('student-id');
const fullNameInput = document.getElementById('full-name');

const studentNameDisplay = document.getElementById('student-name-display');
const studentClassDisplay = document.getElementById('student-class-display');
const monthsTabContainer = document.getElementById('months-tab-container');
const weeksGridContainer = document.getElementById('weeks-grid-container');

const paymentDetailsSection = document.getElementById('payment-details-section');
const paymentModeSelect = document.getElementsByName('payment-mode');
const weekCheckboxesContainer = document.getElementById('week-checkboxes-container');
const totalAmountDisplay = document.getElementById('total-amount-display');
const selectedWeeksSummary = document.getElementById('selected-weeks-summary');

const fileInput = document.getElementById('slip-file');
const filePreviewContainer = document.getElementById('file-preview-container');
const submitSlipBtn = document.getElementById('submit-slip-btn');
const logoutPortalBtn = document.getElementById('logout-portal-btn');

// Toast Notification Helper
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
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

// -----------------------------------------------------------------------------
// Step 1: Student Verification
// -----------------------------------------------------------------------------
verificationForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const studentId = studentIdInput.value.trim();
    const fullName = fullNameInput.value.trim();

    if (!studentId || !fullName) {
        showToast('Please enter both student ID and name.', 'error');
        return;
    }

    validateBtn.disabled = true;
    validateBtn.textContent = 'Verifying...';

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/students.php?action=validate&student_id=${encodeURIComponent(studentId)}&full_name=${encodeURIComponent(fullName)}`);
        const result = await response.json();

        if (result.status === 'success') {
            currentStudent = result.data;
            showToast(`Welcome back, ${currentStudent.nickname || currentStudent.full_name}!`);
            
            // Transition UI to Step 2
            studentNameDisplay.textContent = currentStudent.full_name;
            studentClassDisplay.textContent = `Class: ${currentStudent.class} | Year: ${currentStudent.academic_year}`;
            
            step1Section.classList.add('hidden');
            portalDashboard.classList.remove('hidden');

            // Load Student Payment Ledger
            await loadStudentLedger();
        } else {
            showToast(result.message || 'Validation failed. Check credentials.', 'error');
        }
    } catch (error) {
        showToast('Network error during student lookup.', 'error');
        console.error(error);
    } finally {
        validateBtn.disabled = false;
        validateBtn.textContent = 'Verify and Continue';
    }
});

// Logout Portal
logoutPortalBtn.addEventListener('click', () => {
    currentStudent = null;
    monthlyStatusData = [];
    selectedMonthSetting = null;
    selectedWeeks = [];
    
    studentIdInput.value = '';
    fullNameInput.value = '';
    
    portalDashboard.classList.add('hidden');
    step1Section.classList.remove('hidden');
    showToast('Logged out of session.');
});

// -----------------------------------------------------------------------------
// Step 2 & 3: Render Months and Weeks Status Grid
// -----------------------------------------------------------------------------
async function loadStudentLedger() {
    if (!currentStudent) return;

    monthsTabContainer.innerHTML = '<div class="skeleton" style="height: 50px; width: 100%;"></div>';
    weeksGridContainer.innerHTML = '<div class="skeleton" style="height: 120px; width: 100%;"></div>';

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/submissions.php?action=student_status&student_id=${currentStudent.id}`);
        const result = await response.json();

        if (result.status === 'success') {
            monthlyStatusData = result.data;
            renderMonthsTabs();
            
            // Auto-select the first open month, or the latest month
            const defaultMonth = monthlyStatusData.find(m => m.status === 'Open') || monthlyStatusData[monthlyStatusData.length - 1];
            if (defaultMonth) {
                selectMonth(defaultMonth.id);
            }
        } else {
            showToast(result.message || 'Failed to load ledger records.', 'error');
        }
    } catch (e) {
        showToast('Error syncing payment history records.', 'error');
        console.error(e);
    }
}

function renderMonthsTabs() {
    monthsTabContainer.innerHTML = '';
    
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    monthlyStatusData.forEach(m => {
        const tab = document.createElement('button');
        tab.className = `month-tab tab-color-${m.color}`;
        if (selectedMonthSetting && selectedMonthSetting.id === m.id) {
            tab.classList.add('active');
        }
        
        tab.innerHTML = `
            <span class="month-tab-name">${monthNames[m.month - 1]}</span>
            <span class="month-tab-year">${m.year}</span>
            <span class="status-dot"></span>
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

    renderWeeksGrid();
    resetPaymentForm();
}

function renderWeeksGrid() {
    weeksGridContainer.innerHTML = '';
    
    if (!selectedMonthSetting) return;

    selectedMonthSetting.weeks.forEach(w => {
        const card = document.createElement('div');
        card.className = `week-status-card border-color-${w.color}`;
        
        // Format Due Date
        const dueDateObj = new Date(w.due_date);
        const formattedDate = dueDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        card.innerHTML = `
            <div class="week-number">Week ${w.week_number}</div>
            <div class="week-amount">${w.amount} THB</div>
            <div class="week-due">Due: ${formattedDate}</div>
            <span class="badge badge-${w.color}">${w.status}</span>
        `;
        
        weeksGridContainer.appendChild(card);
    });

    // Toggle Payment form state:
    // Hide form if month is closed, archived, fully verified, or has a pending submission
    const formContainer = document.getElementById('payment-form-card');
    const formMessage = document.getElementById('form-status-message');

    if (selectedMonthSetting.status === 'Archived') {
        formContainer.classList.add('hidden');
        formMessage.textContent = 'This month is archived. Payments are closed.';
        formMessage.classList.remove('hidden');
    } else if (selectedMonthSetting.status === 'Closed') {
        formContainer.classList.add('hidden');
        formMessage.textContent = 'Payments for this month are currently closed.';
        formMessage.classList.remove('hidden');
    } else if (selectedMonthSetting.has_pending_slip) {
        formContainer.classList.add('hidden');
        formMessage.textContent = 'You have a pending slip submission for this month. Please wait for verification.';
        formMessage.classList.remove('hidden');
    } else {
        const allPaid = selectedMonthSetting.weeks.every(w => w.color === 'green');
        if (allPaid) {
            formContainer.classList.add('hidden');
            formMessage.textContent = 'All weeks for this month are fully paid and verified!';
            formMessage.classList.remove('hidden');
        } else {
            formContainer.classList.remove('hidden');
            formMessage.classList.add('hidden');
            setupPaymentFormOptions();
        }
    }
}

// -----------------------------------------------------------------------------
// Step 4: Payment Form Selection Logic
// -----------------------------------------------------------------------------
function resetPaymentForm() {
    selectedWeeks = [];
    fileInput.value = '';
    filePreviewContainer.innerHTML = '';
    submitSlipBtn.disabled = true;
    totalAmountDisplay.textContent = '0.00 THB';
    selectedWeeksSummary.textContent = 'None';
}

function setupPaymentFormOptions() {
    weekCheckboxesContainer.innerHTML = '';
    selectedWeeks = [];

    // Filter weeks that are unpaid or overdue
    const payableWeeks = selectedMonthSetting.weeks.filter(w => w.color === 'gray' || w.color === 'red');

    // Default mode: Pay Remaining Weeks (Recommended / Auto select all)
    const isPayRemainingMode = document.getElementById('mode-remaining').checked;

    payableWeeks.forEach(w => {
        const label = document.createElement('label');
        label.className = 'checkbox-label-card';
        
        const isChecked = isPayRemainingMode;
        if (isChecked) {
            selectedWeeks.push(w.week_number);
        }

        label.innerHTML = `
            <input type="checkbox" value="${w.week_number}" ${isChecked ? 'checked' : ''} 
                   ${isPayRemainingMode ? 'disabled' : ''}>
            <div class="checkbox-box">
                <span class="check-indicator">✓</span>
            </div>
            <div class="checkbox-text">
                <div class="checkbox-week">Week ${w.week_number}</div>
                <div class="checkbox-subtext">${w.color === 'red' ? 'Overdue' : 'Due ' + w.due_date}</div>
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
paymentModeSelect.forEach(radio => {
    radio.addEventListener('change', () => {
        setupPaymentFormOptions();
    });
});

function updatePaymentCalculations() {
    const count = selectedWeeks.length;
    const rate = selectedMonthSetting.weekly_fee;
    const total = count * rate;

    totalAmountDisplay.textContent = `${total.toFixed(2)} THB`;

    if (count > 0) {
        selectedWeeksSummary.textContent = selectedWeeks.map(w => `Week ${w}`).join(', ');
        // Enable submit button if file is also loaded
        if (fileInput.files.length > 0) {
            submitSlipBtn.disabled = false;
        }
    } else {
        selectedWeeksSummary.textContent = 'None';
        submitSlipBtn.disabled = true;
    }
}

// -----------------------------------------------------------------------------
// Step 5: File Upload & Live Preview
// -----------------------------------------------------------------------------
fileInput.addEventListener('change', (e) => {
    filePreviewContainer.innerHTML = '';
    const file = e.target.files[0];

    if (!file) {
        submitSlipBtn.disabled = true;
        return;
    }

    // Client-side validations
    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > CONFIG.MAX_UPLOAD_SIZE_MB) {
        showToast(`File size exceeds ${CONFIG.MAX_UPLOAD_SIZE_MB}MB limit.`, 'error');
        fileInput.value = '';
        submitSlipBtn.disabled = true;
        return;
    }

    if (!CONFIG.ALLOWED_MIME_TYPES.includes(file.type)) {
        showToast('Invalid file format. Please upload PNG, JPG, JPEG, or PDF.', 'error');
        fileInput.value = '';
        submitSlipBtn.disabled = true;
        return;
    }

    // Render Preview
    if (file.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.className = 'slip-preview-img';
        img.onload = () => URL.revokeObjectURL(img.src);
        filePreviewContainer.appendChild(img);
    } else if (file.type === 'application/pdf') {
        const div = document.createElement('div');
        div.className = 'slip-preview-pdf';
        div.innerHTML = `
            <span class="pdf-icon">📄</span>
            <span class="pdf-filename">${file.name}</span>
            <span class="pdf-size">(${sizeMb.toFixed(2)} MB)</span>
        `;
        filePreviewContainer.appendChild(div);
    }

    // Enable submit if weeks are selected
    if (selectedWeeks.length > 0) {
        submitSlipBtn.disabled = false;
    }
});

// -----------------------------------------------------------------------------
// Step 6: Submit Slip
// -----------------------------------------------------------------------------
submitSlipBtn.addEventListener('click', async () => {
    if (!currentStudent || !selectedMonthSetting || selectedWeeks.length === 0) return;

    const file = fileInput.files[0];
    if (!file) {
        showToast('Please select a payment slip file.', 'error');
        return;
    }

    // Check early payment warn
    const todayStr = dateToYmdString(new Date());
    let hasEarlyPayment = false;
    selectedWeeks.forEach(wNum => {
        const wInfo = selectedMonthSetting.weeks.find(x => x.week_number === wNum);
        if (wInfo && wInfo.due_date > todayStr) {
            hasEarlyPayment = true;
        }
    });

    if (hasEarlyPayment) {
        const confirmEarly = confirm("One or more selected weeks have not reached their due date. Do you want to proceed with early payment?");
        if (!confirmEarly) return;
    }

    submitSlipBtn.disabled = true;
    submitSlipBtn.textContent = 'Submitting...';

    const formData = new FormData();
    formData.append('student_id', currentStudent.id);
    formData.append('month_setting_id', selectedMonthSetting.id);
    formData.append('weeks', JSON.stringify(selectedWeeks));
    formData.append('slip', file);

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/submissions.php?action=submit`, {
            method: 'POST',
            body: formData
        });
        const result = await response.json();

        if (result.status === 'success') {
            // Trigger Success Modal
            showSuccessModal(result.data);
            
            // Reload Student Ledger
            await loadStudentLedger();
        } else {
            showToast(result.message || 'Submission failed.', 'error');
            submitSlipBtn.disabled = false;
            submitSlipBtn.textContent = 'Submit Payment Slip';
        }
    } catch (e) {
        showToast('Network error during submission.', 'error');
        submitSlipBtn.disabled = false;
        submitSlipBtn.textContent = 'Submit Payment Slip';
        console.error(e);
    }
});

function showSuccessModal(data) {
    const modal = document.getElementById('success-modal');
    
    document.getElementById('modal-receipt-id').textContent = data.submission_id;
    document.getElementById('modal-receipt-amount').textContent = `${data.amount} THB`;
    document.getElementById('modal-receipt-weeks').textContent = data.weeks.map(w => `Week ${w}`).join(', ');
    document.getElementById('modal-receipt-time').textContent = new Date().toLocaleString();

    modal.classList.add('active');

    // Close Modal Handler
    const closeBtn = document.getElementById('modal-close-btn');
    const dismissBtn = document.getElementById('modal-dismiss-btn');
    
    const closeModal = () => {
        modal.classList.remove('active');
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
