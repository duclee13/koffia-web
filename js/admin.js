"use strict";

const adminState = {
  user: null,
  activeTab: "overview",
  userFilter: "all",
  users: [],
  sellers: [],
  orders: [],
  flashSales: [],
  vouchers: [],
};

document.addEventListener("DOMContentLoaded", async () => {
  const user = customerService.getCurrentUser();
  const accessDenied = document.getElementById("adminAccessDenied");
  const adminApp = document.getElementById("adminApp");

  if (!user || user.role !== "dev") {
    if (accessDenied) accessDenied.style.display = "block";
    if (adminApp) adminApp.style.display = "none";
    return;
  }

  if (accessDenied) accessDenied.style.display = "none";
  if (adminApp) adminApp.style.display = "flex";

  adminState.user = user;
  const usernameDisplay = document.getElementById("adminUsernameDisplay");
  if (usernameDisplay) usernameDisplay.textContent = user.username || "admin";

  initSidebarTabs();
  await loadAllAdminData();
  renderOverview();
  wireFlashSaleModal();
  wireVoucherModal();
  wireLogout();
});

function wireLogout() {
  document.getElementById("adminLogoutBtn")?.addEventListener("click", () => {
    customerService.logout();
    showToast("Đã đăng xuất khỏi tài khoản Quản trị.");
    setTimeout(() => {
      window.location.href = "auth.html";
    }, 700);
  });
}

function initSidebarTabs() {
  document.querySelectorAll(".adminNavItem").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchTab(btn.dataset.tab);
    });
  });

  document.querySelectorAll("[data-adm-switch]").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchTab(btn.dataset.admSwitch);
    });
  });

  document.getElementById("adminCreateFlashBtn")?.addEventListener("click", () => {
    switchTab("flashsales");
    openFlashModal();
  });

  document.getElementById("adminCreateVoucherBtn")?.addEventListener("click", () => {
    switchTab("vouchers");
    openVoucherModal();
  });

  document.getElementById("openCreateFlashSaleModal")?.addEventListener("click", openFlashModal);
  document.getElementById("openCreateGlobalVoucherModal")?.addEventListener("click", openVoucherModal);

  document.querySelectorAll(".roleFilterTabs .filterPill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".roleFilterTabs .filterPill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      adminState.userFilter = pill.dataset.userFilter;
      renderUsersTable();
    });
  });

  document.getElementById("adminOrderSearch")?.addEventListener("input", (e) => {
    renderOrdersTable(e.target.value.toLowerCase().trim());
  });
}

function switchTab(tabName) {
  adminState.activeTab = tabName;
  document.querySelectorAll(".adminNavItem").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  document.querySelectorAll(".adminSection").forEach((sec) => {
    sec.style.display = sec.id === `adm-${tabName}` ? "block" : "none";
  });

  if (tabName === "overview") renderOverview();
  if (tabName === "flashsales") renderFlashSalesTable();
  if (tabName === "vouchers") renderVouchersTable();
  if (tabName === "users") renderUsersTable();
  if (tabName === "orders") renderOrdersTable();
}

async function loadAllAdminData() {
  adminState.users = await customerService.loadAll(true);
  adminState.sellers = await sellerService.loadAll(true);
  adminState.orders = orderHistoryService.loadAll();
  if (typeof flashSaleService !== "undefined") {
    adminState.flashSales = await flashSaleService.loadAll(true);
  }
  if (typeof voucherService !== "undefined") {
    adminState.vouchers = await voucherService.loadAll(true);
  }
}

