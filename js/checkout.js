"use strict";

/* ═══════════════════════════════════════════════════════════════
   KOFFIA CHECKOUT CONTROLLER
   - 3-Tier Vietnam Address Hierarchy (Province > District > Ward)
   - Interactive Map Picker (Leaflet + OSM with Google Maps API Support)
   - Order Review & Payment Processing (COD, VietQR, E-Wallet)
   ═══════════════════════════════════════════════════════════════ */

const checkoutState = {
  provinces: [],
  districtsCache: new Map(),
  wardsCache: new Map(),
  selectedProvince: null,
  selectedDistrict: null,
  selectedWard: null,
  selectedCoords: { lat: 21.0285, lng: 105.8542 }, // Hanoi default
  currentAddressComponents: null,
  appliedVoucher: null,
  leafletMap: null,
  leafletMarker: null,
  googleMap: null,
  googleMarker: null,
  isUsingGoogleMaps: false,
  saveAddrLabel: "Nhà riêng",
  deliverySchedule: {
    mode: "now",
    day: "today",
    dayLabel: "Hôm nay",
    slotLabel: "",
    fullLabel: "Giao ngay (15 – 20 phút)",
  },
};

// Built-in offline fallback data for major cities in Vietnam
const OFFLINE_FALLBACK_DIVISIONS = {
  // Hanoi (code 1)
  1: [
    { code: 1, name: "Quận Ba Đình", wards: ["Phường Phúc Xá", "Phường Trúc Bạch", "Phường Vĩnh Phúc", "Phường Cống Vị", "Phường Liễu Giai", "Phường Kim Mã", "Phường Giảng Võ", "Phường Thành Công"] },
    { code: 2, name: "Quận Hoàn Kiếm", wards: ["Phường Phúc Tân", "Phường Đồng Xuân", "Phường Hàng Mã", "Phường Hàng Buồm", "Phường Hàng Đào", "Phường Cửa Đông", "Phường Tràng Tiền", "Phường Lý Thái Tổ"] },
    { code: 3, name: "Quận Tây Hồ", wards: ["Phường Phú Thượng", "Phường Nhật Tân", "Phường Tứ Liên", "Phường Quảng An", "Phường Xuân La", "Phường Yên Phụ", "Phường Bưởi", "Phường Thụy Khuê"] },
    { code: 4, name: "Quận Cầu Giấy", wards: ["Phường Nghĩa Đô", "Phường Nghĩa Tân", "Phường Mai Dịch", "Phường Dịch Vọng", "Phường Dịch Vọng Hậu", "Phường Quan Hoa", "Phường Yên Hòa", "Phường Trung Hòa"] },
    { code: 5, name: "Quận Đống Đa", wards: ["Phường Cát Linh", "Phường Văn Miếu", "Phường Quốc Tử Giám", "Phường Láng Thượng", "Phường Ô Chợ Dừa", "Phường Nam Đồng", "Phường Khương Thượng"] },
    { code: 6, name: "Quận Hai Bà Trưng", wards: ["Phường Bạch Đằng", "Phường Bách Khoa", "Phường Minh Khai", "Phường Trương Định", "Phường Vĩnh Tuy", "Phường Đồng Tâm"] },
    { code: 7, name: "Quận Hoàng Mai", wards: ["Phường Hoàng Liệt", "Phường Yên Sở", "Phường Định Công", "Phường Đại Kim", "Phường Thịnh Liệt", "Phường Giáp Bát", "Phường Tân Mai"] },
    { code: 8, name: "Quận Thanh Xuân", wards: ["Phường Hạ Đình", "Phường Khương Đình", "Phường Khương Mai", "Phường Khương Trung", "Phường Kim Giang", "Phường Nhân Chính", "Phường Thanh Xuân Bắc"] },
  ],
  // HCMC (code 79)
  79: [
    { code: 760, name: "Quận 1", wards: ["Phường Bến Nghé", "Phường Bến Thành", "Phường Cầu Kho", "Phường Cầu Ông Lãnh", "Phường Cô Giang", "Phường Đa Kao", "Phường Tân Định"] },
    { code: 769, name: "Thành phố Thủ Đức", wards: ["Phường Thảo Điền", "Phường An Phú", "Phường Bình An", "Phường Hiệp Bình Chánh", "Phường Linh Trung", "Phường Linh Tây"] },
    { code: 770, name: "Quận 3", wards: ["Phường Võ Thị Sáu", "Phường 1", "Phường 2", "Phường 3", "Phường 4", "Phường 5", "Phường 9", "Phường 11", "Phường 14"] },
    { code: 771, name: "Quận 10", wards: ["Phường 1", "Phường 2", "Phường 4", "Phường 6", "Phường 9", "Phường 12", "Phường 14", "Phường 15"] },
    { code: 772, name: "Quận Bình Thạnh", wards: ["Phường 1", "Phường 2", "Phường 3", "Phường 14", "Phường 17", "Phường 19", "Phường 21", "Phường 25"] },
    { code: 773, name: "Quận Phú Nhuận", wards: ["Phường 1", "Phường 2", "Phường 3", "Phường 7", "Phường 8", "Phường 9", "Phường 15"] },
  ],
  // Da Nang (code 48)
  48: [
    { code: 490, name: "Quận Hải Châu", wards: ["Phường Hải Châu I", "Phường Hải Châu II", "Phường Thạch Thang", "Phường Thanh Bình", "Phường Thuận Phước", "Phường Hòa Cường Bắc", "Phường Hòa Cường Nam"] },
    { code: 491, name: "Quận Thanh Khê", wards: ["Phường Tam Thuận", "Phường Thanh Khê Tây", "Phường Thanh Khê Đông", "Phường Xuân Hà", "Phường Tân Chính", "Phường Chính Gián"] },
    { code: 492, name: "Quận Sơn Trà", wards: ["Phường An Hải Bắc", "Phường An Hải Tây", "Phường Phước Mỹ", "Phường Thọ Quang", "Phường Mân Thái"] },
  ],
  // Thanh Hoa (code 38)
  38: [
    { code: 380, name: "Thành phố Thanh Hóa", wards: ["Phường Ba Đình", "Phường Điện Biên", "Phường Lam Sơn", "Phường Ngọc Trạo", "Phường Đông Thọ", "Phường Tân Sơn", "Phường Quảng Hưng"] },
    { code: 381, name: "Thị xã Bỉm Sơn", wards: ["Phường Ba Đình", "Phường Bắc Sơn", "Phường Đông Sơn", "Phường Lam Sơn", "Phường Ngọc Trạo", "Phường Phú Sơn"] },
    { code: 382, name: "Thành phố Sầm Sơn", wards: ["Phường Bắc Sơn", "Phường Trung Sơn", "Phường Trường Sơn", "Phường Quảng Cư", "Phường Quảng Tiến"] },
  ],
};

/* ────────────────────────────────────────────────────────────
   1. INITIALIZE CHECKOUT PAGE
   ──────────────────────────────────────────────────────────── */
async function initCheckoutPage() {
  // Kiểm tra đăng nhập
  const currentUser = typeof customerService !== "undefined" ? customerService.getCurrentUser() : null;
  if (!currentUser) {
    if (typeof requireAuthenticatedUser === "function") {
      requireAuthenticatedUser("thanh toán đơn hàng");
      return;
    }
  }

  // Nạp giỏ hàng của người dùng hiện tại
  if (typeof cartState !== "undefined") {
    cartState.loadForCurrentUser();
    if (!cartState.items.length) {
      if (typeof showToast === "function") {
        showToast("Giỏ hàng đang trống. Vui lòng chọn món trước.", "info");
      }
      setTimeout(() => {
        window.location.href = "cart.html";
      }, 1000);
      return;
    }
  }

  prefillCustomerInfo(currentUser);
  renderCheckoutOrderReview();
  wireCheckoutVoucherControls();
  await loadProvinces();
  wireAddressDropdowns();
  await initSavedAddressesBar();
  wireSaveAddressToggle();
  wireDeliverySchedule();
  wirePaymentMethods();
  wireCheckoutFormSubmit();
  wireMapPickerModal();
}

