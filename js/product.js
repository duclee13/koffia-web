"use strict";

/* ────────────────────────────────────────────────────────────
   CONFIG
   ──────────────────────────────────────────────────────────── */
const PRODUCTS_JSON_URL = "../json/products.json";
const CART_REDIRECT_URL = "cart.html"; // Trang giỏ hàng / checkout — tạo thêm nếu chưa có
const GALLERY_AUTOPLAY_MS = 4200;

const CATEGORY_META = {
  coffee: {
    label: "Cà phê",
    icon: '<i class="fa-solid fa-mug-hot" aria-hidden="true"></i>',
  },
  tea: {
    label: "Trà",
    icon: '<i class="fa-solid fa-mug-saucer" aria-hidden="true"></i>',
  },
  "milk-tea": {
    label: "Trà sữa",
    icon: '<i class="fa-solid fa-glass-water" aria-hidden="true"></i>',
  },
  juice: {
    label: "Nước ép",
    icon: '<i class="fa-solid fa-lemon" aria-hidden="true"></i>',
  },
  smoothie: {
    label: "Sinh tố",
    icon: '<i class="fa-solid fa-glass-water" aria-hidden="true"></i>',
  },
  yogurt: {
    label: "Sữa chua",
    icon: '<i class="fa-solid fa-ice-cream" aria-hidden="true"></i>',
  },
  soda: {
    label: "Soda",
    icon: '<i class="fa-solid fa-champagne-glasses" aria-hidden="true"></i>',
  },
  kombucha: {
    label: "Kombucha",
    icon: '<i class="fa-solid fa-bottle-droplet" aria-hidden="true"></i>',
  },
  other: {
    label: "Khác",
    icon: '<i class="fa-solid fa-martini-glass-citrus" aria-hidden="true"></i>',
  },
};

/* ────────────────────────────────────────────────────────────
   STATE
   ──────────────────────────────────────────────────────────── */
const productDetailState = {
  product: null,
  flashSale: null,
  flashTimer: null,
  images: [],
  activeImageIdx: 0,
  selectedSizeCode: null,
  selectedSugar: null,
  selectedIce: null,
  selectedToppingIds: new Set(),
  note: "",
  quantity: 1,
  galleryTimer: null,
};

/* Cached DOM refs — gán trong initProductDetailPage() */
let elSkeleton, elNotFound, elContent;
let elMainImgPlaceholder, elBadgesWrap, elThumbRow;
let elSliderTrack, elSliderViewport, elPrevBtn, elNextBtn, elSliderDots;
let elCategory,
  elName,
  elMetaRow,
  elPriceMain,
  elPriceOld,
  elDiscountTag,
  elPriceHint,
  elDesc;
let elSizeGroup,
  elSizeChips,
  elSugarGroup,
  elSugarChips,
  elIceGroup,
  elIceChips;
let elToppingGroup, elToppingList, elQtyValue, elQtyDecBtn, elQtyIncBtn;
let elAddToCartBtn, elBuyNowBtn, elBreadcrumbCurrent, elPageTitle, elSellerCard;

/* ────────────────────────────────────────────────────────────
   UTILITIES
   ──────────────────────────────────────────────────────────── */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function getCategoryMeta(categoryKey) {
  return (
    CATEGORY_META[categoryKey] || {
      label: categoryKey,
      icon: '<i class="fa-solid fa-martini-glass-citrus" aria-hidden="true"></i>',
    }
  );
}

function formatSoldCount(count) {
  if (!count) return null;
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(count);
}

function computeRatingStats(ratings) {
  if (!ratings) return { average: 0, total: 0 };
  let weightedSum = 0;
  let total = 0;
  Object.entries(ratings).forEach(([star, count]) => {
    weightedSum += Number(star) * count;
    total += count;
  });
  return { average: total ? weightedSum / total : 0, total };
}

function computeDiscountPercent(price, originalPrice) {
  if (!originalPrice || originalPrice <= price) return 0;
  return Math.round((1 - price / originalPrice) * 100);
}

function getIdFromUrl() {
  return new URLSearchParams(window.location.search).get("id");
}

/* ────────────────────────────────────────────────────────────
   FETCH
   ──────────────────────────────────────────────────────────── */
async function fetchAllProducts() {
  const response = await fetch(PRODUCTS_JSON_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data))
    throw new Error("Định dạng products.json không hợp lệ.");
  const customList =
    typeof productCatalogService !== "undefined" &&
    typeof productCatalogService.getCustomProducts === "function"
      ? productCatalogService.getCustomProducts()
      : [];
  const seenIds = new Set();
  const merged = [];
  [...customList, ...data].forEach((p) => {
    if (!p || !p.id || seenIds.has(p.id)) return;
    seenIds.add(p.id);
    merged.push(p);
  });
  return merged;
}

/* ────────────────────────────────────────────────────────────
   RENDER — Gallery
   ──────────────────────────────────────────────────────────── */
function stopGalleryAutoplay() {
  if (productDetailState.galleryTimer) {
    clearInterval(productDetailState.galleryTimer);
    productDetailState.galleryTimer = null;
  }
}

function startGalleryAutoplay() {
  stopGalleryAutoplay();
  if (productDetailState.images.length < 2 || document.hidden) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  productDetailState.galleryTimer = window.setInterval(() => {
    setMainImage(productDetailState.activeImageIdx + 1, {
      restartAutoplay: false,
    });
  }, GALLERY_AUTOPLAY_MS);
}

function restartGalleryAutoplay() {
  stopGalleryAutoplay();
  startGalleryAutoplay();
}

function updateGalleryControls() {
  const activeIndex = productDetailState.activeImageIdx;

  elThumbRow?.querySelectorAll(".productThumbBtn").forEach((button) => {
    button.classList.toggle(
      "productThumbActive",
      Number(button.dataset.imgIndex) === activeIndex,
    );
    button.setAttribute(
      "aria-current",
      Number(button.dataset.imgIndex) === activeIndex ? "true" : "false",
    );
  });

  elSliderTrack?.querySelectorAll(".productSlide").forEach((slide, index) => {
    slide.setAttribute("aria-hidden", index === activeIndex ? "false" : "true");
  });

  elSliderDots?.querySelectorAll(".productSliderDot").forEach((dot) => {
    dot.classList.toggle(
      "productSliderDotActive",
      Number(dot.dataset.imgIndex) === activeIndex,
    );
    dot.setAttribute(
      "aria-current",
      Number(dot.dataset.imgIndex) === activeIndex ? "true" : "false",
    );
  });
}