function renderOverview() {
  const revEl = document.getElementById("adminStatTotalRevenue");
  const ordEl = document.getElementById("adminStatTotalOrders");
  const usrEl = document.getElementById("adminStatTotalUsers");
  const selEl = document.getElementById("adminStatTotalSellers");

  const totalRev = adminState.orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const totalSellers = adminState.users.filter((u) => u.role === "seller").length + adminState.sellers.length;

  if (revEl) revEl.textContent = formatPrice(totalRev);
  if (ordEl) ordEl.textContent = String(adminState.orders.length);
  if (usrEl) usrEl.textContent = String(adminState.users.length);
  if (selEl) selEl.textContent = String(totalSellers);

  const activeWrap = document.getElementById("adminActiveFlashSalesWrap");
  if (!activeWrap) return;

  const now = new Date();
  const activeSales = adminState.flashSales.filter(
    (s) => s.status === "active" && new Date(s.endTime) > now,
  );

  if (activeSales.length === 0) {
    activeWrap.innerHTML = '<p style="color:#64748b;grid-column:span 2;padding:12px;">Hiện không có đợt Flash Sale nào đang trong khung giờ vàng.</p>';
    return;
  }

  activeWrap.innerHTML = activeSales.slice(0, 4).map((s) => `
    <div class="adminSaleItemBox">
      <div>
        <strong style="font-size:15px;color:#0f172a;">${s.name}</strong>
        <p style="font-size:12px;color:#64748b;margin:3px 0 0;">${s.description || "Ưu đãi giới hạn"}</p>
        <span style="font-size:11px;color:#0284c7;font-weight:600;">Hết hạn: ${new Date(s.endTime).toLocaleTimeString("vi-VN")} ${new Date(s.endTime).toLocaleDateString("vi-VN")}</span>
      </div>
      <span class="statusActiveBadge"><i class="fa-solid fa-circle"></i> Đang chạy (${s.products?.length || 0} SP)</span>
    </div>
  `).join("");
}

