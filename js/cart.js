"use strict";

function orderEscape(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

async function hydrateOrderCartImages(list) {
  if (
    !list ||
    typeof productImageService === "undefined" ||
    typeof productCatalogService === "undefined"
  )
    return;
  const imageNodes = [
    ...list.querySelectorAll(".orderCartImg[data-cart-line-id]"),
  ];
  if (!imageNodes.length) return;

  let storageChanged = false;
  await Promise.all(
    imageNodes.map(async (img) => {
      const item = cartState.items.find(
        (entry) => entry.id === img.dataset.cartLineId,
      );
      if (!item) return;

      const cover = await productCatalogService.resolveItemCover(item);
      if (!cover || !img.isConnected) return;

      const absoluteCover = new URL(cover, window.location.href).href;
      img.src = absoluteCover;
      if (item.img !== absoluteCover || !item.productId) {
        item.img = absoluteCover;
        item.productId = productCatalogService.getBaseProductId(item);
        storageChanged = true;
      }
    }),
  );

  if (storageChanged) cartState.saveToStorage();
}

let currentAppliedVoucher = null;
let isApplyingPendingVoucher = false;

function syncAppliedVoucherFromSession() {
  try {
    const savedV = sessionStorage.getItem("koffia_applied_voucher");
    currentAppliedVoucher = savedV ? JSON.parse(savedV) : null;
  } catch (e) {
    currentAppliedVoucher = null;
  }
}

syncAppliedVoucherFromSession();

async function tryApplyPendingVoucher() {
  if (isApplyingPendingVoucher) return;
  if (!cartState.items.length || currentAppliedVoucher) return;
  let pendingCode = "";
  try {
    pendingCode = sessionStorage.getItem("koffia_pending_voucher_code") || "";
  } catch (e) {}
  if (!pendingCode || typeof voucherService === "undefined") return;

  isApplyingPendingVoucher = true;
  try {
    sessionStorage.removeItem("koffia_pending_voucher_code");
    const user = customerService.getCurrentUser();
    const subtotal = cartState.getTotal();
    const validation = await voucherService.validateVoucher(
      pendingCode,
      cartState.items,
      subtotal,
      user,
    );
    if (validation.valid && validation.voucher) {
      currentAppliedVoucher = validation.voucher;
      sessionStorage.setItem(
        "koffia_applied_voucher",
        JSON.stringify(currentAppliedVoucher),
      );
      if (typeof showToast === "function") {
        showToast(`Đã tự động áp dụng mã "${pendingCode}" cho đơn của bạn!`);
      }
      renderOrderCart();
    } else {
      const input = document.getElementById("cartVoucherInput");
      if (input && !input.value) input.value = pendingCode;
      if (typeof showToast === "function") {
        showToast(
          `Mã "${pendingCode}": ${validation.message || "Chưa đủ điều kiện áp dụng."}`,
          "error",
          3600,
        );
      }
    }
  } finally {
    isApplyingPendingVoucher = false;
  }
}

function renderOrderCart() {
  syncAppliedVoucherFromSession();
  const list = document.getElementById("orderCartList");
  const empty = document.getElementById("orderCartEmpty");
  const layout = document.getElementById("orderLayout");
  const summary = document.getElementById("orderSummary");
  const voucherBox = document.getElementById("cartVoucherBox");
  const proceedBtn = document.getElementById("proceedCheckoutBtn");
  const totalEl = document.getElementById("orderTotal");
  const subtotalEl = document.getElementById("orderSubtotal");
  const countEl = document.getElementById("orderItemCount");
  const headerQtyEl = document.getElementById("cartHeaderQty");
  const voucherDiscountRow = document.getElementById("orderVoucherDiscountRow");
  const voucherDiscountEl = document.getElementById("orderVoucherDiscount");
  const shippingFeeEl = document.getElementById("orderShippingFee");
  const appliedVoucherTag = document.getElementById("appliedVoucherTag");
  const appliedVoucherLabel = document.getElementById("appliedVoucherLabel");
  if (!list) return;

  const items = cartState.items;
  if (!items.length) {
    list.innerHTML = "";
    if (empty) empty.hidden = false;
    if (layout) layout.hidden = true;
    const upsellSec = document.getElementById("cartUpsellSection");
    if (upsellSec) upsellSec.hidden = true;
    currentAppliedVoucher = null;
    sessionStorage.removeItem("koffia_applied_voucher");
    return;
  }

  if (empty) empty.hidden = true;
  if (layout) layout.hidden = false;
  if (summary) summary.hidden = false;
  if (voucherBox) voucherBox.style.display = "flex";

  const subtotal = cartState.getTotal();
  const totalQty = cartState.getTotalQty();
  if (subtotalEl) subtotalEl.textContent = formatPrice(subtotal);
  if (countEl) countEl.textContent = totalQty;
  if (headerQtyEl) headerQtyEl.textContent = totalQty;

  // Validate or recompute applied voucher
  let voucherDiscount = 0;
  let isFreeShip = false;
  const user = customerService.getCurrentUser();

  if (currentAppliedVoucher) {
    if (subtotal < (currentAppliedVoucher.minOrderValue || 0)) {
      if (typeof showToast === "function") {
        showToast(
          `Đơn hàng dưới ${formatPrice(currentAppliedVoucher.minOrderValue)} nên mã ${currentAppliedVoucher.code} đã tự động gỡ.`,
          "error",
        );
      }
      currentAppliedVoucher = null;
      sessionStorage.removeItem("koffia_applied_voucher");
      voucherDiscount = 0;
      isFreeShip = false;
    } else if (
      typeof voucherService !== "undefined" &&
      typeof voucherService.computeDiscount === "function"
    ) {
      const res = voucherService.computeDiscount(
        currentAppliedVoucher,
        items,
        subtotal,
      );
      voucherDiscount = res.discount;
      isFreeShip = res.isFreeShip;
      sessionStorage.setItem("koffia_applied_voucher", JSON.stringify(currentAppliedVoucher));
    } else {
      if (currentAppliedVoucher.type === "percent") {
        voucherDiscount = Math.round(
          (subtotal * currentAppliedVoucher.value) / 100,
        );
        if (
          currentAppliedVoucher.maxDiscount &&
          voucherDiscount > currentAppliedVoucher.maxDiscount
        ) {
          voucherDiscount = currentAppliedVoucher.maxDiscount;
        }
      } else if (currentAppliedVoucher.type === "fixed") {
        voucherDiscount = Math.min(currentAppliedVoucher.value, subtotal);
      } else if (currentAppliedVoucher.type === "freeShip") {
        isFreeShip = true;
      }
      sessionStorage.setItem("koffia_applied_voucher", JSON.stringify(currentAppliedVoucher));
    }
  }

  // Update voucher UI
  if (currentAppliedVoucher) {
    if (appliedVoucherTag) appliedVoucherTag.style.display = "flex";
    if (appliedVoucherLabel) {
      appliedVoucherLabel.textContent = `Đang áp dụng: ${currentAppliedVoucher.code} (${currentAppliedVoucher.name})`;
    }
  } else {
    if (appliedVoucherTag) appliedVoucherTag.style.display = "none";
  }

  // Shipping fee (Freeship đơn từ 50.000đ hoặc dùng voucher Freeship)
  const freeshipThreshold =
    typeof KOFFIA_FREESHIP_THRESHOLD !== "undefined"
      ? KOFFIA_FREESHIP_THRESHOLD
      : 50000;
  const BASE_SHIPPING =
    typeof KOFFIA_BASE_SHIPPING_FEE !== "undefined"
      ? KOFFIA_BASE_SHIPPING_FEE
      : 15000;
  let shippingFee =
    subtotal >= freeshipThreshold || isFreeShip ? 0 : BASE_SHIPPING;

  const freeshipHost = document.getElementById("cartPageFreeship");
  if (freeshipHost && typeof buildFreeshipProgressHtml === "function") {
    freeshipHost.innerHTML = buildFreeshipProgressHtml(subtotal, isFreeShip);
  }

  if (voucherDiscountRow && voucherDiscountEl) {
    if (voucherDiscount > 0) {
      voucherDiscountRow.style.display = "flex";
      voucherDiscountEl.textContent = `-${formatPrice(voucherDiscount)}`;
    } else {
      voucherDiscountRow.style.display = "none";
    }
  }

  if (shippingFeeEl) {
    shippingFeeEl.textContent =
      shippingFee === 0 ? "Miễn phí" : formatPrice(shippingFee);
  }

  const finalTotal = Math.max(0, subtotal - voucherDiscount + shippingFee);
  if (totalEl) totalEl.textContent = formatPrice(finalTotal);

  list.innerHTML = items
    .map(
      (item) => {
        const customs = [];
        if (item.size) customs.push(`Size ${item.size}`);
        if (item.ice) customs.push(item.ice);
        if (item.sugar) customs.push(item.sugar);
        if (item.toppings && item.toppings.length) customs.push(item.toppings.join(", "));

        return `
      <article class="orderCartItem" data-id="${orderEscape(item.id)}">
        <img class="orderCartImg" src="${orderEscape(item.img || (typeof defaultProductImageDataUri !== 'undefined' ? defaultProductImageDataUri : ''))}" alt="${orderEscape(item.name)}"
          data-cart-line-id="${orderEscape(item.id)}" data-product-id="${orderEscape(item.productId || productCatalogService.getBaseProductId(item))}" />
        <div class="orderCartInfo">
          <h3>${orderEscape(item.name)}</h3>
          <p>${formatPrice(item.price)}</p>
          ${customs.length ? `<div class="orderCartCustoms">${customs.join(" • ")}</div>` : ""}
          ${item.note ? `<div class="orderCartNote"><i class="fa-regular fa-note-sticky" aria-hidden="true"></i> ${orderEscape(item.note)}</div>` : ""}
          <div class="orderQtyControl" aria-label="Số lượng">
            <button type="button" data-order-qty="-1" data-id="${orderEscape(item.id)}" title="Giảm 1">−</button>
            <span>${item.qty}</span>
            <button type="button" data-order-qty="1" data-id="${orderEscape(item.id)}" title="Tăng 1">+</button>
          </div>
        </div>
        <div class="orderCartRight">
          <strong>${formatPrice(item.price * item.qty)}</strong>
          <button type="button" class="orderRemoveBtn" data-order-remove="${orderEscape(item.id)}"><i class="fa-solid fa-trash"></i> Xóa</button>
        </div>
      </article>`;
      },
    )
    .join("");

  hydrateOrderCartImages(list);

  list.querySelectorAll(".orderCartImg").forEach((img) => {
    img.addEventListener(
      "error",
      () => {
        img.style.display = "none";
        img.insertAdjacentHTML(
          "afterend",
          '<div class="orderCartImg orderCartImgFallback" aria-hidden="true"><i class="fa-solid fa-glass-water"></i></div>',
        );
      },
      { once: true },
    );
  });

  list.querySelectorAll("[data-order-qty]").forEach((button) => {
    button.addEventListener("click", () => {
      cartState.changeQty(button.dataset.id, Number(button.dataset.orderQty));
      renderOrderCart();
    });
  });

  list.querySelectorAll("[data-order-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      cartState.removeItem(button.dataset.orderRemove);
      renderOrderCart();
    });
  });

  renderCartUpsell(subtotal, shippingFee === 0);
  if (!currentAppliedVoucher) {
    tryApplyPendingVoucher();
  }
}

