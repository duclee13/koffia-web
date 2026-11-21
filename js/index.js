"use strict";

const indexCategoryMeta = {
  coffee: ['<i class="fa-solid fa-mug-hot" aria-hidden="true"></i>', "Cà phê"],
  tea: ['<i class="fa-solid fa-mug-saucer" aria-hidden="true"></i>', "Trà"],
  "milk-tea": [
    '<i class="fa-solid fa-glass-water" aria-hidden="true"></i>',
    "Trà sữa",
  ],
  juice: ['<i class="fa-solid fa-lemon" aria-hidden="true"></i>', "Nước ép"],
  smoothie: [
    '<i class="fa-solid fa-glass-water" aria-hidden="true"></i>',
    "Sinh tố",
  ],
  yogurt: [
    '<i class="fa-solid fa-ice-cream" aria-hidden="true"></i>',
    "Sữa chua",
  ],
  soda: [
    '<i class="fa-solid fa-champagne-glasses" aria-hidden="true"></i>',
    "Soda",
  ],
  kombucha: [
    '<i class="fa-solid fa-bottle-droplet" aria-hidden="true"></i>',
    "Kombucha",
  ],
  other: [
    '<i class="fa-solid fa-martini-glass-citrus" aria-hidden="true"></i>',
    "Khác",
  ],
};

function indexRatingStats(ratings) {
  let total = 0,
    weighted = 0;
  Object.entries(ratings || {}).forEach(([star, count]) => {
    total += Number(count) || 0;
    weighted += Number(star) * (Number(count) || 0);
  });
  return { total, average: total ? weighted / total : 0 };
}