function setMainImage(index, { restartAutoplay = true } = {}) {
  const imageCount = productDetailState.images.length;
  if (!imageCount || !elSliderTrack) return;

  const normalizedIndex = ((index % imageCount) + imageCount) % imageCount;
  productDetailState.activeImageIdx = normalizedIndex;
  elSliderTrack.style.transform = `translate3d(-${normalizedIndex * 100}%, 0, 0)`;
  updateGalleryControls();

  if (restartAutoplay) restartGalleryAutoplay();
}

function wireGalleryInteractions() {
  if (!elSliderViewport) return;

  elPrevBtn?.addEventListener("click", () =>
    setMainImage(productDetailState.activeImageIdx - 1),
  );
  elNextBtn?.addEventListener("click", () =>
    setMainImage(productDetailState.activeImageIdx + 1),
  );

  elThumbRow?.querySelectorAll(".productThumbBtn").forEach((button) => {
    button.addEventListener("click", () =>
      setMainImage(Number(button.dataset.imgIndex)),
    );
  });

  elSliderDots?.querySelectorAll(".productSliderDot").forEach((dot) => {
    dot.addEventListener("click", () =>
      setMainImage(Number(dot.dataset.imgIndex)),
    );
  });

  // Tạm dừng khi người dùng đang xem/điều khiển gallery.
  elSliderViewport.addEventListener("mouseenter", stopGalleryAutoplay);
  elSliderViewport.addEventListener("mouseleave", startGalleryAutoplay);
  elSliderViewport.addEventListener("focusin", stopGalleryAutoplay);
  elSliderViewport.addEventListener("focusout", startGalleryAutoplay);

  // Điều khiển bằng bàn phím khi focus vào khu vực ảnh.
  elSliderViewport.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setMainImage(productDetailState.activeImageIdx - 1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setMainImage(productDetailState.activeImageIdx + 1);
    }
  });

  // Swipe đơn giản cho mobile/tablet.
  let pointerStartX = null;
  elSliderViewport.addEventListener("pointerdown", (event) => {
    pointerStartX = event.clientX;
    stopGalleryAutoplay();
  });
  elSliderViewport.addEventListener("pointerup", (event) => {
    if (pointerStartX === null) return;
    const deltaX = event.clientX - pointerStartX;
    pointerStartX = null;
    if (Math.abs(deltaX) > 42) {
      setMainImage(productDetailState.activeImageIdx + (deltaX < 0 ? 1 : -1));
    } else {
      startGalleryAutoplay();
    }
  });
  elSliderViewport.addEventListener("pointercancel", () => {
    pointerStartX = null;
    startGalleryAutoplay();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopGalleryAutoplay();
    else startGalleryAutoplay();
  });
}

function renderGallery(product, images) {
  productDetailState.images = images;
  productDetailState.activeImageIdx = 0;
  stopGalleryAutoplay();

  const discountPct = computeDiscountPercent(
    product.price,
    product.originalPrice,
  );
  elBadgesWrap.innerHTML = `
    ${product.isBestSeller ? `<span class="productDetailBadge badgeBestSeller"><i class="fa-solid fa-fire"></i> Bán chạy</span>` : ""}
    ${discountPct > 0 ? `<span class="productDetailBadge badgeSale">-${discountPct}%</span>` : ""}
  `.trim();

  if (images.length === 0) {
    elSliderViewport.style.display = "none";
    elMainImgPlaceholder.style.display = "flex";
    elMainImgPlaceholder.innerHTML = getCategoryMeta(product.category).icon;
    elThumbRow.innerHTML = "";
    elSliderDots.innerHTML = "";
    if (elPrevBtn) elPrevBtn.style.display = "none";
    if (elNextBtn) elNextBtn.style.display = "none";
    return;
  }

  elSliderViewport.style.display = "";
  elMainImgPlaceholder.style.display = "none";

  elSliderTrack.innerHTML = images
    .map(
      (src, index) => `
    <figure class="productSlide" aria-hidden="${index === 0 ? "false" : "true"}">
      <img class="productSlideImg" src="${src}" alt="${escapeHtml(product.name)} — ảnh ${index + 1}" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} />
    </figure>
  `,
    )
    .join("");

  elThumbRow.innerHTML = images
    .map(
      (src, index) => `
    <button type="button" class="productThumbBtn${index === 0 ? " productThumbActive" : ""}"
            data-img-index="${index}" role="listitem" aria-label="Xem ảnh ${index + 1}"
            aria-current="${index === 0 ? "true" : "false"}">
      <img src="${src}" alt="" loading="lazy" />
    </button>
  `,
    )
    .join("");

  elSliderDots.innerHTML = images
    .map(
      (_, index) => `
    <button type="button" class="productSliderDot${index === 0 ? " productSliderDotActive" : ""}"
            data-img-index="${index}" aria-label="Chuyển đến ảnh ${index + 1}"
            aria-current="${index === 0 ? "true" : "false"}"></button>
  `,
    )
    .join("");

  const showNavigation = images.length > 1;
  if (elPrevBtn) elPrevBtn.style.display = showNavigation ? "" : "none";
  if (elNextBtn) elNextBtn.style.display = showNavigation ? "" : "none";
  elSliderDots.style.display = showNavigation ? "" : "none";

  wireGalleryInteractions();
  setMainImage(0, { restartAutoplay: false });
  startGalleryAutoplay();
}

/* ────────────────────────────────────────────────────────────
   RENDER — Info (tên, giá, mô tả, mét-đánh giá)
   ──────────────────────────────────────────────────────────── */