function renderFlashSalesTable() {
  const tbody = document.getElementById("adminFlashSalesTbody");
  if (!tbody) return;

  if (adminState.flashSales.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:#94a3b8;">Chưa có đợt Flash Sale nào được tạo.</td></tr>';
    return;
  }

  tbody.innerHTML = adminState.flashSales.map((s) => `
    <tr>
      <td><strong>${s.name}</strong></td>
      <td>${new Date(s.startTime).toLocaleString("vi-VN")}</td>
      <td>${new Date(s.endTime).toLocaleString("vi-VN")}</td>
      <td>${s.products?.length || 0} sản phẩm</td>
      <td>
        <span class="${s.status === "active" ? "statusActiveBadge" : "statusPausedBadge"}">
          <i class="fa-solid fa-circle"></i> ${s.status === "active" ? "Đang chạy" : "Tạm dừng"}
        </span>
      </td>
      <td>
        <div class="sellerActionBtns">
          <button type="button" class="btnAction" data-flash-toggle="${s.id}" title="Bật/Tắt đợt sale">
            <i class="fa-solid fa-arrows-rotate"></i>
          </button>
          <button type="button" class="btnAction btnActionDanger" data-flash-delete="${s.id}" title="Xóa đợt sale">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-flash-toggle]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.flashToggle;
      const sale = adminState.flashSales.find((s) => s.id === id);
      if (sale) {
        sale.status = sale.status === "active" ? "paused" : "active";
        await flashSaleService.updateSale(id, { status: sale.status });
        renderFlashSalesTable();
        showToast(`Đã chuyển đợt sale "${sale.name}" sang: ${sale.status === "active" ? "Đang chạy" : "Tạm dừng"}`);
      }
    });
  });

  tbody.querySelectorAll("[data-flash-delete]").forEach((btn) => {
    const id = btn.dataset.flashDelete;
    const performDelete = async () => {
      await flashSaleService.deleteSale(id);
      adminState.flashSales = adminState.flashSales.filter((s) => s.id !== id);
      renderFlashSalesTable();
      showToast("Đã xóa đợt Flash Sale.");
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

function openFlashModal() {
  const modal = document.getElementById("adminFlashModal");
  if (!modal) return;
  modal.style.display = "flex";

  const now = new Date();
  const startTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const end = new Date(now.getTime() + 4 * 3600000 - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const startInput = document.getElementById("flashStartTime");
  const endInput = document.getElementById("flashEndTime");
  if (startInput) startInput.value = startTime;
  if (endInput) endInput.value = end;
}

function wireFlashSaleModal() {
  const modal = document.getElementById("adminFlashModal");
  const closeBtn = document.getElementById("closeAdminFlashModalBtn");
  const cancelBtn = document.getElementById("cancelAdminFlashBtn");
  const overlay = document.getElementById("adminFlashModalOverlay");
  const form = document.getElementById("adminFlashForm");

  const close = () => { if (modal) modal.style.display = "none"; };
  closeBtn?.addEventListener("click", close);
  cancelBtn?.addEventListener("click", close);
  overlay?.addEventListener("click", close);

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("flashName")?.value.trim();
    const description = document.getElementById("flashDesc")?.value.trim();
    const startTime = new Date(document.getElementById("flashStartTime")?.value).toISOString();
    const endTime = new Date(document.getElementById("flashEndTime")?.value).toISOString();
    const discount = Number(document.getElementById("flashDefaultDiscount")?.value) || 30;

    if (!name) return;

    // Pick top sample products for flash sale
    const sampleProducts = [
      { productId: "prod001", discountPercent: discount, maxQty: 50, soldQty: 0 },
      { productId: "prod005", discountPercent: discount, maxQty: 40, soldQty: 0 },
      { productId: "prod012", discountPercent: discount + 5, maxQty: 30, soldQty: 0 },
      { productId: "prod020", discountPercent: discount, maxQty: 60, soldQty: 0 },
    ];

    const newSale = await flashSaleService.createSale({
      name,
      description,
      startTime,
      endTime,
      products: sampleProducts,
      status: "active",
    });

    if (!adminState.flashSales.some((s) => s.id === newSale.id)) {
      adminState.flashSales.unshift(newSale);
    }
    renderOverview();
    renderFlashSalesTable();
    showToast(`Đã tạo thành công đợt Flash Sale "${name}"!`);
    close();
  });
}

function renderVouchersTable() {
  const tbody = document.getElementById("adminVouchersTbody");
  if (!tbody) return;

  if (adminState.vouchers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#94a3b8;">Chưa có voucher nào trên hệ thống.</td></tr>';
    return;
  }

  tbody.innerHTML = adminState.vouchers.map((v) => `
    <tr>
      <td><span class="voucherCodePill" style="font-size:12px;">${v.code}</span></td>
      <td><strong>${v.name}</strong></td>
      <td>${v.type === "percent" ? `Giảm ${v.value}% (max ${formatPrice(v.maxDiscount || 30000)})` : (v.type === "freeShip" ? "Miễn phí ship" : `Giảm ${formatPrice(v.value)}`)}</td>
      <td>${v.minOrderValue ? formatPrice(v.minOrderValue) : "0 ₫"}</td>
      <td>${v.usedCount || 0} / ${v.maxUsageTotal || "∞"}</td>
      <td>${v.sellerId ? `<span class="roleBadge roleSeller">Kênh ${v.sellerId}</span>` : '<span class="roleBadge roleDev">Toàn sàn</span>'}</td>
      <td>
        <span class="${v.status === "active" ? "statusActiveBadge" : "statusPausedBadge"}">
          <i class="fa-solid fa-circle"></i> ${v.status === "active" ? "Hoạt động" : "Tạm khóa"}
        </span>
      </td>
      <td>
        <button type="button" class="btnAction btnActionDanger" data-voucher-delete="${v.id}" title="Xóa voucher">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-voucher-delete]").forEach((btn) => {
    const id = btn.dataset.voucherDelete;
    const performDelete = async () => {
      await voucherService.deleteVoucher(id);
      adminState.vouchers = adminState.vouchers.filter((v) => v.id !== id);
      renderVouchersTable();
      showToast("Đã xóa voucher thành công.");
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

function openVoucherModal() {
  const modal = document.getElementById("adminVoucherModal");
  if (modal) modal.style.display = "flex";
}

function wireVoucherModal() {
  const modal = document.getElementById("adminVoucherModal");
  const closeBtn = document.getElementById("closeAdminVoucherModalBtn");
  const cancelBtn = document.getElementById("cancelAdminVoucherBtn");
  const overlay = document.getElementById("adminVoucherModalOverlay");
  const form = document.getElementById("adminVoucherForm");

  const close = () => { if (modal) modal.style.display = "none"; };
  closeBtn?.addEventListener("click", close);
  cancelBtn?.addEventListener("click", close);
  overlay?.addEventListener("click", close);

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = document.getElementById("admVoucherCode")?.value.trim().toUpperCase();
    const name = document.getElementById("admVoucherName")?.value.trim();
    const type = document.getElementById("admVoucherType")?.value;
    const value = Number(document.getElementById("admVoucherValue")?.value) || 20;
    const maxDiscount = Number(document.getElementById("admVoucherMaxDiscount")?.value) || 30000;
    const minOrderValue = Number(document.getElementById("admVoucherMinOrder")?.value) || 50000;
    const maxUsageTotal = Number(document.getElementById("admVoucherMaxUsage")?.value) || 1000;

    if (!code || !name) return;

    const newVoucher = await voucherService.createVoucher({
      code,
      name,
      type,
      value,
      maxDiscount,
      minOrderValue,
      maxUsageTotal,
      sellerId: null, // Global
      isPublic: true,
    });

    if (!adminState.vouchers.some((v) => v.id === newVoucher.id)) {
      adminState.vouchers.unshift(newVoucher);
    }
    renderVouchersTable();
    showToast(`Đã phát hành voucher "${code}" toàn sàn!`);
    close();
  });
}