function indexEscape(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

async function hydrateHomepageProductImages(grid, products) {
  if (typeof productImageService === "undefined") return;

  const imageNodes = [...grid.querySelectorAll("[data-home-product-img]")];
  await Promise.all(
    imageNodes.map(async (img) => {
      const product = products.find(
        (item) => item.id === img.dataset.productId,
      );
      if (!product) return;

      const cover = await productImageService.resolveCoverImage(product, "");
      if (!img.isConnected) return;

      const card = img.closest(".productCard");
      const placeholder = card?.querySelector("[data-home-img-placeholder]");
      const addButton = card?.querySelector("[data-add-to-cart]");

      if (!cover) {
        img.remove();
        return;
      }

      img.addEventListener(
        "load",
        () => {
          img.classList.add("productImgLoaded");
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

async function initHomepageProducts() {
  const grid = document.querySelector("#featuredProducts .productsGrid");
  if (!grid) return;
  try {
    const response = await fetch("json/products.json", { cache: "no-store" });
    if (!response.ok) return;
    const products = await response.json();
    const sellerMap =
      typeof sellerService !== "undefined"
        ? await sellerService.getMap()
        : new Map();
    const featured = products
      .filter((product) => product.isAvailable !== false)
      .sort(
        (a, b) =>
          Number(b.isBestSeller) - Number(a.isBestSeller) ||
          (b.soldCount || 0) - (a.soldCount || 0),
      )
      .slice(0, 4);

    grid.innerHTML = featured
      .map((product) => {
        const [categoryIcon, category] = indexCategoryMeta[
          product.category
        ] || [
          '<i class="fa-solid fa-martini-glass-citrus" aria-hidden="true"></i>',
          "Đồ uống",
        ];
        const rating = indexRatingStats(product.ratings);
        const hasDiscount = product.originalPrice > product.price;
        const seller = sellerMap.get(product.sellerId);
        return `
        <article class="productCard revealUp" role="listitem" tabindex="0" data-product-id="${indexEscape(product.id)}">
          <div class="productImgWrapper">
            <div class="homepageProductPlaceholder" data-home-img-placeholder aria-hidden="true">${categoryIcon}</div>
            <img class="productImgInner" data-home-product-img data-product-id="${indexEscape(product.id)}" alt="${indexEscape(product.name)}" loading="lazy" width="400" height="240" />
            ${product.isBestSeller ? '<span class="productBadge badgeBestSeller"><i class="fa-solid fa-fire" aria-hidden="true"></i> Bán chạy</span>' : ""}
            <button type="button" class="productWishlistBtn" data-wishlist-btn data-product-id="${indexEscape(product.id)}" aria-label="Thêm vào yêu thích"><i class="fa-regular fa-heart"></i></button>
          </div>
          <div class="productCardBody">
            <p class="productCategory">${categoryIcon} ${category}</p>
            <h3 class="productName">${indexEscape(product.name)}</h3>
            <p class="productSeller"><i class="fa-solid fa-store"></i> ${indexEscape(seller?.channelName || "Kênh đối tác")}</p>
            <p class="productDescription">${indexEscape(product.description || "")}</p>
            <div class="productRating" aria-label="${rating.average.toFixed(1)} trên 5 sao">
              <div class="starGroup" aria-hidden="true"><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i></div>
              <span class="ratingCount">${rating.total ? `(${rating.total})` : ""}</span>
            </div>
            <div class="productCardFooter">
              <div class="productPrice">
                <span class="productPriceMain">${formatPrice(product.price)}</span>
                ${hasDiscount ? `<span class="productPriceOld">${formatPrice(product.originalPrice)}</span>` : ""}
              </div>
              <button class="addToCartBtn" data-add-to-cart data-product-id="${indexEscape(product.id)}" data-product-name="${indexEscape(product.name)}" data-product-price="${product.price}" data-product-img="" aria-label="Thêm ${indexEscape(product.name)} vào giỏ hàng"><i class="fa-solid fa-plus"></i></button>
            </div>
          </div>
        </article>`;
      })
      .join("");

    hydrateHomepageProductImages(grid, products);

    // main.js đã chạy initAddToCartButtons trước renderer này, nên gắn lại handler cho card động.
    grid.querySelectorAll("[data-add-to-cart]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!requireAuthenticatedUser("thêm sản phẩm vào giỏ hàng")) return;
        const product = products.find(
          (item) => item.id === btn.dataset.productId,
        );
        if (
          !btn.dataset.productImg &&
          typeof productImageService !== "undefined"
        ) {
          const cover = product
            ? await productImageService.resolveCoverImage(product, "")
            : "";
          if (cover)
            btn.dataset.productImg = new URL(cover, window.location.href).href;
        }

        cartState.addItem({
          id: btn.dataset.productId,
          productId: btn.dataset.productId,
          category: product?.category || "",
          sellerId: product?.sellerId || "",
          name: btn.dataset.productName,
          price: Number(btn.dataset.productPrice),
          img: btn.dataset.productImg,
        });
      });
    });
    initWishlistButtons();

    // Khởi tạo Flash Sale và Voucher Section trên Trang Chủ trước khi kích hoạt Scroll Reveal
    await Promise.all([
      initHomepageFlashSale(products),
      initHomepageVouchers(),
    ]);

    initScrollReveal();
  } catch (error) {
    console.warn("Không thể đồng bộ sản phẩm nổi bật:", error);
  }
}

let flashSaleTimerInterval = null;

async function initHomepageFlashSale(products) {
  const section = document.getElementById("flashSaleSection");
  const grid = document.getElementById("flashSaleGrid");
  const countdownEl = document.getElementById("flashSaleCountdown");
  const subtitleEl = document.getElementById("flashSaleSubtitle");
  if (!section || !grid || typeof flashSaleService === "undefined") return;

  const activeSales = await flashSaleService.getActiveSales();
  let currentSale = activeSales[0];

  // Nếu hiện tại chưa tới giờ, lấy sale gần nhất để demo
  if (!currentSale) {
    const all = await flashSaleService.loadAll();
    currentSale = all.find((s) => s.status === "active") || all[0];
  }

  if (!currentSale || !currentSale.products?.length) {
    section.style.display = "none";
    return;
  }

  section.style.display = "";
  if (subtitleEl) {
    subtitleEl.textContent = `${currentSale.name} — ${currentSale.description || "Deal sốc có hạn!"}`;
  }

  // Setup countdown
  function updateCountdown() {
    const now = Date.now();
    let target = new Date(currentSale.endTime).getTime();
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    if (target > endOfToday.getTime()) {
      target = endOfToday.getTime();
    }
    let diff = target - now;

    if (diff <= 0) {
      // Tự động duy trì đếm ngược theo chu kỳ 4 tiếng để luôn tạo cảm giác trực quan sinh động
      diff = 4 * 3600 * 1000 - (now % (4 * 3600 * 1000));
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const hBox = document.getElementById("fsHours");
    const mBox = document.getElementById("fsMinutes");
    const sBox = document.getElementById("fsSeconds");

    const newH = String(hours).padStart(2, "0");
    const newM = String(minutes).padStart(2, "0");
    const newS = String(seconds).padStart(2, "0");

    function setBoxTick(el, newVal) {
      if (!el || el.textContent === newVal) return;
      el.textContent = newVal;
      el.classList.remove("tick");
      void el.offsetWidth;
      el.classList.add("tick");
    }

    setBoxTick(hBox, newH);
    setBoxTick(mBox, newM);
    setBoxTick(sBox, newS);
  }

  if (flashSaleTimerInterval) clearInterval(flashSaleTimerInterval);
  updateCountdown();
  flashSaleTimerInterval = setInterval(updateCountdown, 1000);

  // Render flash sale items
  const saleItems = currentSale.products.map((item) => {
    const prod = products.find((p) => p.id === item.productId);
    if (!prod) return null;
    const discount = Number(item.discountPercent) || 20;
    const salePrice = Math.round((prod.price * (100 - discount)) / 100);
    const sold = Number(item.soldQty) || 0;
    const max = Number(item.maxQty) || 50;
    const percentSold = Math.min(100, Math.round((sold / max) * 100));

    return {
      product: prod,
      discount,
      salePrice,
      sold,
      max,
      percentSold,
    };
  }).filter(Boolean);

  grid.innerHTML = saleItems.map(({ product, discount, salePrice, sold, max, percentSold }) => {
    const [categoryIcon] = indexCategoryMeta[product.category] || ['<i class="fa-solid fa-mug-hot"></i>'];
    return `
    <article class="flashCard revealUp" data-product-id="${indexEscape(product.id)}" data-flash-price="${salePrice}">
      <span class="flashBadgeDiscount"><i class="fa-solid fa-bolt"></i> -${discount}%</span>
      <div class="flashCardImgWrapper">
        <div class="homepageProductPlaceholder" data-flash-placeholder aria-hidden="true">${categoryIcon}</div>
        <img class="flashCardImg" data-flash-img data-product-id="${indexEscape(product.id)}" alt="${indexEscape(product.name)}" loading="lazy" />
      </div>
      <div class="flashCardBody">
        <h3 class="flashCardName">${indexEscape(product.name)}</h3>
        <div class="flashPriceRow">
          <span class="flashPriceMain">${formatPrice(salePrice)}</span>
          <span class="flashPriceOld">${formatPrice(product.price)}</span>
        </div>
        <div class="flashProgressBar" title="Đã bán ${sold}/${max}">
          <div class="flashProgressFill" style="width: ${percentSold}%;"></div>
          <span class="flashProgressText">${sold > 0 ? `Đã bán ${sold}` : "Vừa mở bán"}</span>
        </div>
        <div class="flashCardAction">
          <button class="btnPrimary flashBuyBtn" data-flash-buy data-product-id="${indexEscape(product.id)}" data-product-name="${indexEscape(product.name)}" data-product-price="${salePrice}">
            <i class="fa-solid fa-bag-shopping" aria-hidden="true"></i> Mua Với Giá Sale
          </button>
        </div>
      </div>
    </article>
    `;
  }).join("");

  // Hydrate flash images
  if (typeof productImageService !== "undefined") {
    const flashImgNodes = grid.querySelectorAll("[data-flash-img]");
    flashImgNodes.forEach(async (img) => {
      const prod = products.find((p) => p.id === img.dataset.productId);
      if (!prod) return;
      const cover = await productImageService.resolveCoverImage(prod, "");
      if (cover && img.isConnected) {
        img.src = cover;
        const card = img.closest(".flashCard");
        card?.querySelector("[data-flash-placeholder]")?.remove();
      }
    });
  }

  // Flash Buy button click
  grid.querySelectorAll("[data-flash-buy]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!requireAuthenticatedUser("mua sản phẩm Flash Sale")) return;
      const productId = btn.dataset.productId;
      const prod = products.find((p) => p.id === productId);
      let imgUrl = "";
      if (typeof productImageService !== "undefined" && prod) {
        const cover = await productImageService.resolveCoverImage(prod, "");
        if (cover) imgUrl = new URL(cover, window.location.href).href;
      }

      cartState.addItem({
        id: `${productId}::flashsale`,
        productId: productId,
        category: prod?.category || "",
        sellerId: prod?.sellerId || "",
        name: `${btn.dataset.productName} (⚡ Flash Sale)`,
        price: Number(btn.dataset.productPrice),
        img: imgUrl,
      });

      flashSaleService.recordSalePurchase(productId, 1);
    });
  });

  // Clicking on flash card goes to product detail
  grid.querySelectorAll(".flashCard").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("button, a")) return;
      window.location.href = `pages/product.html?id=${encodeURIComponent(card.dataset.productId)}`;
    });
  });

  // Kích hoạt animation reveal cho các thẻ flash sale vừa được render
  initScrollReveal(grid);
}

