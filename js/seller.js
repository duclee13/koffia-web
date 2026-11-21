"use strict";

const CUSTOM_PRODUCTS_STORAGE_KEY = "koffiaCustomProducts";

const sellerPortalState = {
  user: null,
  sellerProfile: null,
  products: [],
  orders: [],
  vouchers: [],
  activeTab: "overview",
  orderFilter: "all",
};

function getCustomProducts() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_PRODUCTS_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveCustomProducts(products) {
  localStorage.setItem(CUSTOM_PRODUCTS_STORAGE_KEY, JSON.stringify(products));
  if (typeof productCatalogService !== "undefined") {
    productCatalogService.productMap = null;
  }
  if (typeof koffiaCloudSync !== "undefined") {
    koffiaCloudSync.schedulePush("customProducts");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const user = customerService.getCurrentUser();
  if (!user || (user.role !== "seller" && user.role !== "dev")) {
    showToast("Bạn cần đăng ký hoặc đăng nhập với quyền Người Bán để truy cập.", "error");
    setTimeout(() => {
      window.location.href = user ? "account.html" : "auth.html";
    }, 1000);
    return;
  }

  const headerEl = document.getElementById("sellerHeader");
  const layoutEl = document.getElementById("sellerLayout");
  if (headerEl) headerEl.style.display = "";
  if (layoutEl) layoutEl.style.display = "";

  sellerPortalState.user = user;
  sellerPortalState.sellerProfile = user.sellerProfile || {
    id: `seller_${user.id}`,
    channelName: `${user.lastName || user.username}'s Store`,
    phone: user.phone || "",
    address: "Hà Nội",
    rating: 5.0,
  };

  initSellerHeader();
  initSidebarTabs();
  await loadSellerData();
  renderOverview();
  wireProductModal();
  wireVoucherModal();
  wireSettingsForm();
});

function initSellerHeader() {
  const storeName = document.getElementById("sellerStoreName");
  const trialPill = document.getElementById("sellerTrialPill");
  const trialDays = document.getElementById("sellerTrialDays");

  if (storeName) {
    storeName.textContent = sellerPortalState.sellerProfile.channelName || "Cửa Hàng Của Bạn";
  }

  if (sellerPortalState.user.role === "dev") {
    if (trialPill) {
      trialPill.className = "sellerTrialPill";
      trialPill.style.background = "#0f172a";
      trialPill.style.color = "#38bdf8";
      trialPill.style.borderColor = "rgba(56, 189, 248, 0.4)";
      if (trialDays) trialDays.textContent = "Super Admin / Dev";
    }
  } else {
    const days = customerService.getSellerTrialRemainingDays(sellerPortalState.user);
    if (trialDays) {
      trialDays.textContent = days > 0 ? `Trial: còn ${days} ngày` : "Trial đã hết hạn";
    }
    if (trialPill && days <= 0) {
      trialPill.style.background = "#fee2e2";
      trialPill.style.color = "#b91c1c";
      trialPill.style.borderColor = "#fca5a5";
    }
  }
}

function initSidebarTabs() {
  const navBtns = document.querySelectorAll(".sellerNavItem");
  navBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabName = btn.dataset.tab;
      switchTab(tabName);
    });
  });

  document.querySelectorAll("[data-switch-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchTab(btn.dataset.switchTab);
    });
  });

  document.getElementById("quickAddProductBtn")?.addEventListener("click", () => {
    switchTab("products");
    openProductModal();
  });

  document.getElementById("addNewProductBtn")?.addEventListener("click", () => {
    openProductModal();
  });

  document.querySelectorAll(".filterPill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".filterPill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      sellerPortalState.orderFilter = pill.dataset.orderFilter;
      renderOrdersTable();
    });
  });
}

function switchTab(tabName) {
  sellerPortalState.activeTab = tabName;
  document.querySelectorAll(".sellerNavItem").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  document.querySelectorAll(".sellerSection").forEach((sec) => {
    sec.style.display = sec.id === `tab-${tabName}` ? "block" : "none";
  });

  if (tabName === "overview") renderOverview();
  if (tabName === "products") renderProductsTable();
  if (tabName === "orders") renderOrdersTable();
  if (tabName === "vouchers") renderVouchersTable();
  if (tabName === "settings") loadSettingsForm();
}