function renderUsersTable() {
  const tbody = document.getElementById("adminUsersTbody");
  if (!tbody) return;

  let list = adminState.users;
  if (adminState.userFilter !== "all") {
    list = list.filter((u) => u.role === adminState.userFilter);
  }

  tbody.innerHTML = list.map((u) => {
    const fullName = `${u.firstName || ""} ${u.lastName || ""}`.trim() || "Chưa đặt tên";
    let roleBadge = '<span class="roleBadge roleCustomer">Khách Hàng</span>';
    if (u.role === "seller") roleBadge = '<span class="roleBadge roleSeller">Người Bán</span>';
    if (u.role === "dev") roleBadge = '<span class="roleBadge roleDev">Dev / Admin</span>';

    const remainingTrial = u.role === "seller" ? customerService.getSellerTrialRemainingDays(u) : 0;
    const trialText = u.role === "seller" ? (remainingTrial > 0 ? `Còn ${remainingTrial} ngày` : '<span style="color:#dc2626;font-weight:700;">Đã hết hạn</span>') : "—";

    return `
      <tr>
        <td><strong>${fullName}</strong></td>
        <td>
          <span style="font-weight:600;">@${u.username || "—"}</span><br/>
          <span style="font-size:11px;color:#64748b;">${u.email || "—"}</span>
        </td>
        <td>${roleBadge}</td>
        <td>${u.sellerProfile?.channelName ? `<strong>${u.sellerProfile.channelName}</strong><br/><span style="font-size:11px;color:#64748b;">${u.sellerProfile.phone || ""}</span>` : "—"}</td>
        <td>${trialText}</td>
        <td>
          <span class="${u.status === "disabled" ? "statusPausedBadge" : "statusActiveBadge"}">
            <i class="fa-solid fa-circle"></i> ${u.status === "disabled" ? "Bị khóa" : "Hoạt động"}
          </span>
        </td>
        <td>
          <div class="sellerActionBtns">
            ${u.role === "seller" ? `
              <button type="button" class="btnAction" data-user-extend="${u.id}" title="Gia hạn thêm 10 ngày trial">
                <i class="fa-solid fa-calendar-plus"></i> +10 ngày
              </button>
            ` : ""}
            ${u.role === "customer" ? `
              <button type="button" class="btnAction" data-user-promote="${u.id}" title="Cấp quyền Người Bán">
                <i class="fa-solid fa-store"></i> Cấp Seller
              </button>
            ` : ""}
            <button type="button" class="btnAction ${u.status === "disabled" ? "" : "btnActionDanger"}" data-user-toggle-status="${u.id}" title="${u.status === "disabled" ? "Mở khóa" : "Khóa tài khoản"}">
              <i class="fa-solid ${u.status === "disabled" ? "fa-unlock" : "fa-ban"}"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll("[data-user-extend]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.userExtend;
      const updated = await customerService.extendSellerTrial(id, 10);
      if (updated) {
        await loadAllAdminData();
        renderUsersTable();
        showToast("Đã gia hạn thêm 10 ngày dùng thử cho Seller!");
      }
    });
  });

  tbody.querySelectorAll("[data-user-promote]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.userPromote;
      const res = await customerService.registerSeller(id, {
        channelName: "Kênh mới được Admin duyệt",
        phone: "0901 000 000",
        address: "Hà Nội",
      });
      if (res.success) {
        await loadAllAdminData();
        renderUsersTable();
        showToast("Đã nâng quyền tài khoản thành Người Bán!");
      }
    });
  });

  tbody.querySelectorAll("[data-user-toggle-status]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.userToggleStatus;
      const u = adminState.users.find((user) => user.id === id);
      if (u) {
        const newStatus = u.status === "disabled" ? "active" : "disabled";
        await customerService.updateCustomer(id, { status: newStatus });
        await loadAllAdminData();
        renderUsersTable();
        showToast(`Đã ${newStatus === "disabled" ? "khóa" : "kích hoạt"} tài khoản!`);
      }
    });
  });
}

function renderOrdersTable(query = "") {
  const tbody = document.getElementById("adminOrdersTbody");
  if (!tbody) return;

  let list = adminState.orders;
  if (query) {
    list = list.filter((o) =>
      o.id.toLowerCase().includes(query) ||
      (o.customer?.name || "").toLowerCase().includes(query) ||
      (o.customer?.phone || "").includes(query),
    );
  }

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#94a3b8;">Không tìm thấy đơn hàng nào.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map((o) => `
    <tr>
      <td><strong>#${o.id}</strong></td>
      <td>${new Date(o.createdAt).toLocaleString("vi-VN")}</td>
      <td>
        <strong>${o.customer?.name || "Khách hàng"}</strong><br/>
        <span style="font-size:11px;color:#64748b;">${o.customer?.phone || ""}</span>
      </td>
      <td style="max-width:180px;font-size:11px;color:#64748b;">${o.customer?.address || "—"}</td>
      <td>${o.items?.length || 0} món</td>
      <td><strong style="color:var(--colorAccent);">${formatPrice(o.total)}</strong></td>
      <td>
        <span class="sellerStatusBadge ${orderHistoryService.getStatusMeta(o.status).className}">
          ${orderHistoryService.getStatusMeta(o.status).label}
        </span>
      </td>
      <td>
        <select class="statusSelect" data-admin-order-status="${o.id}">
          <option value="new" ${o.status === "new" ? "selected" : ""}>Đã tiếp nhận</option>
          <option value="preparing" ${o.status === "preparing" ? "selected" : ""}>Đang chuẩn bị</option>
          <option value="delivering" ${o.status === "delivering" ? "selected" : ""}>Đang giao</option>
          <option value="completed" ${o.status === "completed" ? "selected" : ""}>Hoàn thành</option>
          <option value="cancelled" ${o.status === "cancelled" ? "selected" : ""}>Đã hủy</option>
        </select>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-admin-order-status]").forEach((sel) => {
    sel.addEventListener("change", () => {
      const orderId = sel.dataset.adminOrderStatus;
      const newStatus = sel.value;
      const order = adminState.orders.find((o) => o.id === orderId);
      if (order) {
        order.status = newStatus;
        order.manualStatus = true;
        orderHistoryService.persist(adminState.orders);
        renderOverview();
        renderOrdersTable(query);
        showToast(`Đã chuyển đơn #${orderId} sang "${orderHistoryService.getStatusMeta(newStatus).label}"`);
      }
    });
  });
}
