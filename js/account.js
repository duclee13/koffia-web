"use strict";

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

async function initAccountPage() {
  if (!document.getElementById("accountForm")) return;

  const sessionUser = customerService.getCurrentUser();
  if (!sessionUser) {
    showToast("Vui lòng đăng nhập để xem trang tài khoản.", "error");
    setTimeout(() => {
      window.location.href = "auth.html?mode=login";
    }, 800);
    return;
  }

  // Lấy bản mới nhất từ customers.json + runtime trước khi render.
  await customerService.loadAll(true);
  const freshUser = await customerService.findById(sessionUser.id);
  if (freshUser) customerService.setCurrentUser(freshUser);

  renderAccountInfo(freshUser || sessionUser);
  renderAccountRole(freshUser || sessionUser);
  initAccountTabs();
  renderAccountRewards();
  initDrinkPreferenceCard();
  initAccountAddressBook(freshUser || sessionUser);
  renderAccountWishlist();
  renderAccountVouchers();
  wireAvatarUploader();
  wireAccountForm();
  wireSellerRegistration(freshUser || sessionUser);
  wireLogoutButton();

  if (window._accountWishlistSyncHandler) {
    window.removeEventListener(
      "koffia:wishlist-changed",
      window._accountWishlistSyncHandler,
    );
  }
  window._accountWishlistSyncHandler = () => {
    if (document.getElementById("accountWishlistGrid")) {
      renderAccountWishlist();
    }
  };
  window.addEventListener(
    "koffia:wishlist-changed",
    window._accountWishlistSyncHandler,
  );

  if (window._accountRewardsSyncHandler) {
    window.removeEventListener("koffia:rewards-changed", window._accountRewardsSyncHandler);
    window.removeEventListener("koffia:orders-changed", window._accountRewardsSyncHandler);
  }
  window._accountRewardsSyncHandler = () => {
    if (document.getElementById("accountRewardsCard")) {
      renderAccountRewards();
      renderAccountVouchers();
    }
  };
  window.addEventListener("koffia:rewards-changed", window._accountRewardsSyncHandler);
  window.addEventListener("koffia:orders-changed", window._accountRewardsSyncHandler);

  if (window._accountAddressSyncHandler) {
    window.removeEventListener("koffia:addresses-changed", window._accountAddressSyncHandler);
  }
  window._accountAddressSyncHandler = () => {
    if (document.getElementById("accountAddressList")) {
      renderAccountAddressList();
    }
  };
  window.addEventListener("koffia:addresses-changed", window._accountAddressSyncHandler);
}

document.addEventListener("DOMContentLoaded", initAccountPage);