function renderProductInfo(product) {
  const meta = getCategoryMeta(product.category);
  const { average: ratingAvg, total: ratingTotal } =
    typeof productReviewService !== "undefined"
      ? productReviewService.getMergedRatingStats(product)
      : computeRatingStats(product.ratings);
  const soldLabel = formatSoldCount(product.soldCount);

  if (elCategory) elCategory.innerHTML = `${meta.icon} ${escapeHtml(meta.label)}`;
  if (elName) elName.textContent = product.name;
  if (elPageTitle) elPageTitle.textContent = `${product.name} — Koffia`;
  if (elBreadcrumbCurrent) elBreadcrumbCurrent.textContent = product.name;
  document.title = `${product.name} — Koffia`;

  if (elMetaRow) {
    elMetaRow.innerHTML = `
    ${
      ratingTotal > 0
        ? `
      <span class="productDetailRating">
        <i class="fa-solid fa-star" aria-hidden="true"></i> ${ratingAvg.toFixed(1)}
        <span style="color:var(--colorGray400); font-weight:400;">(${ratingTotal} đánh giá)</span>
      </span>`
        : ""
    }
    ${ratingTotal > 0 && soldLabel ? `<span class="productDetailMetaDivider" aria-hidden="true"></span>` : ""}
    ${soldLabel ? `<span>Đã bán ${soldLabel}</span>` : ""}
    ${product.isAvailable === false ? `<span class="productDetailMetaDivider" aria-hidden="true"></span><span style="color:#C62828;font-weight:600;">Hết hàng</span>` : ""}
  `.trim();
  }

  if (elDesc) elDesc.textContent = product.description || "";
}

async function renderSellerInfo(product) {
  if (
    !elSellerCard ||
    !product.sellerId ||
    typeof sellerService === "undefined"
  )
    return;
  const seller = await sellerService.findById(product.sellerId);
  if (!seller) return;
  elSellerCard.style.display = "";
  elSellerCard.innerHTML = `
    <div class="productSellerIcon"><i class="fa-solid fa-store"></i></div>
    <div class="productSellerInfo">
      <span class="productSellerCaption">Được bán bởi</span>
      <strong>${escapeHtml(seller.channelName)}</strong>
      <span>${seller.verified ? '<i class="fa-solid fa-circle-check"></i> Đã xác minh · ' : ""}${Number(seller.rating || 0).toFixed(1)} <i class="fa-solid fa-star" aria-hidden="true"></i> · ${escapeHtml(seller.address || "")}</span>
    </div>`;
}

/* ────────────────────────────────────────────────────────────
   RENDER — Tuỳ chọn: Size / Đường / Đá / Topping
   ──────────────────────────────────────────────────────────── */
function renderOptions(product) {
  const options = product.options || {};
  const userPref =
    typeof drinkPreferenceService !== "undefined"
      ? drinkPreferenceService.getForCurrentUser()
      : null;
  const usePref = Boolean(userPref?.enabled);
  const prefBanner = document.getElementById("productPrefBanner");
  const prefLabel = document.getElementById("productPrefBannerLabel");

  // Size — ưu tiên Gu uống mặc định nếu bật, nếu không mặc định Size M (Vừa)
  if (Array.isArray(options.sizes) && options.sizes.length > 0) {
    const preferredSizeCode = usePref ? String(userPref.size || "M").toUpperCase() : "M";
    const defaultSize =
      options.sizes.find(
        (size) => String(size.code).toUpperCase() === preferredSizeCode,
      ) ||
      options.sizes.find(
        (size) =>
          String(size.code).toUpperCase() === "M" ||
          String(size.name).trim().toLowerCase() === "vừa",
      ) ||
      options.sizes[0];
    productDetailState.selectedSizeCode = defaultSize.code;
    elSizeGroup.style.display = "";
    elSizeChips.innerHTML = options.sizes
      .map(
        (size) => `
      <button type="button" class="productOptionChip${size.code === defaultSize.code ? " productOptionChipActive" : ""}"
              data-size-code="${size.code}">
        <span>${escapeHtml(size.name)}</span>
        ${size.extraPrice > 0 ? `<span class="productOptionChipExtra">+${formatPrice(size.extraPrice)}</span>` : ""}
      </button>`,
      )
      .join("");

    elSizeChips.querySelectorAll(".productOptionChip").forEach((chip) => {
      chip.addEventListener("click", () => {
        productDetailState.selectedSizeCode = chip.dataset.sizeCode;
        elSizeChips
          .querySelectorAll(".productOptionChip")
          .forEach((c) =>
            c.classList.toggle("productOptionChipActive", c === chip),
          );
        recomputeAndRenderPrice();
      });
    });
  } else {
    elSizeGroup.style.display = "none";
  }

  // Sugar level — ưu tiên Gu mặc định hoặc 50%
  renderLevelChips(
    options.sugarLevels,
    elSugarGroup,
    elSugarChips,
    "selectedSugar",
    usePref ? userPref.sugar : 50,
  );

  // Ice level — ưu tiên Gu mặc định hoặc 70%
  renderLevelChips(
    options.iceLevels,
    elIceGroup,
    elIceChips,
    "selectedIce",
    usePref ? userPref.ice : 70,
  );

  if (usePref && userPref.note && !productDetailState.note) {
    productDetailState.note = userPref.note;
  }

  if (prefBanner) {
    const hasCustomizableOpt =
      (options.sizes && options.sizes.length > 0) ||
      (options.sugarLevels && options.sugarLevels.length > 0) ||
      (options.iceLevels && options.iceLevels.length > 0);
    prefBanner.hidden = !(usePref && hasCustomizableOpt);
    if (!prefBanner.hidden && prefLabel && typeof drinkPreferenceService.getSummaryText === "function") {
      prefLabel.textContent = `Đã tự chọn Gu của bạn: ${drinkPreferenceService.getSummaryText(userPref)}`;
    }
  }

  // Toppings
  productDetailState.selectedToppingIds = new Set();
  if (Array.isArray(options.toppings) && options.toppings.length > 0) {
    elToppingGroup.style.display = "";
    elToppingList.innerHTML = options.toppings
      .map(
        (topping) => `
      <label class="productToppingItem" data-topping-id="${topping.id}">
        <span class="productToppingLeft">
          <input type="checkbox" value="${topping.id}" />
          <span class="productToppingName">${escapeHtml(topping.name)}</span>
        </span>
        <span class="productToppingPrice">+${formatPrice(topping.price)}</span>
      </label>`,
      )
      .join("");

    elToppingList.querySelectorAll(".productToppingItem").forEach((row) => {
      const checkbox = row.querySelector('input[type="checkbox"]');
      row.addEventListener("click", (event) => {
        // Tránh double-toggle khi click trực tiếp vào checkbox (label đã tự toggle)
        if (event.target !== checkbox) checkbox.checked = !checkbox.checked;
        const toppingId = row.dataset.toppingId;
        if (checkbox.checked) {
          productDetailState.selectedToppingIds.add(toppingId);
        } else {
          productDetailState.selectedToppingIds.delete(toppingId);
        }
        row.classList.toggle("productToppingChecked", checkbox.checked);
        recomputeAndRenderPrice();
      });
    });
  } else {
    elToppingGroup.style.display = "none";
  }
}