/* ────────────────────────────────────────────────────────────
   2. CUSTOMER INFO PREFILL
   ──────────────────────────────────────────────────────────── */
function prefillCustomerInfo(user) {
  if (!user) return;
  const nameInput = document.getElementById("checkoutName");
  const phoneInput = document.getElementById("checkoutPhone");
  const emailInput = document.getElementById("checkoutEmail");

  if (nameInput && !nameInput.value) {
    nameInput.value = `${user.lastName || ""} ${user.firstName || ""}`.trim() || user.username || "";
  }
  if (phoneInput && !phoneInput.value && user.phone) {
    phoneInput.value = user.phone;
  }
  if (emailInput && !emailInput.value && user.email) {
    emailInput.value = user.email;
  }
}

/* ────────────────────────────────────────────────────────────
   3. ORDER REVIEW RENDERER
   ──────────────────────────────────────────────────────────── */
function renderCheckoutOrderReview() {
  const listEl = document.getElementById("checkoutItemsList");
  const countEl = document.getElementById("reviewItemCount");
  const subtotalEl = document.getElementById("reviewSubtotal");
  const flashRow = document.getElementById("reviewFlashRow");
  const flashEl = document.getElementById("reviewFlashDiscount");
  const voucherRow = document.getElementById("reviewVoucherRow");
  const voucherLabel = document.getElementById("reviewVoucherLabel");
  const voucherEl = document.getElementById("reviewVoucherDiscount");
  const shippingEl = document.getElementById("reviewShippingFee");
  const totalEl = document.getElementById("reviewTotal");

  if (!listEl || typeof cartState === "undefined") return;

  const items = cartState.items;
  const subtotal = cartState.getTotal();
  const totalQty = cartState.getTotalQty();

  if (countEl) countEl.textContent = `${totalQty} món`;
  if (subtotalEl) subtotalEl.textContent = formatPrice(subtotal);

  // Lấy voucher đã lưu trong session/local nếu có
  let voucherDiscount = 0;
  let isFreeShip = false;
  let appliedVoucher = null;

  try {
    const savedVoucherRaw = sessionStorage.getItem("koffia_applied_voucher");
    if (savedVoucherRaw) {
      appliedVoucher = JSON.parse(savedVoucherRaw);
    }
  } catch (e) {}

  if (appliedVoucher && subtotal < (Number(appliedVoucher.minOrderValue) || 0)) {
    appliedVoucher = null;
    sessionStorage.removeItem("koffia_applied_voucher");
  }
  checkoutState.appliedVoucher = appliedVoucher;

  const appliedTagEl = document.getElementById("checkoutAppliedVoucherTag");
  const appliedLabelEl = document.getElementById("checkoutAppliedVoucherLabel");

  if (appliedVoucher) {
    if (typeof voucherService !== "undefined" && typeof voucherService.computeDiscount === "function") {
      const res = voucherService.computeDiscount(appliedVoucher, items, subtotal);
      voucherDiscount = res.discount;
      isFreeShip = res.isFreeShip;
    } else {
      if (appliedVoucher.type === "percent") {
        voucherDiscount = Math.round((subtotal * appliedVoucher.value) / 100);
        if (appliedVoucher.maxDiscount) voucherDiscount = Math.min(voucherDiscount, appliedVoucher.maxDiscount);
      } else if (appliedVoucher.type === "fixed") {
        voucherDiscount = Math.min(appliedVoucher.value, subtotal);
      } else if (appliedVoucher.type === "freeShip") {
        isFreeShip = true;
      }
    }

    if (appliedTagEl) appliedTagEl.style.display = "flex";
    if (appliedLabelEl) {
      appliedLabelEl.textContent = `Đang áp dụng: ${appliedVoucher.code} (${appliedVoucher.name})`;
    }

    if (voucherRow && voucherEl) {
      voucherRow.style.display = "flex";
      if (voucherLabel) voucherLabel.textContent = `🎟️ Voucher (${appliedVoucher.code})`;
      voucherEl.textContent =
        isFreeShip && voucherDiscount === 0 ? "Miễn phí ship" : `-${formatPrice(voucherDiscount)}`;
    }
  } else {
    if (appliedTagEl) appliedTagEl.style.display = "none";
    if (voucherRow) voucherRow.style.display = "none";
  }

  // Shipping Fee (Freeship đơn từ 50.000đ hoặc dùng freeShip voucher)
  const freeshipThreshold =
    typeof KOFFIA_FREESHIP_THRESHOLD !== "undefined"
      ? KOFFIA_FREESHIP_THRESHOLD
      : 50000;
  const BASE_SHIPPING =
    typeof KOFFIA_BASE_SHIPPING_FEE !== "undefined"
      ? KOFFIA_BASE_SHIPPING_FEE
      : 15000;
  const shippingFee = subtotal >= freeshipThreshold || isFreeShip ? 0 : BASE_SHIPPING;
  if (shippingEl) {
    shippingEl.textContent = shippingFee === 0 ? "Miễn phí" : formatPrice(shippingFee);
  }

  const finalTotal = Math.max(0, subtotal - voucherDiscount + shippingFee);
  if (totalEl) totalEl.textContent = formatPrice(finalTotal);

  const earnedPtsEl = document.getElementById("reviewEarnedPoints");
  if (earnedPtsEl) {
    const pts = Math.floor(finalTotal / 10000);
    earnedPtsEl.textContent = `+${pts} điểm`;
  }
  const reviewScheduleEl = document.getElementById("reviewScheduleText");
  if (reviewScheduleEl) {
    reviewScheduleEl.textContent =
      checkoutState.deliverySchedule?.mode === "scheduled"
        ? checkoutState.deliverySchedule.fullLabel
        : "Giao ngay (15–20p)";
  }

  // Render Compact Item List
  listEl.innerHTML = items
    .map((item) => {
      const lineTotal = item.price * item.qty;
      const meta = [];
      if (item.size) meta.push(`Size ${item.size}`);
      if (item.ice) meta.push(item.ice);
      if (item.sugar) meta.push(item.sugar);
      if (item.toppings && item.toppings.length) meta.push(item.toppings.join(", "));

      return `
      <div class="orderReviewItem">
        <img class="orderReviewImg" src="${item.img || (typeof defaultProductImageDataUri !== 'undefined' ? defaultProductImageDataUri : '')}" alt="${escapeHtml(item.name)}" />
        <div class="orderReviewInfo">
          <h4>${escapeHtml(item.name)}</h4>
          <div class="orderReviewMeta">${meta.length ? meta.join(" • ") + " • " : ""}Số lượng: <strong>x${item.qty}</strong></div>
          ${item.note ? `<div class="orderReviewNote"><i class="fa-regular fa-note-sticky" aria-hidden="true"></i> ${escapeHtml(item.note)}</div>` : ""}
        </div>
        <div class="orderReviewPrice">${formatPrice(lineTotal)}</div>
      </div>
    `;
    })
    .join("");
}

/* ────────────────────────────────────────────────────────────
   3B. VOUCHER CONTROLS TRỰC TIẾP TRÊN TRANG THANH TOÁN
   ──────────────────────────────────────────────────────────── */