async function loadSellerData() {
  const sellerId = sellerPortalState.sellerProfile.id;

  // Load products
  let baseProducts = [];
  try {
    const res = await fetch("../json/products.json", { cache: "no-store" });
    baseProducts = res.ok ? await res.json() : [];
  } catch {}

  const customProducts = getCustomProducts();
  const allMergedProducts = [...customProducts, ...baseProducts];

  // If user is seller of custom products or one of sample sellers
  const sellerProducts = allMergedProducts.filter(
    (p) => p.sellerId === sellerId || (sellerPortalState.user.role === "dev" && !p.sellerId),
  );

  // If newly registered seller with 0 products, give them 3 initial template products
  if (sellerProducts.length === 0 && customProducts.length === 0) {
    const sampleSeed = baseProducts.slice(0, 3).map((p, idx) => ({
      ...p,
      id: `prod_${sellerId}_${idx + 1}`,
      name: `${p.name} (${sellerPortalState.sellerProfile.channelName})`,
      sellerId: sellerId,
    }));
    saveCustomProducts(sampleSeed);
    sellerPortalState.products = sampleSeed;
  } else {
    sellerPortalState.products = sellerProducts.length > 0 ? sellerProducts : customProducts;
  }

  // Load orders
  const allOrders = orderHistoryService.loadAll();
  sellerPortalState.orders = allOrders;

  // Load vouchers
  if (typeof voucherService !== "undefined") {
    const allVouchers = await voucherService.loadAll();
    sellerPortalState.vouchers = allVouchers.filter((v) => v.sellerId === sellerId);
  }
}

function renderOverview() {
  const revEl = document.getElementById("statRevenue");
  const ordersEl = document.getElementById("statOrdersCount");
  const prodsEl = document.getElementById("statProductsCount");
  const ratingEl = document.getElementById("statRating");

  const revenue = sellerPortalState.orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  if (revEl) revEl.textContent = formatPrice(revenue);
  if (ordersEl) ordersEl.textContent = String(sellerPortalState.orders.length);
  if (prodsEl) prodsEl.textContent = String(sellerPortalState.products.length);
  if (ratingEl) ratingEl.textContent = `${sellerPortalState.sellerProfile.rating || 5.0} ⭐`;

  // Recent orders table
  const tbody = document.getElementById("recentOrdersTbody");
  if (!tbody) return;

  const recent = sellerPortalState.orders.slice(0, 5);
  if (recent.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:#94a3b8;">Chưa có đơn hàng nào phát sinh.</td></tr>';
    return;
  }

  tbody.innerHTML = recent.map((o) => {
    const statusMeta = orderHistoryService.getStatusMeta(o.status);
    const itemNames = (o.items || []).map((i) => `${i.name} (x${i.qty})`).join(", ");
    return `
      <tr>
        <td><strong>#${o.id}</strong></td>
        <td>${new Date(o.createdAt).toLocaleString("vi-VN")}</td>
        <td>${o.customer?.name || "Khách hàng"}</td>
        <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${itemNames}">${itemNames}</td>
        <td><strong>${formatPrice(o.total)}</strong></td>
        <td><span class="sellerStatusBadge ${statusMeta.className}">${statusMeta.label}</span></td>
      </tr>
    `;
  }).join("");
}

