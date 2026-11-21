"use strict";

const loginTabBtn = document.getElementById("loginTabBtn");
const registerTabBtn = document.getElementById("registerTabBtn");
const loginPanel = document.getElementById("loginPanel");
const registerPanel = document.getElementById("registerPanel");

function getSafePostAuthRedirect(fallbackUrl) {
  const redirectParam = new URLSearchParams(window.location.search).get(
    "redirect",
  );
  if (!redirectParam) return fallbackUrl;
  try {
    const target = new URL(redirectParam, window.location.href);
    const isSameOrigin = target.origin === window.location.origin;
    const isAuthPage =
      /\/pages\/auth\.html$/i.test(target.pathname) ||
      /\/auth\.html$/i.test(target.pathname);
    return isSameOrigin && !isAuthPage ? target.href : fallbackUrl;
  } catch {
    return fallbackUrl;
  }
}

function clearLegacyAuthNotice() {
  try {
    // Dọn notice cũ từ các bản trước; bản hiện tại chuyển trang im lặng.
    sessionStorage.removeItem("koffiaAuthNotice");
  } catch {
    // Không ảnh hưởng luồng đăng nhập nếu sessionStorage không khả dụng.
  }
}

function switchAuthTab(tabName) {
  const isLogin = tabName === "login";
  loginTabBtn?.classList.toggle("authTabActive", isLogin);
  registerTabBtn?.classList.toggle("authTabActive", !isLogin);
  loginPanel?.classList.toggle("authPanelActive", isLogin);
  registerPanel?.classList.toggle("authPanelActive", !isLogin);
  const url = new URL(window.location.href);
  url.searchParams.set("mode", tabName);
  history.replaceState(null, "", url.toString());
}

(function initAuthPage() {
  const mode = new URLSearchParams(window.location.search).get("mode");
  switchAuthTab(mode === "register" ? "register" : "login");
  if (
    typeof customerService !== "undefined" &&
    customerService.getCurrentUser()
  ) {
    window.location.href = getSafePostAuthRedirect("../index.html");
    return;
  }
  clearLegacyAuthNotice();
})();

loginTabBtn?.addEventListener("click", () => switchAuthTab("login"));
registerTabBtn?.addEventListener("click", () => switchAuthTab("register"));
document
  .getElementById("switchToRegister")
  ?.addEventListener("click", () => switchAuthTab("register"));
document
  .getElementById("switchToLogin")
  ?.addEventListener("click", () => switchAuthTab("login"));

function togglePasswordVisibility(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (!input || !icon) return;
  const hidden = input.type === "password";
  input.type = hidden ? "text" : "password";
  icon.className = hidden ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
}

document.querySelectorAll("[data-togglePassword]").forEach((btn) => {
  btn.addEventListener("click", () =>
    togglePasswordVisibility(
      btn.dataset.togglepassword,
      btn.dataset.toggleicon,
    ),
  );
});

function showAuthToast(message, type = "success") {
  if (typeof showToast === "function") return showToast(message, type);
  console.log(message);
}

function toggleSubmitLoading(btn, isLoading, loadingLabel) {
  if (!btn) return;
  if (isLoading) {
    if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> ${loadingLabel}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
  }
}

const commonPasswords = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "password",
  "password1",
  "password123",
  "qwerty123",
  "qwertyuiop",
  "abc12345",
  "11111111",
  "00000000",
  "admin123",
  "letmein123",
  "welcome123",
  "iloveyou",
  "matkhau123",
  "koffia123",
]);

function hasObviousSequence(value) {
  const lower = value.toLowerCase();
  const sequences = [
    "123456",
    "abcdef",
    "qwerty",
    "111111",
    "000000",
    "987654",
  ];
  return sequences.some((sequence) => lower.includes(sequence));
}

function evaluatePassword(password) {
  return {
    length: password.length >= 8 && password.length <= 32,
    common:
      password.length > 0 &&
      !commonPasswords.has(password.toLowerCase()) &&
      !hasObviousSequence(password) &&
      !/^(.)\1{5,}$/i.test(password),
  };
}

function isPasswordStrong(password) {
  return Object.values(evaluatePassword(password)).every(Boolean);
}