/** renderLevelChips — dùng chung cho mức đường & mức đá (không ảnh hưởng giá) */
function renderLevelChips(levels, groupEl, chipsEl, stateKey, preferredLevel) {
  if (!Array.isArray(levels) || levels.length === 0) {
    groupEl.style.display = "none";
    return;
  }
  groupEl.style.display = "";

  const normalizedLevels = levels.map(Number);
  const preferred = Number(preferredLevel);
  const defaultLevel = normalizedLevels.includes(preferred)
    ? preferred
    : normalizedLevels.reduce((closest, current) =>
        Math.abs(current - preferred) < Math.abs(closest - preferred)
          ? current
          : closest,
      );

  productDetailState[stateKey] = defaultLevel;

  chipsEl.innerHTML = levels
    .map(
      (level) => `
    <button type="button" class="productOptionChip${Number(level) === defaultLevel ? " productOptionChipActive" : ""}"
            data-level="${level}">${level}%</button>`,
    )
    .join("");

  chipsEl.querySelectorAll(".productOptionChip").forEach((chip) => {
    chip.addEventListener("click", () => {
      productDetailState[stateKey] = Number(chip.dataset.level);
      chipsEl
        .querySelectorAll(".productOptionChip")
        .forEach((c) =>
          c.classList.toggle("productOptionChipActive", c === chip),
        );
    });
  });
}

/* ────────────────────────────────────────────────────────────
   TÍNH GIÁ THEO TUỲ CHỌN ĐÃ CHỌN
   ──────────────────────────────────────────────────────────── */
function computeUnitPrice() {
  const product = productDetailState.product;
  if (!product) return 0;

  let basePrice = product.price;
  if (productDetailState.flashSale) {
    basePrice = Math.round(
      (product.price * (100 - productDetailState.flashSale.discountPercent)) /
        100,
    );
  }

  let unitPrice = basePrice;

  const sizeOption = (product.options?.sizes || []).find(
    (s) => s.code === productDetailState.selectedSizeCode,
  );
  if (sizeOption) unitPrice += sizeOption.extraPrice || 0;

  const toppings = product.options?.toppings || [];
  productDetailState.selectedToppingIds.forEach((id) => {
    const topping = toppings.find((t) => t.id === id);
    if (topping) unitPrice += topping.price || 0;
  });

  return unitPrice;
}

function recomputeAndRenderPrice() {
  const product = productDetailState.product;
  const unitPrice = computeUnitPrice();
  const flash = productDetailState.flashSale;

  elPriceMain.textContent = formatPrice(unitPrice);

  if (flash) {
    elPriceOld.textContent = formatPrice(product.price);
    elPriceOld.style.display = "";
    elDiscountTag.textContent = `-${flash.discountPercent}% Flash`;
    elDiscountTag.style.display = "";
  } else {
    const discountPct = computeDiscountPercent(
      product.price,
      product.originalPrice,
    );
    if (discountPct > 0) {
      elPriceOld.textContent = formatPrice(product.originalPrice);
      elPriceOld.style.display = "";
      elDiscountTag.textContent = `-${discountPct}%`;
      elDiscountTag.style.display = "";
    } else {
      elPriceOld.style.display = "none";
      elDiscountTag.style.display = "none";
    }
  }

  const hasCustomizations =
    product.options?.sizes?.length > 0 ||
    productDetailState.selectedToppingIds.size > 0;
  elPriceHint.textContent = flash
    ? "⚡ Đang áp dụng giá Flash Sale đặc biệt!"
    : hasCustomizations
      ? "Giá đã bao gồm tuỳ chọn size & topping đang chọn."
      : "";
}

/* ────────────────────────────────────────────────────────────
   SỐ LƯỢNG (QUANTITY STEPPER)
   ──────────────────────────────────────────────────────────── */
function wireQuantityStepper() {
  const MIN_QTY = 1;
  const MAX_QTY = 20;

  function updateQtyDisplay() {
    elQtyValue.textContent = String(productDetailState.quantity);
    elQtyDecBtn.disabled = productDetailState.quantity <= MIN_QTY;
    elQtyIncBtn.disabled = productDetailState.quantity >= MAX_QTY;
  }

  elQtyDecBtn.addEventListener("click", () => {
    if (productDetailState.quantity > MIN_QTY) productDetailState.quantity -= 1;
    updateQtyDisplay();
  });

  elQtyIncBtn.addEventListener("click", () => {
    if (productDetailState.quantity < MAX_QTY) productDetailState.quantity += 1;
    updateQtyDisplay();
  });

  updateQtyDisplay();
}

/* ────────────────────────────────────────────────────────────
   GIỎ HÀNG — thêm với số lượng tuỳ chỉnh trong 1 lần thao tác
   (tái sử dụng cartState/cartUI/showToast đã có sẵn từ main.js)
   ──────────────────────────────────────────────────────────── */
function buildCartLineLabel(product) {
  const parts = [];
  const sizeOption = (product.options?.sizes || []).find(
    (s) => s.code === productDetailState.selectedSizeCode,
  );
  if (sizeOption) parts.push(sizeOption.name);

  if (productDetailState.selectedSugar !== null)
    parts.push(`Đường ${productDetailState.selectedSugar}%`);
  if (productDetailState.selectedIce !== null)
    parts.push(`Đá ${productDetailState.selectedIce}%`);

  const toppings = product.options?.toppings || [];
  const toppingNames = [...productDetailState.selectedToppingIds]
    .map((id) => toppings.find((t) => t.id === id)?.name)
    .filter(Boolean);
  if (toppingNames.length > 0) parts.push(`+ ${toppingNames.join(", ")}`);

  return parts.length > 0
    ? `${product.name} (${parts.join(", ")})`
    : product.name;
}