function wireCheckoutVoucherControls() {
  const applyBtn = document.getElementById("checkoutApplyVoucherBtn");
  const input = document.getElementById("checkoutVoucherInput");
  const removeBtn = document.getElementById("checkoutRemoveVoucherBtn");
  const openModalBtn = document.getElementById("checkoutOpenVoucherPickerBtn");
  const modal = document.getElementById("checkoutVoucherModal");
  const overlay = document.getElementById("checkoutVoucherOverlay");
  const closeModalBtn = document.getElementById("closeCheckoutVoucherModalBtn");
  const modalList = document.getElementById("checkoutVoucherModalList");

  if (!applyBtn && !openModalBtn) return;
  if (applyBtn?.dataset.wired === "1") return;
  if (applyBtn) applyBtn.dataset.wired = "1";

  async function applyCheckoutVoucher(code) {
    if (!code) {
      if (typeof showToast === "function") showToast("Vui lòng nhập mã voucher.", "error");
      return;
    }
    if (typeof voucherService === "undefined") return;
    const user =
      typeof customerService !== "undefined" ? customerService.getCurrentUser() : null;
    const subtotal = cartState.getTotal();
    const validation = await voucherService.validateVoucher(
      code,
      cartState.items,
      subtotal,
      user,
    );

    if (!validation.valid) {
      if (typeof showToast === "function") showToast(validation.message, "error");
      return;
    }

    checkoutState.appliedVoucher = validation.voucher;
    sessionStorage.setItem("koffia_applied_voucher", JSON.stringify(validation.voucher));
    if (typeof showToast === "function") showToast(validation.message);
    if (input) input.value = "";
    if (modal) modal.style.display = "none";
    renderCheckoutOrderReview();
  }

  applyBtn?.addEventListener("click", () => {
    applyCheckoutVoucher(input?.value?.trim());
  });

  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyCheckoutVoucher(input.value.trim());
    }
  });

  removeBtn?.addEventListener("click", () => {
    checkoutState.appliedVoucher = null;
    sessionStorage.removeItem("koffia_applied_voucher");
    if (typeof showToast === "function") showToast("Đã hủy áp dụng voucher.");
    renderCheckoutOrderReview();
  });

  openModalBtn?.addEventListener("click", async () => {
    if (!modal || !modalList || typeof voucherService === "undefined") return;
    modalList.innerHTML =
      '<div style="text-align:center;padding:20px;">Đang kiểm tra voucher phù hợp...</div>';
    modal.style.display = "flex";

    const user =
      typeof customerService !== "undefined" ? customerService.getCurrentUser() : null;
    const subtotal = cartState.getTotal();
    const evaluated =
      typeof voucherService.evaluateForCart === "function"
        ? await voucherService.evaluateForCart(cartState.items, subtotal, user)
        : (await voucherService.getPublicVouchers()).map((v) => ({
            voucher: v,
            valid: true,
            discount: 0,
            isFreeShip: v.type === "freeShip",
            savingsValue: 0,
            reason: "",
          }));

    if (!evaluated.length) {
      modalList.innerHTML =
        '<div style="text-align:center;padding:20px;">Hiện chưa có voucher khả dụng.</div>';
      return;
    }

    const eligible = evaluated.filter((item) => item.valid);
    const ineligible = evaluated.filter((item) => !item.valid);
    const activeCode = (checkoutState.appliedVoucher?.code || "").toUpperCase();

    const renderRow = (entry) => {
      const v = entry.voucher;
      const isApplied = activeCode && activeCode === String(v.code || "").toUpperCase();
      const savingsText = entry.valid
        ? entry.isFreeShip && entry.discount === 0
          ? "Miễn phí giao hàng (tiết kiệm 15.000 ₫)"
          : `Tiết kiệm ngay -${formatPrice(entry.discount)}`
        : "";
      return `
        <div class="modalVoucherItem${entry.valid ? "" : " isIneligible"}${isApplied ? " isApplied" : ""}">
          <div class="modalVoucherBody">
            <div class="modalVoucherTopRow">
              <span class="modalVoucherCode">${escapeHtml(v.code)}</span>
              ${v.isRewardVoucher ? '<span class="voucherRewardTag">Rewards</span>' : ""}
              ${isApplied ? '<span class="modalVoucherActiveBadge">Đang chọn</span>' : ""}
            </div>
            <strong>${escapeHtml(v.name)}</strong>
            <div class="modalVoucherDesc">${escapeHtml(v.description || "")}${v.minOrderValue ? ` · Đơn từ ${formatPrice(v.minOrderValue)}` : ""}</div>
            ${
              entry.valid
                ? `<div class="modalVoucherSavings"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> ${escapeHtml(savingsText)}</div>`
                : `<div class="modalVoucherReason"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${escapeHtml(entry.reason || "Chưa đủ điều kiện")}</div>`
            }
          </div>
          <button
            type="button"
            class="${entry.valid ? (isApplied ? "btnSecondary" : "btnPrimary") : "btnSecondary"} modalVoucherApplyBtn"
            ${entry.valid && !isApplied ? `data-checkout-modal-apply="${escapeHtml(v.code)}"` : "disabled"}
          >
            ${isApplied ? "Đang dùng" : entry.valid ? "Áp dụng" : "Chưa đủ ĐK"}
          </button>
        </div>
      `;
    };

    let html = "";
    if (eligible.length) {
      html += `<div class="modalVoucherSectionLabel">Khả dụng cho đơn này (${eligible.length})</div>`;
      html += eligible.map(renderRow).join("");
    } else {
      html +=
        '<div class="modalVoucherEmptyHint">Chưa có voucher nào đủ điều kiện cho đơn hiện tại.</div>';
    }
    if (ineligible.length) {
      html += `<div class="modalVoucherSectionLabel isMuted">Chưa đủ điều kiện (${ineligible.length})</div>`;
      html += ineligible.map(renderRow).join("");
    }

    modalList.innerHTML = html;

    modalList.querySelectorAll("[data-checkout-modal-apply]").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyCheckoutVoucher(btn.dataset.checkoutModalApply);
      });
    });
  });

  const closeModal = () => {
    if (modal) modal.style.display = "none";
  };
  closeModalBtn?.addEventListener("click", closeModal);
  overlay?.addEventListener("click", closeModal);
}

/* ────────────────────────────────────────────────────────────
   4. VIETNAM ADMINISTRATIVE DIVISIONS (API + FALLBACK)
   ──────────────────────────────────────────────────────────── */
async function loadProvinces() {
  const provinceSelect = document.getElementById("checkoutProvince");
  if (!provinceSelect) return;

  try {
    // Ưu tiên nạp từ cache cục bộ json/vietnamProvinces.json
    let res = await fetch("../json/vietnamProvinces.json");
    if (!res.ok) {
      // Fallback API trực tiếp
      res = await fetch("https://provinces.open-api.vn/api/v1/?depth=1");
    }
    const provinces = await res.json();
    checkoutState.provinces = provinces;

    provinceSelect.innerHTML = '<option value="">-- Chọn Tỉnh / Thành phố --</option>';
    provinces.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.code;
      opt.dataset.name = p.name;
      opt.textContent = p.name;
      provinceSelect.appendChild(opt);
    });
  } catch (err) {
    console.warn("Không tải được danh sách tỉnh từ API, kích hoạt fallback nội bộ:", err);
    // Danh sách 63 tỉnh thành fallback cơ bản
    const basicProvinces = [
      { code: 1, name: "Thành phố Hà Nội" },
      { code: 79, name: "Thành phố Hồ Chí Minh" },
      { code: 48, name: "Thành phố Đà Nẵng" },
      { code: 31, name: "Thành phố Hải Phòng" },
      { code: 92, name: "Thành phố Cần Thơ" },
      { code: 38, name: "Tỉnh Thanh Hóa" },
      { code: 40, name: "Tỉnh Nghệ An" },
      { code: 46, name: "Tỉnh Thừa Thiên Huế" },
      { code: 22, name: "Tỉnh Quảng Ninh" },
      { code: 74, name: "Tỉnh Bình Dương" },
      { code: 75, name: "Tỉnh Đồng Nai" },
      { code: 77, name: "Tỉnh Bà Rịa - Vũng Tàu" },
      { code: 56, name: "Tỉnh Khánh Hòa" },
      { code: 68, name: "Tỉnh Lâm Đồng" },
    ];
    checkoutState.provinces = basicProvinces;
    provinceSelect.innerHTML = '<option value="">-- Chọn Tỉnh / Thành phố --</option>';
    basicProvinces.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.code;
      opt.dataset.name = p.name;
      opt.textContent = p.name;
      provinceSelect.appendChild(opt);
    });
  }
}