function renderPasswordRequirements(password) {
  const box = document.getElementById("passwordRequirements");
  if (!box) return;
  box.classList.toggle("visible", password.length > 0);
  const result = evaluatePassword(password);
  box.querySelectorAll("[data-password-rule]").forEach((item) => {
    const passed = result[item.dataset.passwordRule];
    item.classList.toggle("rulePassed", passed);
    item.classList.toggle("ruleFailed", !passed && password.length > 0);
    const icon = item.querySelector("i");
    if (icon)
      icon.className = passed
        ? "fa-solid fa-circle-check"
        : "fa-solid fa-circle";
  });
}

const registerPasswordInput = document.getElementById("registerPassword");
registerPasswordInput?.addEventListener("input", () => {
  renderPasswordRequirements(registerPasswordInput.value);
  const errorEl = document.getElementById("registerPasswordError");
  if (errorEl && registerPasswordInput.value)
    clearFieldError(registerPasswordInput, errorEl);
});

/* ── Live email / username validation ─────────────────────── */
const registerIdentifierInput = document.getElementById("registerIdentifier");
let identifierValidationRun = 0;
let identifierValidationTimer = null;

function setValidationRuleState(item, state) {
  if (!item) return;
  item.classList.toggle("rulePassed", state === "passed");
  item.classList.toggle("ruleFailed", state === "failed");
  item.classList.toggle("rulePending", state === "pending");
  const icon = item.querySelector("i");
  if (!icon) return;
  if (state === "passed") icon.className = "fa-solid fa-circle-check";
  else if (state === "pending")
    icon.className = "fa-solid fa-circle-notch fa-spin";
  else icon.className = "fa-solid fa-circle-xmark";
}

function evaluateUsernameSyntax(username) {
  const value = customerService.normalizeUsername(username);
  return {
    length: value.length >= 4 && value.length <= 20,
    characters: /^[A-Za-z0-9._]+$/.test(value),
    edges: /^[A-Za-z0-9](?:[A-Za-z0-9._]*[A-Za-z0-9])?$/.test(value),
  };
}

async function renderIdentifierRequirements(rawValue) {
  const box = document.getElementById("identifierRequirements");
  const usernameGroup = document.getElementById("usernameRequirementGroup");
  const emailGroup = document.getElementById("emailRequirementGroup");
  if (!box || !usernameGroup || !emailGroup) return;

  const value = rawValue.trim();
  box.classList.toggle("visible", value.length > 0);
  if (!value) return;

  const runId = ++identifierValidationRun;
  const looksLikeEmail = value.includes("@");
  usernameGroup.hidden = looksLikeEmail;
  emailGroup.hidden = !looksLikeEmail;

  if (looksLikeEmail) {
    const normalizedEmail = customerService.normalizeIdentifier(value);
    const valid = EMAIL_PATTERN_SHARED.test(normalizedEmail);
    const validItem = emailGroup.querySelector('[data-email-rule="valid"]');
    const availableItem = emailGroup.querySelector(
      '[data-email-rule="available"]',
    );
    const autoItem = emailGroup.querySelector('[data-email-rule="auto"]');

    setValidationRuleState(validItem, valid ? "passed" : "failed");
    setValidationRuleState(autoItem, "passed");
    if (!valid) {
      setValidationRuleState(availableItem, "failed");
      return;
    }

    setValidationRuleState(availableItem, "pending");
    const taken = await customerService.isEmailTaken(normalizedEmail);
    if (runId !== identifierValidationRun) return;
    setValidationRuleState(availableItem, taken ? "failed" : "passed");
    return;
  }

  const syntax = evaluateUsernameSyntax(value);
  Object.entries(syntax).forEach(([rule, passed]) => {
    setValidationRuleState(
      usernameGroup.querySelector(`[data-username-rule="${rule}"]`),
      passed ? "passed" : "failed",
    );
  });

  const availableItem = usernameGroup.querySelector(
    '[data-username-rule="available"]',
  );
  if (!Object.values(syntax).every(Boolean)) {
    setValidationRuleState(availableItem, "failed");
    return;
  }

  setValidationRuleState(availableItem, "pending");
  const taken = await customerService.isUsernameTaken(value);
  if (runId !== identifierValidationRun) return;
  setValidationRuleState(availableItem, taken ? "failed" : "passed");
}