function switchAccountTab(tabName, updateUrl = true) {
  const raw = String(tabName || "").toLowerCase();
  const focusAddress = raw === "addresses" || raw === "address";
  const validTabs = ["profile", "vouchers", "rewards", "wishlist", "preferences"];
  const target = focusAddress
    ? "profile"
    : validTabs.includes(raw)
      ? raw
      : "profile";

  document.querySelectorAll("[data-account-tab]").forEach((btn) => {
    const active = btn.dataset.accountTab === target;
    btn.classList.toggle("isActive", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });

  document.querySelectorAll("[data-account-panel]").forEach((panel) => {
    const active = panel.dataset.accountPanel === target;
    panel.classList.toggle("isActive", active);
    panel.hidden = !active;
  });

  if (updateUrl) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", focusAddress ? "addresses" : target);
      url.hash = "";
      window.history.replaceState(null, "", url.toString());
    } catch {}
    if (typeof syncNavCenterAndContextPill === "function") {
      syncNavCenterAndContextPill(window.location.href);
    }
  }

  if (focusAddress) {
    requestAnimationFrame(() => {
      document
        .getElementById("accountAddressBookCard")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

function initAccountTabs() {
  const nav = document.getElementById("accountTabNav");
  if (!nav) return;

  const params = new URLSearchParams(window.location.search);
  const hash = (window.location.hash || "").toLowerCase();
  let initialTab = params.get("tab") || "";
  if (!initialTab) {
    if (hash.includes("voucher")) initialTab = "vouchers";
    else if (hash.includes("reward")) initialTab = "rewards";
    else if (hash.includes("wish")) initialTab = "wishlist";
    else if (hash.includes("address")) initialTab = "addresses";
    else if (hash.includes("pref")) initialTab = "preferences";
    else initialTab = "profile";
  }

  switchAccountTab(initialTab, false);

  nav.querySelectorAll("[data-account-tab]").forEach((btn) => {
    if (btn.dataset.wired === "1") return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      switchAccountTab(btn.dataset.accountTab, true);
      if (window.matchMedia && window.matchMedia("(max-width: 900px)").matches) {
        const panelCol = document.querySelector(".accountPanelsCol");
        panelCol?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

function renderAccountInfo(user) {
  const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  const fullNameEl = document.getElementById("accountFullName");
  const identifierEl = document.getElementById("accountIdentifier");
  const avatarPreview = document.getElementById("accountAvatarPreview");
  const joinedDateEl = document.getElementById("accountJoinedDate");
  const emailPreviewEl = document.getElementById("accountEmailPreview");
  const usernameInput = document.getElementById("accountUsername");
  const usernameHint = document.getElementById("accountUsernameHint");
  const emailInput = document.getElementById("accountEmail");
  const recoveryInput = document.getElementById("accountRecoveryEmail");

  if (fullNameEl) fullNameEl.textContent = fullName || "Khách hàng Koffia";
  if (identifierEl)
    identifierEl.textContent = user.username ? `@${user.username}` : "—";
  if (avatarPreview) avatarPreview.src = user.avatar || defaultAvatarDataUri;
  if (joinedDateEl)
    joinedDateEl.textContent = user.createdAt
      ? `Tham gia ${new Date(user.createdAt).toLocaleDateString("vi-VN")}`
      : "Thành viên Koffia";
  if (emailPreviewEl)
    emailPreviewEl.textContent = user.email || "Chưa có email";
  if (emailInput) emailInput.value = user.email || "";
  if (recoveryInput) recoveryInput.value = user.recoveryEmail || "";

  const usedUsernameChange = Number(user.usernameChangeCount) >= 1;
  if (usernameInput) {
    usernameInput.value = user.username || "";
    usernameInput.disabled = usedUsernameChange;
  }
  if (usernameHint) {
    usernameHint.textContent = usedUsernameChange
      ? "Bạn đã sử dụng lần đổi tên người dùng duy nhất."
      : "Bạn còn 1 lần đổi tên. Tên mới cần 4–20 ký tự, chỉ gồm A–Z, a–z, 0–9, dấu chấm (.) và gạch dưới (_).";
    usernameHint.classList.toggle("limitUsed", usedUsernameChange);
  }
}

function wireAvatarUploader() {
  const avatarInput = document.getElementById("avatarFileInput");
  const avatarPreview = document.getElementById("accountAvatarPreview");
  const changeBtn = document.getElementById("avatarChangeBtn");
  if (!avatarInput || !avatarPreview) return;

  changeBtn?.addEventListener("click", () => avatarInput.click());
  avatarInput.addEventListener("change", () => {
    const file = avatarInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Vui lòng chọn một tệp hình ảnh hợp lệ.", "error");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      showToast("Ảnh đại diện tối đa 2MB.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (event) => {
      avatarPreview.src = event.target.result;
      const current = customerService.getCurrentUser();
      if (!current) return;
      const updated = await customerService.updateCustomer(current.id, {
        avatar: event.target.result,
      });
      if (updated) {
        showToast("Đã cập nhật ảnh đại diện!");
        const navAvatar = document.getElementById("navAvatarImg");
        if (navAvatar) navAvatar.src = event.target.result;
      }
    };
    reader.readAsDataURL(file);
  });
}

function wireAccountForm() {
  const form = document.getElementById("accountForm");
  const usernameInput = document.getElementById("accountUsername");
  const usernameError = document.getElementById("accountUsernameError");
  const emailInput = document.getElementById("accountEmail");
  const emailError = document.getElementById("accountEmailError");
  const recoveryInput = document.getElementById("accountRecoveryEmail");
  const recoveryError = document.getElementById("accountRecoveryEmailError");
  const saveBtn = document.getElementById("accountSaveBtn");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAllFieldErrors(form);

    const current = customerService.getCurrentUser();
    if (!current) return;

    const newUsername = customerService.normalizeUsername(
      usernameInput?.value || current.username,
    );
    const newEmail = emailInput.value.trim().toLowerCase();
    const newRecovery = recoveryInput.value.trim().toLowerCase();
    const usernameChanged =
      newUsername !== customerService.normalizeUsername(current.username);

    if (usernameChanged) {
      if (Number(current.usernameChangeCount) >= 1) {
        setFieldError(
          usernameInput,
          usernameError,
          "Bạn đã sử dụng lần đổi tên người dùng duy nhất.",
        );
        return;
      }
      const usernameCheck = customerService.validateUsername(newUsername);
      if (!usernameCheck.valid) {
        setFieldError(usernameInput, usernameError, usernameCheck.message);
        return;
      }
      if (await customerService.isUsernameTaken(newUsername, current.id)) {
        setFieldError(
          usernameInput,
          usernameError,
          "Tên người dùng này đã có người sử dụng.",
        );
        return;
      }
    }

    if (newEmail && !EMAIL_PATTERN.test(newEmail)) {
      setFieldError(emailInput, emailError, "Email không hợp lệ.");
      return;
    }
    if (
      newEmail &&
      (await customerService.isEmailTaken(newEmail, current.id))
    ) {
      setFieldError(
        emailInput,
        emailError,
        "Email này đã được sử dụng bởi tài khoản khác.",
      );
      return;
    }
    if (newRecovery && !EMAIL_PATTERN.test(newRecovery)) {
      setFieldError(
        recoveryInput,
        recoveryError,
        "Email khôi phục không hợp lệ.",
      );
      return;
    }
    if (newRecovery && newEmail && newRecovery === newEmail) {
      setFieldError(
        recoveryInput,
        recoveryError,
        "Email khôi phục nên khác email chính.",
      );
      return;
    }

    const patch = { email: newEmail, recoveryEmail: newRecovery };
    if (usernameChanged) {
      patch.username = newUsername;
      patch.usernameChangeCount = 1;
      patch.usernameChangedAt = new Date().toISOString();
    }

    const original = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
    const updated = await customerService.updateCustomer(current.id, patch);
    saveBtn.disabled = false;
    saveBtn.innerHTML = original;

    if (updated) {
      renderAccountInfo(updated);
      showToast(
        usernameChanged
          ? "Đã lưu hồ sơ và sử dụng lần đổi username duy nhất."
          : "Đã lưu thay đổi tài khoản!",
      );
    }
  });
}

function wireLogoutButton() {
  document.getElementById("accountLogoutBtn")?.addEventListener("click", () => {
    customerService.logout();
    showToast("Đã đăng xuất. Hẹn gặp lại bạn!");
    setTimeout(() => {
      window.location.href = "../index.html";
    }, 700);
  });
}

function renderAccountRole(user) {
  const customerBlock = document.getElementById("accountCustomerRoleBlock");
  const sellerBlock = document.getElementById("accountSellerRoleBlock");
  const devBlock = document.getElementById("accountDevRoleBlock");
  const channelNameHeading = document.getElementById("sellerChannelNameHeading");
  const trialBadge = document.getElementById("sellerTrialDaysBadge");

  if (!customerBlock || !sellerBlock || !devBlock) return;

  customerBlock.style.display = "none";
  sellerBlock.style.display = "none";
  devBlock.style.display = "none";

  if (user.role === "dev") {
    devBlock.style.display = "block";
  } else if (user.role === "seller") {
    sellerBlock.style.display = "block";
    const days = customerService.getSellerTrialRemainingDays(user);
    if (channelNameHeading) {
      channelNameHeading.textContent = `Kênh: ${user.sellerProfile?.channelName || "Cửa hàng của bạn"}`;
    }
    if (trialBadge) {
      trialBadge.textContent = days > 0 ? `Trial: còn ${days} ngày` : "Trial đã hết hạn";
      trialBadge.style.background = days > 0 ? "#ecfdf5" : "#fee2e2";
      trialBadge.style.color = days > 0 ? "#047857" : "#b91c1c";
    }
  } else {
    customerBlock.style.display = "block";
  }
}

function wireSellerRegistration(user) {
  const openBtn = document.getElementById("openRegisterSellerModalBtn");
  const modal = document.getElementById("registerSellerModal");
  const closeBtn = document.getElementById("closeSellerModalBtn");
  const overlay = document.getElementById("sellerModalOverlay");
  const form = document.getElementById("sellerRegisterForm");

  openBtn?.addEventListener("click", () => {
    if (modal) modal.style.display = "flex";
  });

  closeBtn?.addEventListener("click", () => {
    if (modal) modal.style.display = "none";
  });

  overlay?.addEventListener("click", () => {
    if (modal) modal.style.display = "none";
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const channelName = document.getElementById("sellerRegChannelName")?.value.trim();
    const phone = document.getElementById("sellerRegPhone")?.value.trim();
    const address = document.getElementById("sellerRegAddress")?.value.trim();
    const description = document.getElementById("sellerRegDesc")?.value.trim();
    const checkedCats = Array.from(
      document.querySelectorAll('input[name="sellerCat"]:checked'),
    ).map((cb) => cb.value);

    if (!channelName || !phone || !address) {
      showToast("Vui lòng điền đầy đủ thông tin bắt buộc.", "error");
      return;
    }

    const submitBtn = document.getElementById("submitRegisterSellerBtn");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang khởi tạo kênh...';
    }

    const res = await customerService.registerSeller(user.id, {
      channelName,
      phone,
      address,
      description,
      categories: checkedCats,
    });

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Xác Nhận Mở Kênh';
    }

    if (res.success) {
      showToast("Chúc mừng! Kênh người bán của bạn đã được kích hoạt thành công!");
      if (modal) modal.style.display = "none";
      renderAccountRole(res.user);
      initAuthNav();
    } else {
      showToast(res.message || "Không thể đăng ký người bán lúc này.", "error");
    }
  });
}

async function renderAccountWishlist() {
  const grid = document.getElementById("accountWishlistGrid");
  const countBadge = document.getElementById("accountWishlistCount");
  if (!grid || typeof wishlistService === "undefined") return;

  const ids = wishlistService.getIds();
  if (countBadge) countBadge.textContent = String(ids.length);
  const tabWishBadge = document.getElementById("accountTabWishCount");
  if (tabWishBadge) tabWishBadge.textContent = String(ids.length);

  if (!ids.length) {
    grid.innerHTML = `
      <div class="accountWishlistEmpty">
        <i class="fa-regular fa-heart" aria-hidden="true"></i>
        <p>Bạn chưa lưu món yêu thích nào.</p>
        <span>Nhấn biểu tượng trái tim trên bất kỳ đồ uống nào ở Thực đơn để lưu lại tại đây.</span>
      </div>
    `;
    return;
  }

  const productMap =
    typeof productCatalogService !== "undefined"
      ? await productCatalogService.getProductMap()
      : new Map();

  const likedProducts = ids.map((id) => productMap.get(id)).filter(Boolean);
  if (countBadge) countBadge.textContent = String(likedProducts.length);

  if (!likedProducts.length) {
    grid.innerHTML = `
      <div class="accountWishlistEmpty">
        <i class="fa-regular fa-heart" aria-hidden="true"></i>
        <p>Bạn chưa lưu món yêu thích nào.</p>
      </div>
    `;
    return;
  }

  const esc =
    typeof escapeHtmlGlobal === "function"
      ? escapeHtmlGlobal
      : (v) => String(v ?? "");

  grid.innerHTML = likedProducts
    .map((product) => {
      const soldOut = product.isAvailable === false;
      return `
        <article class="accountWishItem" data-product-id="${esc(product.id)}">
          <a href="product.html?id=${encodeURIComponent(product.id)}" class="accountWishMedia">
            <img class="accountWishImg" src="${esc(defaultProductImageDataUri)}" data-wish-img="${esc(product.id)}" alt="${esc(product.name)}" loading="lazy" />
          </a>
          <div class="accountWishBody">
            <a href="product.html?id=${encodeURIComponent(product.id)}" class="accountWishName">${esc(product.name)}</a>
            <div class="accountWishPrice">${formatPrice(product.price)}</div>
          </div>
          <div class="accountWishActions">
            <button type="button" class="accountWishAddBtn" data-wish-add="${esc(product.id)}" ${soldOut ? "disabled" : ""} aria-label="Thêm ${esc(product.name)} vào giỏ" title="Thêm vào giỏ">
              <i class="fa-solid ${soldOut ? "fa-ban" : "fa-plus"}" aria-hidden="true"></i>
            </button>
            <button type="button" class="accountWishRemoveBtn" data-wish-remove="${esc(product.id)}" aria-label="Bỏ khỏi yêu thích" title="Bỏ yêu thích">
              <i class="fa-solid fa-heart" aria-hidden="true"></i>
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  // Hydrate cover images
  if (typeof productImageService !== "undefined") {
    const imgs = [...grid.querySelectorAll("[data-wish-img]")];
    await Promise.all(
      imgs.map(async (img) => {
        const product = productMap.get(img.dataset.wishImg);
        if (!product) return;
        const cover = await productImageService.resolveCoverImage(product, "../");
        if (cover && img.isConnected) {
          img.src = new URL(cover, window.location.href).href;
        }
      }),
    );
  }

  grid.querySelectorAll("[data-wish-add]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const product = productMap.get(btn.dataset.wishAdd);
      if (!product) return;
      let coverUrl = "";
      if (typeof productImageService !== "undefined") {
        const cover = await productImageService.resolveCoverImage(product, "../");
        if (cover) coverUrl = new URL(cover, window.location.href).href;
      }
      cartState.addItem({
        id: product.id,
        productId: product.id,
        category: product.category || "",
        sellerId: product.sellerId || "",
        name: product.name,
        price: Number(product.price) || 0,
        img: coverUrl,
      });
    });
  });

  grid.querySelectorAll("[data-wish-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.wishRemove;
      if (!id) return;
      wishlistService.toggle(id);
      showToast("Đã bỏ khỏi danh sách yêu thích", "success", 2000);
    });
  });
}

async function renderAccountVouchers() {
  const container = document.getElementById("accountVouchersList");
  if (!container || typeof voucherService === "undefined") return;

  const vouchers = await voucherService.getPublicVouchers();
  const tabBadge = document.getElementById("accountTabVoucherCount");
  if (tabBadge) tabBadge.textContent = String(vouchers.length);

  if (!vouchers.length) {
    container.innerHTML = '<p style="color:var(--colorGray500);font-size:13px;">Chưa có mã giảm giá nào.</p>';
    return;
  }

  const esc =
    typeof escapeHtmlGlobal === "function"
      ? escapeHtmlGlobal
      : (v) => String(v ?? "");

  container.innerHTML = vouchers
    .slice(0, 14)
    .map(
      (v) => `
    <div class="accountVoucherItem${v.isRewardVoucher ? " isRewardVoucher" : ""}">
      <div>
        <div class="voucherHead">
          <span class="voucherCodeTxt">${esc(v.code)}</span>
          ${v.isRewardVoucher ? '<span class="voucherRewardTag">Rewards</span>' : ""}
          <span style="font-size:11px;font-weight:700;color:var(--colorAccent);">${v.type === "percent" ? `-${v.value}%` : (v.type === "freeShip" ? "Free Ship" : `-${formatPrice(v.value)}`)}</span>
        </div>
        <div class="voucherNameTxt">${esc(v.name)}</div>
        <div class="voucherDescTxt">${esc(v.description || "")}${v.minOrderValue ? ` · Đơn từ ${formatPrice(v.minOrderValue)}` : ""}</div>
      </div>
      <div class="accountVoucherBtns">
        <button type="button" class="btnPrimary useVoucherBtnSmall" data-use-acct-voucher="${esc(v.code)}">
          <i class="fa-solid fa-bolt" aria-hidden="true"></i> Dùng ngay
        </button>
        <button type="button" class="copyVoucherBtnSmall" data-copy-acct-voucher="${esc(v.code)}" title="Sao chép mã">
          <i class="fa-regular fa-copy" aria-hidden="true"></i> Sao chép
        </button>
      </div>
    </div>
  `,
    )
    .join("");

  container.querySelectorAll("[data-use-acct-voucher]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const code = btn.dataset.useAcctVoucher;
      if (!code) return;
      const voucher = vouchers.find((x) => x.code === code);
      const user = customerService.getCurrentUser();
      if (typeof cartState !== "undefined") cartState.loadForCurrentUser();
      const items = typeof cartState !== "undefined" ? cartState.items : [];
      const subtotal = typeof cartState !== "undefined" ? cartState.getTotal() : 0;

      if (items.length > 0) {
        const check = await voucherService.validateVoucher(code, items, subtotal, user);
        if (check.valid && check.voucher) {
          sessionStorage.setItem("koffia_applied_voucher", JSON.stringify(check.voucher));
          sessionStorage.removeItem("koffia_pending_voucher_code");
          showToast(`Đã áp dụng mã "${code}" vào giỏ hàng!`);
          const cartUrl = new URL("cart.html", window.location.href).href;
          if (typeof koffiaRouter !== "undefined" && typeof koffiaRouter.navigate === "function") {
            koffiaRouter.navigate(cartUrl);
          } else {
            window.location.href = cartUrl;
          }
          return;
        }
        // Chưa đủ điều kiện: vẫn lưu pending để sang giỏ hàng gợi ý mua thêm
        sessionStorage.setItem("koffia_pending_voucher_code", code);
        navigator.clipboard?.writeText(code);
        showToast(`${check.message || "Chưa đủ điều kiện."} Mã "${code}" đã được sao chép sẵn!`, "error", 3600);
        return;
      }

      // Giỏ hàng đang trống: lưu pending + copy và đưa sang thực đơn chọn món
      sessionStorage.setItem("koffia_pending_voucher_code", code);
      navigator.clipboard?.writeText(code);
      showToast(`Đã lưu mã "${code}"! Hãy chọn đồ uống, mã sẽ tự động áp dụng khi mở giỏ.`, "success", 3600);
      const menuUrl = new URL("menu.html", window.location.href).href;
      if (typeof koffiaRouter !== "undefined" && typeof koffiaRouter.navigate === "function") {
        koffiaRouter.navigate(menuUrl);
      } else {
        window.location.href = menuUrl;
      }
    });
  });

  container.querySelectorAll("[data-copy-acct-voucher]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = btn.dataset.copyAcctVoucher;
      navigator.clipboard?.writeText(code);
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Đã chép';
      btn.style.color = "var(--colorAccent)";
      showToast(`Đã sao chép mã "${code}"!`);
      setTimeout(() => {
        btn.innerHTML = '<i class="fa-regular fa-copy"></i> Sao chép';
        btn.style.color = "";
      }, 2000);
    });
  });
}

/* ────────────────────────────────────────────────────────────
   NHÓM 3 — KOFFIA REWARDS & ĐỔI VOUCHER
   ──────────────────────────────────────────────────────────── */
function renderAccountRewards() {
  const card = document.getElementById("accountRewardsCard");
  if (!card || typeof rewardsService === "undefined") return;

  const summary = rewardsService.getSummary();
  const tierPill = document.getElementById("rewardsTierPill");
  const passEl = document.getElementById("rewardsWalletPass");
  const balanceEl = document.getElementById("rewardsPointsBalance");
  const passBadge = document.getElementById("rewardsPassBadge");
  const progressText = document.getElementById("rewardsProgressText");
  const lifetimeText = document.getElementById("rewardsLifetimeText");
  const progressFill = document.getElementById("rewardsProgressFill");
  const catalogGrid = document.getElementById("rewardsCatalogGrid");
  const recentWrap = document.getElementById("rewardsRecentWrap");
  const recentList = document.getElementById("rewardsRecentList");

  if (tierPill) tierPill.textContent = summary.tier.name;
  if (balanceEl) balanceEl.textContent = String(summary.balance);
  const tabRewardBadge = document.getElementById("accountTabRewardPts");
  if (tabRewardBadge) tabRewardBadge.textContent = `${summary.balance} đ`;
  if (passEl) {
    passEl.classList.remove("tierBronze", "tierSilver", "tierGold");
    const cls =
      summary.tier.id === "gold"
        ? "tierGold"
        : summary.tier.id === "silver"
          ? "tierSilver"
          : "tierBronze";
    passEl.classList.add(cls);
  }
  if (passBadge) {
    passBadge.innerHTML = `<i class="fa-solid ${summary.tier.icon || "fa-medal"}" aria-hidden="true"></i> <span>${summary.tier.badge}</span>`;
  }
  if (progressText) {
    progressText.textContent = summary.nextTier
      ? `Còn ${summary.pointsToNext} điểm để đạt ${summary.nextTier.name}`
      : "Bạn đang ở hạng cao nhất — Đặc quyền Thành viên Vàng!";
  }
  if (lifetimeText) {
    lifetimeText.textContent = `Tổng tích lũy: ${summary.lifetimeEarned} điểm`;
  }
  if (progressFill) {
    progressFill.style.width = `${summary.progressPct}%`;
  }

  const esc =
    typeof escapeHtmlGlobal === "function"
      ? escapeHtmlGlobal
      : (v) => String(v ?? "");

  if (catalogGrid) {
    const catalog = rewardsService.getCatalog();
    catalogGrid.innerHTML = catalog
      .map((item) => {
        const canRedeem = summary.balance >= item.points;
        return `
          <article class="rewardOptionCard${canRedeem ? "" : " isLocked"}" role="listitem">
            <div class="rewardOptionTop">
              <span class="rewardOptionIcon" aria-hidden="true"><i class="fa-solid ${item.icon}"></i></span>
              <span class="rewardPointCost">${item.points} điểm</span>
            </div>
            <div class="rewardOptionTitle">${esc(item.title)}</div>
            <div class="rewardOptionSub">${esc(item.subtitle)}</div>
            <button
              type="button"
              class="btnSecondary rewardRedeemBtn"
              data-redeem-id="${esc(item.id)}"
              ${canRedeem ? "" : "disabled"}
            >
              ${canRedeem ? '<i class="fa-solid fa-sparkles" aria-hidden="true"></i> Đổi ngay' : `Thiếu ${item.points - summary.balance} điểm`}
            </button>
          </article>
        `;
      })
      .join("");

    // Fix icon class to FA6 Free safe icon
    catalogGrid.querySelectorAll(".rewardRedeemBtn i.fa-sparkles").forEach((i) => {
      i.className = "fa-solid fa-gift";
    });

    catalogGrid.querySelectorAll("[data-redeem-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const rewardId = btn.dataset.redeemId;
        if (!rewardId) return;
        btn.disabled = true;
        const res = await rewardsService.redeem(rewardId);
        if (res.success && res.voucher) {
          showToast(
            `Đổi thành công mã ${res.voucher.code}! Đã lưu vào Kho Voucher của bạn.`,
            "success",
            4200,
          );
          renderAccountRewards();
          renderAccountVouchers();
        } else {
          showToast(res.message || "Không thể đổi ưu đãi lúc này.", "error");
          btn.disabled = false;
        }
      });
    });
  }

  if (recentWrap && recentList) {
    if (summary.history.length > 0) {
      recentWrap.hidden = false;
      recentList.innerHTML = summary.history
        .slice(0, 4)
        .map(
          (entry) => `
            <div class="rewardsRecentItem">
              <div>
                <strong>${esc(entry.code)}</strong>
                <span>${esc(entry.title)} · -${entry.points} điểm</span>
              </div>
              <button type="button" class="rewardsRecentCopyBtn" data-copy-reward="${esc(entry.code)}">
                <i class="fa-regular fa-copy" aria-hidden="true"></i> Chép
              </button>
            </div>
          `,
        )
        .join("");

      recentList.querySelectorAll("[data-copy-reward]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const code = btn.dataset.copyReward;
          navigator.clipboard?.writeText(code);
          showToast(`Đã sao chép mã thưởng "${code}"!`);
        });
      });
    } else {
      recentWrap.hidden = true;
    }
  }
}

/* ────────────────────────────────────────────────────────────
   NHÓM 3 — GU UỐNG MẶC ĐỊNH (MY DRINK PREFERENCE)
   ──────────────────────────────────────────────────────────── */
function initDrinkPreferenceCard() {
  const card = document.getElementById("accountDrinkPrefCard");
  if (!card || typeof drinkPreferenceService === "undefined") return;

  const toggle = document.getElementById("prefEnabledToggle");
  const toggleLabel = document.getElementById("prefEnabledLabel");
  const noteInput = document.getElementById("prefDefaultNote");
  const previewEl = document.getElementById("drinkPrefPreview");
  const saveBtn = document.getElementById("saveDrinkPrefBtn");

  const draft = { ...drinkPreferenceService.getForCurrentUser() };

  function syncUi() {
    if (toggle) toggle.checked = Boolean(draft.enabled);
    if (toggleLabel) toggleLabel.textContent = draft.enabled ? "Đang bật" : "Đang tắt";
    card.querySelectorAll("[data-pref-size]").forEach((b) => {
      b.classList.toggle("isSelected", b.dataset.prefSize === draft.size);
    });
    card.querySelectorAll("[data-pref-sugar]").forEach((b) => {
      b.classList.toggle("isSelected", Number(b.dataset.prefSugar) === Number(draft.sugar));
    });
    card.querySelectorAll("[data-pref-ice]").forEach((b) => {
      b.classList.toggle("isSelected", Number(b.dataset.prefIce) === Number(draft.ice));
    });
    if (noteInput && noteInput.value !== draft.note) {
      noteInput.value = draft.note || "";
    }
    if (previewEl) {
      previewEl.textContent = drinkPreferenceService.getSummaryText(draft);
    }
  }

  syncUi();

  if (card.dataset.wired === "1") return;
  card.dataset.wired = "1";

  toggle?.addEventListener("change", () => {
    draft.enabled = toggle.checked;
    drinkPreferenceService.saveForCurrentUser(draft);
    syncUi();
    showToast(
      draft.enabled
        ? "Đã bật tự động chọn Gu uống mặc định!"
        : "Đã tắt tự động chọn Gu uống mặc định.",
    );
  });

  card.querySelectorAll("[data-pref-size]").forEach((btn) => {
    btn.addEventListener("click", () => {
      draft.size = btn.dataset.prefSize;
      syncUi();
    });
  });

  card.querySelectorAll("[data-pref-sugar]").forEach((btn) => {
    btn.addEventListener("click", () => {
      draft.sugar = Number(btn.dataset.prefSugar);
      syncUi();
    });
  });

  card.querySelectorAll("[data-pref-ice]").forEach((btn) => {
    btn.addEventListener("click", () => {
      draft.ice = Number(btn.dataset.prefIce);
      syncUi();
    });
  });

  noteInput?.addEventListener("input", () => {
    draft.note = noteInput.value.trim();
    if (previewEl) {
      previewEl.textContent = drinkPreferenceService.getSummaryText(draft);
    }
  });

  saveBtn?.addEventListener("click", () => {
    draft.enabled = true;
    draft.note = noteInput?.value?.trim() || "";
    drinkPreferenceService.saveForCurrentUser(draft);
    syncUi();
    showToast(`Đã lưu Gu uống mặc định: ${drinkPreferenceService.getSummaryText(draft)}`);
  });
}

/* ────────────────────────────────────────────────────────────
   NHÓM 3 — SỔ ĐỊA CHỈ GIAO HÀNG (SAVED ADDRESSES)
   ──────────────────────────────────────────────────────────── */
const ACCOUNT_FALLBACK_DIVISIONS = {
  1: [
    { code: 1, name: "Quận Ba Đình", wards: ["Phường Phúc Xá", "Phường Trúc Bạch", "Phường Liễu Giai", "Phường Kim Mã", "Phường Giảng Võ"] },
    { code: 2, name: "Quận Hoàn Kiếm", wards: ["Phường Hàng Trống", "Phường Tràng Tiền", "Phường Hàng Bông", "Phường Lý Thái Tổ"] },
    { code: 4, name: "Quận Cầu Giấy", wards: ["Phường Dịch Vọng", "Phường Yên Hòa", "Phường Trung Hòa", "Phường Mai Dịch"] },
    { code: 5, name: "Quận Đống Đa", wards: ["Phường Láng Thượng", "Phường Ô Chợ Dừa", "Phường Cát Linh", "Phường Trung Liệt"] },
  ],
  79: [
    { code: 760, name: "Quận 1", wards: ["Phường Bến Nghé", "Phường Bến Thành", "Phường Đa Kao", "Phường Tân Định"] },
    { code: 769, name: "Thành phố Thủ Đức", wards: ["Phường Thảo Điền", "Phường An Phú", "Phường Linh Trung"] },
    { code: 770, name: "Quận 3", wards: ["Phường Võ Thị Sáu", "Phường 1", "Phường 5", "Phường 9"] },
    { code: 772, name: "Quận Bình Thạnh", wards: ["Phường 1", "Phường 14", "Phường 19", "Phường 25"] },
  ],
  48: [
    { code: 490, name: "Quận Hải Châu", wards: ["Phường Hải Châu I", "Phường Thạch Thang", "Phường Thanh Bình"] },
    { code: 492, name: "Quận Sơn Trà", wards: ["Phường An Hải Bắc", "Phường Phước Mỹ", "Phường Mỹ An"] },
  ],
};

function renderAccountAddressList() {
  const listEl = document.getElementById("accountAddressList");
  const countEl = document.getElementById("accountAddressCount");
  if (!listEl || typeof addressBookService === "undefined") return;

  const addresses = addressBookService.getList();
  if (countEl) countEl.textContent = String(addresses.length);
  const tabAddrBadge = document.getElementById("accountTabAddrCount");
  if (tabAddrBadge) tabAddrBadge.textContent = String(addresses.length);

  if (!addresses.length) {
    listEl.innerHTML = `
      <div class="accountWishlistEmpty">
        <i class="fa-solid fa-map-location-dot" aria-hidden="true"></i>
        <p>Chưa có địa chỉ nào được lưu.</p>
        <span>Nhấn "Thêm địa chỉ" để lưu Nhà riêng hoặc Công ty cho lần thanh toán 1 chạm.</span>
      </div>
    `;
    return;
  }

  const esc =
    typeof escapeHtmlGlobal === "function"
      ? escapeHtmlGlobal
      : (v) => String(v ?? "");

  const labelIcons = {
    "Nhà riêng": "fa-house",
    "Công ty": "fa-briefcase",
    "Trường học": "fa-graduation-cap",
  };

  listEl.innerHTML = addresses
    .map((addr) => {
      const icon = labelIcons[addr.label] || "fa-location-dot";
      return `
        <article class="savedAddrCard${addr.isDefault ? " isDefault" : ""}" data-addr-id="${esc(addr.id)}">
          <div class="savedAddrHead">
            <div class="savedAddrTags">
              <span class="savedAddrLabelPill"><i class="fa-solid ${icon}" aria-hidden="true"></i> ${esc(addr.label)}</span>
              ${addr.isDefault ? '<span class="savedAddrDefaultTag">Mặc định</span>' : ""}
            </div>
            <div class="savedAddrBtns">
              ${
                !addr.isDefault
                  ? `<button type="button" class="savedAddrActionBtn" data-addr-default="${esc(addr.id)}">Đặt mặc định</button>`
                  : ""
              }
              <button type="button" class="savedAddrDeleteBtn" data-addr-delete="${esc(addr.id)}" aria-label="Xóa địa chỉ">
                <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <div class="savedAddrRecipient">
            <strong>${esc(addr.recipientName || "Khách hàng Koffia")}</strong>
            <span>·</span>
            <span>${esc(addr.phone || "—")}</span>
          </div>
          <p class="savedAddrFull">${esc(addressBookService.formatFullAddress(addr))}</p>
        </article>
      `;
    })
    .join("");

  listEl.querySelectorAll("[data-addr-default]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (addressBookService.setDefault(btn.dataset.addrDefault)) {
        showToast("Đã đặt làm địa chỉ giao hàng mặc định!");
      }
    });
  });

  listEl.querySelectorAll("[data-addr-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (addressBookService.remove(btn.dataset.addrDelete)) {
        showToast("Đã xóa địa chỉ khỏi sổ địa chỉ.");
      }
    });
  });
}

async function initAccountAddressBook(user) {
  const card = document.getElementById("accountAddressBookCard");
  if (!card || typeof addressBookService === "undefined") return;

  renderAccountAddressList();

  const toggleBtn = document.getElementById("toggleAddAddressBtn");
  const cancelBtn = document.getElementById("cancelAddAddressBtn");
  const form = document.getElementById("accountAddressForm");
  const provSelect = document.getElementById("addrProvince");
  const distSelect = document.getElementById("addrDistrict");
  const wardSelect = document.getElementById("addrWard");
  const recipInput = document.getElementById("addrRecipient");
  const phoneInput = document.getElementById("addrPhone");
  const streetInput = document.getElementById("addrStreet");
  const defaultCheck = document.getElementById("addrIsDefault");

  if (!form || form.dataset.wired === "1") return;
  form.dataset.wired = "1";

  let selectedLabel = "Nhà riêng";
  const districtsByProv = new Map();

  if (recipInput && !recipInput.value && user) {
    recipInput.value = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || "";
  }
  if (phoneInput && !phoneInput.value && user?.phone) {
    phoneInput.value = user.phone;
  }

  form.querySelectorAll("[data-addr-label]").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedLabel = btn.dataset.addrLabel || "Nhà riêng";
      form.querySelectorAll("[data-addr-label]").forEach((b) => {
        b.classList.toggle("isSelected", b === btn);
      });
    });
  });

  async function ensureProvincesLoaded() {
    if (!provSelect || provSelect.options.length > 1) return;
    let provinces = [];
    try {
      const res = await fetch("../json/vietnamProvinces.json");
      if (res.ok) provinces = await res.json();
    } catch {}
    if (!Array.isArray(provinces) || !provinces.length) {
      provinces = [
        { code: 1, name: "Thành phố Hà Nội" },
        { code: 79, name: "Thành phố Hồ Chí Minh" },
        { code: 48, name: "Thành phố Đà Nẵng" },
      ];
    }
    provSelect.innerHTML = '<option value="">-- Chọn Tỉnh / TP --</option>';
    provinces.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.code;
      opt.textContent = p.name;
      provSelect.appendChild(opt);
    });
  }

  toggleBtn?.addEventListener("click", async () => {
    form.hidden = !form.hidden;
    if (!form.hidden) {
      await ensureProvincesLoaded();
      recipInput?.focus();
    }
  });

  cancelBtn?.addEventListener("click", () => {
    form.hidden = true;
  });

  provSelect?.addEventListener("change", async () => {
    const code = provSelect.value;
    if (!code) {
      distSelect.innerHTML = '<option value="">-- Chọn Quận / Huyện --</option>';
      distSelect.disabled = true;
      wardSelect.innerHTML = '<option value="">-- Chọn Phường / Xã --</option>';
      wardSelect.disabled = true;
      return;
    }
    distSelect.innerHTML = '<option value="">Đang tải...</option>';
    distSelect.disabled = true;
    wardSelect.innerHTML = '<option value="">-- Chọn Phường / Xã --</option>';
    wardSelect.disabled = true;

    let districts = districtsByProv.get(code);
    if (!districts) {
      try {
        const res = await fetch(`https://provinces.open-api.vn/api/v1/p/${code}?depth=2`);
        if (res.ok) {
          const data = await res.json();
          districts = data.districts || [];
        }
      } catch {}
      if (!districts || !districts.length) {
        districts = ACCOUNT_FALLBACK_DIVISIONS[code] || [
          { code: Number(code) * 10 + 1, name: "Quận / Huyện Trung Tâm", wards: ["Phường Trung Tâm", "Phường 1", "Phường 2"] },
        ];
      }
      districtsByProv.set(code, districts);
    }

    distSelect.innerHTML = '<option value="">-- Chọn Quận / Huyện --</option>';
    districts.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d.code;
      opt.textContent = d.name;
      distSelect.appendChild(opt);
    });
    distSelect.disabled = false;
  });

  distSelect?.addEventListener("change", async () => {
    const dCode = distSelect.value;
    if (!dCode) {
      wardSelect.innerHTML = '<option value="">-- Chọn Phường / Xã --</option>';
      wardSelect.disabled = true;
      return;
    }
    wardSelect.innerHTML = '<option value="">Đang tải...</option>';
    wardSelect.disabled = true;

    let wards = [];
    try {
      const res = await fetch(`https://provinces.open-api.vn/api/v1/d/${dCode}?depth=2`);
      if (res.ok) {
        const data = await res.json();
        wards = data.wards || [];
      }
    } catch {}
    if (!wards.length) {
      const list = districtsByProv.get(provSelect.value) || [];
      const found = list.find((d) => String(d.code) === String(dCode));
      if (found?.wards?.length) {
        wards = found.wards.map((w, i) => (typeof w === "string" ? { code: i + 1, name: w } : w));
      } else {
        wards = [
          { code: 1, name: "Phường Trung Tâm" },
          { code: 2, name: "Phường 1" },
        ];
      }
    }

    wardSelect.innerHTML = '<option value="">-- Chọn Phường / Xã --</option>';
    wards.forEach((w) => {
      const opt = document.createElement("option");
      opt.value = w.code;
      opt.textContent = w.name;
      wardSelect.appendChild(opt);
    });
    wardSelect.disabled = false;
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const recipientName = recipInput?.value?.trim() || "";
    const phone = phoneInput?.value?.trim() || "";
    const street = streetInput?.value?.trim() || "";
    const provinceCode = provSelect?.value || "";
    const districtCode = distSelect?.value || "";
    const wardCode = wardSelect?.value || "";

    if (!recipientName || !phone || !provinceCode || !districtCode || !wardCode || !street) {
      showToast("Vui lòng điền đầy đủ thông tin địa chỉ.", "error");
      return;
    }

    addressBookService.add({
      label: selectedLabel,
      recipientName,
      phone,
      provinceCode,
      provinceName: provSelect.selectedOptions[0]?.textContent || "",
      districtCode,
      districtName: distSelect.selectedOptions[0]?.textContent || "",
      wardCode,
      wardName: wardSelect.selectedOptions[0]?.textContent || "",
      street,
      isDefault: Boolean(defaultCheck?.checked),
    });

    streetInput.value = "";
    form.hidden = true;
    showToast(`Đã lưu địa chỉ "${selectedLabel}" vào Sổ địa chỉ!`);
  });
}