async function loadDistricts(provinceCode) {
  const districtSelect = document.getElementById("checkoutDistrict");
  const wardSelect = document.getElementById("checkoutWard");
  if (!districtSelect) return;

  districtSelect.innerHTML = '<option value="">Đang tải Quận / Huyện...</option>';
  districtSelect.disabled = true;
  if (wardSelect) {
    wardSelect.innerHTML = '<option value="">-- Chọn Phường / Xã --</option>';
    wardSelect.disabled = true;
  }

  if (checkoutState.districtsCache.has(provinceCode)) {
    renderDistricts(checkoutState.districtsCache.get(provinceCode));
    return;
  }

  try {
    const res = await fetch(`https://provinces.open-api.vn/api/v1/p/${provinceCode}?depth=2`);
    if (!res.ok) throw new Error("HTTP error " + res.status);
    const data = await res.json();
    const districts = data.districts || [];
    checkoutState.districtsCache.set(provinceCode, districts);
    renderDistricts(districts);
  } catch (err) {
    console.warn("Lỗi fetch quận huyện, dùng fallback offline:", err);
    const fallback = OFFLINE_FALLBACK_DIVISIONS[provinceCode] || [
      { code: Number(provinceCode) * 10 + 1, name: "Quận / Huyện Trung Tâm", wards: ["Phường / Xã 1", "Phường / Xã 2", "Phường / Xã 3"] },
      { code: Number(provinceCode) * 10 + 2, name: "Quận / Huyện Ngoại Thành", wards: ["Phường / Xã A", "Phường / Xã B"] },
    ];
    checkoutState.districtsCache.set(provinceCode, fallback);
    renderDistricts(fallback);
  }
}

function renderDistricts(districts) {
  const districtSelect = document.getElementById("checkoutDistrict");
  if (!districtSelect) return;

  districtSelect.innerHTML = '<option value="">-- Chọn Quận / Huyện --</option>';
  districts.forEach((d) => {
    const opt = document.createElement("option");
    opt.value = d.code;
    opt.dataset.name = d.name;
    opt.textContent = d.name;
    districtSelect.appendChild(opt);
  });
  districtSelect.disabled = false;
}

async function loadWards(districtCode) {
  const wardSelect = document.getElementById("checkoutWard");
  if (!wardSelect) return;

  wardSelect.innerHTML = '<option value="">Đang tải Phường / Xã...</option>';
  wardSelect.disabled = true;

  if (checkoutState.wardsCache.has(districtCode)) {
    renderWards(checkoutState.wardsCache.get(districtCode));
    return;
  }

  try {
    const res = await fetch(`https://provinces.open-api.vn/api/v1/d/${districtCode}?depth=2`);
    if (!res.ok) throw new Error("HTTP error " + res.status);
    const data = await res.json();
    const wards = data.wards || [];
    checkoutState.wardsCache.set(districtCode, wards);
    renderWards(wards);
  } catch (err) {
    console.warn("Lỗi fetch phường xã, dùng fallback offline:", err);
    let fallbackWards = [];
    // Tìm trong cache district
    for (const [_, distList] of checkoutState.districtsCache.entries()) {
      const match = distList.find((d) => String(d.code) === String(districtCode));
      if (match && match.wards) {
        fallbackWards = match.wards.map((w, idx) => (typeof w === "string" ? { code: idx + 1, name: w } : w));
        break;
      }
    }
    if (!fallbackWards.length) {
      fallbackWards = [
        { code: 1, name: "Phường Trung Tâm" },
        { code: 2, name: "Phường 1" },
        { code: 3, name: "Phường 2" },
      ];
    }
    checkoutState.wardsCache.set(districtCode, fallbackWards);
    renderWards(fallbackWards);
  }
}

function renderWards(wards) {
  const wardSelect = document.getElementById("checkoutWard");
  if (!wardSelect) return;

  wardSelect.innerHTML = '<option value="">-- Chọn Phường / Xã --</option>';
  wards.forEach((w) => {
    const opt = document.createElement("option");
    opt.value = w.code;
    opt.dataset.name = w.name;
    opt.textContent = w.name;
    wardSelect.appendChild(opt);
  });
  wardSelect.disabled = false;
}

function wireAddressDropdowns() {
  const provinceSelect = document.getElementById("checkoutProvince");
  const districtSelect = document.getElementById("checkoutDistrict");
  const wardSelect = document.getElementById("checkoutWard");
  const streetInput = document.getElementById("checkoutStreet");

  provinceSelect?.addEventListener("change", async () => {
    const selectedOpt = provinceSelect.selectedOptions[0];
    checkoutState.selectedProvince = selectedOpt && selectedOpt.value ? { code: selectedOpt.value, name: selectedOpt.dataset.name } : null;
    checkoutState.selectedDistrict = null;
    checkoutState.selectedWard = null;

    if (checkoutState.selectedProvince) {
      await loadDistricts(checkoutState.selectedProvince.code);
    } else {
      districtSelect.innerHTML = '<option value="">-- Chọn Quận / Huyện --</option>';
      districtSelect.disabled = true;
      wardSelect.innerHTML = '<option value="">-- Chọn Phường / Xã --</option>';
      wardSelect.disabled = true;
    }
    updateFullAddressPreview();
  });

  districtSelect?.addEventListener("change", async () => {
    const selectedOpt = districtSelect.selectedOptions[0];
    checkoutState.selectedDistrict = selectedOpt && selectedOpt.value ? { code: selectedOpt.value, name: selectedOpt.dataset.name } : null;
    checkoutState.selectedWard = null;

    if (checkoutState.selectedDistrict) {
      await loadWards(checkoutState.selectedDistrict.code);
    } else {
      wardSelect.innerHTML = '<option value="">-- Chọn Phường / Xã --</option>';
      wardSelect.disabled = true;
    }
    updateFullAddressPreview();
  });

  wardSelect?.addEventListener("change", () => {
    const selectedOpt = wardSelect.selectedOptions[0];
    checkoutState.selectedWard = selectedOpt && selectedOpt.value ? { code: selectedOpt.value, name: selectedOpt.dataset.name } : null;
    updateFullAddressPreview();
  });

  streetInput?.addEventListener("input", () => {
    updateFullAddressPreview();
  });
}

function updateFullAddressPreview() {
  const previewBox = document.getElementById("fullAddressPreview");
  const previewText = document.getElementById("fullAddressText");
  const street = document.getElementById("checkoutStreet")?.value?.trim() || "";

  const parts = [];
  if (street) parts.push(street);
  if (checkoutState.selectedWard) parts.push(checkoutState.selectedWard.name);
  if (checkoutState.selectedDistrict) parts.push(checkoutState.selectedDistrict.name);
  if (checkoutState.selectedProvince) parts.push(checkoutState.selectedProvince.name);
  parts.push("Việt Nam");

  if (parts.length > 1 && street) {
    if (previewText) previewText.innerHTML = `<strong>Địa chỉ giao:</strong> ${escapeHtml(parts.join(", "))}`;
    if (previewBox) {
      previewBox.classList.add("isValid");
      previewBox.classList.remove("isIncomplete");
      previewBox.style.background = "";
      previewBox.style.borderColor = "";
      previewBox.style.color = "";
    }
  } else {
    if (previewText) previewText.textContent = "Chưa hoàn tất địa chỉ. Vui lòng chọn Tỉnh, Quận, Phường và điền Số nhà / Đường.";
    if (previewBox) {
      previewBox.classList.add("isIncomplete");
      previewBox.classList.remove("isValid");
      previewBox.style.background = "";
      previewBox.style.borderColor = "";
      previewBox.style.color = "";
    }
  }
}

/* ────────────────────────────────────────────────────────────
   4B. SAVED ADDRESSES (1-TAP FILL) & DELIVERY SCHEDULING
   ──────────────────────────────────────────────────────────── */