function buildCartItemId(product) {
  const toppingKey = [...productDetailState.selectedToppingIds]
    .sort()
    .join("-");
  const cleanNote = String(productDetailState.note || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return [
    product.id,
    productDetailState.selectedSizeCode,
    `sugar-${productDetailState.selectedSugar ?? "na"}`,
    `ice-${productDetailState.selectedIce ?? "na"}`,
    toppingKey,
    cleanNote ? `note-${cleanNote}` : "",
  ]
    .filter(Boolean)
    .join("::");
}

/** addProductToCart — cộng dồn đúng số lượng đã chọn trong MỘT lần cập nhật UI/toast */
function addProductToCart(product, quantity) {
  if (!requireAuthenticatedUser("thêm sản phẩm vào giỏ hàng")) return false;

  const unitPrice = computeUnitPrice();
  const isFlash = Boolean(productDetailState.flashSale);
  const cleanNote = String(productDetailState.note || "").trim();
  const item = {
    id: buildCartItemId(product) + (isFlash ? "::flash" : ""),
    productId: product.id,
    sellerId: product.sellerId || null,
    category: product.category || null,
    name:
      buildCartLineLabel(product) + (isFlash ? " (⚡ Flash Sale)" : ""),
    note: cleanNote,
    price: unitPrice,
    isFlashSale: isFlash,
    img: (() => {
      const src =
        productDetailState.images[productDetailState.activeImageIdx] ||
        productDetailState.images[0] ||
        "";
      return src ? new URL(src, window.location.href).href : "";
    })(),
  };

  const added = cartState.addItem(item, quantity);
  if (added && isFlash && typeof flashSaleService !== "undefined") {
    flashSaleService.recordSalePurchase(product.id, quantity);
  }
  return added;
}

/* ────────────────────────────────────────────────────────────
   GHI CHÚ RIÊNG & CHIA SẺ MÓN
   ──────────────────────────────────────────────────────────── */
function wireNoteControls() {
  const input = document.getElementById("productNoteInput");
  const counter = document.getElementById("productNoteCounter");
  const chips = [...document.querySelectorAll(".productNoteChip")];
  if (!input) return;

  const MAX_LEN = 120;

  function syncNoteUi() {
    const val = input.value;
    productDetailState.note = val.trim();
    if (counter) counter.textContent = `${val.length}/${MAX_LEN}`;
    const lower = val.toLowerCase();
    chips.forEach((chip) => {
      const phrase = String(chip.dataset.noteChip || "");
      const active = Boolean(phrase && lower.includes(phrase.toLowerCase()));
      chip.classList.toggle("isSelected", active);
      chip.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  input.value = productDetailState.note || "";
  input.addEventListener("input", syncNoteUi);

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const phrase = String(chip.dataset.noteChip || "").trim();
      if (!phrase) return;

      const parts = input.value
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      const idx = parts.findIndex(
        (p) => p.toLowerCase() === phrase.toLowerCase(),
      );

      if (idx >= 0) {
        parts.splice(idx, 1);
      } else {
        const candidate = [...parts, phrase].join(", ");
        if (candidate.length <= MAX_LEN) {
          parts.push(phrase);
        } else if (typeof showToast === "function") {
          showToast("Ghi chú tối đa 120 ký tự", "error", 2000);
          return;
        }
      }

      input.value = parts.join(", ");
      syncNoteUi();
    });
  });

  syncNoteUi();
}

function wireShareButton(product) {
  const shareBtn = document.getElementById("productShareBtn");
  if (!shareBtn) return;

  let resetTimer = null;
  function markCopiedFeedback() {
    const icon = shareBtn.querySelector("i");
    shareBtn.classList.add("isCopied");
    if (icon) icon.className = "fa-solid fa-check";
    if (typeof showToast === "function") {
      showToast("Đã sao chép liên kết món!");
    }
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      shareBtn.classList.remove("isCopied");
      if (icon) icon.className = "fa-solid fa-arrow-up-from-bracket";
    }, 1600);
  }

  shareBtn.addEventListener("click", async () => {
    const shareUrl = window.location.href;
    const isMobile = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
    if (isMobile && navigator.share) {
      try {
        await navigator.share({
          title: `${product.name} — Koffia`,
          text: `Thử ngay ${product.name} tại Koffia`,
          url: shareUrl,
        });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        markCopiedFeedback();
        return;
      }
    } catch {}

    // Fallback cho HTTP không HTTPS hoặc trình duyệt cũ
    try {
      const tmp = document.createElement("textarea");
      tmp.value = shareUrl;
      tmp.setAttribute("readonly", "");
      tmp.style.position = "fixed";
      tmp.style.opacity = "0";
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand("copy");
      tmp.remove();
      markCopiedFeedback();
    } catch {
      if (typeof showToast === "function") {
        showToast("Không thể sao chép liên kết", "error");
      }
    }
  });
}

function wireCtaButtons(product) {
  elAddToCartBtn.addEventListener("click", () => {
    const added = addProductToCart(product, productDetailState.quantity);
    if (!added) return;

    elAddToCartBtn.classList.add("addedAnim");
    setTimeout(() => elAddToCartBtn.classList.remove("addedAnim"), 600);
  });

  elBuyNowBtn.addEventListener("click", () => {
    const added = addProductToCart(product, productDetailState.quantity);
    if (added) window.location.href = CART_REDIRECT_URL;
  });
}

/* ────────────────────────────────────────────────────────────
   TRẠNG THÁI HIỂN THỊ (loading / not found / content)
   ──────────────────────────────────────────────────────────── */
function showLoadingState() {
  elSkeleton.style.display = "grid";
  elNotFound.style.display = "none";
  elContent.style.display = "none";
}

function showNotFoundState() {
  elSkeleton.style.display = "none";
  elNotFound.style.display = "block";
  elContent.style.display = "none";
  if (elBreadcrumbCurrent) elBreadcrumbCurrent.textContent = "Không tìm thấy";
}

function showContentState() {
  elSkeleton.style.display = "none";
  elNotFound.style.display = "none";
  elContent.style.display = "grid";
}