function renderProductsTable() {
  const tbody = document.getElementById("sellerProductsTbody");
  const search = document.getElementById("sellerProductSearch")?.value.toLowerCase().trim() || "";
  const cat = document.getElementById("sellerProductCategoryFilter")?.value || "all";
  if (!tbody) return;

  let list = sellerPortalState.products;
  if (cat !== "all") list = list.filter((p) => p.category === cat);
  if (search) list = list.filter((p) => (p.name || "").toLowerCase().includes(search));

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:#94a3b8;">Không tìm thấy món nào. Hãy bấm "Thêm Món Mới" để tạo thức uống đầu tiên!</td></tr>';
    return;
  }

  tbody.innerHTML = list.map((p) => `
    <tr>
      <td>
        <strong>${p.name}</strong>
        ${p.isBestSeller ? ' <span class="badgeBestSeller" style="font-size:10px;padding:2px 6px;">Hot</span>' : ""}
      </td>
      <td><span style="text-transform:capitalize;">${p.category || "Đồ uống"}</span></td>
      <td><strong style="color:var(--colorAccent);">${formatPrice(p.price)}</strong></td>
      <td><span style="color:#94a3b8;text-decoration:line-through;">${p.originalPrice ? formatPrice(p.originalPrice) : "—"}</span></td>
      <td>
        <span class="sellerStatusBadge ${p.isAvailable !== false ? "statusAvailable" : "statusUnavailable"}">
          <i class="fa-solid ${p.isAvailable !== false ? "fa-circle-check" : "fa-circle-xmark"}"></i>
          ${p.isAvailable !== false ? "Đang bán" : "Tạm hết"}
        </span>
      </td>
      <td>
        <div class="sellerActionBtns">
          <button type="button" class="btnAction" data-prod-toggle="${p.id}" title="Đổi trạng thái còn/hết">
            <i class="fa-solid fa-arrows-rotate"></i>
          </button>
          <button type="button" class="btnAction" data-prod-edit="${p.id}" title="Chỉnh sửa">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button type="button" class="btnAction btnActionDanger" data-prod-delete="${p.id}" title="Xóa món">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-prod-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.prodToggle;
      const prod = sellerPortalState.products.find((p) => p.id === id);
      if (prod) {
        prod.isAvailable = prod.isAvailable === false;
        saveCustomProducts(sellerPortalState.products);
        renderProductsTable();
        showToast(`Đã chuyển trạng thái "${prod.name}" thành: ${prod.isAvailable ? "Đang bán" : "Tạm hết"}`);
      }
    });
  });

  tbody.querySelectorAll("[data-prod-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.prodEdit;
      const prod = sellerPortalState.products.find((p) => p.id === id);
      if (prod) openProductModal(prod);
    });
  });

  tbody.querySelectorAll("[data-prod-delete]").forEach((btn) => {
    const id = btn.dataset.prodDelete;
    const performDelete = () => {
      sellerPortalState.products = sellerPortalState.products.filter((p) => p.id !== id);
      saveCustomProducts(sellerPortalState.products);
      renderProductsTable();
      showToast("Đã xóa sản phẩm thành công.");
    };
    if (typeof wireTwoTapConfirm === "function") {
      wireTwoTapConfirm(btn, {
        confirmHtml: '<i class="fa-solid fa-check" aria-hidden="true"></i> Xóa?',
        onConfirm: performDelete,
      });
    } else {
      btn.addEventListener("click", performDelete);
    }
  });

  document.getElementById("sellerProductSearch")?.addEventListener("input", renderProductsTable);
  document.getElementById("sellerProductCategoryFilter")?.addEventListener("change", renderProductsTable);
}

function openProductModal(prod = null) {
  const modal = document.getElementById("productModal");
  const title = document.getElementById("productModalTitle");
  const idInput = document.getElementById("prodEditId");
  const nameInput = document.getElementById("prodName");
  const catInput = document.getElementById("prodCategory");
  const priceInput = document.getElementById("prodPrice");
  const origPriceInput = document.getElementById("prodOriginalPrice");
  const descInput = document.getElementById("prodDesc");
  const availInput = document.getElementById("prodIsAvailable");

  if (!modal) return;
  modal.style.display = "flex";

  if (prod) {
    if (title) title.innerHTML = '<i class="fa-solid fa-pen"></i> Chỉnh Sửa Món';
    if (idInput) idInput.value = prod.id;
    if (nameInput) nameInput.value = prod.name;
    if (catInput) catInput.value = prod.category || "coffee";
    if (priceInput) priceInput.value = prod.price;
    if (origPriceInput) origPriceInput.value = prod.originalPrice || "";
    if (descInput) descInput.value = prod.description || "";
    if (availInput) availInput.checked = prod.isAvailable !== false;
  } else {
    if (title) title.innerHTML = '<i class="fa-solid fa-mug-hot"></i> Thêm Món Mới Cho Quán';
    if (idInput) idInput.value = "";
    if (nameInput) nameInput.value = "";
    if (catInput) catInput.value = "coffee";
    if (priceInput) priceInput.value = "";
    if (origPriceInput) origPriceInput.value = "";
    if (descInput) descInput.value = "";
    if (availInput) availInput.checked = true;
  }
}

function wireProductModal() {
  const modal = document.getElementById("productModal");
  const closeBtn = document.getElementById("closeProductModalBtn");
  const cancelBtn = document.getElementById("cancelProductBtn");
  const overlay = document.getElementById("productModalOverlay");
  const form = document.getElementById("sellerProductForm");

  const close = () => { if (modal) modal.style.display = "none"; };
  closeBtn?.addEventListener("click", close);
  cancelBtn?.addEventListener("click", close);
  overlay?.addEventListener("click", close);

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const editId = document.getElementById("prodEditId")?.value;
    const name = document.getElementById("prodName")?.value.trim();
    const category = document.getElementById("prodCategory")?.value;
    const price = Number(document.getElementById("prodPrice")?.value) || 30000;
    const originalPrice = Number(document.getElementById("prodOriginalPrice")?.value) || 0;
    const description = document.getElementById("prodDesc")?.value.trim();
    const isAvailable = document.getElementById("prodIsAvailable")?.checked;
    const sellerId = sellerPortalState.sellerProfile.id;

    if (!name) return;

    if (editId) {
      const idx = sellerPortalState.products.findIndex((p) => p.id === editId);
      if (idx >= 0) {
        sellerPortalState.products[idx] = {
          ...sellerPortalState.products[idx],
          name,
          category,
          price,
          originalPrice,
          description,
          isAvailable,
        };
        showToast(`Đã cập nhật món "${name}"!`);
      }
    } else {
      const newProd = {
        id: `prod_${sellerId}_${Date.now().toString(36)}`,
        sellerId,
        name,
        category,
        price,
        originalPrice: originalPrice > price ? originalPrice : 0,
        description,
        isAvailable,
        soldCount: 0,
        ratings: { "5": 1 },
        isBestSeller: false,
        options: {
          sizes: [
            { code: "S", name: "Nhỏ", extraPrice: 0 },
            { code: "M", name: "Vừa", extraPrice: 6000 },
            { code: "L", name: "Lớn", extraPrice: 10000 },
          ],
          sugarLevels: [0, 30, 50, 70, 100],
          iceLevels: [0, 30, 50, 70, 100],
          toppings: [
            { id: "top01", name: "Thạch Cà Phê", price: 8000 },
            { id: "top02", name: "Kem Cheese Extra", price: 10000 },
          ],
        },
      };
      sellerPortalState.products.unshift(newProd);
      showToast(`Đã thêm món "${name}" vào thực đơn!`);
    }

    saveCustomProducts(sellerPortalState.products);
    renderProductsTable();
    close();
  });
}

function renderOrdersTable() {
  const tbody = document.getElementById("allSellerOrdersTbody");
  if (!tbody) return;

  let list = sellerPortalState.orders;
  if (sellerPortalState.orderFilter !== "all") {
    list = list.filter((o) => o.status === sellerPortalState.orderFilter);
  }

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#94a3b8;">Không có đơn hàng nào trong mục này.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map((o) => {
    const itemNames = (o.items || []).map((i) => `${i.name} (x${i.qty})`).join(", ");
    return `
      <tr>
        <td><strong>#${o.id}</strong></td>
        <td>${new Date(o.createdAt).toLocaleString("vi-VN")}</td>
        <td>
          <strong>${o.customer?.name || "Khách hàng"}</strong><br/>
          <span style="font-size:11px;color:#64748b;">${o.customer?.phone || ""}</span><br/>
          <span style="font-size:11px;color:#94a3b8;">${o.customer?.address || ""}</span>
        </td>
        <td style="max-width:200px;">${itemNames}</td>
        <td><strong style="color:var(--colorAccent);">${formatPrice(o.total)}</strong></td>
        <td>
          <span class="sellerStatusBadge ${orderHistoryService.getStatusMeta(o.status).className}">
            ${orderHistoryService.getStatusMeta(o.status).label}
          </span>
        </td>
        <td>
          <select class="statusSelect" data-order-status-update="${o.id}">
            <option value="new" ${o.status === "new" ? "selected" : ""}>Đã tiếp nhận</option>
            <option value="preparing" ${o.status === "preparing" ? "selected" : ""}>Đang chuẩn bị</option>
            <option value="delivering" ${o.status === "delivering" ? "selected" : ""}>Đang giao</option>
            <option value="completed" ${o.status === "completed" ? "selected" : ""}>Hoàn thành</option>
            <option value="cancelled" ${o.status === "cancelled" ? "selected" : ""}>Đã hủy</option>
          </select>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll("[data-order-status-update]").forEach((sel) => {
    sel.addEventListener("change", () => {
      const orderId = sel.dataset.orderStatusUpdate;
      const newStatus = sel.value;
      const order = sellerPortalState.orders.find((o) => o.id === orderId);
      if (order) {
        order.status = newStatus;
        order.manualStatus = true;
        orderHistoryService.persist(sellerPortalState.orders);
        renderOverview();
        renderOrdersTable();
        showToast(`Đã chuyển đơn #${orderId} sang trạng thái: "${orderHistoryService.getStatusMeta(newStatus).label}"`);
      }
    });
  });
}