async function applySavedAddressToCheckout(addr, notify = true) {
  if (!addr) return;
  const nameInput = document.getElementById("checkoutName");
  const phoneInput = document.getElementById("checkoutPhone");
  const provinceSelect = document.getElementById("checkoutProvince");
  const districtSelect = document.getElementById("checkoutDistrict");
  const wardSelect = document.getElementById("checkoutWard");
  const streetInput = document.getElementById("checkoutStreet");

  if (nameInput && addr.recipientName) nameInput.value = addr.recipientName;
  if (phoneInput && addr.phone) phoneInput.value = addr.phone;

  // 1. Chọn Tỉnh / Thành phố
  if (provinceSelect) {
    let provOpt = [...provinceSelect.options].find(
      (o) =>
        (addr.provinceCode && String(o.value) === String(addr.provinceCode)) ||
        (addr.provinceName &&
          o.textContent.trim().toLowerCase() === addr.provinceName.trim().toLowerCase()),
    );
    if (provOpt) {
      provinceSelect.value = provOpt.value;
      checkoutState.selectedProvince = {
        code: provOpt.value,
        name: provOpt.dataset.name || provOpt.textContent,
      };
      await loadDistricts(provOpt.value);

      // 2. Chọn Quận / Huyện
      if (districtSelect) {
        const distOpt = [...districtSelect.options].find(
          (o) =>
            (addr.districtCode && String(o.value) === String(addr.districtCode)) ||
            (addr.districtName &&
              o.textContent.trim().toLowerCase() === addr.districtName.trim().toLowerCase()),
        );
        if (distOpt) {
          districtSelect.value = distOpt.value;
          checkoutState.selectedDistrict = {
            code: distOpt.value,
            name: distOpt.dataset.name || distOpt.textContent,
          };
          await loadWards(distOpt.value);

          // 3. Chọn Phường / Xã
          if (wardSelect) {
            const wardOpt = [...wardSelect.options].find(
              (o) =>
                (addr.wardCode && String(o.value) === String(addr.wardCode)) ||
                (addr.wardName &&
                  o.textContent.trim().toLowerCase() === addr.wardName.trim().toLowerCase()),
            );
            if (wardOpt) {
              wardSelect.value = wardOpt.value;
              checkoutState.selectedWard = {
                code: wardOpt.value,
                name: wardOpt.dataset.name || wardOpt.textContent,
              };
            }
          }
        }
      }
    }
  }

  if (streetInput && addr.street) {
    streetInput.value = addr.street;
  }

  document.querySelectorAll("[data-saved-addr-id]").forEach((btn) => {
    btn.classList.toggle("isSelected", btn.dataset.savedAddrId === addr.id);
  });

  updateFullAddressPreview();
  if (notify && typeof showToast === "function") {
    showToast(`Đã điền nhanh địa chỉ "${addr.label}"!`, "success", 2200);
  }
}

async function initSavedAddressesBar() {
  const chipsEl = document.getElementById("checkoutSavedAddrChips");
  if (!chipsEl || typeof addressBookService === "undefined") return;

  const list = addressBookService.getList();
  if (!list.length) {
    chipsEl.innerHTML =
      '<div class="checkoutSavedAddrEmpty">Chưa có địa chỉ nào được lưu. Bạn có thể tích "Lưu địa chỉ" ở bên dưới để đặt 1 chạm cho các lần sau.</div>';
    return;
  }

  const labelIcons = {
    "Nhà riêng": "fa-house",
    "Công ty": "fa-briefcase",
    "Trường học": "fa-graduation-cap",
  };

  chipsEl.innerHTML = list
    .map((addr) => {
      const icon = labelIcons[addr.label] || "fa-location-dot";
      return `
        <button type="button" class="checkoutSavedAddrChip${addr.isDefault ? " isSelected" : ""}" data-saved-addr-id="${escapeHtml(addr.id)}" role="listitem">
          <span class="savedChipTop">
            <i class="fa-solid ${icon}" aria-hidden="true"></i>
            <strong>${escapeHtml(addr.label)}</strong>
            ${addr.isDefault ? '<span class="savedChipBadge">Mặc định</span>' : ""}
          </span>
          <span class="savedChipSub">${escapeHtml(addressBookService.formatFullAddress(addr))}</span>
        </button>
      `;
    })
    .join("");

  chipsEl.querySelectorAll("[data-saved-addr-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const target = list.find((a) => a.id === btn.dataset.savedAddrId);
      if (target) await applySavedAddressToCheckout(target, true);
    });
  });

  // Tự động điền địa chỉ mặc định nếu ô địa chỉ đang trống
  const streetInput = document.getElementById("checkoutStreet");
  const defaultAddr = addressBookService.getDefault();
  if (defaultAddr && streetInput && !streetInput.value.trim()) {
    await applySavedAddressToCheckout(defaultAddr, false);
  }
}

function wireSaveAddressToggle() {
  const checkbox = document.getElementById("checkoutSaveToBook");
  const labelsWrap = document.getElementById("checkoutSaveAddrLabels");
  if (!checkbox || !labelsWrap) return;

  checkbox.addEventListener("change", () => {
    labelsWrap.hidden = !checkbox.checked;
  });

  labelsWrap.querySelectorAll("[data-save-addr-label]").forEach((btn) => {
    btn.addEventListener("click", () => {
      checkoutState.saveAddrLabel = btn.dataset.saveAddrLabel || "Nhà riêng";
      labelsWrap.querySelectorAll("[data-save-addr-label]").forEach((b) => {
        b.classList.toggle("isSelected", b === btn);
      });
    });
  });
}

function buildDeliverySlotsForDay(day) {
  if (day === "tomorrow") {
    return [
      "08:00 – 08:30",
      "09:00 – 09:30",
      "10:30 – 11:00",
      "12:00 – 12:30",
      "14:00 – 14:30",
      "15:30 – 16:00",
      "17:00 – 17:30",
      "19:00 – 19:30",
    ];
  }
  const now = new Date();
  const curMin = now.getHours() * 60 + now.getMinutes();
  // Làm tròn lên bội số 30 phút + tối thiểu 30 phút chuẩn bị
  let startMin = Math.ceil((curMin + 35) / 30) * 30;
  startMin = Math.max(startMin, 8 * 60);
  const slots = [];
  const fmt = (m) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  while (startMin + 30 <= 22 * 60 && slots.length < 8) {
    slots.push(`${fmt(startMin)} – ${fmt(startMin + 30)}`);
    startMin += 30;
  }
  return slots;
}

function wireDeliverySchedule() {
  const card = document.getElementById("checkoutScheduleCard");
  const pickerPanel = document.getElementById("schedulePickerPanel");
  const slotsGrid = document.getElementById("scheduleSlotsGrid");
  if (!card || !pickerPanel || !slotsGrid) return;

  const modeBtns = [...card.querySelectorAll("[data-schedule-mode]")];
  const dayBtns = [...card.querySelectorAll("[data-schedule-day]")];

  function updateSummaryText() {
    const reviewEl = document.getElementById("reviewScheduleText");
    if (!reviewEl) return;
    reviewEl.textContent =
      checkoutState.deliverySchedule.mode === "scheduled"
        ? checkoutState.deliverySchedule.fullLabel
        : "Giao ngay (15–20p)";
  }

  function renderSlots(day) {
    let slots = buildDeliverySlotsForDay(day);
    let actualDay = day;
    if (!slots.length && day === "today") {
      actualDay = "tomorrow";
      slots = buildDeliverySlotsForDay("tomorrow");
    }
    const dayLabel = actualDay === "tomorrow" ? "Ngày mai" : "Hôm nay";
    checkoutState.deliverySchedule.day = actualDay;
    checkoutState.deliverySchedule.dayLabel = dayLabel;

    dayBtns.forEach((b) => {
      b.classList.toggle("isSelected", b.dataset.scheduleDay === actualDay);
    });

    if (!slots.includes(checkoutState.deliverySchedule.slotLabel)) {
      checkoutState.deliverySchedule.slotLabel = slots[0] || "09:00 – 09:30";
    }
    checkoutState.deliverySchedule.fullLabel = `${dayLabel}, ${checkoutState.deliverySchedule.slotLabel}`;

    slotsGrid.innerHTML = slots
      .map(
        (slot) => `
          <button
            type="button"
            class="scheduleSlotBtn${slot === checkoutState.deliverySchedule.slotLabel ? " isSelected" : ""}"
            data-schedule-slot="${escapeHtml(slot)}"
            role="radio"
            aria-checked="${slot === checkoutState.deliverySchedule.slotLabel ? "true" : "false"}"
          >
            <i class="fa-regular fa-clock" aria-hidden="true"></i>
            <span>${escapeHtml(slot)}</span>
          </button>
        `,
      )
      .join("");

    slotsGrid.querySelectorAll("[data-schedule-slot]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const chosen = btn.dataset.scheduleSlot;
        checkoutState.deliverySchedule.slotLabel = chosen;
        checkoutState.deliverySchedule.fullLabel = `${checkoutState.deliverySchedule.dayLabel}, ${chosen}`;
        slotsGrid.querySelectorAll("[data-schedule-slot]").forEach((b) => {
          const active = b === btn;
          b.classList.toggle("isSelected", active);
          b.setAttribute("aria-checked", active ? "true" : "false");
        });
        updateSummaryText();
      });
    });

    updateSummaryText();
  }

  modeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.scheduleMode === "scheduled" ? "scheduled" : "now";
      checkoutState.deliverySchedule.mode = mode;
      modeBtns.forEach((b) => {
        const active = b === btn;
        b.classList.toggle("isActive", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
      });
      pickerPanel.hidden = mode !== "scheduled";
      if (mode === "scheduled") {
        renderSlots(checkoutState.deliverySchedule.day || "today");
      } else {
        checkoutState.deliverySchedule.fullLabel = "Giao ngay (15 – 20 phút)";
        updateSummaryText();
      }
    });
  });

  dayBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      renderSlots(btn.dataset.scheduleDay === "tomorrow" ? "tomorrow" : "today");
    });
  });
}

