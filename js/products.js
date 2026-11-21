"use strict";

const menuState = {
  products: [],
  sellers: new Map(),
  flashMap: new Map(),
  category: "all",
  search: "",
  sort: "default",
  quickFilters: new Set(),
};

const menuCategoryMeta = {
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

function menuEscapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function menuNormalizeText(value) {
  return (value || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

function menuRatingStats(ratings) {
  let total = 0;
  let weighted = 0;
  Object.entries(ratings || {}).forEach(([star, count]) => {
    total += Number(count) || 0;
    weighted += (Number(star) || 0) * (Number(count) || 0);
  });
  return { total, average: total ? weighted / total : 0 };
}

function menuFormatSold(count) {
  if (!count) return "0";
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(".0", "")}k`;
  return String(count);
}

function menuDiscountPercent(product) {
  if (!product.originalPrice || product.originalPrice <= product.price)
    return 0;
  return Math.round((1 - product.price / product.originalPrice) * 100);
}

function renderMenuSkeleton() {
  const grid = document.getElementById("menuGrid");
  if (!grid) return;
  grid.innerHTML = Array.from(
    { length: 8 },
    () => `
    <article class="menuCard menuCardSkeleton" aria-hidden="true">
      <div class="menuCardImgWrapper skeletonBlock"></div>
      <div class="menuCardBody">
        <div class="skeletonLine skeletonLineSm"></div>
        <div class="skeletonLine skeletonLineMd"></div>
        <div class="skeletonLine"></div>
        <div class="skeletonLine"></div>
        <div class="skeletonLine skeletonLineLg" style="margin-top:1rem"></div>
      </div>
    </article>
  `,
  ).join("");
}

function renderCategoryFilters() {
  const groups = document.querySelectorAll(".filterBtnGroup");
  if (!groups.length) return;
  const counts = menuState.products.reduce((acc, product) => {
    acc[product.category] = (acc[product.category] || 0) + 1;
    return acc;
  }, {});

  const categories = Object.keys(menuCategoryMeta).filter((key) => counts[key]);
  const html = [
    `<button type="button" class="filterBtn filterActive" data-category="all">Tất cả <span class="filterCount">${menuState.products.length}</span></button>`,
    ...categories.map((key) => {
      const meta = menuCategoryMeta[key];
      return `<button type="button" class="filterBtn" data-category="${key}">${meta.icon} ${meta.label} <span class="filterCount">${counts[key]}</span></button>`;
    }),
  ].join("");

  groups.forEach((group) => {
    group.innerHTML = html;
  });

  document.querySelectorAll(".filterBtn").forEach((button) => {
    button.addEventListener("click", () => {
      const selectedCategory = button.dataset.category;
      menuState.category = selectedCategory;

      // Đồng bộ trạng thái active trên cả thanh gộp Navbar và thanh trang
      document.querySelectorAll(".filterBtn").forEach((btn) => {
        btn.classList.toggle("filterActive", btn.dataset.category === selectedCategory);
      });

      renderMenuProducts();
    });
  });
}

function initMenuMergedNav() {
  const navBar = document.getElementById("navBar");
  const inPageFilter = document.getElementById("categoryFilter");
  if (!navBar || !inPageFilter) {
    if (window._menuMergedNavHandler) {
      window.removeEventListener("scroll", window._menuMergedNavHandler);
      window._menuMergedNavHandler = null;
    }
    if (navBar) navBar.classList.remove("navMenuMerged");
    return;
  }

  let isMerged = false;
  let rafPending = false;

  const updateMergeState = () => {
    rafPending = false;
    const filter = document.getElementById("categoryFilter");
    if (!filter) {
      if (window._menuMergedNavHandler) {
        window.removeEventListener("scroll", window._menuMergedNavHandler);
        window._menuMergedNavHandler = null;
      }
      navBar.classList.remove("navMenuMerged");
      return;
    }

    const rect = filter.getBoundingClientRect();
    // Hysteresis tránh nhấp nháy tại ngưỡng chuyển trạng thái (76px gộp vào / 92px tách ra)
    const nextMerged = isMerged ? rect.top <= 92 : rect.top <= 76;
    if (nextMerged !== isMerged) {
      isMerged = nextMerged;
      navBar.classList.toggle("navMenuMerged", isMerged);
      filter.classList.toggle("isMergedHidden", isMerged);
    }
  };

  const onScroll = () => {
    if (rafPending) return;
    rafPending = true;
    window.requestAnimationFrame(updateMergeState);
  };

  if (window._menuMergedNavHandler) {
    window.removeEventListener("scroll", window._menuMergedNavHandler);
  }
  window._menuMergedNavHandler = onScroll;
  window.addEventListener("scroll", onScroll, { passive: true });
  updateMergeState();
}

function getEffectiveProductPrice(product) {
  const flash = menuState.flashMap?.get(product.id);
  if (flash) {
    return Math.round(
      (product.price * (100 - (Number(flash.discountPercent) || 20))) / 100,
    );
  }
  return Number(product.price) || 0;
}

function getVisibleProducts() {
  let result = [...menuState.products];

  if (menuState.category !== "all") {
    result = result.filter(
      (product) => product.category === menuState.category,
    );
  }

  if (menuState.quickFilters?.size > 0) {
    if (menuState.quickFilters.has("discount")) {
      result = result.filter(
        (product) =>
          Boolean(menuState.flashMap?.get(product.id)) ||
          menuDiscountPercent(product) > 0,
      );
    }
    if (menuState.quickFilters.has("under35k")) {
      result = result.filter(
        (product) => getEffectiveProductPrice(product) <= 35000,
      );
    }
    if (menuState.quickFilters.has("bestseller")) {
      result = result.filter((product) => Boolean(product.isBestSeller));
    }
    if (menuState.quickFilters.has("wishlist")) {
      const likedIds =
        typeof wishlistService !== "undefined"
          ? new Set(wishlistService.getIds())
          : new Set();
      result = result.filter((product) => likedIds.has(product.id));
    }
  }

  if (menuState.search) {
    const keyword = menuNormalizeText(menuState.search);
    result = result.filter((product) => {
      const categoryName = menuCategoryMeta[product.category]?.label || "";
      const sellerName =
        menuState.sellers.get(product.sellerId)?.channelName || "";
      return menuNormalizeText(
        `${product.name} ${product.description} ${categoryName} ${sellerName}`,
      ).includes(keyword);
    });
  }

  if (menuState.sort === "priceAsc")
    result.sort((a, b) => getEffectiveProductPrice(a) - getEffectiveProductPrice(b));
  if (menuState.sort === "priceDesc")
    result.sort((a, b) => getEffectiveProductPrice(b) - getEffectiveProductPrice(a));
  if (menuState.sort === "popular")
    result.sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0));

  return result;
}

async function hydrateMenuProductImages(grid) {
  if (typeof productImageService === "undefined") return;

  const imageNodes = [...grid.querySelectorAll("[data-menu-product-img]")];
  await Promise.all(
    imageNodes.map(async (img) => {
      const product = menuState.products.find(
        (item) => item.id === img.dataset.productId,
      );
      if (!product) return;

      const cover = await productImageService.resolveCoverImage(product, "../");
      if (!img.isConnected) return;

      const card = img.closest(".menuCard");
      const placeholder = card?.querySelector("[data-menu-img-placeholder]");
      const addButton = card?.querySelector("[data-menu-add]");

      if (!cover) {
        img.remove();
        return;
      }

      img.addEventListener(
        "load",
        () => {
          img.classList.add("menuCardImgLoaded");
          placeholder?.remove();
        },
        { once: true },
      );

      img.src = cover;
      if (addButton)
        addButton.dataset.productImg = new URL(
          cover,
          window.location.href,
        ).href;
    }),
  );
}

function renderMenuProducts() {
  const grid = document.getElementById("menuGrid");
  const countEl = document.getElementById("resultsCount");
  const emptyState = document.querySelector(".menuEmptyState");
  const resetBtn = document.getElementById("menuQuickResetBtn");
  if (!grid) return;

  if (resetBtn) {
    const hasFilter =
      menuState.category !== "all" ||
      Boolean(menuState.search.trim()) ||
      menuState.quickFilters.size > 0;
    resetBtn.hidden = !hasFilter;
  }

  const products = getVisibleProducts();
  if (countEl) countEl.textContent = products.length;
  if (emptyState) {
    emptyState.classList.toggle("visible", products.length === 0);
    const emptyMsg = emptyState.querySelector("p");
    if (emptyMsg) {
      emptyMsg.textContent =
        menuState.quickFilters.has("wishlist") &&
        typeof wishlistService !== "undefined" &&
        wishlistService.count() === 0
          ? "Bạn chưa thả tim món nào. Hãy nhấn biểu tượng trái tim trên món yêu thích nhé!"
          : "Không có món phù hợp với bộ lọc hiện tại. Vui lòng thử điều chỉnh tìm kiếm hoặc đặt lại bộ lọc!";
    }
  }

  grid.innerHTML = products
    .map((product) => {
      const meta = menuCategoryMeta[product.category] || {
        label: "Đồ uống",
        icon: '<i class="fa-solid fa-martini-glass-citrus" aria-hidden="true"></i>',
      };
      const rating = menuRatingStats(product.ratings);
      const flash = menuState.flashMap?.get(product.id);
      const isFlash = Boolean(flash);
      const effectivePrice = getEffectiveProductPrice(product);
      const effectiveOriginal = isFlash ? product.price : product.originalPrice;
      const discount = isFlash ? flash.discountPercent : menuDiscountPercent(product);
      const soldOut = product.isAvailable === false;
      const seller = menuState.sellers.get(product.sellerId);
      const sellerLabel = seller
        ? `${seller.channelName}${seller.verified ? " · Đã xác minh" : ""}`
        : "Kênh đối tác";

      return `
      <article class="menuCard${soldOut ? " menuCardSoldOut" : ""}${isFlash ? " menuCardFlash" : ""}" role="listitem" data-product-id="${menuEscapeHtml(product.id)}" data-category="${menuEscapeHtml(product.category)}" data-price="${effectivePrice}">
        <div class="menuCardImgWrapper">
          <div class="menuCardImgPlaceholder" data-menu-img-placeholder aria-hidden="true">${meta.icon}</div>
          <img class="menuCardImg" data-menu-product-img data-product-id="${menuEscapeHtml(product.id)}" alt="${menuEscapeHtml(product.name)}" loading="lazy" />
          <button type="button" class="menuCardWishlistBtn" data-wishlist-btn data-product-id="${menuEscapeHtml(product.id)}" aria-label="Thêm vào yêu thích">
            <i class="fa-regular fa-heart" aria-hidden="true"></i>
          </button>
          ${isFlash ? `<span class="menuCardBadge badgeFlash"><i class="fa-solid fa-bolt"></i> Flash -${discount}%</span>` : ""}
          ${!isFlash && product.isBestSeller ? '<span class="menuCardBadge badgeBestSeller"><i class="fa-solid fa-fire"></i> Bán chạy</span>' : ""}
          ${!isFlash && discount ? `<span class="menuCardBadge badgeSale">-${discount}%</span>` : ""}
          ${
            soldOut
              ? '<div class="menuCardSoldOutTag">Tạm hết</div>'
              : `
            <div class="menuCardOverlay">
              <a class="quickViewBtn" href="product.html?id=${encodeURIComponent(product.id)}">Xem chi tiết</a>
            </div>`
          }
        </div>
        <div class="menuCardBody">
          <p class="menuCardCategory">${meta.icon} ${meta.label}</p>
          <h3 class="menuCardName">${menuEscapeHtml(product.name)}</h3>
          <p class="menuCardSeller"><i class="fa-solid fa-store"></i> ${menuEscapeHtml(sellerLabel)}</p>
          <p class="menuCardDesc">${menuEscapeHtml(product.description || "")}</p>
          <div class="menuCardMetaRow">
            ${rating.total ? `<span class="menuCardRating"><i class="fa-solid fa-star"></i> ${rating.average.toFixed(1)} <span class="menuCardRatingCount">(${rating.total})</span></span>` : ""}
            <span>Đã bán ${menuFormatSold(product.soldCount)}</span>
          </div>
          <div class="menuCardFooter">
            <div class="menuCardPriceGroup">
              <span class="menuCardPrice">${formatPrice(effectivePrice)}</span>
              ${effectiveOriginal > effectivePrice ? `<span class="menuCardPriceOriginal">${formatPrice(effectiveOriginal)}</span>` : ""}
            </div>
            <button type="button" class="menuCardAddBtn" ${soldOut ? "disabled" : ""}
              data-menu-add
              data-product-id="${menuEscapeHtml(product.id)}"
              data-product-name="${menuEscapeHtml(product.name)}${isFlash ? " (⚡ Flash Sale)" : ""}"
              data-product-price="${effectivePrice}"
              data-product-img=""
              data-is-flash="${isFlash ? "true" : "false"}"
              aria-label="${soldOut ? "Sản phẩm tạm hết" : `Thêm ${menuEscapeHtml(product.name)} vào giỏ`}">
              <i class="fa-solid ${soldOut ? "fa-ban" : "fa-plus"}"></i>
              <span>${soldOut ? "Tạm hết" : "Thêm"}</span>
            </button>
          </div>
        </div>
      </article>`;
    })
    .join("");

  hydrateMenuProductImages(grid);
  if (typeof initWishlistButtons === "function") initWishlistButtons();

  grid.querySelectorAll("[data-menu-add]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!requireAuthenticatedUser("thêm sản phẩm vào giỏ hàng")) return;

      const product = menuState.products.find(
        (item) => item.id === button.dataset.productId,
      );
      if (
        !button.dataset.productImg &&
        typeof productImageService !== "undefined"
      ) {
        const cover = product
          ? await productImageService.resolveCoverImage(product, "../")
          : "";
        if (cover)
          button.dataset.productImg = new URL(cover, window.location.href).href;
      }

      const isFlash = button.dataset.isFlash === "true";
      let unitPrice = Number(button.dataset.productPrice) || 0;
      let itemId = button.dataset.productId;
      let itemName = button.dataset.productName;
      let itemNote = "";

      // Tự động áp dụng "Gu uống mặc định" khi bấm Thêm nhanh trên Thực đơn
      if (
        product &&
        typeof drinkPreferenceService !== "undefined"
      ) {
        const pref = drinkPreferenceService.getForCurrentUser();
        if (pref && pref.enabled) {
          const opts = product.options || {};
          const parts = [];
          const idSegments = [product.id];

          const sizeOption = Array.isArray(opts.sizes)
            ? opts.sizes.find((s) => s.code === pref.size) || opts.sizes[0]
            : null;
          if (sizeOption) {
            unitPrice += Number(sizeOption.extraPrice) || 0;
            parts.push(sizeOption.name);
            idSegments.push(sizeOption.code);
          }

          if (Array.isArray(opts.sugarLevels) && opts.sugarLevels.length) {
            const sugarVal = opts.sugarLevels.includes(pref.sugar)
              ? pref.sugar
              : opts.sugarLevels[0];
            parts.push(`Đường ${sugarVal}%`);
            idSegments.push(`sugar-${sugarVal}`);
          }

          if (Array.isArray(opts.iceLevels) && opts.iceLevels.length) {
            const iceVal = opts.iceLevels.includes(pref.ice)
              ? pref.ice
              : opts.iceLevels[0];
            parts.push(`Đá ${iceVal}%`);
            idSegments.push(`ice-${iceVal}`);
          }

          itemNote = String(pref.note || "").trim();
          if (itemNote) {
            const cleanNote = itemNote.toLowerCase().replace(/\s+/g, " ");
            idSegments.push(`note-${cleanNote}`);
          }

          if (isFlash) idSegments.push("flash");
          if (parts.length || itemNote) {
            itemId = idSegments.filter(Boolean).join("::");
            const baseName = product.name || itemName;
            itemName = `${baseName}${parts.length ? ` (${parts.join(", ")})` : ""}${isFlash ? " (⚡ Flash Sale)" : ""}`;
          }
        }
      }

      cartState.addItem({
        id: itemId,
        productId: button.dataset.productId,
        category: product?.category || "",
        sellerId: product?.sellerId || "",
        name: itemName,
        note: itemNote,
        price: unitPrice,
        isFlashSale: isFlash,
        img: button.dataset.productImg,
      });
    });
  });

  grid.querySelectorAll(".menuCard").forEach((card) => {
    card.tabIndex = 0;
    card.style.cursor = "pointer";
    const navigateToDetail = () => {
      const targetHref = new URL(
        `product.html?id=${encodeURIComponent(card.dataset.productId)}`,
        window.location.href,
      ).href;
      if (
        typeof koffiaRouter !== "undefined" &&
        typeof koffiaRouter.navigate === "function"
      ) {
        koffiaRouter.navigate(targetHref);
      } else {
        window.location.href = targetHref;
      }
    };
    card.addEventListener("click", (event) => {
      if (event.target.closest("a, button")) return;
      navigateToDetail();
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.target.closest("a, button")) {
        navigateToDetail();
      }
    });
  });
}

function updateMenuWishlistBadge() {
  const badge = document.getElementById("menuWishlistCount");
  if (!badge) return;
  const count =
    typeof wishlistService !== "undefined" ? wishlistService.count() : 0;
  badge.textContent = String(count);
  badge.hidden = count === 0;
}

function wireMenuControls() {
  const searchInput = document.getElementById("menuSearchInput");
  const clearBtn = document.getElementById("menuSearchClearBtn");
  const sortSelect = document.getElementById("menuSortSelect");
  const quickChips = [...document.querySelectorAll(".menuQuickChip")];
  const resetBtn = document.getElementById("menuQuickResetBtn");

  function syncClearBtn() {
    if (clearBtn && searchInput) {
      clearBtn.hidden = searchInput.value.length === 0;
    }
  }

  searchInput?.addEventListener("input", () => {
    menuState.search = searchInput.value;
    syncClearBtn();
    renderMenuProducts();
  });

  clearBtn?.addEventListener("click", () => {
    if (!searchInput) return;
    searchInput.value = "";
    menuState.search = "";
    syncClearBtn();
    renderMenuProducts();
    searchInput.focus();
  });

  sortSelect?.addEventListener("change", () => {
    menuState.sort = sortSelect.value;
    renderMenuProducts();
  });

  quickChips.forEach((chip) => {
    const key = chip.dataset.quickFilter;
    chip.classList.toggle("isActive", menuState.quickFilters.has(key));
    chip.setAttribute(
      "aria-pressed",
      menuState.quickFilters.has(key) ? "true" : "false",
    );
    chip.addEventListener("click", () => {
      if (!key) return;
      if (menuState.quickFilters.has(key)) {
        menuState.quickFilters.delete(key);
      } else {
        menuState.quickFilters.add(key);
      }
      const active = menuState.quickFilters.has(key);
      chip.classList.toggle("isActive", active);
      chip.setAttribute("aria-pressed", active ? "true" : "false");
      renderMenuProducts();
    });
  });

  resetBtn?.addEventListener("click", () => {
    menuState.quickFilters.clear();
    menuState.search = "";
    menuState.category = "all";
    if (searchInput) searchInput.value = "";
    syncClearBtn();
    quickChips.forEach((chip) => {
      chip.classList.remove("isActive");
      chip.setAttribute("aria-pressed", "false");
    });
    document.querySelectorAll(".filterBtn").forEach((btn) => {
      btn.classList.toggle("filterActive", btn.dataset.category === "all");
    });
    renderMenuProducts();
  });

  if (window._menuWishlistSyncHandler) {
    window.removeEventListener(
      "koffia:wishlist-changed",
      window._menuWishlistSyncHandler,
    );
  }
  window._menuWishlistSyncHandler = () => {
    updateMenuWishlistBadge();
    if (menuState.quickFilters.has("wishlist") && document.getElementById("menuGrid")) {
      renderMenuProducts();
    }
  };
  window.addEventListener(
    "koffia:wishlist-changed",
    window._menuWishlistSyncHandler,
  );

  syncClearBtn();
  updateMenuWishlistBadge();
}

async function initMenuPage() {
  const grid = document.getElementById("menuGrid");
  if (!grid) return;
  menuState.category = "all";
  menuState.search = "";
  menuState.sort = "default";
  menuState.quickFilters = new Set();
  renderMenuSkeleton();

  try {
    const response = await fetch("../json/products.json", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data))
      throw new Error("products.json không đúng định dạng mảng.");
    const customList =
      typeof productCatalogService !== "undefined" &&
      typeof productCatalogService.getCustomProducts === "function"
        ? productCatalogService.getCustomProducts()
        : [];
    const seenIds = new Set();
    const mergedProducts = [];
    [...customList, ...data].forEach((p) => {
      if (!p || !p.id || seenIds.has(p.id)) return;
      seenIds.add(p.id);
      mergedProducts.push(p);
    });
    menuState.products = mergedProducts;
    menuState.sellers =
      typeof sellerService !== "undefined"
        ? await sellerService.getMap()
        : new Map();

    // Nạp đợt flash sale đang chạy để đánh dấu trên thẻ món
    if (typeof flashSaleService !== "undefined") {
      try {
        const activeSales = await flashSaleService.getActiveSales();
        menuState.flashMap = new Map();
        activeSales.forEach((sale) => {
          (sale.products || []).forEach((p) => {
            menuState.flashMap.set(p.productId, {
              discountPercent: Number(p.discountPercent) || 20,
              saleId: sale.id,
              endTime: sale.endTime,
            });
          });
        });
      } catch (err) {
        console.warn("Không thể nạp flash sale cho menu:", err);
      }
    }

    renderCategoryFilters();
    initMenuMergedNav();
    wireMenuControls();
    renderMenuProducts();
  } catch (error) {
    console.error("Không tải được thực đơn:", error);
    grid.innerHTML = `
      <div class="menuErrorState">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <h3>Chưa tải được thực đơn</h3>
        <p>Hãy mở project bằng Live Server hoặc một web server cục bộ để trình duyệt có thể đọc file JSON.</p>
        <button type="button" class="btnSecondary" onclick="location.reload()">Thử lại</button>
      </div>`;
    const countEl = document.getElementById("resultsCount");
    if (countEl) countEl.textContent = "0";
  }
}

document.addEventListener("DOMContentLoaded", initMenuPage);