let cartUpsellRenderSeq = 0;

async function renderCartUpsell(subtotal, isFreeShip) {
  const section = document.getElementById("cartUpsellSection");
  const grid = document.getElementById("cartUpsellGrid");
  const headingText = document.getElementById("cartUpsellHeadingText");
  const subtitle = document.getElementById("cartUpsellSubtitle");
  const badge = document.getElementById("cartUpsellBadge");
  if (!section || !grid || typeof productCatalogService === "undefined") return;

  if (!cartState.items.length) {
    section.hidden = true;
    return;
  }

  const seq = ++cartUpsellRenderSeq;
  const threshold =
    typeof KOFFIA_FREESHIP_THRESHOLD !== "undefined"
      ? KOFFIA_FREESHIP_THRESHOLD
      : 50000;
  const remaining = Math.max(0, threshold - Number(subtotal || 0));

  const productMap = await productCatalogService.getProductMap();
  if (seq !== cartUpsellRenderSeq || !grid.isConnected) return;

  const inCartBaseIds = new Set(
    cartState.items.map((item) =>
      String(item.productId || productCatalogService.getBaseProductId(item) || ""),
    ),
  );

  const candidates = [...productMap.values()].filter(
    (p) =>
      p &&
      p.isAvailable !== false &&
      Number(p.price) > 0 &&
      !inCartBaseIds.has(String(p.id)),
  );

  if (!candidates.length) {
    section.hidden = true;
    return;
  }

  let picks = [];
  if (!isFreeShip && remaining > 0) {
    // Ưu tiên món gọn tiền <= 39.000đ hoặc vừa khít để mở khóa Freeship 50K chỉ với 1 ly
    const affordable = candidates.filter(
      (p) => Number(p.price) <= Math.max(remaining + 15000, 39000),
    );
    const pool = affordable.length >= 4 ? affordable : candidates;
    picks = pool
      .slice()
      .sort((a, b) => {
        const aBridges = Number(a.price) >= remaining ? 0 : 1;
        const bBridges = Number(b.price) >= remaining ? 0 : 1;
        if (aBridges !== bBridges) return aBridges - bBridges;
        const aGap = Math.abs(Number(a.price) - remaining);
        const bGap = Math.abs(Number(b.price) - remaining);
        if (aGap !== bGap) return aGap - bGap;
        return (Number(b.soldCount) || 0) - (Number(a.soldCount) || 0);
      })
      .slice(0, 4);

    if (headingText)
      headingText.textContent = "Mua thêm để nhận Freeship 50K";
    if (subtitle)
      subtitle.textContent = `Thêm chỉ từ ${formatPrice(remaining)} nữa là đơn của bạn được miễn phí giao hàng.`;
    if (badge) {
      badge.textContent = `Còn thiếu ${formatPrice(remaining)}`;
      badge.classList.remove("isUnlocked");
    }
  } else {
    picks = candidates
      .slice()
      .sort((a, b) => (Number(b.soldCount) || 0) - (Number(a.soldCount) || 0))
      .slice(0, 4);

    if (headingText) headingText.textContent = "Thường được đặt kèm";
    if (subtitle)
      subtitle.textContent =
        "Đơn hàng của bạn đã đạt Freeship — chọn thêm món bán chạy nếu muốn thưởng thức thêm nhé!";
    if (badge) {
      badge.textContent = "Đã đạt Freeship";
      badge.classList.add("isUnlocked");
    }
  }

  const categoryLabels = {
    coffee: "Cà Phê",
    "milk-tea": "Trà Sữa",
    "fruit-tea": "Trà Hoa Quả",
    "juice-smoothie": "Nước Ép",
    "matcha-cacao": "Matcha & Cacao",
    special: "Đặc Biệt",
  };

  grid.innerHTML = picks
    .map((p) => {
      const catLabel = categoryLabels[p.category] || "Đồ Uống";
      const stats =
        typeof productReviewService !== "undefined"
          ? productReviewService.getMergedRatingStats(p)
          : { average: 4.9 };
      return `
        <article class="iosMiniCard" role="listitem" data-upsell-id="${orderEscape(p.id)}">
          <a href="product.html?id=${encodeURIComponent(p.id)}" class="iosMiniMedia">
            <img class="iosMiniImg" src="${orderEscape(typeof defaultProductImageDataUri !== "undefined" ? defaultProductImageDataUri : "")}" data-upsell-img="${orderEscape(p.id)}" alt="${orderEscape(p.name)}" loading="lazy" />
          </a>
          <div class="iosMiniBody">
            <span class="iosMiniCat">${orderEscape(catLabel)}</span>
            <a href="product.html?id=${encodeURIComponent(p.id)}" class="iosMiniName">${orderEscape(p.name)}</a>
            <div class="iosMiniBottom">
              <div>
                <div class="iosMiniPrice">${formatPrice(p.price)}</div>
                <div class="iosMiniRating"><i class="fa-solid fa-star" aria-hidden="true"></i> ${stats.average ? stats.average.toFixed(1) : "5.0"}</div>
              </div>
              <button type="button" class="iosMiniAddBtn" data-upsell-add="${orderEscape(p.id)}" aria-label="Thêm ${orderEscape(p.name)} vào giỏ">
                <i class="fa-solid fa-plus" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  section.hidden = false;

  if (typeof productImageService !== "undefined") {
    const imgs = [...grid.querySelectorAll("[data-upsell-img]")];
    await Promise.all(
      imgs.map(async (img) => {
        const prod = picks.find((p) => p.id === img.dataset.upsellImg);
        if (!prod) return;
        const cover = await productImageService.resolveCoverImage(prod, "../");
        if (cover && img.isConnected && seq === cartUpsellRenderSeq) {
          img.src = new URL(cover, window.location.href).href;
        }
      }),
    );
  }

  grid.querySelectorAll("[data-upsell-add]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const prod = picks.find((p) => p.id === btn.dataset.upsellAdd);
      if (!prod) return;
      let coverUrl = "";
      if (typeof productImageService !== "undefined") {
        const cover = await productImageService.resolveCoverImage(prod, "../");
        if (cover) coverUrl = new URL(cover, window.location.href).href;
      }
      cartState.addItem({
        id: prod.id,
        productId: prod.id,
        category: prod.category || "",
        sellerId: prod.sellerId || "",
        name: prod.name,
        price: Number(prod.price) || 0,
        img: coverUrl,
      });
    });
  });
}

function wireVoucherControls() {
  const applyBtn = document.getElementById("applyVoucherBtn");
  const input = document.getElementById("cartVoucherInput");
  const removeBtn = document.getElementById("removeVoucherBtn");
  const openModalBtn = document.getElementById("openVoucherPickerBtn");
  const modal = document.getElementById("voucherModal");
  const overlay = document.getElementById("voucherModalOverlay");
  const closeModalBtn = document.getElementById("closeVoucherModalBtn");
  const modalList = document.getElementById("voucherModalList");

  if (!applyBtn && !openModalBtn) return;
  if (applyBtn?.dataset.wired === "1") return;
  if (applyBtn) applyBtn.dataset.wired = "1";

  async function applyCode(code) {
    if (!code) {
      if (typeof showToast === "function") showToast("Vui lòng nhập mã voucher.", "error");
      return;
    }
    const user = customerService.getCurrentUser();
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

    currentAppliedVoucher = validation.voucher;
    sessionStorage.setItem("koffia_applied_voucher", JSON.stringify(currentAppliedVoucher));
    if (typeof showToast === "function") showToast(validation.message);
    if (input) input.value = "";
    if (modal) modal.style.display = "none";
    renderOrderCart();
  }

  applyBtn?.addEventListener("click", () => {
    applyCode(input?.value?.trim());
  });

  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyCode(input.value.trim());
    }
  });

  removeBtn?.addEventListener("click", () => {
    currentAppliedVoucher = null;
    sessionStorage.removeItem("koffia_applied_voucher");
    if (typeof showToast === "function") showToast("Đã hủy áp dụng voucher.");
    renderOrderCart();
  });

  openModalBtn?.addEventListener("click", async () => {
    if (!modal || !modalList) return;
    modalList.innerHTML =
      '<div style="text-align:center;padding:20px;">Đang kiểm tra voucher phù hợp...</div>';
    modal.style.display = "flex";

    const user = customerService.getCurrentUser();
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
    const activeCode = (currentAppliedVoucher?.code || "").toUpperCase();

    const renderVoucherRow = (entry) => {
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
              <span class="modalVoucherCode">${orderEscape(v.code)}</span>
              ${v.isRewardVoucher ? '<span class="voucherRewardTag">Rewards</span>' : ""}
              ${isApplied ? '<span class="modalVoucherActiveBadge">Đang chọn</span>' : ""}
            </div>
            <strong>${orderEscape(v.name)}</strong>
            <div class="modalVoucherDesc">${orderEscape(v.description || "")}${v.minOrderValue ? ` · Đơn từ ${formatPrice(v.minOrderValue)}` : ""}</div>
            ${
              entry.valid
                ? `<div class="modalVoucherSavings"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> ${orderEscape(savingsText)}</div>`
                : `<div class="modalVoucherReason"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${orderEscape(entry.reason || "Chưa đủ điều kiện")}</div>`
            }
          </div>
          <button
            type="button"
            class="${entry.valid ? (isApplied ? "btnSecondary" : "btnPrimary") : "btnSecondary"} modalVoucherApplyBtn"
            ${entry.valid && !isApplied ? `data-modal-apply="${orderEscape(v.code)}"` : "disabled"}
          >
            ${isApplied ? "Đang dùng" : entry.valid ? "Áp dụng" : "Chưa đủ ĐK"}
          </button>
        </div>
      `;
    };

    let html = "";
    if (eligible.length) {
      html += `<div class="modalVoucherSectionLabel">Khả dụng cho đơn này (${eligible.length})</div>`;
      html += eligible.map(renderVoucherRow).join("");
    } else {
      html +=
        '<div class="modalVoucherEmptyHint">Chưa có voucher nào đủ điều kiện cho giỏ hiện tại — hãy xem gợi ý bên dưới nhé.</div>';
    }
    if (ineligible.length) {
      html += `<div class="modalVoucherSectionLabel isMuted">Chưa đủ điều kiện (${ineligible.length})</div>`;
      html += ineligible.map(renderVoucherRow).join("");
    }

    modalList.innerHTML = html;

    modalList.querySelectorAll("[data-modal-apply]").forEach((btn) => {
      btn.addEventListener("click", () => {
        applyCode(btn.dataset.modalApply);
      });
    });
  });

  closeModalBtn?.addEventListener("click", () => {
    if (modal) modal.style.display = "none";
  });

  overlay?.addEventListener("click", () => {
    if (modal) modal.style.display = "none";
  });
}