/* ────────────────────────────────────────────────────────────
   5. INTERACTIVE MAP PICKER (LEAFLET + GOOGLE MAPS DUAL-ENGINE)
   ──────────────────────────────────────────────────────────── */
function wireMapPickerModal() {
  const modal = document.getElementById("mapPickerModal");
  const overlay = document.getElementById("mapPickerOverlay");
  const openBtn = document.getElementById("openMapBtn");
  const closeBtn = document.getElementById("closeMapModalBtn");
  const cancelBtn = document.getElementById("cancelMapBtn");
  const confirmBtn = document.getElementById("confirmMapBtn");
  const searchInput = document.getElementById("mapSearchInput");
  const searchBtn = document.getElementById("mapSearchBtn");
  const geoBtn = document.getElementById("mapGeoBtn");

  // Google Maps API Key controls
  const toggleKeyBtn = document.getElementById("mapEngineToggleBtn");
  const keyBox = document.getElementById("gmapsKeyBox");
  const keyInput = document.getElementById("gmapsKeyInput");
  const saveKeyBtn = document.getElementById("saveGmapsKeyBtn");
  const removeKeyBtn = document.getElementById("removeGmapsKeyBtn");
  const keyStatus = document.getElementById("gmapsKeyStatus");

  // Load saved Google Maps key if present
  const savedKey = localStorage.getItem("koffia_google_maps_key");
  if (savedKey && keyInput) {
    keyInput.value = savedKey;
  }

  toggleKeyBtn?.addEventListener("click", () => {
    if (!keyBox) return;
    const isHidden = keyBox.style.display === "none";
    keyBox.style.display = isHidden ? "flex" : "none";
  });

  saveKeyBtn?.addEventListener("click", () => {
    const key = keyInput?.value?.trim();
    if (!key) {
      if (typeof showToast === "function") showToast("Vui lòng nhập Google Maps API Key", "error");
      return;
    }
    localStorage.setItem("koffia_google_maps_key", key);
    if (keyStatus) keyStatus.textContent = "✓ Đã lưu Google Maps API Key. Đang khởi tạo Google Maps SDK...";
    if (typeof showToast === "function") showToast("Đã lưu API Key! Đang nạp Google Maps...", "success");
    loadGoogleMapsSDK(key);
  });

  removeKeyBtn?.addEventListener("click", () => {
    localStorage.removeItem("koffia_google_maps_key");
    if (keyInput) keyInput.value = "";
    if (keyStatus) keyStatus.textContent = "Đã xóa Google Maps Key. Trở về chế độ OpenStreetMap mặc định.";
    if (typeof showToast === "function") showToast("Đã xóa key, quay lại dùng OpenStreetMap.");
    checkoutState.isUsingGoogleMaps = false;
    initLeafletMap();
  });

  openBtn?.addEventListener("click", () => {
    if (!modal) return;
    modal.style.display = "flex";

    // Khởi tạo map sau khi DOM hiển thị
    setTimeout(() => {
      const gKey = localStorage.getItem("koffia_google_maps_key");
      if (gKey) {
        loadGoogleMapsSDK(gKey);
      } else {
        initLeafletMap();
      }
    }, 150);
  });

  const closeModal = () => {
    if (modal) modal.style.display = "none";
  };

  closeBtn?.addEventListener("click", closeModal);
  overlay?.addEventListener("click", closeModal);
  cancelBtn?.addEventListener("click", closeModal);

  // Search address
  searchBtn?.addEventListener("click", () => {
    searchAddressOnMap(searchInput?.value?.trim());
  });

  searchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      searchAddressOnMap(searchInput.value.trim());
    }
  });

  // My location button
  geoBtn?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      if (typeof showToast === "function") showToast("Trình duyệt không hỗ trợ định vị GPS.", "error");
      return;
    }
    if (typeof showToast === "function") showToast("Đang xác định vị trí của bạn...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setMapPosition(lat, lng, true);
      },
      (err) => {
        console.warn("Lỗi định vị:", err);
        if (typeof showToast === "function") showToast("Không lấy được vị trí GPS (vui lòng cho phép quyền định vị).", "error");
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  });

  // Confirm picked position
  confirmBtn?.addEventListener("click", async () => {
    await applyPickedAddressToForm();
    closeModal();
  });
}