/* ────────────────────────────────────────────────────────────
   BOOTSTRAP
   ──────────────────────────────────────────────────────────── */
async function initProductDetailPage() {
  stopGalleryAutoplay();
  if (productDetailState.flashTimer) {
    clearInterval(productDetailState.flashTimer);
    productDetailState.flashTimer = null;
  }
  productDetailState.product = null;
  productDetailState.flashSale = null;
  productDetailState.images = [];
  productDetailState.activeImageIdx = 0;
  productDetailState.selectedSizeCode = null;
  productDetailState.selectedSugar = null;
  productDetailState.selectedIce = null;
  productDetailState.selectedToppingIds = new Set();
  productDetailState.note = "";
  productDetailState.quantity = 1;

  // Cache DOM refs
  elSkeleton = document.getElementById("productDetailSkeleton");
  elNotFound = document.getElementById("productNotFound");
  elContent = document.getElementById("productDetailContent");

  elSliderViewport = document.getElementById("productSliderViewport");
  elSliderTrack = document.getElementById("productSliderTrack");
  elPrevBtn = document.getElementById("productPrevBtn");
  elNextBtn = document.getElementById("productNextBtn");
  elSliderDots = document.getElementById("productSliderDots");
  elMainImgPlaceholder = document.getElementById("productMainImgPlaceholder");
  elBadgesWrap = document.getElementById("productDetailBadges");
  elThumbRow = document.getElementById("productThumbRow");

  elCategory = document.getElementById("productDetailCategory");
  elName = document.getElementById("productDetailName");
  elMetaRow = document.getElementById("productDetailMetaRow");
  elPriceMain = document.getElementById("productPriceMain");
  elPriceOld = document.getElementById("productPriceOld");
  elDiscountTag = document.getElementById("productDiscountTag");
  elPriceHint = document.getElementById("productPriceHint");
  elDesc = document.getElementById("productDetailDesc");
  elSellerCard = document.getElementById("productSellerCard");

  elSizeGroup = document.getElementById("productSizeGroup");
  elSizeChips = document.getElementById("productSizeChips");
  elSugarGroup = document.getElementById("productSugarGroup");
  elSugarChips = document.getElementById("productSugarChips");
  elIceGroup = document.getElementById("productIceGroup");
  elIceChips = document.getElementById("productIceChips");
  elToppingGroup = document.getElementById("productToppingGroup");
  elToppingList = document.getElementById("productToppingList");

  elQtyValue = document.getElementById("productQtyValue");
  elQtyDecBtn = document.getElementById("productQtyDecBtn");
  elQtyIncBtn = document.getElementById("productQtyIncBtn");
  elAddToCartBtn = document.getElementById("productAddToCartBtn");
  elBuyNowBtn = document.getElementById("productBuyNowBtn");

  elBreadcrumbCurrent = document.getElementById("productBreadcrumbCurrent");
  elPageTitle = document.getElementById("productPageTitle");

  if (!elContent) return; // Không phải trang product.html — bỏ qua

  const productId = getIdFromUrl();
  if (!productId) {
    showNotFoundState();
    return;
  }

  showLoadingState();

  // Chỉ hiển thị "Không tìm thấy sản phẩm" khi ID thật sự không tồn tại.
  // Lỗi gallery / seller không được phép làm một sản phẩm hợp lệ biến thành 404 giả.
  let allProducts;
  try {
    allProducts = await fetchAllProducts();
  } catch (err) {
    console.error("[Koffia] Không tải được products.json:", err);
    showNotFoundState();
    return;
  }

  const product = allProducts.find((item) => item.id === productId);
  if (!product) {
    showNotFoundState();
    return;
  }

  productDetailState.product = product;

  // Kiểm tra Flash Sale cho sản phẩm này
  if (typeof flashSaleService !== "undefined") {
    try {
      const flash = await flashSaleService.getActiveProductSale(product.id);
      if (flash) {
        productDetailState.flashSale = flash;
        const banner = document.getElementById("productFlashSaleBanner");
        const bannerText = document.getElementById("productFlashSaleText");
        const timerVal = document.getElementById("productFlashTimerValue");
        if (banner) banner.style.display = "flex";
        if (bannerText)
          bannerText.textContent = `Giảm ${flash.discountPercent}% (${flash.saleName})`;

        function updateDetailFlashTimer() {
          const diff = Math.max(
            0,
            new Date(flash.endTime).getTime() - Date.now(),
          );
          const h = Math.floor(diff / 3600000);
          const m = Math.floor((diff % 3600000) / 60000);
          const s = Math.floor((diff % 60000) / 1000);
          if (timerVal) {
            timerVal.textContent = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
          }
        }
        updateDetailFlashTimer();
        productDetailState.flashTimer = setInterval(
          updateDetailFlashTimer,
          1000,
        );
      }
    } catch (e) {
      console.warn("Lỗi kiểm tra flash sale chi tiết sản phẩm:", e);
    }
  }

  try {
    // Render dữ liệu cốt lõi trước để trang vẫn dùng được nếu ảnh/seller gặp sự cố.
    const wishlistBtn = document.getElementById("productWishlistBtn");
    if (wishlistBtn) wishlistBtn.dataset.productId = product.id;

    renderProductInfo(product);
    renderOptions(product);
    wireNoteControls();
    recomputeAndRenderPrice();
    wireQuantityStepper();
    wireCtaButtons(product);
    wireShareButton(product);

    let images = [];
    if (typeof productImageService !== "undefined") {
      try {
        images = await productImageService.resolveProductImages(product, "../");
      } catch (imageErr) {
        console.warn("[Koffia] Không tải được gallery sản phẩm:", imageErr);
      }
    } else {
      console.warn(
        "[Koffia] productImageService chưa được nạp; dùng placeholder.",
      );
    }
    renderGallery(product, images);

    try {
      await renderSellerInfo(product);
    } catch (sellerErr) {
      console.warn("[Koffia] Không tải được thông tin seller:", sellerErr);
    }

    if (product.isAvailable === false) {
      elAddToCartBtn.disabled = true;
      elBuyNowBtn.disabled = true;
      elBuyNowBtn.style.opacity = "0.5";
      elAddToCartBtn.style.opacity = "0.5";
    }

    showContentState();

    // Lưu lịch sử vừa xem & hiển thị Đánh giá + Món tương tự + Đã xem gần đây
    if (typeof recentlyViewedService !== "undefined") {
      recentlyViewedService.record(product.id);
    }
    renderProductReviews(product);
    renderRelatedProducts(product, allProducts);
    renderRecentlyViewed(product, allProducts);

    if (window.location.hash === "#productReviewsSection") {
      requestAnimationFrame(() => {
        const revSec = document.getElementById("productReviewsSection");
        if (revSec) {
          revSec.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }

    // Tái sử dụng logic dùng chung từ main.js cho nội dung vừa render động
    if (typeof initWishlistButtons === "function") initWishlistButtons();
    if (typeof initScrollReveal === "function") initScrollReveal();
  } catch (err) {
    console.error("[Koffia] Lỗi render chi tiết sản phẩm:", err);
    // Sản phẩm đã tồn tại: ưu tiên giữ trang nội dung thay vì báo "không tìm thấy" sai.
    showContentState();
  }
}

/* ────────────────────────────────────────────────────────────
   ĐÁNH GIÁ & BÌNH LUẬN SẢN PHẨM (App Store Style)
   ──────────────────────────────────────────────────────────── */
const REVIEW_STAR_LABELS = {
  1: "Chưa hài lòng",
  2: "Tạm được",
  3: "Ổn áp",
  4: "Rất ngon",
  5: "Tuyệt vời",
};

function formatReviewDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Gần đây";
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays <= 0) return "Hôm nay";
  if (diffDays === 1) return "Hôm qua";
  if (diffDays < 7) return `${diffDays} ngày trước`;
  return d.toLocaleDateString("vi-VN");
}

function renderStarsHtml(rating) {
  const filled = Math.round(Number(rating) || 0);
  return [1, 2, 3, 4, 5]
    .map(
      (i) =>
        `<i class="${i <= filled ? "fa-solid" : "fa-regular"} fa-star" aria-hidden="true"></i>`,
    )
    .join("");
}

function renderProductReviews(product) {
  const section = document.getElementById("productReviewsSection");
  if (!section || typeof productReviewService === "undefined") return;
  section.style.display = "";

  const stats = productReviewService.getMergedRatingStats(product);
  const avgEl = document.getElementById("reviewAvgBig");
  const starsEl = document.getElementById("reviewAvgStars");
  const totalEl = document.getElementById("reviewTotalCount");
  const headerCountEl = document.getElementById("reviewsHeaderCount");
  const barsEl = document.getElementById("reviewBarsList");
  const listEl = document.getElementById("productReviewList");

  if (avgEl) avgEl.textContent = stats.total > 0 ? stats.average.toFixed(1) : "5.0";
  if (starsEl) starsEl.innerHTML = renderStarsHtml(stats.total > 0 ? stats.average : 5);
  if (totalEl) totalEl.textContent = `${stats.total} lượt đánh giá`;
  if (headerCountEl) headerCountEl.textContent = `${stats.total} đánh giá`;

  if (barsEl) {
    barsEl.innerHTML = [5, 4, 3, 2, 1]
      .map((star) => {
        const cnt = stats.counts[star] || 0;
        const pct = stats.total > 0 ? Math.round((cnt / stats.total) * 100) : 0;
        return `
          <div class="reviewBarRow">
            <span class="reviewBarLabel">${star} <i class="fa-solid fa-star" aria-hidden="true"></i></span>
            <div class="reviewBarTrack"><div class="reviewBarFill" style="width:${pct}%"></div></div>
            <span class="reviewBarPct">${pct}%</span>
          </div>
        `;
      })
      .join("");
  }

  // Form gửi đánh giá
  const user =
    typeof customerService !== "undefined"
      ? customerService.getCurrentUser()
      : null;
  const loginPrompt = document.getElementById("reviewLoginPrompt");
  const loginLink = document.getElementById("reviewLoginLink");
  const form = document.getElementById("productReviewForm");

  if (user?.id) {
    if (loginPrompt) loginPrompt.hidden = true;
    if (form) form.hidden = false;
  } else {
    if (loginPrompt) loginPrompt.hidden = false;
    if (loginLink && typeof getAuthPageUrl === "function") {
      loginLink.href = getAuthPageUrl("login", window.location.href);
    }
    if (form) form.hidden = true;
  }

  if (form && form.dataset.wired !== "1") {
    form.dataset.wired = "1";
    let selectedStar = 5;
    const starBtns = [...form.querySelectorAll(".reviewStarBtn")];
    const hintEl = document.getElementById("reviewStarHint");
    const commentEl = document.getElementById("reviewCommentInput");
    const charEl = document.getElementById("reviewCharCount");

    function paintStars(val) {
      starBtns.forEach((b) => {
        const s = Number(b.dataset.star);
        b.classList.toggle("isFilled", s <= val);
      });
      if (hintEl) hintEl.textContent = REVIEW_STAR_LABELS[val] || "";
    }

    starBtns.forEach((btn) => {
      const s = Number(btn.dataset.star);
      btn.addEventListener("mouseenter", () => paintStars(s));
      btn.addEventListener("click", () => {
        selectedStar = s;
        paintStars(selectedStar);
      });
    });

    document
      .getElementById("reviewStarPicker")
      ?.addEventListener("mouseleave", () => paintStars(selectedStar));

    commentEl?.addEventListener("input", () => {
      if (charEl) charEl.textContent = `${commentEl.value.length}/300`;
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = commentEl?.value?.trim() || "";
      if (text.length < 4) {
        if (typeof showToast === "function") {
          showToast("Vui lòng nhập nhận xét tối thiểu 4 ký tự.", "error");
        }
        commentEl?.focus();
        return;
      }
      const added = productReviewService.addReview(product.id, {
        rating: selectedStar,
        comment: text,
      });
      if (!added) return;
      if (commentEl) commentEl.value = "";
      if (charEl) charEl.textContent = "0/300";
      selectedStar = 5;
      paintStars(5);
      renderProductInfo(product);
      renderProductReviews(product);
      if (typeof showToast === "function") {
        showToast("Cảm ơn bạn đã gửi đánh giá!");
      }
    });

    paintStars(selectedStar);
  }

  // Danh sách bình luận
  if (listEl) {
    const reviews = productReviewService.getDisplayReviews(product);
    listEl.innerHTML = reviews
      .map((rev) => {
        const canDelete =
          !rev.isSeed &&
          user?.id &&
          (rev.userId === user.id || user.role === "dev");
        return `
          <article class="reviewItemCard${!rev.isSeed ? " isUserReview" : ""}" role="listitem">
            <div class="reviewItemHead">
              <div class="reviewAuthorWrap">
                <span class="reviewAvatar" aria-hidden="true">${escapeHtml(rev.authorInitials || "KF")}</span>
                <div>
                  <div class="reviewAuthorName">
                    ${escapeHtml(rev.authorName)}
                    ${!rev.isSeed ? '<span class="reviewMineTag">Của bạn</span>' : ""}
                  </div>
                  <div class="reviewItemMeta">
                    <span class="reviewItemStars">${renderStarsHtml(rev.rating)}</span>
                    <span>·</span>
                    <span>${escapeHtml(formatReviewDate(rev.createdAt))}</span>
                  </div>
                </div>
              </div>
              ${
                canDelete
                  ? `<button type="button" class="reviewDeleteBtn" data-delete-review="${escapeHtml(rev.id)}" aria-label="Xóa đánh giá">
                       <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
                     </button>`
                  : ""
              }
            </div>
            <p class="reviewItemBody">${escapeHtml(rev.comment)}</p>
          </article>
        `;
      })
      .join("");

    listEl.querySelectorAll("[data-delete-review]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ok = productReviewService.deleteReview(
          product.id,
          btn.dataset.deleteReview,
        );
        if (ok) {
          renderProductInfo(product);
          renderProductReviews(product);
          if (typeof showToast === "function") {
            showToast("Đã xóa đánh giá của bạn.", "success", 2200);
          }
        }
      });
    });
  }
}

