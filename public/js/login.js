// public/js/login.js

document.addEventListener('DOMContentLoaded', () => {
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

    // 1. Check existing sessions and auto-redirect
    checkExistingSession();

    // DOM Elements
    const form = document.getElementById('unified-login-form');
    const identityInput = document.getElementById('login-identity');
    const credentialInput = document.getElementById('login-credential');
    const submitBtn = document.getElementById('login-submit-btn');
    const loginAlert = document.getElementById('login-alert');
    const rememberMeCheckbox = document.getElementById('remember-me');

    // Toggle Password Visibility
    const togglePasswordBtn = document.getElementById('toggle-password-btn');
    const passwordToggleIcon = document.getElementById('password-toggle-icon');
    if (togglePasswordBtn && credentialInput && passwordToggleIcon) {
        togglePasswordBtn.addEventListener('click', () => {
            if (credentialInput.type === 'password') {
                credentialInput.type = 'text';
                passwordToggleIcon.className = 'far fa-eye-slash';
            } else {
                credentialInput.type = 'password';
                passwordToggleIcon.className = 'far fa-eye';
            }
        });
    }

    // Restore "Remember Me" credentials or temp values from sessionStorage
    if (identityInput && credentialInput) {
        const isRemembered = localStorage.getItem('remember_me_state') === 'true';
        if (isRemembered) {
            identityInput.value = localStorage.getItem('remembered_identity') || '';
            credentialInput.value = localStorage.getItem('remembered_credential') || '';
            if (rememberMeCheckbox) rememberMeCheckbox.checked = true;
        } else {
            identityInput.value = sessionStorage.getItem('temp_identity') || '';
            credentialInput.value = sessionStorage.getItem('temp_credential') || '';
        }
    }

    if (identityInput) {
        identityInput.addEventListener('input', () => {
            sessionStorage.setItem('temp_identity', identityInput.value);
        });
    }

    if (credentialInput) {
        credentialInput.addEventListener('input', () => {
            sessionStorage.setItem('temp_credential', credentialInput.value);
        });
    }

    // 3. Unified login form submission
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideAlert();

            const identity = identityInput.value.trim();
            const credential = credentialInput.value.trim();

            if (!identity || !credential) {
                showAlert('กรุณากรอกข้อมูลให้ครบถ้วนทุกช่อง');
                return;
            }

            const isEmail = identity.includes('@');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> กำลังตรวจสอบข้อมูล...';

            if (isEmail) {
                // --- Staff Login Flow ---
                try {
                    await signIn(identity, credential);
                    const profile = await checkAuthState(false);
                    if (profile) {
                        handleRememberMe(identity, credential);
                        window.location.href = 'admin.html';
                    } else {
                        showAlert('พบบัญชีในระบบหลัก แต่บัญชีของคุณยังไม่ได้ลงทะเบียนสิทธิ์ในระบบบัญชี COMED23');
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = 'เข้าสู่ระบบ';
                    }
                } catch (err) {
                    showAlert(err.message || 'อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือไม่มีสิทธิ์เข้าถึงระบบนี้');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = 'เข้าสู่ระบบ';
                }
            } else {
                // --- Student Login Flow ---
                try {
                    const url =
                        `${CONFIG.API_BASE_URL}/students.php?action=validate` +
                        `&student_id=${encodeURIComponent(identity)}` +
                        `&password=${encodeURIComponent(credential)}`;

                    console.log("Request URL:", url);

                    const response = await fetch(url, {
                        method: "GET",
                        headers: {
                            "Accept": "application/json"
                        }
                    });

                    console.log("Status:", response.status);
                    console.log("Content-Type:", response.headers.get("content-type"));

                    const raw = await response.text();
                    console.log("Raw Response:", raw);

                    let result;

                    try {
                        result = JSON.parse(raw);
                    } catch (e) {
                        console.error("API ไม่ได้ส่ง JSON");
                        console.error(raw);

                        showAlert(
                            "API ส่งข้อมูลไม่ถูกต้อง กรุณาตรวจสอบ Console (F12)"
                        );

                        submitBtn.disabled = false;
                        submitBtn.innerHTML = 'เข้าสู่ระบบ';
                        return;
                    }

                    if (result.status === "success") {
                        handleRememberMe(identity, credential);

                        localStorage.setItem(
                            "student_session",
                            JSON.stringify(result.data)
                        );

                        window.location.href = "student.html";
                    } else {
                        showAlert(result.message || "รหัสประจำตัวนักศึกษาหรือรหัสผ่านไม่ถูกต้อง");

                        submitBtn.disabled = false;
                        submitBtn.innerHTML = 'เข้าสู่ระบบ';
                    }
                } catch (err) {
                    showAlert('ระบบเครือข่ายขัดข้อง ไม่สามารถเชื่อมต่อระบบตรวจสอบสิทธิ์ได้');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = 'เข้าสู่ระบบ';
                    console.error(err);
                }
            }
        });
    }

    // Helper functions
    function handleRememberMe(identity, credential) {
        if (rememberMeCheckbox && rememberMeCheckbox.checked) {
            localStorage.setItem('remember_me_state', 'true');
            localStorage.setItem('remembered_identity', identity);
            if (!identity.includes('@')) {
                localStorage.setItem('remembered_credential', credential);
            } else {
                localStorage.removeItem('remembered_credential');
            }
        } else {
            localStorage.setItem('remember_me_state', 'false');
            localStorage.removeItem('remembered_identity');
            localStorage.removeItem('remembered_credential');
        }
        sessionStorage.removeItem('temp_identity');
        sessionStorage.removeItem('temp_credential');
    }

    function showAlert(msg) {
        if (loginAlert) {
            loginAlert.textContent = msg;
            loginAlert.style.display = 'block';
        }
    }

    function hideAlert() {
        if (loginAlert) {
            loginAlert.style.display = 'none';
        }
    }

    function checkExistingSession() {
        // Redirect active student session
        if (localStorage.getItem('student_session')) {
            window.location.href = 'student.html';
            return;
        }

        // Redirect active staff session
        const token = localStorage.getItem('sb_access_token');
        if (token) {
            window.location.href = 'admin.html';
        }
    }
});