function initLeafletMap() {
  const container = document.getElementById("mapCanvas");
  if (!container || typeof L === "undefined") return;

  if (checkoutState.leafletMap) {
    setTimeout(() => checkoutState.leafletMap.invalidateSize(), 100);
    return;
  }

  const { lat, lng } = checkoutState.selectedCoords;
  const map = L.map("mapCanvas", {
    zoomControl: true,
  }).setView([lat, lng], 16);
  checkoutState.leafletMap = map;

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);

  // Custom Koffia Animated Map Pin (No external PNG dependency, crisp SVG)
  const koffiaPinIcon = L.divIcon({
    className: "koffiaCustomPin",
    html: `
      <div style="position: relative; width: 38px; height: 38px; margin-left: -19px; margin-top: -38px; display: flex; flex-direction: column; align-items: center; filter: drop-shadow(0 6px 12px rgba(230,81,0,0.45)); cursor: grab;">
        <div style="width: 36px; height: 36px; border-radius: 50% 50% 50% 0; background: linear-gradient(135deg, #e65100, #bf360c); transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 2.5px solid #ffffff;">
          <i class="fa-solid fa-mug-hot" style="transform: rotate(45deg); color: #ffffff; font-size: 15px;"></i>
        </div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

  const marker = L.marker([lat, lng], {
    draggable: true,
    icon: koffiaPinIcon,
  }).addTo(map);
  checkoutState.leafletMarker = marker;

  marker.on("dragend", () => {
    const pos = marker.getLatLng();
    setMapPosition(pos.lat, pos.lng, false);
  });

  map.on("click", (e) => {
    marker.setLatLng(e.latlng);
    setMapPosition(e.latlng.lat, e.latlng.lng, false);
  });

  setTimeout(() => {
    map.invalidateSize();
  }, 200);

  // Reverse geocode initial position
  setMapPosition(lat, lng, false);
}

function loadGoogleMapsSDK(apiKey) {
  if (window.google && window.google.maps) {
    initGoogleMap();
    return;
  }

  const scriptId = "koffia_google_maps_sdk";
  if (document.getElementById(scriptId)) return;

  const script = document.createElement("script");
  script.id = scriptId;
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=vi`;
  script.async = true;
  script.defer = true;
  script.onload = () => {
    initGoogleMap();
  };
  script.onerror = () => {
    console.warn("Không tải được Google Maps SDK với key này. Trở về OpenStreetMap.");
    if (typeof showToast === "function") showToast("Không tải được Google Maps với key này. Kiểm tra lại quyền/thẻ thanh toán của key.", "error");
    initLeafletMap();
  };
  document.head.appendChild(script);
}

function initGoogleMap() {
  const container = document.getElementById("mapCanvas");
  if (!container || !window.google || !window.google.maps) return;

  // Clear previous leaflet content if any
  if (checkoutState.leafletMap) {
    checkoutState.leafletMap.remove();
    checkoutState.leafletMap = null;
  }

  const { lat, lng } = checkoutState.selectedCoords;
  const map = new google.maps.Map(container, {
    center: { lat, lng },
    zoom: 16,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  });
  checkoutState.googleMap = map;
  checkoutState.isUsingGoogleMaps = true;

  const marker = new google.maps.Marker({
    position: { lat, lng },
    map: map,
    draggable: true,
    title: "Vị trí giao hàng Koffia",
  });
  checkoutState.googleMarker = marker;

  marker.addListener("dragend", () => {
    const pos = marker.getPosition();
    setMapPosition(pos.lat(), pos.lng(), false);
  });

  map.addListener("click", (e) => {
    marker.setPosition(e.latLng);
    setMapPosition(e.latLng.lat(), e.latLng.lng(), false);
  });

  setMapPosition(lat, lng, false);
}

async function setMapPosition(lat, lng, panMap = true) {
  checkoutState.selectedCoords = { lat, lng };

  // Pan active map
  if (checkoutState.isUsingGoogleMaps && checkoutState.googleMap) {
    if (panMap) checkoutState.googleMap.panTo({ lat, lng });
    if (checkoutState.googleMarker) checkoutState.googleMarker.setPosition({ lat, lng });
  } else if (checkoutState.leafletMap) {
    if (panMap) checkoutState.leafletMap.setView([lat, lng], 16);
    if (checkoutState.leafletMarker) checkoutState.leafletMarker.setLatLng([lat, lng]);
  }

  const addressEl = document.getElementById("mapSelectedAddress");
  const coordsEl = document.getElementById("mapSelectedCoords");
  if (coordsEl) coordsEl.textContent = `Tọa độ: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  if (addressEl) addressEl.textContent = "Đang tra cứu địa chỉ...";

  // Reverse Geocoding via Nominatim
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=vi`;
    const res = await fetch(url, { headers: { "Accept-Language": "vi" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const displayName = data.display_name || "Vị trí đã chọn";
    if (addressEl) addressEl.textContent = displayName;

    checkoutState.currentAddressComponents = {
      displayName: displayName,
      raw: data.address || {},
      lat,
      lng,
    };
  } catch (err) {
    console.warn("Lỗi dịch ngược địa chỉ:", err);
    if (addressEl) addressEl.textContent = `Vị trí tại tọa độ ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    checkoutState.currentAddressComponents = {
      displayName: `Tọa độ ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      raw: {},
      lat,
      lng,
    };
  }
}

async function searchAddressOnMap(query) {
  if (!query) return;
  const addressEl = document.getElementById("mapSelectedAddress");
  if (addressEl) addressEl.textContent = `Đang tìm "${query}"...`;

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=vn&limit=1&accept-language=vi`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Search failed");
    const results = await res.json();

    if (!results || !results.length) {
      if (typeof showToast === "function") showToast("Không tìm thấy địa điểm này tại Việt Nam.", "error");
      if (addressEl) addressEl.textContent = "Không tìm thấy địa chỉ.";
      return;
    }

    const first = results[0];
    const lat = parseFloat(first.lat);
    const lng = parseFloat(first.lon);
    setMapPosition(lat, lng, true);
  } catch (err) {
    console.warn("Lỗi tìm kiếm địa chỉ:", err);
    if (typeof showToast === "function") showToast("Lỗi kết nối tìm kiếm địa chỉ.", "error");
  }
}

async function applyPickedAddressToForm() {
  const comp = checkoutState.currentAddressComponents;
  if (!comp) return;

  const raw = comp.raw || {};
  const provinceSelect = document.getElementById("checkoutProvince");
  const districtSelect = document.getElementById("checkoutDistrict");
  const wardSelect = document.getElementById("checkoutWard");
  const streetInput = document.getElementById("checkoutStreet");

  // 1. Phân giải Tỉnh / Thành phố
  const cityName = raw.city || raw.state || raw.province || "";
  let matchedProvince = null;
  if (cityName && checkoutState.provinces.length) {
    const cleanCity = cityName.toLowerCase().replace(/thành phố|tỉnh/g, "").trim();
    matchedProvince = checkoutState.provinces.find((p) => p.name.toLowerCase().includes(cleanCity));
  }

  if (matchedProvince && provinceSelect) {
    provinceSelect.value = matchedProvince.code;
    checkoutState.selectedProvince = matchedProvince;
    await loadDistricts(matchedProvince.code);

    // 2. Phân giải Quận / Huyện
    const districtName = raw.district || raw.county || raw.city_district || "";
    let matchedDistrict = null;
    const districts = checkoutState.districtsCache.get(matchedProvince.code) || [];
    if (districtName && districts.length) {
      const cleanDist = districtName.toLowerCase().replace(/quận|huyện|thị xã|thành phố/g, "").trim();
      matchedDistrict = districts.find((d) => d.name.toLowerCase().includes(cleanDist));
    }

    if (matchedDistrict && districtSelect) {
      districtSelect.value = matchedDistrict.code;
      checkoutState.selectedDistrict = matchedDistrict;
      await loadWards(matchedDistrict.code);

      // 3. Phân giải Phường / Xã
      const wardName = raw.suburb || raw.quarter || raw.village || raw.ward || "";
      const wards = checkoutState.wardsCache.get(matchedDistrict.code) || [];
      if (wardName && wards.length && wardSelect) {
        const cleanWard = wardName.toLowerCase().replace(/phường|xã|thị trấn/g, "").trim();
        const matchedWard = wards.find((w) => w.name.toLowerCase().includes(cleanWard));
        if (matchedWard) {
          wardSelect.value = matchedWard.code;
          checkoutState.selectedWard = matchedWard;
        }
      }
    }
  }

  // 4. Số nhà, tên đường
  const house = raw.house_number || "";
  const road = raw.road || raw.street || "";
  let streetVal = "";
  if (house && road) streetVal = `${house} ${road}`;
  else if (road) streetVal = road;
  else if (comp.displayName) {
    streetVal = comp.displayName.split(",")[0].trim();
  }

  if (streetInput && streetVal) {
    streetInput.value = streetVal;
  }

  updateFullAddressPreview();
  if (typeof showToast === "function") {
    showToast("Đã đồng bộ vị trí bản đồ vào form địa chỉ!", "success");
  }
}

/* ────────────────────────────────────────────────────────────
   6. PAYMENT METHOD SELECTOR
   ──────────────────────────────────────────────────────────── */
function wirePaymentMethods() {
  const items = document.querySelectorAll(".paymentOptionItem");
  items.forEach((item) => {
    item.addEventListener("click", () => {
      items.forEach((i) => i.classList.remove("paymentSelected"));
      item.classList.add("paymentSelected");
      const radio = item.querySelector(".paymentRadio");
      if (radio) radio.checked = true;
    });
  });
}

/* ────────────────────────────────────────────────────────────
   7. FORM SUBMISSION & ORDER CREATION
   ──────────────────────────────────────────────────────────── */
function wireCheckoutFormSubmit() {
  const form = document.getElementById("checkoutForm");
  const successView = document.getElementById("checkoutSuccessView");
  const mainLayout = document.getElementById("checkoutMainLayout");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    // 1. Kiểm tra giỏ hàng
    if (!cartState.items.length) {
      if (typeof showToast === "function") showToast("Giỏ hàng của bạn đang trống.", "error");
      return;
    }

    // 2. Kiểm tra form hợp lệ
    if (!form.reportValidity()) return;

    // 3. Kiểm tra số điện thoại
    const phoneInput = document.getElementById("checkoutPhone");
    const phone = phoneInput ? phoneInput.value.replace(/\s/g, "") : "";
    if (!/^(0[0-9]{9}|\+84[0-9]{9})$/.test(phone)) {
      if (typeof showToast === "function") showToast("Số điện thoại chưa hợp lệ. Vui lòng kiểm tra lại.", "error");
      phoneInput?.focus();
      return;
    }

    // 4. Kiểm tra đầy đủ Tỉnh, Quận, Phường, Đường
    const provinceSelect = document.getElementById("checkoutProvince");
    const districtSelect = document.getElementById("checkoutDistrict");
    const wardSelect = document.getElementById("checkoutWard");
    const streetInput = document.getElementById("checkoutStreet");

    if (!provinceSelect?.value || !districtSelect?.value || !wardSelect?.value || !streetInput?.value?.trim()) {
      if (typeof showToast === "function") {
        showToast("Vui lòng chọn đầy đủ Tỉnh/TP, Quận/Huyện, Phường/Xã và Số nhà / Tên đường.", "error");
      }
      return;
    }

    const provinceName = provinceSelect.selectedOptions[0]?.textContent || "";
    const districtName = districtSelect.selectedOptions[0]?.textContent || "";
    const wardName = wardSelect.selectedOptions[0]?.textContent || "";
    const street = streetInput.value.trim();
    const fullAddress = `${street}, ${wardName}, ${districtName}, ${provinceName}, Việt Nam`;

    const name = document.getElementById("checkoutName")?.value?.trim() || "Khách hàng Koffia";
    const email = document.getElementById("checkoutEmail")?.value?.trim() || "";
    const note = document.getElementById("checkoutNote")?.value?.trim() || "";

    // Phương thức thanh toán
    const selectedRadio = document.querySelector('input[name="paymentMethod"]:checked');
    const paymentVal = selectedRadio ? selectedRadio.value : "cod";
    let paymentMethodName = "Thanh toán khi nhận hàng (COD)";
    if (paymentVal === "vietqr") paymentMethodName = "Chuyển khoản Ngân hàng (VietQR)";
    else if (paymentVal === "wallet") paymentMethodName = "Ví điện tử (MoMo / ZaloPay)";

    // Tính toán giá trị đơn hàng
    const subtotal = cartState.getTotal();
    let voucherDiscount = 0;
    let isFreeShip = false;
    const appliedVoucher = checkoutState.appliedVoucher;

    if (appliedVoucher) {
      if (typeof voucherService !== "undefined" && typeof voucherService.computeDiscount === "function") {
        const res = voucherService.computeDiscount(appliedVoucher, cartState.items, subtotal);
        voucherDiscount = res.discount;
        isFreeShip = res.isFreeShip;
      } else {
        if (appliedVoucher.type === "percent") {
          voucherDiscount = Math.round((subtotal * appliedVoucher.value) / 100);
          if (appliedVoucher.maxDiscount) voucherDiscount = Math.min(voucherDiscount, appliedVoucher.maxDiscount);
        } else if (appliedVoucher.type === "fixed") {
          voucherDiscount = Math.min(appliedVoucher.value, subtotal);
        } else if (appliedVoucher.type === "freeShip") {
          isFreeShip = true;
        }
      }
    }

    const freeshipThreshold =
      typeof KOFFIA_FREESHIP_THRESHOLD !== "undefined"
        ? KOFFIA_FREESHIP_THRESHOLD
        : 50000;
    const baseShipping =
      typeof KOFFIA_BASE_SHIPPING_FEE !== "undefined"
        ? KOFFIA_BASE_SHIPPING_FEE
        : 15000;
    const shippingFee = subtotal >= freeshipThreshold || isFreeShip ? 0 : baseShipping;
    const finalTotal = Math.max(0, subtotal - voucherDiscount + shippingFee);

    // Tạo đối tượng đơn hàng
    const scheduleSnapshot =
      checkoutState.deliverySchedule?.mode === "scheduled"
        ? {
            mode: "scheduled",
            dayLabel: checkoutState.deliverySchedule.dayLabel || "Hôm nay",
            slotLabel: checkoutState.deliverySchedule.slotLabel || "",
            fullLabel:
              checkoutState.deliverySchedule.fullLabel || "Hẹn giờ giao",
          }
        : {
            mode: "now",
            dayLabel: "Hôm nay",
            slotLabel: "15 – 20 phút",
            fullLabel: "Giao ngay (15 – 20 phút)",
          };

    // Lưu vào Sổ địa chỉ nếu khách tích chọn
    const saveAddrBox = document.getElementById("checkoutSaveToBook");
    if (saveAddrBox?.checked && typeof addressBookService !== "undefined") {
      addressBookService.add({
        label: checkoutState.saveAddrLabel || "Nhà riêng",
        recipientName: name,
        phone,
        provinceCode: provinceSelect.value,
        provinceName,
        districtCode: districtSelect.value,
        districtName,
        wardCode: wardSelect.value,
        wardName,
        street,
        isDefault: addressBookService.getList().length === 0,
      });
    }

    const orderId = `KOF${Date.now().toString().slice(-8)}`;
    const newOrder = {
      id: orderId,
      createdAt: new Date().toISOString(),
      customer: {
        name,
        phone,
        email,
        address: fullAddress,
        note,
      },
      items: cartState.items.map((i) => ({ ...i })),
      subtotal,
      voucher: appliedVoucher
        ? {
            code: appliedVoucher.code,
            name: appliedVoucher.name,
            discount: voucherDiscount,
          }
        : null,
      shippingFee,
      deliverySchedule: scheduleSnapshot,
      total: finalTotal,
      paymentMethod: paymentMethodName,
      status: "new",
    };

    // Lưu vào lịch sử đơn hàng
    const currentUser = typeof customerService !== "undefined" ? customerService.getCurrentUser() : null;
    if (typeof orderHistoryService !== "undefined") {
      orderHistoryService.add(newOrder);
    }

    // Ghi nhận lượt sử dụng voucher
    if (appliedVoucher && typeof voucherService !== "undefined" && currentUser?.id) {
      voucherService.recordUsage(appliedVoucher.code, currentUser.id);
    }
    sessionStorage.removeItem("koffia_applied_voucher");

    // Xóa giỏ hàng
    cartState.clearCurrentUserCart();

    // Hiển thị giao diện thành công
    if (mainLayout) mainLayout.hidden = true;
    if (successView) {
      successView.hidden = false;
      document.getElementById("successOrderCode").textContent = orderId;
      document.getElementById("successCustomerName").textContent = name;
      document.getElementById("successCustomerPhone").textContent = phone;
      document.getElementById("successCustomerAddress").textContent = fullAddress;
      const schedEl = document.getElementById("successDeliverySchedule");
      if (schedEl) schedEl.textContent = scheduleSnapshot.fullLabel;
      document.getElementById("successPaymentMethod").textContent = paymentMethodName;
      document.getElementById("successOrderTotal").textContent = formatPrice(finalTotal);

      // Hiển thị VietQR nếu chọn chuyển khoản
      const vietqrBox = document.getElementById("successVietQRBox");
      const vietqrImg = document.getElementById("successVietQRImg");
      const vietqrContent = document.getElementById("successQRContent");

      if (paymentVal === "vietqr" && vietqrBox && vietqrImg) {
        vietqrBox.style.display = "flex";
        const qrUrl = `https://img.vietqr.io/image/MB-0901234567-compact2.png?amount=${finalTotal}&addInfo=${orderId}&accountName=KOFFIA%20VIETNAM`;
        vietqrImg.src = qrUrl;
        if (vietqrContent) vietqrContent.textContent = orderId;
      } else if (vietqrBox) {
        vietqrBox.style.display = "none";
      }
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
    if (typeof showToast === "function") {
      showToast("Đặt đơn hàng thành công! Mã đơn: " + orderId, "success");
    }
  });
}

// Utility to escape HTML strings safely
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

// Bootstrap on DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
  initCheckoutPage();
});