async function initHomepageVouchers() {
  const track = document.getElementById("voucherCardsTrack");
  const section = document.getElementById("voucherPromoSection");
  if (!track || !section || typeof voucherService === "undefined") return;

  const vouchers = await voucherService.getPublicVouchers();
  if (!vouchers.length) {
    section.style.display = "none";
    return;
  }

  section.style.display = "";
  const displayVouchers = vouchers.slice(0, 6);

  track.innerHTML = displayVouchers.map((v) => {
    let bigValue = `${v.value}%`;
    let typeLabel = "Giảm giá";
    if (v.type === "fixed") {
      bigValue = `${Math.round(v.value / 1000)}k`;
      typeLabel = "Giảm tiền";
    } else if (v.type === "freeShip") {
      bigValue = "0₫";
      typeLabel = "Free Ship";
    }

    return `
    <article class="voucherCouponCard" data-voucher-code="${indexEscape(v.code)}">
      <div class="voucherCardLeft">
        <span class="voucherValueBig">${bigValue}</span>
        <span class="voucherTypeLabel">${typeLabel}</span>
      </div>
      <div class="voucherCardRight">
        <h3 class="voucherCardName">${indexEscape(v.name)}</h3>
        <p class="voucherCardDesc">${indexEscape(v.description || "")}</p>
        <div class="voucherCardFooter">
          <span class="voucherCodePill">${indexEscape(v.code)}</span>
          <button type="button" class="voucherCopyBtn" data-copy-voucher="${indexEscape(v.code)}">
            <i class="fa-regular fa-copy" aria-hidden="true"></i> Lưu Mã
          </button>
        </div>
      </div>
    </article>
    `;
  }).join("");

  track.querySelectorAll("[data-copy-voucher]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const code = btn.dataset.copyVoucher || btn.getAttribute("data-copy-voucher");
      if (!code) return;
      navigator.clipboard?.writeText(code);
      btn.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Đã Lưu';
      btn.style.color = "var(--colorAccent)";
      showToast(`Đã sao chép mã "${code}"! Áp dụng khi thanh toán để được giảm.`);
      setTimeout(() => {
        btn.innerHTML = '<i class="fa-regular fa-copy" aria-hidden="true"></i> Lưu Mã';
        btn.style.color = "";
      }, 2500);
    });
  });

  // Kích hoạt reveal cho track voucher
  initScrollReveal(track);
}