function wireClearCartButton() {
  const clearBtn = document.getElementById("clearCartBtn");
  if (!clearBtn) return;

  const doClear = () => {
    cartState.clearCurrentUserCart();
    currentAppliedVoucher = null;
    sessionStorage.removeItem("koffia_applied_voucher");
    renderOrderCart();
    if (typeof showToast === "function") showToast("Đã làm trống giỏ hàng.");
  };

  if (typeof wireTwoTapConfirm === "function") {
    wireTwoTapConfirm(clearBtn, {
      guard: () => cartState.items.length > 0,
      confirmHtml:
        '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Xác nhận xóa?',
      onConfirm: doClear,
    });
  } else if (clearBtn.dataset.wired !== "1") {
    clearBtn.dataset.wired = "1";
    clearBtn.addEventListener("click", () => {
      if (cartState.items.length > 0) doClear();
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Yêu cầu đăng nhập trước khi xem giỏ hàng
  if (!customerService.getCurrentUser()) {
    requireAuthenticatedUser("xem giỏ hàng");
    return;
  }
  cartState.loadForCurrentUser();
  renderOrderCart();
  wireVoucherControls();
  wireClearCartButton();
});

if (!window._cartPageSyncBound) {
  window._cartPageSyncBound = true;
  window.addEventListener("koffia:cart-changed", () => {
    if (document.getElementById("orderCartList")) {
      renderOrderCart();
    }
  });
}