/* ────────────────────────────────────────────────────────────
   MÓN TƯƠNG TỰ & ĐÃ XEM GẦN ĐÂY
   ──────────────────────────────────────────────────────────── */
async function renderMiniProductGrid(gridEl, list) {
  if (!gridEl || !list.length) return;
  gridEl.innerHTML = list
    .map((item) => {
      const meta = getCategoryMeta(item.category);
      const { average } =
        typeof productReviewService !== "undefined"
          ? productReviewService.getMergedRatingStats(item)
          : computeRatingStats(item.ratings);
      const soldOut = item.isAvailable === false;
      return `
        <article class="iosMiniCard" role="listitem" data-mini-product-id="${escapeHtml(item.id)}">
          <a href="product.html?id=${encodeURIComponent(item.id)}" class="iosMiniMedia">
            <img class="iosMiniImg" src="${escapeHtml(typeof defaultProductImageDataUri !== "undefined" ? defaultProductImageDataUri : "")}" data-mini-img="${escapeHtml(item.id)}" alt="${escapeHtml(item.name)}" loading="lazy" />
          </a>
          <div class="iosMiniBody">
            <span class="iosMiniCat">${meta.icon} ${escapeHtml(meta.label)}</span>
            <a href="product.html?id=${encodeURIComponent(item.id)}" class="iosMiniName">${escapeHtml(item.name)}</a>
            <div class="iosMiniBottom">
              <div>
                <div class="iosMiniPrice">${formatPrice(item.price)}</div>
                <div class="iosMiniRating"><i class="fa-solid fa-star" aria-hidden="true"></i> ${average ? average.toFixed(1) : "5.0"}</div>
              </div>
              <button type="button" class="iosMiniAddBtn" data-mini-add="${escapeHtml(item.id)}" ${soldOut ? "disabled" : ""} aria-label="Thêm ${escapeHtml(item.name)} vào giỏ">
                <i class="fa-solid ${soldOut ? "fa-ban" : "fa-plus"}" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  if (typeof productImageService !== "undefined") {
    const imgs = [...gridEl.querySelectorAll("[data-mini-img]")];
    await Promise.all(
      imgs.map(async (img) => {
        const prod = list.find((p) => p.id === img.dataset.miniImg);
        if (!prod) return;
        const cover = await productImageService.resolveCoverImage(prod, "../");
        if (cover && img.isConnected) {
          img.src = new URL(cover, window.location.href).href;
        }
      }),
    );
  }

  gridEl.querySelectorAll("[data-mini-add]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const prod = list.find((p) => p.id === btn.dataset.miniAdd);
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

function renderRelatedProducts(product, allProducts) {
  const section = document.getElementById("productRelatedSection");
  const grid = document.getElementById("productRelatedGrid");
  if (!section || !grid || !Array.isArray(allProducts)) return;

  const sameCat = allProducts.filter(
    (p) =>
      p.id !== product.id &&
      p.isAvailable !== false &&
      p.category === product.category,
  );
  const sameSeller = allProducts.filter(
    (p) =>
      p.id !== product.id &&
      p.isAvailable !== false &&
      p.category !== product.category &&
      p.sellerId === product.sellerId,
  );
  const combined = [...sameCat, ...sameSeller]
    .sort(
      (a, b) =>
        Number(b.isBestSeller) - Number(a.isBestSeller) ||
        (b.soldCount || 0) - (a.soldCount || 0),
    )
    .slice(0, 4);

  if (!combined.length) {
    section.style.display = "none";
    return;
  }
  section.style.display = "";
  renderMiniProductGrid(grid, combined);
}

function renderRecentlyViewed(product, allProducts) {
  const section = document.getElementById("productRecentSection");
  const grid = document.getElementById("productRecentGrid");
  if (
    !section ||
    !grid ||
    typeof recentlyViewedService === "undefined" ||
    !Array.isArray(allProducts)
  )
    return;

  const ids = recentlyViewedService
    .getIds()
    .filter((id) => id !== product.id)
    .slice(0, 4);
  const list = ids
    .map((id) => allProducts.find((p) => p.id === id))
    .filter(Boolean);

  if (!list.length) {
    section.style.display = "none";
    return;
  }
  section.style.display = "";
  renderMiniProductGrid(grid, list);
}

document.addEventListener("DOMContentLoaded", initProductDetailPage);