function initHeroDrinkTabs() {
  const tabs = document.querySelectorAll(".heroDrinkTab");
  const img = document.getElementById("heroShowcaseImg");
  const name = document.getElementById("heroShowcaseName");
  const price = document.getElementById("heroShowcasePrice");
  const tag = document.getElementById("heroShowcaseTag");
  const badge = document.getElementById("heroShowcaseBadge");
  if (!tabs.length || !img || !name) return;

  const drinks = {
    latte: {
      img: "assets/images/productLatte.jpg",
      name: "Caramel Macchiato",
      price: "45.000 ₫",
      tag: "Signature Drink",
      badge: '<i class="fa-solid fa-fire"></i> Best Seller',
    },
    egg: {
      img: "assets/images/products/prod005/1.png",
      name: "Cà Phê Trứng Hà Nội",
      price: "39.000 ₫",
      tag: "Món Truyền Thống",
      badge: '<i class="fa-solid fa-crown"></i> Đặc Biệt',
    },
    tea: {
      img: "assets/images/heroBanner.jpg",
      name: "Trà Đào Cam Sả Tươi",
      price: "42.000 ₫",
      tag: "Giải Nhiệt Thanh Mát",
      badge: '<i class="fa-solid fa-leaf"></i> Thanh Mát',
    },
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const drinkId = tab.dataset.drinkId;
      const data = drinks[drinkId];
      if (!data) return;

      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");

      img.style.opacity = "0.2";
      setTimeout(() => {
        img.src = data.img;
        name.textContent = data.name;
        price.textContent = data.price;
        if (tag) tag.textContent = data.tag;
        if (badge) badge.innerHTML = data.badge;
        img.style.opacity = "1";
      }, 140);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initHeroDrinkTabs();
  initHomepageProducts();
});