registerIdentifierInput?.addEventListener("input", () => {
  const errorEl = document.getElementById("registerIdentifierError");
  if (errorEl && registerIdentifierInput.value)
    clearFieldError(registerIdentifierInput, errorEl);
  clearTimeout(identifierValidationTimer);
  identifierValidationTimer = setTimeout(() => {
    renderIdentifierRequirements(registerIdentifierInput.value);
  }, 180);
});

async function handleLoginSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  clearAllFieldErrors(form);
  if (!form.checkValidity()) return form.reportValidity();

  const identifierInput = document.getElementById("loginIdentifier");
  const identifierError = document.getElementById("loginIdentifierError");
  const password = document.getElementById("loginPassword").value;
  const submitBtn = document.getElementById("loginSubmitBtn");
  toggleSubmitLoading(submitBtn, true, "Đang đăng nhập...");

  setTimeout(async () => {
    const account = await customerService.login(
      identifierInput.value.trim(),
      password,
    );
    if (!account) {
      toggleSubmitLoading(submitBtn, false);
      setFieldError(
        identifierInput,
        identifierError,
        "Email/Tên người dùng hoặc mật khẩu không đúng.",
      );
      showAuthToast(
        "Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.",
        "error",
      );
      return;
    }
    customerService.setCurrentUser(account);
    showAuthToast(
      `Đăng nhập thành công! Chào mừng ${account.firstName || account.username || "bạn"} trở lại.`,
    );
    setTimeout(() => {
      window.location.href = getSafePostAuthRedirect("../index.html");
    }, 900);
  }, 500);
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  clearAllFieldErrors(form);
  if (!form.checkValidity()) return form.reportValidity();

  const firstName = document.getElementById("registerFirstName").value.trim();
  const lastName = document.getElementById("registerLastName").value.trim();
  const identifierInput = document.getElementById("registerIdentifier");
  const identifierError = document.getElementById("registerIdentifierError");
  const identifier = identifierInput.value.trim();
  const passwordInput = document.getElementById("registerPassword");
  const passwordError = document.getElementById("registerPasswordError");
  const password = passwordInput.value;
  const confirmInput = document.getElementById("registerConfirmPassword");
  const confirmError = document.getElementById("registerConfirmPasswordError");
  const submitBtn = document.getElementById("registerSubmitBtn");
  const normalizedIdentifier = customerService.normalizeIdentifier(identifier);
  const isEmail = EMAIL_PATTERN_SHARED.test(normalizedIdentifier);

  if (!isEmail) {
    const usernameCheck = customerService.validateUsername(identifier);
    if (!usernameCheck.valid) {
      setFieldError(identifierInput, identifierError, usernameCheck.message);
      return;
    }
  }

  if (!isPasswordStrong(password)) {
    setFieldError(
      passwordInput,
      passwordError,
      "Hãy chọn mật khẩu dài 8–32 ký tự và không quá dễ đoán.",
    );
    renderPasswordRequirements(password);
    return;
  }

  if (password !== confirmInput.value) {
    setFieldError(confirmInput, confirmError, "Mật khẩu xác nhận không khớp.");
    return;
  }

  toggleSubmitLoading(submitBtn, true, "Đang tạo tài khoản...");
  setTimeout(async () => {
    const isTaken = isEmail
      ? await customerService.isEmailTaken(normalizedIdentifier)
      : await customerService.isUsernameTaken(identifier);

    if (isTaken) {
      toggleSubmitLoading(submitBtn, false);
      setFieldError(
        identifierInput,
        identifierError,
        isEmail
          ? "Email này đã được sử dụng."
          : "Tên người dùng này đã được sử dụng.",
      );
      showAuthToast(
        "Tài khoản đã tồn tại, vui lòng thử thông tin khác.",
        "error",
      );
      return;
    }

    const newCustomer = await customerService.register({
      firstName,
      lastName,
      identifier,
      password,
    });
    customerService.setCurrentUser(newCustomer);
    const generatedMessage = isEmail
      ? ` Tên người dùng của bạn là @${newCustomer.username}.`
      : "";
    showAuthToast(`Tạo tài khoản thành công!${generatedMessage}`);
    setTimeout(() => {
      window.location.href = getSafePostAuthRedirect("account.html");
    }, 1100);
  }, 600);
}

document
  .getElementById("loginForm")
  ?.addEventListener("submit", handleLoginSubmit);
document
  .getElementById("registerForm")
  ?.addEventListener("submit", handleRegisterSubmit);