function renderVouchersTable() {
  const tbody = document.getElementById("sellerVouchersTbody");
  if (!tbody) return;

  if (sellerPortalState.vouchers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#94a3b8;">Quán chưa có voucher nào. Hãy bấm "Tạo Mã Voucher Mới" để tạo ngay!</td></tr>';
    return;
  }

  tbody.innerHTML = sellerPortalState.vouchers.map((v) => `
    <tr>
      <td><span class="voucherCodePill" style="font-size:12px;">${v.code}</span></td>
      <td><strong>${v.name}</strong></td>
      <td>${v.type === "percent" ? `Giảm ${v.value}%` : `Giảm ${formatPrice(v.value)}`}</td>
      <td>${v.minOrderValue ? formatPrice(v.minOrderValue) : "0 ₫"}</td>
      <td>${v.usedCount || 0} / ${v.maxUsageTotal || 500}</td>
      <td><span class="sellerStatusBadge statusAvailable">Hoạt động</span></td>
      <td>
        <button type="button" class="btnAction btnActionDanger" data-voucher-delete="${v.id}" title="Xóa mã">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-voucher-delete]").forEach((btn) => {
    const id = btn.dataset.voucherDelete;
    const performDelete = async () => {
      await voucherService.deleteVoucher(id);
      sellerPortalState.vouchers = sellerPortalState.vouchers.filter((v) => v.id !== id);
      renderVouchersTable();
      showToast("Đã xóa voucher của quán.");
    };
    if (typeof wireTwoTapConfirm === "function") {
      wireTwoTapConfirm(btn, {
        confirmHtml: '<i class="fa-solid fa-check" aria-hidden="true"></i> Xóa?',
        onConfirm: performDelete,
      });
    } else {
      btn.addEventListener("click", performDelete);
    }
  });
}

function wireVoucherModal() {
  const modal = document.getElementById("sellerVoucherModal");
  const openBtn = document.getElementById("openAddVoucherModalBtn");
  const closeBtn = document.getElementById("closeSellerVoucherModalBtn");
  const cancelBtn = document.getElementById("cancelSellerVoucherBtn");
  const overlay = document.getElementById("sellerVoucherOverlay");
  const form = document.getElementById("sellerVoucherForm");

  const close = () => { if (modal) modal.style.display = "none"; };
  openBtn?.addEventListener("click", () => { if (modal) modal.style.display = "flex"; });
  closeBtn?.addEventListener("click", close);
  cancelBtn?.addEventListener("click", close);
  overlay?.addEventListener("click", close);

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = document.getElementById("voucherCode")?.value.trim().toUpperCase();
    const name = document.getElementById("voucherName")?.value.trim();
    const type = document.getElementById("voucherType")?.value;
    const value = Number(document.getElementById("voucherValue")?.value) || 10;
    const minOrderValue = Number(document.getElementById("voucherMinOrder")?.value) || 0;
    const maxDiscount = Number(document.getElementById("voucherMaxDiscount")?.value) || 25000;
    const sellerId = sellerPortalState.sellerProfile.id;

    if (!code || !name) return;

    const newVoucher = await voucherService.createVoucher({
      code,
      name,
      description: `Ưu đãi độc quyền từ kênh ${sellerPortalState.sellerProfile.channelName}`,
      type,
      value,
      minOrderValue,
      maxDiscount,
      sellerId,
      isPublic: true,
    });

    sellerPortalState.vouchers.unshift(newVoucher);
    showToast(`Đã tạo thành công voucher "${code}" cho quán!`);
    renderVouchersTable();
    close();
  });
}

function loadSettingsForm() {
  const channelNameInput = document.getElementById("storeChannelName");
  const phoneInput = document.getElementById("storePhone");
  const addressInput = document.getElementById("storeAddress");
  const descInput = document.getElementById("storeDescription");

  const profile = sellerPortalState.sellerProfile;
  if (channelNameInput) channelNameInput.value = profile.channelName || "";
  if (phoneInput) phoneInput.value = profile.phone || "";
  if (addressInput) addressInput.value = profile.address || "";
  if (descInput) descInput.value = profile.description || "";
}

function wireSettingsForm() {
  const form = document.getElementById("sellerSettingsForm");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const channelName = document.getElementById("storeChannelName")?.value.trim();
    const phone = document.getElementById("storePhone")?.value.trim();
    const address = document.getElementById("storeAddress")?.value.trim();
    const description = document.getElementById("storeDescription")?.value.trim();

    if (!channelName || !phone || !address) {
      showToast("Vui lòng điền đủ tên, số điện thoại và địa chỉ quán.", "error");
      return;
    }

    const updatedProfile = {
      ...sellerPortalState.sellerProfile,
      channelName,
      phone,
      address,
      description,
    };

    sellerPortalState.sellerProfile = updatedProfile;
    await customerService.updateCustomer(sellerPortalState.user.id, {
      sellerProfile: updatedProfile,
    });
    await sellerService.addOrUpdateSeller(updatedProfile);

    initSellerHeader();
    showToast("Đã lưu thông tin quán thành công!");
  });
}
