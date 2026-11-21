/* Ảnh đại diện mặc định (SVG inline) — dùng khi khách hàng chưa có avatar */
const defaultAvatarDataUri =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%233E2723'/%3E%3Ccircle cx='50' cy='38' r='18' fill='%23F5E6D3'/%3E%3Cpath d='M50 62c-22 0-34 12-34 26v12h68V88c0-14-12-26-34-26z' fill='%23F5E6D3'/%3E%3C/svg%3E";

/* Placeholder nhẹ để giao diện không vỡ khi thư mục ảnh sản phẩm chưa được chép vào project. */
const defaultProductImageDataUri =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220' viewBox='0 0 220 220'%3E%3Crect width='220' height='220' rx='18' fill='%23F7F0E8'/%3E%3Ctext x='110' y='102' text-anchor='middle' font-size='54'%3E%F0%9F%A5%A4%3C/text%3E%3Ctext x='110' y='145' text-anchor='middle' font-family='Arial' font-size='18' font-weight='700' fill='%233E2723'%3EKoffia%3C/text%3E%3C/svg%3E";

let isInsidePagesFolder = window.location.pathname
  .replace(/\\/g, "/")
  .includes("/pages/");
let projectRootPrefix = isInsidePagesFolder ? "../" : "";

const AUTH_SESSION_STORAGE_KEY = "koffiaCurrentUser";
const ACCOUNT_CART_STORAGE_PREFIX = "koffiaCartByUser:";
const LEGACY_CART_STORAGE_KEY = "koffiaCart";
const KOFFIA_FREESHIP_THRESHOLD = 50000;
const KOFFIA_BASE_SHIPPING_FEE = 15000;

function escapeHtmlGlobal(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildFreeshipProgressHtml(subtotal, hasFreeShipVoucher = false) {
  const safeSubtotal = Math.max(0, Number(subtotal) || 0);
  const remaining = Math.max(0, KOFFIA_FREESHIP_THRESHOLD - safeSubtotal);
  const isUnlocked = remaining === 0 || Boolean(hasFreeShipVoucher);
  const pct = isUnlocked
    ? 100
    : Math.min(100, Math.round((safeSubtotal / KOFFIA_FREESHIP_THRESHOLD) * 100));

  let textHtml = "";
  if (remaining === 0) {
    textHtml = `Tuyệt vời! Bạn đã đạt <strong>Miễn phí giao hàng</strong>`;
  } else if (hasFreeShipVoucher) {
    textHtml = `Đã mở khóa <strong>Miễn phí giao hàng</strong> từ Voucher`;
  } else {
    textHtml = `Mua thêm <strong>${formatPrice(remaining)}</strong> nữa để được <strong>Freeship</strong>!`;
  }

  return `
    <div class="iosFreeshipCard${isUnlocked ? " isUnlocked" : ""}" role="status" aria-live="polite">
      <div class="iosFreeshipTop">
        <span class="iosFreeshipIcon" aria-hidden="true">
          <i class="fa-solid ${isUnlocked ? "fa-circle-check" : "fa-truck-fast"}"></i>
        </span>
        <span class="iosFreeshipText">${textHtml}</span>
      </div>
      <div class="iosFreeshipTrack" aria-hidden="true">
        <div class="iosFreeshipFill" style="width: ${pct}%"></div>
      </div>
    </div>
  `.trim();
}

/* ────────────────────────────────────────────────────────────
   ONE-TIME DEMO DATA RESET
   - Bản source thuyết trình: khởi động sạch để demo đăng ký tài khoản mới.
   - Chỉ chạy MỘT LẦN trên mỗi origin trình duyệt cho phiên bản reset bên dưới.
   - Sau lần đầu, marker được giữ lại nên dữ liệu mới tạo sẽ KHÔNG bị xóa khi reload/chuyển trang.
   ──────────────────────────────────────────────────────────── */
const DEMO_DATA_RESET_VERSION = "2026-08-16-presentation-clean-v2";
const DEMO_DATA_RESET_MARKER_KEY = "koffiaDataResetVersion";

function resetKoffiaDemoDataOnce() {
  try {
    if (
      localStorage.getItem(DEMO_DATA_RESET_MARKER_KEY) ===
      DEMO_DATA_RESET_VERSION
    )
      return;

    // Xóa toàn bộ dữ liệu runtime của Koffia từ các bản source trước:
    // tài khoản đăng ký, phiên đăng nhập, giỏ theo user, giỏ legacy, lịch sử đơn, guest owner...
    Object.keys(localStorage)
      .filter((key) => key.startsWith("koffia"))
      .forEach((key) => localStorage.removeItem(key));

    Object.keys(sessionStorage)
      .filter((key) => key.startsWith("koffia"))
      .forEach((key) => sessionStorage.removeItem(key));

    localStorage.setItem(DEMO_DATA_RESET_MARKER_KEY, DEMO_DATA_RESET_VERSION);
  } catch (error) {
    console.warn("Không thể reset dữ liệu demo Koffia:", error);
  }
}

resetKoffiaDemoDataOnce();

/** Đọc phiên đăng nhập mà không phụ thuộc thứ tự khai báo customerService. */
function getStoredCurrentUser() {
  try {
    const user = JSON.parse(
      localStorage.getItem(AUTH_SESSION_STORAGE_KEY) || "null",
    );
    return user && user.id ? user : null;
  } catch {
    return null;
  }
}

/** Tạo URL trang đăng nhập và giữ lại trang hiện tại để quay về sau khi đăng nhập/đăng ký. */
function getAuthPageUrl(mode = "login", returnUrl = window.location.href) {
  const authPath = isInsidePagesFolder ? "auth.html" : "pages/auth.html";
  const authUrl = new URL(authPath, window.location.href);
  authUrl.searchParams.set("mode", mode === "register" ? "register" : "login");
  if (returnUrl) authUrl.searchParams.set("redirect", returnUrl);
  return authUrl.href;
}

/**
 * Chặn thao tác mua hàng khi chưa đăng nhập.
 * Trả về user nếu hợp lệ; nếu chưa đăng nhập sẽ chuyển tới trang Đăng nhập / Đăng ký.
 */
function requireAuthenticatedUser(actionLabel = "thực hiện thao tác này") {
  const user = getStoredCurrentUser();
  if (user) return user;

  // Chuyển thẳng tới trang đăng nhập, không hiện toast cảnh báo thừa.
  window.location.href = getAuthPageUrl("login");
  return null;
}

/* ────────────────────────────────────────────────────────────
   PRODUCT CATALOG IMAGE SERVICE
   - Dùng chung cho mọi trang có thẻ/sản phẩm trong giỏ.
   - Luôn ánh xạ cart item -> product gốc -> imageDir -> ảnh cover 1.*.
   - Hỗ trợ cart item có ID biến thể dạng prod001::M::sugar-50... bằng productId gốc.
   ──────────────────────────────────────────────────────────── */
const productCatalogService = {
  productMap: null,

  getCustomProducts() {
    try {
      const raw = JSON.parse(localStorage.getItem("koffiaCustomProducts") || "[]");
      return Array.isArray(raw) ? raw.filter((p) => p && p.id) : [];
    } catch {
      return [];
    }
  },

  getBaseProductId(itemOrId) {
    if (itemOrId && typeof itemOrId === "object" && itemOrId.productId) {
      return String(itemOrId.productId);
    }
    const rawId =
      itemOrId && typeof itemOrId === "object" ? itemOrId.id : itemOrId;
    return String(rawId || "").split("::")[0];
  },

  async getProductMap(forceRefresh = false) {
    if (this.productMap && !forceRefresh) return this.productMap;
    try {
      const response = await fetch(`${projectRootPrefix}json/products.json`, {
        cache: "no-store",
      });
      const data = response.ok ? await response.json() : [];
      const merged = [...this.getCustomProducts(), ...(Array.isArray(data) ? data : [])];
      const map = new Map();
      merged.forEach((product) => {
        if (product?.id && !map.has(product.id)) {
          map.set(product.id, product);
        }
      });
      this.productMap = map;
    } catch (error) {
      console.warn("Không tải được dữ liệu sản phẩm để đồng bộ ảnh:", error);
      const fallback = new Map();
      this.getCustomProducts().forEach((p) => fallback.set(p.id, p));
      this.productMap = fallback;
    }
    return this.productMap;
  },

  async resolveItemCover(itemOrId) {
    if (typeof productImageService === "undefined") return "";
    const productId = this.getBaseProductId(itemOrId);
    if (!productId) return "";
    const productMap = await this.getProductMap();
    const product = productMap.get(productId);
    if (!product) return "";
    return productImageService.resolveCoverImage(product, projectRootPrefix);
  },
};

/* ────────────────────────────────────────────────────────────
   CART STATE
   ──────────────────────────────────────────────────────────── */
const cartState = {
  items: [],
  ownerId: "",

  getStorageKey(userId) {
    return userId ? `${ACCOUNT_CART_STORAGE_PREFIX}${userId}` : "";
  },

  loadForCurrentUser() {
    const user = getStoredCurrentUser();
    if (!user?.id) {
      this.ownerId = "";
      this.items = [];
      return this.items;
    }

    this.ownerId = user.id;
    const storageKey = this.getStorageKey(user.id);
    let raw = localStorage.getItem(storageKey);

    // Một lần duy nhất: chuyển giỏ global của bản cũ sang tài khoản đang đăng nhập
    // để người dùng không mất các món đã thêm trước khi nâng cấp source.
    if (raw === null) {
      const legacy = localStorage.getItem(LEGACY_CART_STORAGE_KEY);
      if (legacy) {
        raw = legacy;
        localStorage.setItem(storageKey, legacy);
        localStorage.removeItem(LEGACY_CART_STORAGE_KEY);
      }
    }

    try {
      const data = JSON.parse(raw || "[]");
      this.items = Array.isArray(data)
        ? data.map((item) => ({
            ...item,
            productId: item.productId || String(item.id || "").split("::")[0],
            qty: Math.max(1, Number(item.qty) || 1),
            price: Number(item.price) || 0,
            note: String(item.note || "").trim(),
          }))
        : [];
    } catch {
      this.items = [];
    }
    return this.items;
  },

  ensureOwnerSync() {
    const user = getStoredCurrentUser();
    const currentId = user?.id || "";
    if (currentId !== this.ownerId) this.loadForCurrentUser();
    return user;
  },

  saveToStorage() {
    const user = this.ensureOwnerSync();
    if (!user?.id) return false;
    localStorage.setItem(
      this.getStorageKey(user.id),
      JSON.stringify(this.items),
    );
    return true;
  },

  addItem(product, quantity = 1) {
    const user = requireAuthenticatedUser("thêm sản phẩm vào giỏ hàng");
    if (!user) return false;
    this.ensureOwnerSync();

    const normalizedProduct = {
      ...product,
      productId: product.productId || String(product.id || "").split("::")[0],
      category: product.category || "",
      sellerId: product.sellerId || "",
      price: Number(product.price) || 0,
      note: String(product.note || "").trim(),
      // Nếu chưa có ảnh, để rỗng để cartUI tự đồng bộ ảnh thật từ products.json/imageDir.
      img: product.img ? new URL(product.img, document.baseURI).href : "",
    };
    const addQty = Math.max(1, Number(quantity) || 1);
    const existingItem = this.items.find((i) => i.id === normalizedProduct.id);
    if (existingItem) {
      existingItem.qty += addQty;
    } else {
      this.items.push({ ...normalizedProduct, qty: addQty });
    }
    this.saveToStorage();
    cartUI.render();
    cartUI.updateBadge();
    window.dispatchEvent(new CustomEvent("koffia:cart-changed"));
    showToast(`Đã thêm "${normalizedProduct.name}" vào giỏ!`);
    return true;
  },

  addItemsBatch(itemsList) {
    const user = requireAuthenticatedUser("thêm sản phẩm vào giỏ hàng");
    if (!user || !Array.isArray(itemsList) || !itemsList.length) return 0;
    this.ensureOwnerSync();

    let addedCount = 0;
    itemsList.forEach((raw) => {
      if (!raw) return;
      const addQty = Math.max(1, Number(raw.qty) || 1);
      const id = String(raw.id || raw.productId || "");
      if (!id) return;
      const normalized = {
        ...raw,
        id,
        productId: raw.productId || id.split("::")[0],
        category: raw.category || "",
        sellerId: raw.sellerId || "",
        name: raw.name || "Đồ uống Koffia",
        price: Number(raw.price) || 0,
        note: String(raw.note || "").trim(),
        img: raw.img ? new URL(raw.img, document.baseURI).href : "",
      };
      const existing = this.items.find((i) => i.id === normalized.id);
      if (existing) {
        existing.qty += addQty;
      } else {
        this.items.push({ ...normalized, qty: addQty });
      }
      addedCount += addQty;
    });

    if (addedCount > 0) {
      this.saveToStorage();
      cartUI.render();
      cartUI.updateBadge();
      window.dispatchEvent(new CustomEvent("koffia:cart-changed"));
    }
    return addedCount;
  },

  removeItem(productId, options = { enableUndo: true }) {
    if (!this.ensureOwnerSync()) return false;
    const removedIndex = this.items.findIndex((i) => i.id === productId);
    if (removedIndex === -1) return false;

    const removedItem = { ...this.items[removedIndex] };
    this.items = this.items.filter((i) => i.id !== productId);
    this.saveToStorage();
    cartUI.render();
    cartUI.updateBadge();
    window.dispatchEvent(new CustomEvent("koffia:cart-changed"));

    if (options?.enableUndo !== false) {
      const rawName = String(removedItem.name || "món đồ uống");
      const shortName =
        rawName.length > 34 ? `${rawName.slice(0, 31).trim()}...` : rawName;
      showToast(`Đã xóa "${shortName}"`, "success", 4000, {
        actionLabel: "Hoàn tác",
        onAction: () => {
          this.restoreItem(removedItem, removedIndex);
          showToast(`Đã khôi phục "${shortName}"`, "success", 2200);
        },
      });
    }
    return true;
  },

  restoreItem(item, index = -1) {
    if (!item || !this.ensureOwnerSync()) return false;
    const existing = this.items.find((entry) => entry.id === item.id);
    if (existing) {
      existing.qty += Math.max(1, Number(item.qty) || 1);
    } else {
      const safeItem = {
        ...item,
        qty: Math.max(1, Number(item.qty) || 1),
        price: Number(item.price) || 0,
        note: String(item.note || "").trim(),
      };
      const insertAt =
        index >= 0 ? Math.min(index, this.items.length) : this.items.length;
      this.items.splice(insertAt, 0, safeItem);
    }
    this.saveToStorage();
    cartUI.render();
    cartUI.updateBadge();
    window.dispatchEvent(new CustomEvent("koffia:cart-changed"));
    return true;
  },

  changeQty(productId, delta) {
    if (!this.ensureOwnerSync()) return false;
    const item = this.items.find((i) => i.id === productId);
    if (!item) return false;
    if (item.qty + delta <= 0) {
      this.removeItem(productId);
      return true;
    }
    item.qty += delta;
    this.saveToStorage();
    cartUI.render();
    cartUI.updateBadge();
    window.dispatchEvent(new CustomEvent("koffia:cart-changed"));
    return true;
  },

  clearCurrentUserCart() {
    const user = this.ensureOwnerSync();
    if (!user?.id) {
      this.items = [];
      return;
    }
    this.items = [];
    localStorage.setItem(this.getStorageKey(user.id), "[]");
    cartUI.render();
    cartUI.updateBadge();
    window.dispatchEvent(new CustomEvent("koffia:cart-changed"));
  },

  getTotal() {
    this.ensureOwnerSync();
    return this.items.reduce((sum, i) => sum + i.price * i.qty, 0);
  },

  getTotalQty() {
    this.ensureOwnerSync();
    return this.items.reduce((sum, i) => sum + i.qty, 0);
  },
};

// Nạp giỏ theo tài khoản ngay khi script chạy; khách chưa đăng nhập luôn có giỏ rỗng.
cartState.loadForCurrentUser();

/* ────────────────────────────────────────────────────────────
   ORDER HISTORY SERVICE
   - Lưu đơn hàng ở localStorage để phù hợp phạm vi Web Basic/front-end.
   - Đơn của tài khoản được gắn customerId nên mỗi tài khoản chỉ xem đơn của mình.
   - Đơn đặt khi chưa đăng nhập được gắn guestId riêng cho trình duyệt hiện tại.
   - Tự đọc/migrate dữ liệu cũ từ key koffiaOrders nếu có.
   ──────────────────────────────────────────────────────────── */
const ORDER_HISTORY_STORAGE_KEY = "koffiaOrdersV2";
const LEGACY_ORDER_STORAGE_KEY = "koffiaOrders";
const GUEST_ORDER_OWNER_KEY = "koffiaGuestOrderOwner";

const orderHistoryService = {
  getGuestId() {
    let guestId = localStorage.getItem(GUEST_ORDER_OWNER_KEY) || "";
    if (guestId) return guestId;

    if (window.crypto?.randomUUID) {
      guestId = `guest_${window.crypto.randomUUID()}`;
    } else {
      guestId = `guest_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    }
    localStorage.setItem(GUEST_ORDER_OWNER_KEY, guestId);
    return guestId;
  },

  normalizeOrder(raw = {}) {
    const items = Array.isArray(raw.items)
      ? raw.items.map((item) => ({
          ...item,
          id: item.id || item.productId || "",
          productId:
            item.productId || productCatalogService.getBaseProductId(item),
          name: item.name || "Đồ uống Koffia",
          price: Number(item.price) || 0,
          qty: Math.max(1, Number(item.qty) || 1),
          img: item.img || "",
          note: String(item.note || "").trim(),
        }))
      : [];

    const fallbackTotal = items.reduce(
      (sum, item) => sum + item.price * item.qty,
      0,
    );
    return {
      id: raw.id || `KOF${Date.now().toString().slice(-8)}`,
      createdAt: raw.createdAt || new Date().toISOString(),
      customerId: raw.customerId || "",
      guestId: raw.guestId || "",
      accountSnapshot:
        raw.accountSnapshot && typeof raw.accountSnapshot === "object"
          ? raw.accountSnapshot
          : null,
      customer:
        raw.customer && typeof raw.customer === "object"
          ? {
              name: raw.customer.name || "",
              phone: raw.customer.phone || "",
              address: raw.customer.address || "",
              note: raw.customer.note || "",
            }
          : { name: "", phone: "", address: "", note: "" },
      items,
      voucher:
        raw.voucher && typeof raw.voucher === "object"
          ? {
              code: raw.voucher.code || "",
              name: raw.voucher.name || "",
              discount: Number(raw.voucher.discount) || 0,
            }
          : null,
      shippingFee: Number.isFinite(Number(raw.shippingFee))
        ? Number(raw.shippingFee)
        : 0,
      deliverySchedule:
        raw.deliverySchedule && typeof raw.deliverySchedule === "object"
          ? {
              mode: raw.deliverySchedule.mode === "scheduled" ? "scheduled" : "now",
              dayLabel: String(raw.deliverySchedule.dayLabel || ""),
              slotLabel: String(raw.deliverySchedule.slotLabel || ""),
              fullLabel: String(raw.deliverySchedule.fullLabel || ""),
            }
          : null,
      total: Number.isFinite(Number(raw.total))
        ? Number(raw.total)
        : fallbackTotal,
      paymentMethod: raw.paymentMethod || "Thanh toán khi nhận hàng",
      status: raw.status || "new",
      migratedFromLegacy: Boolean(raw.migratedFromLegacy),
    };
  },

  persist(orders) {
    localStorage.setItem(ORDER_HISTORY_STORAGE_KEY, JSON.stringify(orders));
    if (typeof koffiaCloudSync !== "undefined") {
      koffiaCloudSync.schedulePush("orders");
    }
  },

  loadAll() {
    try {
      const current = JSON.parse(
        localStorage.getItem(ORDER_HISTORY_STORAGE_KEY) || "null",
      );
      if (Array.isArray(current))
        return current.map((order) => this.normalizeOrder(order));
    } catch {
      // Nếu dữ liệu mới lỗi, thử migrate dữ liệu cũ ở bên dưới.
    }

    let legacy = [];
    try {
      const parsedLegacy = JSON.parse(
        localStorage.getItem(LEGACY_ORDER_STORAGE_KEY) || "[]",
      );
      legacy = Array.isArray(parsedLegacy) ? parsedLegacy : [];
    } catch {
      legacy = [];
    }

    if (!legacy.length) {
      this.persist([]);
      return [];
    }

    // Dữ liệu cũ chưa có customerId nên chỉ có thể gắn với trình duyệt hiện tại.
    const guestId = this.getGuestId();
    const migrated = legacy.map((order) =>
      this.normalizeOrder({
        ...order,
        customerId: "",
        guestId,
        migratedFromLegacy: true,
      }),
    );
    this.persist(migrated);
    return migrated;
  },

  add(order) {
    const currentUser =
      typeof customerService !== "undefined"
        ? customerService.getCurrentUser()
        : getStoredCurrentUser();

    // Từ phiên bản này Koffia không cho đặt hàng với tư cách khách.
    if (!currentUser?.id) return null;

    const ownedOrder = this.normalizeOrder({
      ...order,
      customerId: currentUser.id,
      guestId: "",
      accountSnapshot: {
        id: currentUser.id,
        username: currentUser.username || "",
        email: currentUser.email || "",
        firstName: currentUser.firstName || "",
        lastName: currentUser.lastName || "",
      },
    });

    const orders = this.loadAll();
    orders.unshift(ownedOrder);
    // Demo front-end: giới hạn lịch sử để localStorage không tăng vô hạn.
    this.persist(orders.slice(0, 120));
    try {
      sessionStorage.removeItem("koffiaLiveActivityDismissed");
    } catch {}
    window.dispatchEvent(
      new CustomEvent("koffia:orders-changed", {
        detail: { orderId: ownedOrder.id, status: ownedOrder.status, isNew: true },
      }),
    );
    return ownedOrder;
  },

  updateStatus(orderId, nextStatus) {
    if (!orderId || !nextStatus) return null;
    const orders = this.loadAll();
    const target = orders.find((o) => o.id === orderId);
    if (!target) return null;
    if (target.status === nextStatus) return target;
    target.status = nextStatus;
    this.persist(orders);
    window.dispatchEvent(
      new CustomEvent("koffia:orders-changed", {
        detail: { orderId, status: nextStatus },
      }),
    );
    return target;
  },

  syncLiveStatuses() {
    const orders = this.loadAll();
    const now = Date.now();
    let changed = false;
    const newlyCompletedIds = [];

    orders.forEach((order) => {
      if (
        order.manualStatus ||
        order.status === "cancelled" ||
        order.status === "completed"
      )
        return;
      const createdMs = new Date(order.createdAt).getTime();
      if (!Number.isFinite(createdMs)) return;
      const elapsedSec = Math.max(0, (now - createdMs) / 1000);

      let expected = "new";
      if (elapsedSec >= 90) expected = "completed";
      else if (elapsedSec >= 50) expected = "delivering";
      else if (elapsedSec >= 20) expected = "preparing";

      const rank = { new: 0, preparing: 1, delivering: 2, completed: 3 };
      if ((rank[expected] ?? 0) > (rank[order.status] ?? 0)) {
        order.status = expected;
        changed = true;
        if (expected === "completed") newlyCompletedIds.push(order.id);
      }
    });

    if (changed) {
      this.persist(orders);
      window.dispatchEvent(
        new CustomEvent("koffia:orders-changed", {
          detail: { synced: true, newlyCompletedIds },
        }),
      );
    }
    return orders;
  },

  getProgressInfo(order) {
    const status = order?.status || "new";
    const map = {
      new: {
        stepIndex: 0,
        progressPct: 24,
        etaLabel: "~15 phút",
        icon: "fa-receipt",
        title: "Quán đã tiếp nhận đơn",
        shortLabel: "Đã nhận đơn",
      },
      preparing: {
        stepIndex: 1,
        progressPct: 54,
        etaLabel: "~11 phút",
        icon: "fa-mug-hot",
        title: "Barista đang pha chế",
        shortLabel: "Đang pha chế",
      },
      delivering: {
        stepIndex: 2,
        progressPct: 84,
        etaLabel: "~5 phút",
        icon: "fa-motorcycle",
        title: "Tài xế đang giao đến bạn",
        shortLabel: "Đang giao",
      },
      completed: {
        stepIndex: 3,
        progressPct: 100,
        etaLabel: "Đã giao",
        icon: "fa-circle-check",
        title: "Giao đồ uống hoàn tất",
        shortLabel: "Hoàn thành",
      },
      cancelled: {
        stepIndex: -1,
        progressPct: 0,
        etaLabel: "Đã hủy",
        icon: "fa-ban",
        title: "Đơn hàng đã hủy",
        shortLabel: "Đã hủy",
      },
    };
    return map[status] || map.new;
  },

  getForCurrentViewer() {
    const currentUser =
      typeof customerService !== "undefined"
        ? customerService.getCurrentUser()
        : getStoredCurrentUser();
    if (!currentUser?.id) return [];

    const orders = this.loadAll();
    return orders.filter((order) => order.customerId === currentUser.id);
  },

  getStatusMeta(status) {
    const statusMap = {
      new: { label: "Đã tiếp nhận", className: "isNew" },
      preparing: { label: "Đang pha chế", className: "isPreparing" },
      delivering: { label: "Đang giao", className: "isDelivering" },
      completed: { label: "Hoàn thành", className: "isCompleted" },
      cancelled: { label: "Đã hủy", className: "isCancelled" },
    };
    return statusMap[status] || statusMap.new;
  },
};

/* ────────────────────────────────────────────────────────────
   CART UI
   ──────────────────────────────────────────────────────────── */
const cartUI = {
  drawerEl: null,
  bodyEl: null,
  badgeEl: null,
  renderVersion: 0,

  init() {
    this.drawerEl = document.getElementById("cartDrawer");
    this.bodyEl = document.getElementById("cartBody");
    this.badgeEl = document.getElementById("cartBadge");

    if (!this.drawerEl) return;

    document
      .getElementById("cartOpenBtn")
      ?.addEventListener("click", () => this.open());
    document
      .getElementById("cartCloseBtn")
      ?.addEventListener("click", () => this.close());
    this.drawerEl
      .querySelector(".cartOverlay")
      ?.addEventListener("click", () => this.close());

    this.setAuthVisibility(Boolean(getStoredCurrentUser()));
    this.render();
    this.updateBadge();
  },

  setAuthVisibility(isAuthenticated) {
    const openBtn = document.getElementById("cartOpenBtn");
    if (openBtn) {
      openBtn.hidden = !isAuthenticated;
      openBtn.style.display = isAuthenticated ? "" : "none";
    }
    if (!isAuthenticated) {
      this.close();
      if (this.drawerEl) this.drawerEl.setAttribute("aria-hidden", "true");
    } else if (this.drawerEl) {
      this.drawerEl.removeAttribute("aria-hidden");
    }
  },

  open() {
    if (!requireAuthenticatedUser("xem giỏ hàng")) return;
    cartState.ensureOwnerSync();
    this.render();
    this.updateBadge();
    this.drawerEl?.classList.add("cartOpen");
    document.body.style.overflow = "hidden";
  },

  close() {
    this.drawerEl?.classList.remove("cartOpen");
    document.body.style.overflow = "";
  },

  updateBadge() {
    if (!this.badgeEl) return;
    if (!getStoredCurrentUser()) {
      this.badgeEl.style.display = "none";
      return;
    }
    const qty = cartState.getTotalQty();
    this.badgeEl.textContent = qty > 99 ? "99+" : qty;
    const shouldShow = qty > 0;
    this.badgeEl.style.display = shouldShow ? "flex" : "none";
    if (shouldShow) {
      this.badgeEl.classList.remove("cartBadgeBounce");
      void this.badgeEl.offsetWidth; // trigger reflow for animation restart
      this.badgeEl.classList.add("cartBadgeBounce");
    }
  },

  render() {
    if (!this.bodyEl) return;
    cartState.ensureOwnerSync();
    if (!getStoredCurrentUser()) {
      this.bodyEl.innerHTML = "";
      this.updateFooter(0);
      return;
    }
    this.renderVersion += 1;
    const currentRenderVersion = this.renderVersion;
    const { items } = cartState;

    if (items.length === 0) {
      this.bodyEl.innerHTML = `
        <div class="cartEmpty">
          <i class="fa-solid fa-mug-hot"></i>
          <p>Giỏ hàng của bạn đang trống.<br>Hãy thêm đồ uống yêu thích nhé!</p>
        </div>`;
      this.updateFooter(0);
      return;
    }

    const subtotal = cartState.getTotal();
    const freeshipHtml = buildFreeshipProgressHtml(subtotal);

    const itemsHtml = items
      .map(
        (item) => `
      <div class="cartItem" data-id="${escapeHtmlGlobal(item.id)}">
        <img class="cartItemImg" src="${escapeHtmlGlobal(item.img || defaultProductImageDataUri)}" alt="${escapeHtmlGlobal(item.name)}" loading="lazy"
          data-cart-line-id="${escapeHtmlGlobal(item.id)}" data-product-id="${escapeHtmlGlobal(item.productId || productCatalogService.getBaseProductId(item))}">
        <div class="cartItemInfo">
          <div class="cartItemName">${escapeHtmlGlobal(item.name)}</div>
          ${item.note ? `<div class="cartItemNote"><i class="fa-regular fa-note-sticky" aria-hidden="true"></i> ${escapeHtmlGlobal(item.note)}</div>` : ""}
          <div class="cartItemPrice">${formatPrice(item.price)}</div>
          <div class="cartItemQtyRow">
            <button class="cartQtyBtn" data-action="dec" data-id="${escapeHtmlGlobal(item.id)}" aria-label="Giảm số lượng">−</button>
            <span class="cartQtyNum">${item.qty}</span>
            <button class="cartQtyBtn" data-action="inc" data-id="${escapeHtmlGlobal(item.id)}" aria-label="Tăng số lượng">+</button>
          </div>
        </div>
        <button class="cartItemRemove" data-id="${escapeHtmlGlobal(item.id)}" aria-label="Xoá sản phẩm">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>`,
      )
      .join("");

    this.bodyEl.innerHTML = `${freeshipHtml}<div class="cartItemList">${itemsHtml}</div>`;

    // Đồng bộ ảnh cover thật cho từng cart item trên MỌI trang, kể cả item cũ trong localStorage.
    this.hydrateProductImages(currentRenderVersion);

    this.bodyEl.querySelectorAll(".cartItemImg").forEach((img) => {
      img.addEventListener(
        "error",
        () => {
          img.src = defaultProductImageDataUri;
        },
        { once: true },
      );
    });

    // Event delegation
    this.bodyEl.querySelectorAll(".cartQtyBtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const { id, action } = btn.dataset;
        cartState.changeQty(id, action === "inc" ? 1 : -1);
      });
    });

    this.bodyEl.querySelectorAll(".cartItemRemove").forEach((btn) => {
      btn.addEventListener("click", () => cartState.removeItem(btn.dataset.id));
    });

    this.updateFooter(cartState.getTotal());
  },

  async hydrateProductImages(renderVersion) {
    if (!this.bodyEl || typeof productImageService === "undefined") return;
    const imageNodes = [
      ...this.bodyEl.querySelectorAll(".cartItemImg[data-cart-line-id]"),
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
        if (!cover || renderVersion !== this.renderVersion || !img.isConnected)
          return;

        const absoluteCover = new URL(cover, window.location.href).href;
        img.src = absoluteCover;
        img.classList.add("cartItemImgLoaded");

        if (item.img !== absoluteCover || !item.productId) {
          item.img = absoluteCover;
          item.productId = productCatalogService.getBaseProductId(item);
          storageChanged = true;
        }
      }),
    );

    if (storageChanged) cartState.saveToStorage();
  },

  updateFooter(total) {
    const totalEl = document.getElementById("cartTotalAmount");
    if (totalEl) totalEl.textContent = formatPrice(total);
  },
};

/* ────────────────────────────────────────────────────────────
   APPLE DYNAMIC-ISLAND TOAST MANAGER
   - Smooth GPU translate3d stacking (0 layout jump on enter/exit)
   - Simultaneous cascade slide-up for remaining toasts
   - Quick-close × button with pre-updated rapid spam-close hit zone
   - Hover pauses auto-dismiss timer
   ──────────────────────────────────────────────────────────── */
const toastManager = {
  active: [],
  rapidProxyEl: null,
  rapidTargetIndex: 0,
  rapidIdleTimer: null,
  GAP: 6,
  MAX_VISIBLE: 5,

  getContainer() {
    let container = document.getElementById("toastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
      container.setAttribute("aria-live", "polite");
      container.setAttribute("aria-atomic", "false");
      document.body.appendChild(container);
    }
    return container;
  },

  ensureRapidProxy(container) {
    if (this.rapidProxyEl && this.rapidProxyEl.parentNode === container) {
      return this.rapidProxyEl;
    }
    const proxy = document.createElement("button");
    proxy.type = "button";
    proxy.id = "toastRapidCloseProxy";
    proxy.className = "toastRapidCloseProxy";
    proxy.setAttribute("aria-label", "Đóng nhanh thông báo kế tiếp");
    proxy.style.display = "none";
    proxy.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.active.length) {
        this.hideRapidProxy();
        return;
      }
      const idx = Math.min(this.rapidTargetIndex, this.active.length - 1);
      const target = this.active[idx];
      if (target) this.dismiss(target, true);
    });
    proxy.addEventListener("pointerleave", () => {
      this.hideRapidProxy();
    });
    container.appendChild(proxy);
    this.rapidProxyEl = proxy;
    return proxy;
  },

  armRapidProxy(container, slotIndex, slotY, toastHeight) {
    if (!this.active.length) {
      this.hideRapidProxy();
      return;
    }
    const proxy = this.ensureRapidProxy(container);
    this.rapidTargetIndex = Math.min(slotIndex, this.active.length - 1);
    const topPx = Math.max(0, Math.round(slotY + Math.max(0, (toastHeight - 30) / 2)));
    proxy.style.top = `${topPx}px`;
    proxy.style.display = "block";
    clearTimeout(this.rapidIdleTimer);
    this.rapidIdleTimer = setTimeout(() => this.hideRapidProxy(), 1800);
  },

  hideRapidProxy() {
    clearTimeout(this.rapidIdleTimer);
    this.rapidIdleTimer = null;
    if (this.rapidProxyEl) {
      this.rapidProxyEl.style.display = "none";
    }
  },

  layout() {
    let y = 0;
    for (let i = 0; i < this.active.length; i++) {
      const rec = this.active[i];
      rec.y = y;
      rec.el.style.setProperty("--toast-y", `${y}px`);
      rec.el.style.zIndex = String(10 + (this.active.length - i));
      const h = rec.height || rec.el.offsetHeight || 36;
      y += h + this.GAP;
    }
    if (!this.active.length) {
      this.hideRapidProxy();
    }
  },

  getStatusSvg(isError) {
    if (isError) {
      return '<svg class="toastSvgIcon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12.5"/><circle cx="12" cy="16" r="0.8" fill="currentColor" stroke="none"/></svg>';
    }
    return '<svg class="toastSvgIcon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8.5 12.3l2.4 2.4 4.8-5.2"/></svg>';
  },

  getCloseSvg() {
    return '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';
  },

  startTimer(rec) {
    if (rec.dismissed || rec.remainingMs <= 0) return;
    clearTimeout(rec.timerId);
    rec.startedAt = performance.now();
    rec.timerId = setTimeout(() => this.dismiss(rec, false), rec.remainingMs);
  },

  pauseTimer(rec) {
    if (rec.dismissed || !rec.timerId) return;
    clearTimeout(rec.timerId);
    rec.timerId = null;
    const elapsed = performance.now() - (rec.startedAt || performance.now());
    rec.remainingMs = Math.max(400, rec.remainingMs - elapsed);
  },

  dismiss(rec, viaCloseBtn = false) {
    if (!rec || rec.dismissed) return;
    rec.dismissed = true;
    clearTimeout(rec.timerId);
    rec.timerId = null;

    const idx = this.active.indexOf(rec);
    const slotY = rec.y || 0;
    const slotH = rec.height || rec.el.offsetHeight || 46;
    if (idx >= 0) {
      this.active.splice(idx, 1);
    }

    // Gỡ tương tác ngay & đẩy ra lớp nền để các toast sau trượt lên đồng thời mượt mà
    rec.el.classList.remove("isVisible");
    rec.el.classList.add("isLeaving");
    rec.el.style.zIndex = "1";

    this.layout();

    if (viaCloseBtn) {
      if (this.active.length > 0 && idx >= 0) {
        this.armRapidProxy(this.getContainer(), idx, slotY, slotH);
      } else {
        this.hideRapidProxy();
      }
    }

    const cleanup = () => {
      if (rec.el.isConnected) rec.el.remove();
    };
    rec.el.addEventListener(
      "transitionend",
      (ev) => {
        if (ev.target === rec.el && ev.propertyName === "opacity") cleanup();
      },
      { once: true },
    );
    setTimeout(cleanup, 420);
  },

  show(message, type = "success", duration = 3000, options = null) {
    const container = this.getContainer();
    const isError = type === "error";

    const toast = document.createElement("div");
    toast.className = `toastItem${isError ? " toastError" : ""}`;
    toast.setAttribute("role", isError ? "alert" : "status");

    const iconWrap = document.createElement("span");
    iconWrap.className = "toastIcon";
    iconWrap.innerHTML = this.getStatusSvg(isError);

    const text = document.createElement("span");
    text.className = "toastMessage";
    text.textContent = message;

    toast.append(iconWrap, text);

    const rec = {
      el: toast,
      y: 0,
      height: 46,
      remainingMs: Math.max(1200, Number(duration) || 3000),
      startedAt: 0,
      timerId: null,
      dismissed: false,
    };

    if (options?.actionLabel && typeof options.onAction === "function") {
      const actionBtn = document.createElement("button");
      actionBtn.type = "button";
      actionBtn.className = "toastActionBtn";
      actionBtn.textContent = options.actionLabel;
      let acted = false;
      actionBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (acted) return;
        acted = true;
        options.onAction();
        this.dismiss(rec, false);
      });
      toast.appendChild(actionBtn);
    }

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "toastCloseBtn";
    closeBtn.setAttribute("aria-label", "Đóng thông báo");
    closeBtn.innerHTML = this.getCloseSvg();
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dismiss(rec, true);
    });
    toast.appendChild(closeBtn);

    toast.addEventListener("mouseenter", () => this.pauseTimer(rec));
    toast.addEventListener("mouseleave", () => this.startTimer(rec));

    // Giới hạn tối đa 5 thông báo hiển thị đồng thời
    while (this.active.length >= this.MAX_VISIBLE) {
      this.dismiss(this.active[0], false);
    }

    // Tính vị trí Y dự kiến trước khi chèn để thông báo mới trồi êm đúng vị trí đích
    const initialY = this.active.reduce(
      (sum, item) => sum + (item.height || 46) + this.GAP,
      0,
    );
    toast.style.setProperty("--toast-y", `${initialY}px`);
    container.appendChild(toast);

    rec.height = toast.offsetHeight || 46;
    this.active.push(rec);
    this.layout();

    // Đảm bảo frame đầu đã paint trạng thái ẩn rồi mới transition mượt vào
    void toast.offsetWidth;
    requestAnimationFrame(() => {
      if (!rec.dismissed && toast.isConnected) {
        toast.classList.add("isVisible");
      }
    });

    this.startTimer(rec);
    return rec;
  },
};

/**
 * showToast — hiển thị thông báo toast mượt kiểu Apple Dynamic Island
 * @param {string} message
 * @param {'success'|'error'} type
 * @param {number} duration
 * @param {{ actionLabel?: string, onAction?: () => void } | null} options
 */
function showToast(message, type = "success", duration = 3000, options = null) {
  return toastManager.show(message, type, duration, options);
}

/* ────────────────────────────────────────────────────────────
   FORM VALIDATION HELPERS — dùng chung cho auth.js & account.js
   ──────────────────────────────────────────────────────────── */

/**
 * setFieldError — đánh dấu input lỗi + hiển thị dòng chữ đỏ bên dưới
 * @param {HTMLElement} inputEl
 * @param {HTMLElement} errorEl
 * @param {string} message
 */
function setFieldError(inputEl, errorEl, message) {
  inputEl?.classList.add("inputError");
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.add("visible");
  }
}

/**
 * clearFieldError — gỡ trạng thái lỗi của một input
 */
function clearFieldError(inputEl, errorEl) {
  inputEl?.classList.remove("inputError");
  if (errorEl) {
    errorEl.textContent = "";
    errorEl.classList.remove("visible");
  }
}

/**
 * clearAllFieldErrors — gỡ lỗi cho toàn bộ input/formErrorText bên trong 1 form
 */
function clearAllFieldErrors(formEl) {
  if (!formEl) return;
  formEl
    .querySelectorAll(".inputField.inputError")
    .forEach((el) => el.classList.remove("inputError"));
  formEl.querySelectorAll(".formErrorText.visible").forEach((el) => {
    el.classList.remove("visible");
    el.textContent = "";
  });
}

/* ────────────────────────────────────────────────────────────
   CUSTOMER SERVICE — dữ liệu gốc từ customers.json + dữ liệu chạy từ localStorage

   Web tĩnh không thể ghi ngược vào file JSON trên ổ đĩa. Vì vậy:
   - customers.json = dữ liệu gốc có thể quản lý/chỉnh sửa bằng tay.
   - localStorage   = tài khoản đăng ký mới + các thay đổi phát sinh khi demo.
   Mỗi lần mở trang, dữ liệu JSON được nạp lại rồi ghép với phần runtime.
   ──────────────────────────────────────────────────────────── */
const CUSTOMERS_JSON_URL = `${projectRootPrefix}json/customers.json`;
const CUSTOMER_RUNTIME_STORAGE_KEY = "koffiaCustomerRuntimeV2";
const CURRENT_USER_STORAGE_KEY = "koffiaCurrentUser";
const EMAIL_PATTERN_SHARED = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN_SHARED =
  /^(?=.{4,20}$)[A-Za-z0-9](?:[A-Za-z0-9._]*[A-Za-z0-9])?$/;

const customerService = {
  cache: null,
  baseIds: new Set(),
  runtime: null,

  getRuntimeStore() {
    if (this.runtime) return this.runtime;
    try {
      const parsed = JSON.parse(
        localStorage.getItem(CUSTOMER_RUNTIME_STORAGE_KEY) || "{}",
      );
      this.runtime = {
        registered: Array.isArray(parsed.registered) ? parsed.registered : [],
        overrides:
          parsed.overrides && typeof parsed.overrides === "object"
            ? parsed.overrides
            : {},
      };
    } catch {
      this.runtime = { registered: [], overrides: {} };
    }
    return this.runtime;
  },

  persistRuntime() {
    localStorage.setItem(
      CUSTOMER_RUNTIME_STORAGE_KEY,
      JSON.stringify(this.getRuntimeStore()),
    );
    if (typeof koffiaCloudSync !== "undefined") {
      koffiaCloudSync.schedulePush("customers");
    }
  },

  normalizeIdentifier(value) {
    return (value || "").toString().trim().toLowerCase();
  },

  normalizeUsername(value) {
    // Giữ nguyên hoa/thường để hiển thị; so sánh trùng lặp vẫn không phân biệt hoa/thường.
    return (value || "").toString().trim();
  },

  getUsernameKey(value) {
    return this.normalizeUsername(value).toLowerCase();
  },

  normalizeCustomer(raw) {
    const email = this.normalizeIdentifier(
      raw.email ||
        (String(raw.identifier || "").includes("@") ? raw.identifier : ""),
    );
    let username = this.normalizeUsername(
      raw.username ||
        (!String(raw.identifier || "").includes("@") ? raw.identifier : ""),
    );
    if (!username && email) username = this.makeUsernameBaseFromEmail(email);
    const role =
      raw.role === "dev" ? "dev" : raw.role === "seller" ? "seller" : "customer";
    return {
      id: raw.id || `cus_${Date.now().toString(36)}`,
      role,
      firstName: raw.firstName || "",
      lastName: raw.lastName || "",
      username,
      email,
      recoveryEmail: this.normalizeIdentifier(raw.recoveryEmail || ""),
      password: raw.password || "",
      avatar: raw.avatar || "",
      createdAt: raw.createdAt || new Date().toISOString(),
      usernameChangeCount: Number(raw.usernameChangeCount) || 0,
      usernameChangedAt: raw.usernameChangedAt || "",
      status: raw.status || "active",
      sellerProfile:
        raw.sellerProfile && typeof raw.sellerProfile === "object"
          ? raw.sellerProfile
          : null,
      sellerTrialStart: raw.sellerTrialStart || "",
      sellerTrialEnd: raw.sellerTrialEnd || "",
    };
  },

  async loadAll(forceRefresh = false) {
    if (this.cache && !forceRefresh) return this.cache;

    let base = [];
    try {
      const response = await fetch(`${projectRootPrefix}json/customers.json`, { cache: "no-store" });
      const data = response.ok ? await response.json() : [];
      base = Array.isArray(data)
        ? data.map((item) => this.normalizeCustomer(item))
        : [];
    } catch {
      base = [];
    }

    const runtime = this.getRuntimeStore();
    this.baseIds = new Set(base.map((customer) => customer.id));

    const mergedBase = base.map((customer) => ({
      ...customer,
      ...(runtime.overrides[customer.id] || {}),
    }));

    const registered = runtime.registered.map((item) =>
      this.normalizeCustomer(item),
    );
    this.cache = [
      ...mergedBase,
      ...registered.filter((item) => !this.baseIds.has(item.id)),
    ];
    return this.cache;
  },

  async findById(id) {
    const all = await this.loadAll();
    return all.find((customer) => customer.id === id) || null;
  },

  async findByIdentifier(identifier) {
    const all = await this.loadAll();
    const target = this.normalizeIdentifier(identifier);
    if (!target) return null;
    return (
      all.find(
        (customer) =>
          this.normalizeIdentifier(customer.username) === target ||
          this.normalizeIdentifier(customer.email) === target,
      ) || null
    );
  },

  async isEmailTaken(email, excludeId = null) {
    const target = this.normalizeIdentifier(email);
    if (!target) return false;
    const all = await this.loadAll();
    return all.some(
      (customer) =>
        customer.id !== excludeId &&
        this.normalizeIdentifier(customer.email) === target,
    );
  },

  async isUsernameTaken(username, excludeId = null) {
    const target = this.getUsernameKey(username);
    if (!target) return false;
    const all = await this.loadAll();
    return all.some(
      (customer) =>
        customer.id !== excludeId &&
        this.getUsernameKey(customer.username) === target,
    );
  },

  async isIdentifierTaken(identifier, excludeId = null) {
    const target = this.normalizeIdentifier(identifier);
    if (!target) return false;
    const all = await this.loadAll();
    return all.some(
      (customer) =>
        customer.id !== excludeId &&
        (this.normalizeIdentifier(customer.email) === target ||
          this.normalizeIdentifier(customer.username) === target),
    );
  },

  makeUsernameBaseFromEmail(email) {
    const localPart = this.normalizeIdentifier(email).split("@")[0] || "";
    const base = localPart
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9._]+/g, ".")
      .replace(/[._]{2,}/g, ".")
      .replace(/^[._]+|[._]+$/g, "")
      .slice(0, 20);
    return USERNAME_PATTERN_SHARED.test(base) ? base : "";
  },

  makeRandomUsername() {
    const letters = "abcdefghijklmnopqrstuvwxyz";
    const digits = "0123456789";
    let result = "";
    for (let i = 0; i < 5; i += 1)
      result += letters[Math.floor(Math.random() * letters.length)];
    for (let i = 0; i < 3; i += 1)
      result += digits[Math.floor(Math.random() * digits.length)];
    return result;
  },

  async generateUniqueUsernameFromEmail(email) {
    const processed = this.makeUsernameBaseFromEmail(email);
    if (processed && !(await this.isUsernameTaken(processed))) return processed;

    let candidate = this.makeRandomUsername();
    while (await this.isUsernameTaken(candidate)) {
      candidate = this.makeRandomUsername();
    }
    return candidate;
  },

  validateUsername(username) {
    const normalized = this.normalizeUsername(username);
    return {
      normalized,
      valid: USERNAME_PATTERN_SHARED.test(normalized),
      message:
        "Tên người dùng cần 4–20 ký tự; chỉ dùng A–Z, a–z, 0–9, dấu chấm (.) và gạch dưới (_), không bắt đầu hoặc kết thúc bằng dấu.",
    };
  },

  async register({ firstName, lastName, identifier, password }) {
    const isEmail = EMAIL_PATTERN_SHARED.test(
      this.normalizeIdentifier(identifier),
    );
    const email = isEmail ? this.normalizeIdentifier(identifier) : "";
    const username = isEmail
      ? await this.generateUniqueUsernameFromEmail(email)
      : this.normalizeUsername(identifier);

    const newCustomer = this.normalizeCustomer({
      id: `cus_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      firstName,
      lastName,
      username,
      email,
      recoveryEmail: "",
      password,
      avatar: "",
      createdAt: new Date().toISOString(),
      usernameChangeCount: 0,
      status: "active",
    });

    const runtime = this.getRuntimeStore();
    runtime.registered.push(newCustomer);
    this.persistRuntime();
    this.cache = null;
    await this.loadAll(true);
    return newCustomer;
  },

  async login(identifier, password) {
    const account = await this.findByIdentifier(identifier);
    if (
      !account ||
      account.status === "disabled" ||
      account.password !== password
    )
      return null;
    return account;
  },

  async updateCustomer(id, patch) {
    const all = await this.loadAll();
    const currentData = all.find((customer) => customer.id === id);
    if (!currentData) return null;

    const safePatch = { ...patch };
    if (Object.prototype.hasOwnProperty.call(safePatch, "email")) {
      safePatch.email = this.normalizeIdentifier(safePatch.email);
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, "username")) {
      safePatch.username = this.normalizeUsername(safePatch.username);
    }

    const updated = this.normalizeCustomer({
      ...currentData,
      ...safePatch,
      id,
    });
    const runtime = this.getRuntimeStore();

    if (this.baseIds.has(id)) {
      runtime.overrides[id] = {
        ...(runtime.overrides[id] || {}),
        ...safePatch,
      };
    } else {
      const idx = runtime.registered.findIndex(
        (customer) => customer.id === id,
      );
      if (idx >= 0) runtime.registered[idx] = updated;
    }

    this.persistRuntime();
    this.cache = null;
    await this.loadAll(true);

    const fresh =
      (this.cache || []).find((customer) => customer.id === id) || updated;
    const current = this.getCurrentUser();
    if (current && current.id === id) this.setCurrentUser(fresh);
    return fresh;
  },

  getCurrentUser() {
    try {
      return JSON.parse(
        localStorage.getItem(CURRENT_USER_STORAGE_KEY) || "null",
      );
    } catch {
      return null;
    }
  },

  setCurrentUser(customer) {
    const { password, ...safeCustomer } = customer;
    localStorage.setItem(
      CURRENT_USER_STORAGE_KEY,
      JSON.stringify(safeCustomer),
    );
    if (typeof cartState !== "undefined") cartState.loadForCurrentUser();
    if (typeof cartUI !== "undefined") {
      cartUI.setAuthVisibility(true);
      cartUI.render();
      cartUI.updateBadge();
    }
    return safeCustomer;
  },

  isDev(user) {
    const u = user || this.getCurrentUser();
    return u?.role === "dev";
  },

  isSeller(user) {
    const u = user || this.getCurrentUser();
    return u?.role === "seller" || u?.role === "dev";
  },

  getSellerTrialRemainingDays(user) {
    const u = user || this.getCurrentUser();
    if (!u || u.role !== "seller" || !u.sellerTrialEnd) return 0;
    const end = new Date(u.sellerTrialEnd).getTime();
    const now = Date.now();
    if (end <= now) return 0;
    return Math.max(1, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
  },

  async registerSeller(userId, channelInfo) {
    const all = await this.loadAll();
    const user = all.find((c) => c.id === userId);
    if (!user) return { success: false, message: "Không tìm thấy người dùng." };

    const trialStart = new Date().toISOString();
    const trialEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerId = `seller_${userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}`;

    const sellerProfile = {
      id: sellerId,
      channelName: channelInfo.channelName || `${user.lastName || user.username}'s Store`,
      phone: channelInfo.phone || "",
      address: channelInfo.address || "",
      description: channelInfo.description || "",
      categories: Array.isArray(channelInfo.categories) && channelInfo.categories.length
        ? channelInfo.categories
        : ["coffee", "tea"],
      rating: 5.0,
      totalSold: 0,
      verified: false,
      status: "active",
      joinedAt: trialStart,
      trialEnd,
    };

    const updated = await this.updateCustomer(userId, {
      role: "seller",
      sellerProfile,
      sellerTrialStart: trialStart,
      sellerTrialEnd: trialEnd,
    });

    await sellerService.addOrUpdateSeller(sellerProfile);
    this.setCurrentUser(updated);

    return { success: true, user: updated, sellerProfile };
  },

  async extendSellerTrial(userId, extraDays = 10) {
    const user = await this.findById(userId);
    if (!user) return null;
    const currentEnd = user.sellerTrialEnd ? new Date(user.sellerTrialEnd).getTime() : Date.now();
    const newEnd = new Date(Math.max(Date.now(), currentEnd) + extraDays * 24 * 60 * 60 * 1000).toISOString();
    const updated = await this.updateCustomer(userId, {
      sellerTrialEnd: newEnd,
      status: "active",
    });
    return updated;
  },

  logout() {
    localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
    if (typeof cartState !== "undefined") {
      cartState.items = [];
      cartState.ownerId = "";
    }
    if (typeof cartUI !== "undefined") {
      cartUI.setAuthVisibility(false);
      cartUI.render();
      cartUI.updateBadge();
    }
  },
};

/* ────────────────────────────────────────────────────────────
   SELLER SERVICE — ánh xạ sellerId trong products.json sang sellers.json + runtime
   ──────────────────────────────────────────────────────────── */
const SELLERS_JSON_URL = `${projectRootPrefix}json/sellers.json`;
const SELLER_RUNTIME_STORAGE_KEY = "koffiaSellerRuntime";

const sellerService = {
  cache: null,
  getRuntimeSellers() {
    try {
      return JSON.parse(localStorage.getItem(SELLER_RUNTIME_STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  },
  async loadAll(forceRefresh = false) {
    if (this.cache && !forceRefresh) return this.cache;
    let base = [];
    try {
      const response = await fetch(`${projectRootPrefix}json/sellers.json`, { cache: "no-store" });
      const data = response.ok ? await response.json() : [];
      base = Array.isArray(data) ? data : [];
    } catch {
      base = [];
    }
    const runtime = this.getRuntimeSellers();
    const map = new Map(base.map((s) => [s.id, s]));
    runtime.forEach((s) => map.set(s.id, { ...(map.get(s.id) || {}), ...s }));
    this.cache = Array.from(map.values());
    return this.cache;
  },
  async findById(id) {
    const all = await this.loadAll();
    return all.find((seller) => seller.id === id) || null;
  },
  async getMap() {
    const all = await this.loadAll();
    return new Map(all.map((seller) => [seller.id, seller]));
  },
  async addOrUpdateSeller(seller) {
    const runtime = this.getRuntimeSellers();
    const idx = runtime.findIndex((s) => s.id === seller.id);
    if (idx >= 0) runtime[idx] = { ...runtime[idx], ...seller };
    else runtime.push(seller);
    localStorage.setItem(SELLER_RUNTIME_STORAGE_KEY, JSON.stringify(runtime));
    this.cache = null;
    if (typeof koffiaCloudSync !== "undefined") {
      koffiaCloudSync.schedulePush("sellers");
    }
    return this.loadAll(true);
  },
};

/* ────────────────────────────────────────────────────────────
   FLASH SALE SERVICE — đợt giảm giá có thời hạn & số lượng
   ──────────────────────────────────────────────────────────── */
const FLASH_SALES_JSON_URL = `${projectRootPrefix}json/flashSales.json`;
const FLASH_SALES_RUNTIME_KEY = "koffiaFlashSalesRuntime";

const flashSaleService = {
  cache: null,
  getRuntimeSales() {
    try {
      const raw = localStorage.getItem(FLASH_SALES_RUNTIME_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  async loadAll(forceRefresh = false) {
    if (this.cache && !forceRefresh) return this.cache;
    try {
      const response = await fetch(`${projectRootPrefix}json/flashSales.json`, { cache: "no-store" });
      const staticData = response.ok ? await response.json() : [];
      const runtime = this.getRuntimeSales() || [];
      const staticIds = new Set(staticData.map((s) => s.id));
      const customRuntime = runtime.filter((s) => !staticIds.has(s.id));
      this.cache = [...staticData, ...customRuntime];
      localStorage.setItem(FLASH_SALES_RUNTIME_KEY, JSON.stringify(this.cache));
    } catch {
      const runtime = this.getRuntimeSales();
      this.cache = Array.isArray(runtime) ? runtime : [];
    }
    return this.cache;
  },
  saveAll(sales) {
    this.cache = sales;
    localStorage.setItem(FLASH_SALES_RUNTIME_KEY, JSON.stringify(sales));
    if (typeof koffiaCloudSync !== "undefined") {
      koffiaCloudSync.schedulePush("flashSales");
    }
  },
  async getActiveSales() {
    const all = await this.loadAll();
    const now = new Date();
    const active = all.filter((s) => {
      if (s.status !== "active") return false;
      const start = new Date(s.startTime);
      const end = new Date(s.endTime);
      return now >= start && now <= end;
    });
    if (active.length > 0) return active;
    // Fallback: nếu không khớp khung giờ hoặc ngày lệch, tự động phục vụ sale đầu tiên cho phiên hôm nay
    const candidate = all.find((s) => s.status === "active") || all[0];
    if (candidate) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      return [{
        ...candidate,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      }];
    }
    return [];
  },
  async getActiveProductSale(productId) {
    const activeSales = await this.getActiveSales();
    for (const sale of activeSales) {
      const p = (sale.products || []).find((item) => item.productId === productId);
      if (p && (Number(p.soldQty) || 0) < (Number(p.maxQty) || 9999)) {
        return {
          saleId: sale.id,
          saleName: sale.name,
          discountPercent: Number(p.discountPercent) || 0,
          maxQty: Number(p.maxQty) || 0,
          soldQty: Number(p.soldQty) || 0,
          endTime: sale.endTime,
        };
      }
    }
    return null;
  },
  async recordSalePurchase(productId, qty = 1) {
    const all = await this.loadAll();
    const active = await this.getActiveSales();
    for (const sale of active) {
      const p = (sale.products || []).find((item) => item.productId === productId);
      if (p) {
        p.soldQty = (Number(p.soldQty) || 0) + qty;
        const mainSale = all.find((s) => s.id === sale.id);
        if (mainSale) {
          const mainP = mainSale.products.find((item) => item.productId === productId);
          if (mainP) mainP.soldQty = p.soldQty;
        }
        this.saveAll(all);
        break;
      }
    }
  },
  async createSale(sale) {
    const all = await this.loadAll();
    const newSale = {
      id: sale.id || `fs_${Date.now().toString(36)}`,
      name: sale.name || "Flash Sale Mới",
      description: sale.description || "",
      startTime: sale.startTime || new Date().toISOString(),
      endTime: sale.endTime || new Date(Date.now() + 4 * 3600000).toISOString(),
      products: Array.isArray(sale.products) ? sale.products : [],
      status: sale.status || "active",
    };
    all.unshift(newSale);
    this.saveAll(all);
    return newSale;
  },
  async updateSale(id, patch) {
    const all = await this.loadAll();
    const idx = all.findIndex((s) => s.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...patch };
      this.saveAll(all);
      return all[idx];
    }
    return null;
  },
  async deleteSale(id) {
    const all = await this.loadAll();
    const filtered = all.filter((s) => s.id !== id);
    this.saveAll(filtered);
    return true;
  },
};

/* ────────────────────────────────────────────────────────────
   VOUCHER SERVICE — mã giảm giá toàn sàn & theo kênh người bán
   ──────────────────────────────────────────────────────────── */
const VOUCHERS_JSON_URL = `${projectRootPrefix}json/vouchers.json`;
const VOUCHERS_RUNTIME_KEY = "koffiaVouchersRuntime";
const VOUCHER_USAGE_STORAGE_KEY = "koffiaVoucherUsage";

const voucherService = {
  cache: null,
  getRuntimeVouchers() {
    try {
      const raw = localStorage.getItem(VOUCHERS_RUNTIME_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  async loadAll(forceRefresh = false) {
    if (this.cache && !forceRefresh) return this.cache;
    try {
      const response = await fetch(`${projectRootPrefix}json/vouchers.json`, { cache: "no-store" });
      const staticData = response.ok ? await response.json() : [];
      const runtime = this.getRuntimeVouchers() || [];
      const staticCodes = new Set(
        staticData.map((v) => (v.code || "").toUpperCase()),
      );
      const customRuntime = runtime.filter(
        (v) => !staticCodes.has((v.code || "").toUpperCase()),
      );
      this.cache = [...staticData, ...customRuntime];
      localStorage.setItem(VOUCHERS_RUNTIME_KEY, JSON.stringify(this.cache));
    } catch {
      const runtime = this.getRuntimeVouchers();
      this.cache = Array.isArray(runtime) ? runtime : [];
    }
    return this.cache;
  },
  saveAll(vouchers) {
    this.cache = vouchers;
    localStorage.setItem(VOUCHERS_RUNTIME_KEY, JSON.stringify(vouchers));
    if (typeof koffiaCloudSync !== "undefined") {
      koffiaCloudSync.schedulePush("vouchers");
    }
  },
  async getPublicVouchers() {
    const all = await this.loadAll();
    const now = new Date();
    const viewer = getStoredCurrentUser();
    const canSee = (v) => {
      if (v.status !== "active") return false;
      if (v.ownerUserId) {
        return Boolean(viewer?.id && v.ownerUserId === viewer.id);
      }
      return Boolean(v.isPublic);
    };
    const publicList = all.filter((v) => {
      if (!canSee(v)) return false;
      const start = new Date(v.startDate);
      const end = new Date(v.endDate);
      return isNaN(start) || isNaN(end) || (now >= start && now <= end);
    });
    const result =
      publicList.length > 0 ? publicList : all.filter((v) => canSee(v));
    // Ưu tiên hiển thị voucher đổi điểm Rewards của chính khách lên đầu
    return result.slice().sort((a, b) => {
      const aMine = a.ownerUserId ? 0 : 1;
      const bMine = b.ownerUserId ? 0 : 1;
      return aMine - bMine;
    });
  },
  async getSellerVouchers(sellerId) {
    const all = await this.loadAll();
    return all.filter((v) => v.sellerId === sellerId);
  },
  async findByCode(code) {
    const all = await this.loadAll();
    const cleanCode = (code || "").trim().toUpperCase();
    return (
      all.find(
        (v) =>
          (v.code || "").toUpperCase() === cleanCode && v.status === "active",
      ) || null
    );
  },
  getUserUsage(code, userId) {
    try {
      const map = JSON.parse(
        localStorage.getItem(VOUCHER_USAGE_STORAGE_KEY) || "{}",
      );
      return Number(map[`${code}_${userId}`]) || 0;
    } catch {
      return 0;
    }
  },
  recordUsage(code, userId) {
    try {
      const map = JSON.parse(
        localStorage.getItem(VOUCHER_USAGE_STORAGE_KEY) || "{}",
      );
      const key = `${code}_${userId}`;
      map[key] = (Number(map[key]) || 0) + 1;
      localStorage.setItem(VOUCHER_USAGE_STORAGE_KEY, JSON.stringify(map));
    } catch {}
  },
  computeDiscount(voucher, cartItems = [], subtotal = 0) {
    if (!voucher) return { discount: 0, isFreeShip: false };
    if (subtotal < (Number(voucher.minOrderValue) || 0)) {
      return { discount: 0, isFreeShip: false, underMin: true };
    }
    let eligibleAmount = subtotal;
    if (voucher.applicableCategories && voucher.applicableCategories.length > 0) {
      const eligibleItems = cartItems.filter((item) =>
        voucher.applicableCategories.includes(item.category),
      );
      if (eligibleItems.length === 0) return { discount: 0, isFreeShip: false };
      eligibleAmount = eligibleItems.reduce(
        (sum, i) => sum + (Number(i.price) || 0) * (Number(i.qty) || 1),
        0,
      );
    }
    if (voucher.sellerId) {
      const sellerItems = cartItems.filter((item) => item.sellerId === voucher.sellerId);
      if (sellerItems.length === 0) return { discount: 0, isFreeShip: false };
      eligibleAmount = sellerItems.reduce(
        (sum, i) => sum + (Number(i.price) || 0) * (Number(i.qty) || 1),
        0,
      );
    }
    let discount = 0;
    if (voucher.type === "percent") {
      discount = Math.round((eligibleAmount * Number(voucher.value)) / 100);
      if (voucher.maxDiscount && discount > Number(voucher.maxDiscount)) {
        discount = Number(voucher.maxDiscount);
      }
    } else if (voucher.type === "fixed") {
      discount = Math.min(Number(voucher.value) || 0, eligibleAmount);
    } else if (voucher.type === "freeShip") {
      discount = 0;
    }
    return {
      discount,
      isFreeShip: voucher.type === "freeShip",
    };
  },
  async validateVoucher(code, cartItems = [], subtotal = 0, user = null) {
    const voucher = await this.findByCode(code);
    if (!voucher) {
      return {
        valid: false,
        message: "Mã giảm giá không tồn tại hoặc đã hết hạn.",
      };
    }
    if (voucher.ownerUserId && (!user?.id || voucher.ownerUserId !== user.id)) {
      return {
        valid: false,
        message: "Mã thưởng này thuộc về tài khoản khác.",
      };
    }
    const now = new Date();
    const start = new Date(voucher.startDate);
    const end = new Date(voucher.endDate);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      if (now.getFullYear() === end.getFullYear() && (now < start || now > end)) {
        return {
          valid: false,
          message: "Mã giảm giá chưa bắt đầu hoặc đã hết thời gian áp dụng.",
        };
      }
    }
    if ((Number(voucher.usedCount) || 0) >= (Number(voucher.maxUsageTotal) || 999999)) {
      return {
        valid: false,
        message: "Mã giảm giá đã hết lượt sử dụng trên hệ thống.",
      };
    }
    if (user?.id) {
      const userUsed = this.getUserUsage(voucher.code, user.id);
      if (userUsed >= (Number(voucher.maxUsagePerUser) || 1)) {
        return {
          valid: false,
          message: `Bạn đã sử dụng tối đa (${voucher.maxUsagePerUser} lần) mã này.`,
        };
      }
    }
    if (voucher.isNewUserOnly && user?.id) {
      const orders =
        typeof orderHistoryService !== "undefined"
          ? orderHistoryService.getForCurrentViewer()
          : [];
      if (orders && orders.length > 0) {
        return {
          valid: false,
          message: "Mã này chỉ áp dụng cho đơn hàng đầu tiên của thành viên mới.",
        };
      }
    }
    if (subtotal < (Number(voucher.minOrderValue) || 0)) {
      return {
        valid: false,
        message: `Đơn hàng tối thiểu ${formatPrice(voucher.minOrderValue)} để áp dụng mã này.`,
      };
    }

    // Tự động phân giải category & sellerId nếu cartItems từ phiên cũ thiếu thuộc tính
    let enrichedItems = cartItems;
    if (typeof productCatalogService !== "undefined") {
      try {
        const pMap = await productCatalogService.getProductMap();
        enrichedItems = cartItems.map((item) => {
          const baseId =
            item.productId || String(item.id || "").split("::")[0];
          const prod = pMap.get(baseId);
          return {
            ...item,
            category: item.category || prod?.category || "",
            sellerId: item.sellerId || prod?.sellerId || "",
          };
        });
      } catch (err) {
        enrichedItems = cartItems;
      }
    }

    let eligibleAmount = subtotal;
    if (voucher.applicableCategories && voucher.applicableCategories.length > 0) {
      const eligibleItems = enrichedItems.filter((item) =>
        voucher.applicableCategories.includes(item.category),
      );
      if (eligibleItems.length === 0) {
        const catLabels = {
          coffee: "Cà phê",
          tea: "Trà",
          "milk-tea": "Trà sữa",
          juice: "Nước ép",
          smoothie: "Sinh tố",
          yogurt: "Sữa chua",
          soda: "Soda",
        };
        const readableCats = voucher.applicableCategories
          .map((c) => catLabels[c] || c)
          .join(", ");
        return {
          valid: false,
          message: `Mã chỉ áp dụng cho thức uống thuộc danh mục: ${readableCats}.`,
        };
      }
      eligibleAmount = eligibleItems.reduce(
        (sum, i) => sum + (Number(i.price) || 0) * (Number(i.qty) || 1),
        0,
      );
    }

    if (voucher.sellerId) {
      const sellerItems = enrichedItems.filter(
        (item) => item.sellerId === voucher.sellerId,
      );
      if (sellerItems.length === 0) {
        return {
          valid: false,
          message: "Mã chỉ áp dụng cho sản phẩm thuộc kênh đối tác tương ứng.",
        };
      }
      eligibleAmount = sellerItems.reduce(
        (sum, i) => sum + (Number(i.price) || 0) * (Number(i.qty) || 1),
        0,
      );
    }

    let discount = 0;
    if (voucher.type === "percent") {
      discount = Math.round((eligibleAmount * Number(voucher.value)) / 100);
      if (voucher.maxDiscount && discount > Number(voucher.maxDiscount)) {
        discount = Number(voucher.maxDiscount);
      }
    } else if (voucher.type === "fixed") {
      discount = Math.min(Number(voucher.value) || 0, eligibleAmount);
    } else if (voucher.type === "freeShip") {
      discount = 0;
    }

    return {
      valid: true,
      discount,
      isFreeShip: voucher.type === "freeShip",
      message: `Áp dụng thành công "${voucher.name}"!`,
      voucher,
    };
  },
  async createVoucher(voucher) {
    const all = await this.loadAll();
    const newVoucher = {
      id: voucher.id || `vc_${Date.now().toString(36)}`,
      code: (voucher.code || "").trim().toUpperCase(),
      name: voucher.name || "Voucher giảm giá",
      description: voucher.description || "",
      type: voucher.type || "percent",
      value: Number(voucher.value) || 10,
      maxDiscount: Number(voucher.maxDiscount) || 20000,
      minOrderValue: Number(voucher.minOrderValue) || 50000,
      maxUsageTotal: Number(voucher.maxUsageTotal) || 500,
      maxUsagePerUser: Number(voucher.maxUsagePerUser) || 1,
      usedCount: 0,
      applicableCategories: Array.isArray(voucher.applicableCategories)
        ? voucher.applicableCategories
        : [],
      applicableProductIds: Array.isArray(voucher.applicableProductIds)
        ? voucher.applicableProductIds
        : [],
      startDate: voucher.startDate || new Date().toISOString(),
      endDate:
        voucher.endDate ||
        new Date(Date.now() + 30 * 24 * 3600000).toISOString(),
      isPublic: voucher.isPublic !== false,
      isNewUserOnly: Boolean(voucher.isNewUserOnly),
      ownerUserId: voucher.ownerUserId || null,
      isRewardVoucher: Boolean(voucher.isRewardVoucher),
      sellerId: voucher.sellerId || null,
      status: voucher.status || "active",
    };
    all.unshift(newVoucher);
    this.saveAll(all);
    return newVoucher;
  },
  async updateVoucher(id, patch) {
    const all = await this.loadAll();
    const idx = all.findIndex((v) => v.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...patch };
      this.saveAll(all);
      return all[idx];
    }
    return null;
  },
  async deleteVoucher(id) {
    const all = await this.loadAll();
    const filtered = all.filter((v) => v.id !== id);
    this.saveAll(filtered);
    return true;
  },
  async evaluateForCart(cartItems = [], subtotal = 0, user = null) {
    const vouchers = await this.getPublicVouchers();
    const evaluated = await Promise.all(
      vouchers.map(async (v) => {
        const res = await this.validateVoucher(v.code, cartItems, subtotal, user);
        let shortReason = "";
        if (!res.valid) {
          const minVal = Number(v.minOrderValue) || 0;
          if (subtotal < minVal) {
            shortReason = `Mua thêm ${formatPrice(minVal - subtotal)}`;
          } else {
            shortReason = res.message || "Chưa đủ điều kiện";
          }
        }
        const savingsValue = res.valid
          ? res.isFreeShip
            ? typeof KOFFIA_BASE_SHIPPING_FEE !== "undefined"
              ? KOFFIA_BASE_SHIPPING_FEE
              : 15000
            : Number(res.discount) || 0
          : 0;
        return {
          voucher: v,
          valid: Boolean(res.valid),
          discount: Number(res.discount) || 0,
          isFreeShip: Boolean(res.isFreeShip),
          savingsValue,
          reason: shortReason,
        };
      }),
    );
    return evaluated.sort((a, b) => {
      if (a.valid !== b.valid) return a.valid ? -1 : 1;
      if (a.valid && b.valid) {
        if (Boolean(a.voucher.isRewardVoucher) !== Boolean(b.voucher.isRewardVoucher)) {
          return a.voucher.isRewardVoucher ? -1 : 1;
        }
        return b.savingsValue - a.savingsValue;
      }
      return (Number(a.voucher.minOrderValue) || 0) - (Number(b.voucher.minOrderValue) || 0);
    });
  },
};

/* ────────────────────────────────────────────────────────────
   iOS 2-TAP INLINE CONFIRMATION HELPER (Thay window.confirm())
   ──────────────────────────────────────────────────────────── */
function wireTwoTapConfirm(btn, options = {}) {
  if (!btn || btn.dataset.twoTapWired === "1") return;
  btn.dataset.twoTapWired = "1";
  const defaultHtml = options.defaultHtml || btn.innerHTML;
  const confirmHtml =
    options.confirmHtml ||
    '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Xác nhận?';
  const timeoutMs = Number(options.timeoutMs) || 3500;
  let timer = null;

  btn.addEventListener("click", async (e) => {
    if (typeof options.guard === "function" && !options.guard(e)) return;
    if (btn.dataset.confirming !== "1") {
      btn.dataset.confirming = "1";
      btn.classList.add("isConfirming");
      btn.innerHTML = confirmHtml;
      clearTimeout(timer);
      timer = setTimeout(() => {
        btn.dataset.confirming = "0";
        btn.classList.remove("isConfirming");
        btn.innerHTML = defaultHtml;
      }, timeoutMs);
      return;
    }

    clearTimeout(timer);
    btn.dataset.confirming = "0";
    btn.classList.remove("isConfirming");
    btn.innerHTML = defaultHtml;
    if (typeof options.onConfirm === "function") {
      await options.onConfirm(e);
    }
  });
}

/* ────────────────────────────────────────────────────────────
   NAVIGATION & CATEGORY TASKBAR — macOS Dynamic Top Bar Cluster
   - Nhóm 4 trang chính (.navMenu) + Nhóm stack trang "Khác" (#navRecentMenu)
   - Hiển thị tối đa 3 trang; từ trang thứ 4 hiển thị [Trang 1, Trang 2, •••]
   - Cơ chế MRU Stack: trang vừa truy cập luôn đẩy lên đầu (index 0) kèm FLIP animation
   ──────────────────────────────────────────────────────────── */
const NAV_RECENT_STORAGE_KEY = "koffiaNavRecentStackV1";

function getNavContextPageMeta(urlOrPath = window.location.href) {
  let parsed = null;
  try {
    parsed = new URL(urlOrPath, window.location.href);
  } catch {
    return null;
  }
  const file = parsed.pathname.replace(/\\/g, "/").split("/").pop().toLowerCase();
  if (file === "cart.html") {
    return {
      key: "cart",
      label: "Giỏ Hàng",
      icon: "fa-bag-shopping",
      tone: "isOrange",
      relPath: "pages/cart.html",
    };
  }
  if (file === "checkout.html") {
    return {
      key: "checkout",
      label: "Thanh Toán",
      icon: "fa-credit-card",
      tone: "isGreen",
      relPath: "pages/checkout.html",
    };
  }
  if (file === "orders.html") {
    return {
      key: "orders",
      label: "Đơn Hàng",
      icon: "fa-receipt",
      tone: "isBlue",
      relPath: "pages/orders.html",
    };
  }
  if (file === "product.html") {
    return {
      key: "product",
      label: "Chi Tiết Món",
      icon: "fa-mug-hot",
      tone: "isAmber",
      relPath: `pages/product.html${parsed.search || ""}`,
    };
  }
  if (file === "account.html") {
    const tab = (parsed.searchParams.get("tab") || "profile").toLowerCase();
    if (tab === "vouchers") {
      return {
        key: "account-vouchers",
        label: "Kho Voucher",
        icon: "fa-ticket",
        tone: "isOrange",
        relPath: "pages/account.html?tab=vouchers",
      };
    }
    if (tab === "rewards") {
      return {
        key: "account-rewards",
        label: "Tích Điểm",
        icon: "fa-crown",
        tone: "isAmber",
        relPath: "pages/account.html?tab=rewards",
      };
    }
    if (tab === "wishlist") {
      return {
        key: "account-wishlist",
        label: "Yêu Thích",
        icon: "fa-heart",
        tone: "isRed",
        relPath: "pages/account.html?tab=wishlist",
      };
    }
    if (tab === "preferences" || tab === "settings") {
      return {
        key: "account-preferences",
        label: "Gu Uống",
        icon: "fa-sliders",
        tone: "isGreen",
        relPath: "pages/account.html?tab=preferences",
      };
    }
    if (tab === "addresses" || tab === "address") {
      return {
        key: "account-addresses",
        label: "Sổ Địa Chỉ",
        icon: "fa-location-dot",
        tone: "isGreen",
        relPath: "pages/account.html?tab=addresses",
      };
    }
    return {
      key: "account-profile",
      label: "Tài Khoản",
      icon: "fa-circle-user",
      tone: "isIndigo",
      relPath: "pages/account.html?tab=profile",
    };
  }
  return null;
}

const navRecentManager = {
  stack: [],
  activeKey: null,
  loaded: false,
  morePopoverEl: null,
  moreOpen: false,
  widthTimer: null,
  animSeq: 0,

  loadStack() {
    if (this.loaded) return this.stack;
    this.loaded = true;
    try {
      const raw = JSON.parse(sessionStorage.getItem(NAV_RECENT_STORAGE_KEY) || "[]");
      if (Array.isArray(raw)) {
        this.stack = raw.filter(
          (item) => item && typeof item.key === "string" && typeof item.label === "string",
        );
      }
    } catch {
      this.stack = [];
    }
    return this.stack;
  },

  saveStack() {
    try {
      sessionStorage.setItem(NAV_RECENT_STORAGE_KEY, JSON.stringify(this.stack));
    } catch {}
  },

  resolveHref(relPath) {
    const cleanRel = String(relPath || "").replace(/^\/+/, "");
    const inPages = window.location.pathname.replace(/\\/g, "/").includes("/pages/");
    if (inPages && cleanRel.startsWith("pages/")) {
      return cleanRel.slice("pages/".length);
    }
    if (!inPages && !cleanRel.startsWith("pages/") && cleanRel !== "index.html") {
      return `pages/${cleanRel}`;
    }
    return cleanRel;
  },

  getMoreDotsSvg() {
    return '<svg class="navRecentDotsSvg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
  },

  ensureMorePopover() {
    if (this.morePopoverEl && this.morePopoverEl.isConnected) return this.morePopoverEl;
    let pop = document.getElementById("navRecentMorePopover");
    if (!pop) {
      pop = document.createElement("div");
      pop.id = "navRecentMorePopover";
      pop.className = "navRecentMorePopover";
      pop.setAttribute("role", "menu");
      pop.setAttribute("aria-label", "Các trang đã truy cập khác");
      document.body.appendChild(pop);
    }
    this.morePopoverEl = pop;

    if (!window._navRecentPopoverEventsWired) {
      window._navRecentPopoverEventsWired = true;
      document.addEventListener("click", (e) => {
        if (!this.moreOpen) return;
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (t.closest("#navRecentMorePopover") || t.closest("#navRecentMoreBtn")) return;
        this.closeMorePopover();
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.moreOpen) {
          this.closeMorePopover();
        }
      });
      window.addEventListener(
        "resize",
        () => {
          if (this.moreOpen) this.positionMorePopover();
        },
        { passive: true },
      );
      window.addEventListener(
        "scroll",
        () => {
          if (this.moreOpen) this.positionMorePopover();
        },
        { passive: true },
      );
    }
    return pop;
  },

  positionMorePopover() {
    const btn = document.getElementById("navRecentMoreBtn");
    const pop = this.ensureMorePopover();
    if (!btn || !pop) return;
    const rect = btn.getBoundingClientRect();
    const popW = Math.min(232, window.innerWidth - 24);
    const left = Math.max(
      12,
      Math.min(rect.right - popW, window.innerWidth - popW - 12),
    );
    const top = Math.round(rect.bottom + 10);
    pop.style.width = `${popW}px`;
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  },

  renderMorePopover() {
    const pop = this.ensureMorePopover();
    const overflowItems = this.stack.length >= 4 ? this.stack.slice(2) : [];
    if (!overflowItems.length) {
      this.closeMorePopover();
      return;
    }
    const esc = escapeHtmlGlobal;
    pop.innerHTML = `
      <div class="navRecentPopHeader">
        <span>Trang đã mở gần đây</span>
        <span class="navRecentPopCount">${overflowItems.length}</span>
      </div>
      <div class="navRecentPopList">
        ${overflowItems
          .map(
            (item, idx) => `
          <a href="${esc(this.resolveHref(item.relPath))}"
             class="navRecentPopItem${item.key === this.activeKey ? " isActive" : ""}"
             data-recent-pop-key="${esc(item.key)}"
             style="--pop-idx:${idx}"
             role="menuitem">
            <span class="iosPopIcon ${esc(item.tone || "isOrange")}">
              <i class="fa-solid ${esc(item.icon || "fa-layer-group")}" aria-hidden="true"></i>
            </span>
            <span class="navRecentPopText">${esc(item.label)}</span>
            <i class="fa-solid fa-arrow-up-left navRecentPopPromoteIcon" aria-hidden="true" title="Đẩy lên đầu thanh bar"></i>
          </a>
        `,
          )
          .join("")}
      </div>
    `;

    pop.querySelectorAll("a.navRecentPopItem").forEach((link) => {
      link.addEventListener("click", () => {
        this.closeMorePopover();
      });
    });
  },

  openMorePopover() {
    if (this.stack.length < 4) return;
    this.renderMorePopover();
    this.positionMorePopover();
    const pop = this.ensureMorePopover();
    pop.classList.add("isOpen");
    this.moreOpen = true;
    const btn = document.getElementById("navRecentMoreBtn");
    if (btn) {
      btn.classList.add("isOpen");
      btn.setAttribute("aria-expanded", "true");
    }
  },

  closeMorePopover() {
    if (this.morePopoverEl) {
      this.morePopoverEl.classList.remove("isOpen");
    }
    this.moreOpen = false;
    const btn = document.getElementById("navRecentMoreBtn");
    if (btn) {
      btn.classList.remove("isOpen");
      btn.setAttribute("aria-expanded", "false");
    }
    const recentMenu = document.getElementById("navRecentMenu");
    if (recentMenu && typeof recentMenu._restoreRecentPill === "function") {
      recentMenu._restoreRecentPill();
    }
  },

  toggleMorePopover() {
    if (this.moreOpen) this.closeMorePopover();
    else this.openMorePopover();
  },

  moveRecentPill(recentMenu, targetEl, immediate = false) {
    const pill = recentMenu?.querySelector(".navRecentActivePill");
    if (!pill || !targetEl) return;
    const width = targetEl.offsetWidth;
    const height = targetEl.offsetHeight;
    if (width === 0 || height === 0) return;
    const left = targetEl.offsetLeft;
    const top = targetEl.offsetTop;

    const wasHidden = parseFloat(getComputedStyle(pill).opacity || "0") < 0.05;
    if (immediate || wasHidden) {
      pill.style.transition = "none";
    } else {
      pill.style.transition = "";
    }

    pill.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    pill.style.width = `${width}px`;
    pill.style.height = `${height}px`;
    pill.style.opacity = "1";

    if (immediate || wasHidden) {
      void pill.offsetHeight;
      pill.style.transition = "";
    }
  },

  sync(urlOrPath = window.location.href) {
    const navBar = document.getElementById("navBar");
    const navInner = navBar?.querySelector(".navInner");
    const navMenu = navInner?.querySelector(".navMenu");
    if (!navInner || !navMenu) return;

    this.loadStack();

    let centerGroup = document.getElementById("navCenterGroup");
    if (!centerGroup) {
      centerGroup = document.createElement("div");
      centerGroup.id = "navCenterGroup";
      centerGroup.className = "navCenterGroup";
      navMenu.parentNode.insertBefore(centerGroup, navMenu);
      centerGroup.appendChild(navMenu);
    }

    // Gỡ bỏ #navContextPill đơn lẻ của bản cũ nếu còn tồn tại
    const oldSinglePill = document.getElementById("navContextPill");
    if (oldSinglePill) oldSinglePill.remove();

    let recentMenu = document.getElementById("navRecentMenu");
    if (!recentMenu) {
      recentMenu = document.createElement("div");
      recentMenu.id = "navRecentMenu";
      recentMenu.className = "navRecentMenu isEmpty";
      recentMenu.setAttribute("role", "navigation");
      recentMenu.setAttribute("aria-label", "Các trang truy cập gần đây");

      const recentPill = document.createElement("div");
      recentPill.id = "navRecentActivePill";
      recentPill.className = "navRecentActivePill";
      recentPill.setAttribute("aria-hidden", "true");
      recentMenu.appendChild(recentPill);

      centerGroup.appendChild(recentMenu);

      recentMenu.addEventListener("mouseleave", () => {
        recentMenu
          .querySelectorAll(".navRecentLink")
          .forEach((el) => el.classList.remove("pillHovered"));
        if (this.moreOpen) {
          const moreBtn = document.getElementById("navRecentMoreBtn");
          if (moreBtn) {
            this.moveRecentPill(recentMenu, moreBtn, false);
            return;
          }
        }
        recentMenu._restoreRecentPill?.();
      });
    }

    recentMenu._restoreRecentPill = () => {
      const activeEl = recentMenu.querySelector(".navRecentLink.navRecentLinkActive");
      const pill = recentMenu.querySelector(".navRecentActivePill");
      if (activeEl) {
        this.moveRecentPill(recentMenu, activeEl, false);
      } else if (pill) {
        pill.style.opacity = "0";
      }
    };

    // 1. FIRST — Đo vị trí & kích thước trước khi cập nhật stack để chuẩn bị FLIP animation
    const wasEmpty = recentMenu.classList.contains("isEmpty");
    const oldMainRect = navMenu.getBoundingClientRect();
    const oldRecentRect = recentMenu.getBoundingClientRect();
    const oldLocalLefts = new Map();
    if (!wasEmpty && oldRecentRect.width > 0) {
      recentMenu.querySelectorAll("[data-recent-key]").forEach((el) => {
        oldLocalLefts.set(el.dataset.recentKey, el.offsetLeft);
      });
    }

    // 2. Cập nhật MRU Stack (đẩy trang vừa truy cập lên vị trí đầu tiên index 0)
    const meta = getNavContextPageMeta(urlOrPath);
    let promotedFromOverflow = false;
    let promotedKey = null;

    if (meta) {
      const existingIdx = this.stack.findIndex((item) => item.key === meta.key);
      if (existingIdx >= 2 && this.stack.length >= 4) {
        promotedFromOverflow = true;
        promotedKey = meta.key;
      }
      if (existingIdx !== -1) {
        this.stack.splice(existingIdx, 1);
      }
      this.stack.unshift(meta);
      if (this.stack.length > 8) {
        this.stack.length = 8;
      }
      this.activeKey = meta.key;
      this.saveStack();
    } else {
      this.activeKey = null;
    }

    if (this.moreOpen) {
      this.closeMorePopover();
    }

    // Nếu stack rỗng: ẩn gọn cụm phụ
    if (this.stack.length === 0) {
      recentMenu.classList.add("isEmpty");
      centerGroup.classList.add("isRecentEmpty");
      const pill = recentMenu.querySelector(".navRecentActivePill");
      if (pill) pill.style.opacity = "0";
      return;
    }

    recentMenu.classList.remove("isEmpty");
    centerGroup.classList.remove("isRecentEmpty");

    // 3. Xác định các slot hiển thị: <= 3 trang thì hiện cả 3; >= 4 trang thì hiện 2 trang đầu + nút •••
    const hasOverflow = this.stack.length >= 4;
    const visibleItems = hasOverflow ? this.stack.slice(0, 2) : this.stack.slice(0, 3);

    // Tái sử dụng DOM nodes để chữ và font không bao giờ nháy
    const existingNodes = new Map();
    recentMenu.querySelectorAll("[data-recent-key]").forEach((el) => {
      existingNodes.set(el.dataset.recentKey, el);
    });

    const desiredNodes = [];

    visibleItems.forEach((item) => {
      let link = existingNodes.get(item.key);
      if (!link || link.tagName !== "A") {
        link = document.createElement("a");
        link.className = "navRecentLink";
        link.dataset.recentKey = item.key;
        link.addEventListener("mouseenter", () => {
          this.moveRecentPill(recentMenu, link, false);
          recentMenu
            .querySelectorAll(".navRecentLink")
            .forEach((l) => l.classList.remove("pillHovered"));
          link.classList.add("pillHovered");
        });
      }
      link.href = this.resolveHref(item.relPath);
      link.textContent = item.label;
      const isActive = item.key === this.activeKey;
      link.classList.toggle("navRecentLinkActive", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
      desiredNodes.push(link);
    });

    if (hasOverflow) {
      const overflowCount = this.stack.length - 2;
      let moreBtn = existingNodes.get("__more__");
      if (!moreBtn || moreBtn.tagName !== "BUTTON") {
        moreBtn = document.createElement("button");
        moreBtn.type = "button";
        moreBtn.id = "navRecentMoreBtn";
        moreBtn.className = "navRecentLink navRecentMoreBtn";
        moreBtn.dataset.recentKey = "__more__";
        moreBtn.setAttribute("aria-haspopup", "menu");
        moreBtn.setAttribute("aria-expanded", "false");
        moreBtn.innerHTML = this.getMoreDotsSvg();
        moreBtn.addEventListener("mouseenter", () => {
          this.moveRecentPill(recentMenu, moreBtn, false);
          recentMenu
            .querySelectorAll(".navRecentLink")
            .forEach((l) => l.classList.remove("pillHovered"));
          moreBtn.classList.add("pillHovered");
        });
        moreBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.toggleMorePopover();
        });
      }
      moreBtn.title = `Còn ${overflowCount} trang khác (${this.stack
        .slice(2)
        .map((i) => i.label)
        .join(", ")})`;
      moreBtn.setAttribute("aria-label", `Mở danh sách ${overflowCount} trang khác`);
      desiredNodes.push(moreBtn);
    }

    // Xóa các node không còn nằm trong nhóm hiển thị
    existingNodes.forEach((node, key) => {
      if (!desiredNodes.includes(node)) {
        node.remove();
      }
    });

    // Sắp xếp đúng thứ tự sau .navRecentActivePill
    desiredNodes.forEach((node) => {
      recentMenu.appendChild(node);
    });

    // 4. LAST & INVERT — Chạy hiệu ứng FLIP mượt chuẩn Apple (60fps GPU)
    clearTimeout(this.widthTimer);
    recentMenu.style.width = "";

    const activeEl = recentMenu.querySelector(".navRecentLink.navRecentLinkActive");
    const pill = recentMenu.querySelector(".navRecentActivePill");
    if (activeEl) {
      this.moveRecentPill(recentMenu, activeEl, wasEmpty);
    } else if (pill) {
      pill.style.opacity = "0";
    }

    const reduceMotion =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    const seq = ++this.animSeq;
    const newMainRect = navMenu.getBoundingClientRect();
    const newRecentRect = recentMenu.getBoundingClientRect();

    // 4a. Trượt mượt cụm 4 tab chính (.navMenu) khi tâm cụm dịch chuyển
    const dxMain = oldMainRect.left - newMainRect.left;
    if (Math.abs(dxMain) > 0.5 && oldMainRect.width > 0) {
      navMenu.style.transition = "none";
      navMenu.style.transform = `translate3d(${dxMain}px, 0, 0)`;
      void navMenu.offsetWidth;
      navMenu.style.transition = "transform 0.44s cubic-bezier(0.22, 1, 0.36, 1)";
      navMenu.style.transform = "translate3d(0, 0, 0)";
    }

    // 4b. Co giãn chiều rộng & vị trí khung #navRecentMenu
    if (wasEmpty) {
      recentMenu.style.transition = "none";
      recentMenu.style.opacity = "0";
      recentMenu.style.transform = "translate3d(-10px, 0, 0) scale(0.9)";
      void recentMenu.offsetWidth;
      recentMenu.style.transition =
        "opacity 0.34s cubic-bezier(0.22, 1, 0.36, 1), transform 0.44s cubic-bezier(0.22, 1, 0.36, 1)";
      recentMenu.style.opacity = "1";
      recentMenu.style.transform = "translate3d(0, 0, 0) scale(1)";
    } else if (oldRecentRect.width > 0 && newRecentRect.width > 0) {
      const dxRecent = oldRecentRect.left - newRecentRect.left;
      const dwRecent = Math.abs(oldRecentRect.width - newRecentRect.width);
      if (Math.abs(dxRecent) > 0.5 || dwRecent > 0.5) {
        recentMenu.style.transition = "none";
        recentMenu.style.width = `${oldRecentRect.width}px`;
        recentMenu.style.transform = `translate3d(${dxRecent}px, 0, 0)`;
        void recentMenu.offsetWidth;
        recentMenu.style.transition =
          "width 0.44s cubic-bezier(0.22, 1, 0.36, 1), transform 0.44s cubic-bezier(0.22, 1, 0.36, 1)";
        recentMenu.style.width = `${newRecentRect.width}px`;
        recentMenu.style.transform = "translate3d(0, 0, 0)";
        this.widthTimer = setTimeout(() => {
          if (this.animSeq === seq) {
            recentMenu.style.width = "";
            recentMenu.style.transition = "";
            recentMenu.style.transform = "";
          }
        }, 460);
      }
    }

    // 4c. FLIP từng nút bên trong #navRecentMenu (trượt đổi chỗ hoặc trồi ra từ nút •••)
    if (!wasEmpty) {
      desiredNodes.forEach((node) => {
        const key = node.dataset.recentKey;
        const newLocalX = node.offsetLeft;
        if (oldLocalLefts.has(key)) {
          const localDx = oldLocalLefts.get(key) - newLocalX;
          if (Math.abs(localDx) > 0.5) {
            node.style.transition = "none";
            node.style.transform = `translate3d(${localDx}px, 0, 0)`;
            void node.offsetWidth;
            node.style.transition =
              "transform 0.44s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.28s ease, color 0.2s ease";
            node.style.transform = "translate3d(0, 0, 0)";
          }
        } else {
          // Tab mới mở hoặc vừa được kéo từ trong menu ••• lên đầu stack
          const fromMoreX =
            promotedFromOverflow &&
            promotedKey === key &&
            oldLocalLefts.has("__more__")
              ? oldLocalLefts.get("__more__") - newLocalX
              : -12;
          node.style.transition = "none";
          node.style.opacity = "0";
          node.style.transform = `translate3d(${fromMoreX}px, 0, 0) scale(0.86)`;
          void node.offsetWidth;
          node.style.transition =
            "transform 0.44s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.32s ease, color 0.2s ease";
          node.style.opacity = "1";
          node.style.transform = "translate3d(0, 0, 0) scale(1)";
        }
      });
    }
  },
};

function syncNavCenterAndContextPill(urlOrPath = window.location.href) {
  navRecentManager.sync(urlOrPath);
}

function isMenuPageUrl(urlOrPath = window.location.href) {
  try {
    const pathname = new URL(urlOrPath, window.location.href).pathname.toLowerCase();
    const file = pathname.split("/").pop() || "";
    return file === "menu.html";
  } catch {
    return String(urlOrPath || "").toLowerCase().includes("menu.html");
  }
}

function syncSpotlightVisibility(urlOrPath = window.location.href) {
  const isMenu = isMenuPageUrl(urlOrPath);
  const searchBtn = document.getElementById("navSpotlightBtn");
  if (searchBtn) {
    searchBtn.hidden = !isMenu;
    searchBtn.setAttribute("aria-hidden", isMenu ? "false" : "true");
  }
  if (!isMenu && typeof spotlightSearch !== "undefined" && spotlightSearch.isOpen) {
    spotlightSearch.close();
  }
}

function initNavBar() {
  const navBar = document.getElementById("navBar");
  const hamburgerBtn = document.getElementById("navHamburger");
  const navDrawer = document.getElementById("navDrawer");

  if (!navBar) return;

  // Chèn nút tìm kiếm nhanh iOS Spotlight vào .navActions (chỉ khả dụng ở trang Thực Đơn)
  const navActions = navBar.querySelector(".navActions");
  if (navActions && !document.getElementById("navSpotlightBtn")) {
    const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");
    const searchBtn = document.createElement("button");
    searchBtn.type = "button";
    searchBtn.id = "navSpotlightBtn";
    searchBtn.className = "navSpotlightBtn";
    searchBtn.setAttribute("aria-label", "Tìm kiếm nhanh (Ctrl+K)");
    searchBtn.title = isMac ? "Tìm kiếm nhanh (⌘K)" : "Tìm kiếm nhanh (Ctrl + K)";

    const searchIcon = document.createElement("i");
    searchIcon.className = "fa-solid fa-magnifying-glass";
    searchIcon.setAttribute("aria-hidden", "true");

    const kbd = document.createElement("kbd");
    kbd.className = "navSpotlightKbd";
    kbd.setAttribute("aria-hidden", "true");
    kbd.textContent = isMac ? "⌘K" : "Ctrl K";

    searchBtn.append(searchIcon, kbd);
    searchBtn.addEventListener("click", () => spotlightSearch.open());
    navActions.prepend(searchBtn);
  }
  syncSpotlightVisibility(window.location.href);

  // Chèn nút chuyển đổi Sáng / Tối gọn kiểu Apple trên thanh Navbar desktop
  if (navActions && !document.getElementById("navThemeToggleBtn")) {
    const themeBtn = document.createElement("button");
    themeBtn.type = "button";
    themeBtn.id = "navThemeToggleBtn";
    themeBtn.className = "navThemeToggleBtn themeToggleBtn";
    const isDarkNow = themeManager.getCurrentTheme() === "dark";
    themeBtn.dataset.themeState = isDarkNow ? "dark" : "light";
    themeBtn.setAttribute(
      "aria-label",
      isDarkNow ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối",
    );
    themeBtn.title = isDarkNow ? "Giao diện Sáng" : "Giao diện Tối";
    themeBtn.innerHTML = `<span class="themeIconWrap" aria-hidden="true">${themeManager.getThemeIconSvg(isDarkNow)}</span>`;
    themeBtn.onclick = (e) => {
      e.preventDefault();
      themeManager.toggle(true);
    };
    const spotlightEl = document.getElementById("navSpotlightBtn");
    if (spotlightEl && spotlightEl.parentNode === navActions) {
      spotlightEl.insertAdjacentElement("afterend", themeBtn);
    } else {
      navActions.prepend(themeBtn);
    }
  } else if (document.getElementById("navThemeToggleBtn")) {
    themeManager.syncToggleIcons(themeManager.getCurrentTheme() === "dark");
  }

  const onScroll = () => {
    const scrolled = window.scrollY > 20;
    navBar.classList.toggle("navScrolled", scrolled);
    navBar.classList.remove("navDark");
  };

  if (navBar._onScrollHandler) {
    window.removeEventListener("scroll", navBar._onScrollHandler);
  }
  navBar._onScrollHandler = onScroll;
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll(); // run on load

  // Set active link
  const currentPath = window.location.pathname.replace(/\\/g, "/");
  document.querySelectorAll(".navLink, .drawerNavLink").forEach((link) => {
    const linkPath = new URL(link.href, window.location.href).pathname.replace(
      /\\/g,
      "/",
    );
    const isActive =
      linkPath === currentPath ||
      (currentPath === "/" && linkPath.endsWith("index.html")) ||
      (currentPath.endsWith("/") && linkPath.endsWith("index.html")) ||
      (currentPath.endsWith("index.html") &&
        (linkPath === "/" || linkPath.endsWith("index.html")));
    link.classList.toggle("navLinkActive", isActive);
  });

  // Căn giữa cụm điều hướng & đồng bộ tab phụ tách rời (Giỏ Hàng / Thanh Toán / Đơn Hàng / Tài Khoản / Chi Tiết Món)
  syncNavCenterAndContextPill(window.location.href);

  // Khởi tạo viên thuốc trượt Apple cho Nav Links
  initNavPill();
  window.addEventListener("resize", () => {
    initNavPill();
  }, { passive: true });
  window.addEventListener("load", () => {
    initNavPill();
  }, { once: true });

  // Mobile drawer
  if (hamburgerBtn && navDrawer && !hamburgerBtn._hasDrawerEvents) {
    hamburgerBtn._hasDrawerEvents = true;
    hamburgerBtn.addEventListener("click", () => {
      if (window.innerWidth > 900) return;
      const isOpen = hamburgerBtn.classList.toggle("hamOpen");
      navDrawer.classList.toggle("drawerOpen", isOpen);
      document.body.style.overflow = isOpen ? "hidden" : "";
      hamburgerBtn.setAttribute("aria-expanded", isOpen);
    });

    navDrawer
      .querySelector(".navDrawerOverlay")
      ?.addEventListener("click", () => {
        hamburgerBtn.classList.remove("hamOpen");
        navDrawer.classList.remove("drawerOpen");
        document.body.style.overflow = "";
      });
  }
}

/* ────────────────────────────────────────────────────────────
   NAVBAR — Apple-Style Sliding Pill Indicator
   ──────────────────────────────────────────────────────────── */
function initNavPill() {
  const navMenu = document.querySelector(".navMenu");
  if (!navMenu) return;

  // Đảm bảo phần tử viên thuốc trượt (pill) tồn tại
  let pill = navMenu.querySelector(".navActivePill");
  if (!pill) {
    pill = document.createElement("div");
    pill.className = "navActivePill";
    pill.id = "navActivePill";
    pill.setAttribute("aria-hidden", "true");
    navMenu.prepend(pill);
  }

  const links = Array.from(navMenu.querySelectorAll(".navLink"));
  if (!links.length) return;

  function movePillTo(targetEl, immediate = false) {
    if (!targetEl || !pill) return;
    const menuRect = navMenu.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();

    if (targetRect.width === 0 || targetRect.height === 0) return;

    const left = targetRect.left - menuRect.left;
    const top = targetRect.top - menuRect.top;
    const width = targetRect.width;
    const height = targetRect.height;

    if (immediate) {
      pill.style.transition = "none";
    } else {
      pill.style.transition = "";
    }

    pill.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    pill.style.width = `${width}px`;
    pill.style.height = `${height}px`;
    pill.style.opacity = "1";

    if (immediate) {
      void pill.offsetHeight; // force reflow
      pill.style.transition = "";
    }
  }

  function getActiveLink() {
    return navMenu.querySelector(".navLink.navLinkActive");
  }

  // Định vị viên thuốc vào tab đang hoạt động
  const activeLink = getActiveLink();
  if (activeLink) {
    movePillTo(activeLink, true);
    requestAnimationFrame(() => movePillTo(activeLink, true));
    setTimeout(() => {
      const cur = getActiveLink();
      if (cur) movePillTo(cur, true);
    }, 120);
  } else {
    pill.style.opacity = "0";
  }

  // Gán sự kiện hover mượt mà (chỉ gán 1 lần)
  if (!navMenu._hasPillEvents) {
    navMenu._hasPillEvents = true;

    links.forEach((link) => {
      link.addEventListener("mouseenter", () => {
        const wasHidden = parseFloat(getComputedStyle(pill).opacity || "0") < 0.05;
        if (wasHidden) {
          // Đang ở trang phụ (pill đang ẩn): đặt sẵn vị trí ngay dưới tab mới rồi mới fade-in mượt
          const menuRect = navMenu.getBoundingClientRect();
          const targetRect = link.getBoundingClientRect();
          if (targetRect.width > 0 && targetRect.height > 0) {
            pill.style.transition = "none";
            pill.style.transform = `translate3d(${targetRect.left - menuRect.left}px, ${targetRect.top - menuRect.top}px, 0)`;
            pill.style.width = `${targetRect.width}px`;
            pill.style.height = `${targetRect.height}px`;
            void pill.offsetHeight;
            pill.style.transition = "";
            pill.style.opacity = "1";
          }
        } else {
          movePillTo(link, false);
        }
        links.forEach((l) => l.classList.remove("pillHovered"));
        link.classList.add("pillHovered");
      });
    });

    navMenu.addEventListener("mouseleave", () => {
      links.forEach((l) => l.classList.remove("pillHovered"));
      const curActive = getActiveLink();
      if (curActive) {
        movePillTo(curActive, false);
      } else {
        pill.style.opacity = "0";
      }
    });

    let resizeTimer = null;
    window.addEventListener(
      "resize",
      () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          const curActive = getActiveLink();
          if (curActive) movePillTo(curActive, true);
        }, 100);
      },
      { passive: true },
    );
  }

  navMenu._updatePill = movePillTo;
}

/* ────────────────────────────────────────────────────────────
   NAVBAR — Login / Avatar switch
   ──────────────────────────────────────────────────────────── */
/* ────────────────────────────────────────────────────────────
   APPLE ACCOUNT POPOVER MENU (Bấm Avatar trên Navbar)
   ──────────────────────────────────────────────────────────── */
const accountPopover = {
  el: null,
  isOpen: false,

  ensureEl() {
    if (this.el && this.el.isConnected) return this.el;
    let node = document.getElementById("iosAccountPopover");
    if (!node) {
      node = document.createElement("div");
      node.id = "iosAccountPopover";
      node.className = "iosAccountPopover";
      node.setAttribute("role", "menu");
      node.setAttribute("aria-label", "Menu tài khoản nhanh");
      document.body.appendChild(node);
    }
    this.el = node;
    if (!window._iosAccountPopoverEventsWired) {
      window._iosAccountPopoverEventsWired = true;
      document.addEventListener("click", (e) => {
        if (!this.isOpen) return;
        const target = e.target;
        if (!(target instanceof Element)) return;
        if (
          target.closest("#iosAccountPopover") ||
          target.closest("#navAvatarBtn")
        )
          return;
        this.close();
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.isOpen) this.close();
      });
      window.addEventListener("resize", () => {
        if (this.isOpen) this.position();
      });
    }
    return this.el;
  },

  position() {
    const btn = document.getElementById("navAvatarBtn");
    const pop = this.ensureEl();
    if (!btn || !pop) return;
    const rect = btn.getBoundingClientRect();
    const popW = Math.min(286, window.innerWidth - 24);
    const left = Math.max(
      12,
      Math.min(rect.right - popW, window.innerWidth - popW - 12),
    );
    const top = Math.min(rect.bottom + 10, window.innerHeight - 120);
    pop.style.width = `${popW}px`;
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  },

  async renderContent() {
    const pop = this.ensureEl();
    const user = customerService.getCurrentUser();
    if (!user) {
      this.close();
      return;
    }

    const prefix = window.location.pathname
      .replace(/\\/g, "/")
      .includes("/pages/")
      ? ""
      : "pages/";
    const fullName =
      `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
      user.username ||
      "Khách hàng Koffia";

    const orders =
      typeof orderHistoryService !== "undefined"
        ? orderHistoryService.getForCurrentViewer()
        : [];
    const activeOrdersCount = orders.filter((o) =>
      ["new", "preparing", "delivering"].includes(o.status),
    ).length;
    const wishCount =
      typeof wishlistService !== "undefined" ? wishlistService.count() : 0;
    const rewardSummary =
      typeof rewardsService !== "undefined"
        ? rewardsService.getSummary()
        : { balance: 0, tier: { badge: "Đồng" } };

    let voucherCount = 0;
    if (typeof voucherService !== "undefined") {
      try {
        const list = await voucherService.getPublicVouchers();
        voucherCount = list.length;
      } catch {}
    }

    const esc = escapeHtmlGlobal;
    pop.innerHTML = `
      <div class="iosPopHeader">
        <img class="iosPopAvatar" src="${esc(user.avatar || defaultAvatarDataUri)}" alt="" />
        <div class="iosPopIdentity">
          <div class="iosPopName">${esc(fullName)}</div>
          <div class="iosPopHandle">@${esc(user.username || "koffia")}</div>
          <span class="iosPopRewardPill">
            <i class="fa-solid fa-crown" aria-hidden="true"></i>
            ${rewardSummary.balance} điểm · ${esc(rewardSummary.tier?.badge || "Đồng")}
          </span>
        </div>
      </div>
      <div class="iosPopDivider"></div>
      <div class="iosPopList">
        <a href="${prefix}account.html?tab=profile" class="iosPopItem" role="menuitem">
          <span class="iosPopIcon isIndigo"><i class="fa-regular fa-circle-user" aria-hidden="true"></i></span>
          <span class="iosPopText">Tài khoản &amp; Cài đặt</span>
          <span class="iosPopBadge">Địa chỉ</span>
        </a>
        <a href="${prefix}orders.html" class="iosPopItem" role="menuitem">
          <span class="iosPopIcon isBlue"><i class="fa-solid fa-receipt" aria-hidden="true"></i></span>
          <span class="iosPopText">Đơn hàng của tôi</span>
          ${
            activeOrdersCount > 0
              ? `<span class="iosPopBadge isLive">${activeOrdersCount} đang giao</span>`
              : orders.length > 0
                ? `<span class="iosPopBadge">${orders.length}</span>`
                : ""
          }
        </a>
        <a href="${prefix}account.html?tab=rewards" class="iosPopItem" role="menuitem">
          <span class="iosPopIcon isAmber"><i class="fa-solid fa-crown" aria-hidden="true"></i></span>
          <span class="iosPopText">Tích điểm &amp; Voucher</span>
          <span class="iosPopBadge">${rewardSummary.balance} đ${voucherCount > 0 ? ` · ${voucherCount} mã` : ""}</span>
        </a>
        <a href="${prefix}account.html?tab=preferences" class="iosPopItem" role="menuitem">
          <span class="iosPopIcon isRed"><i class="fa-solid fa-heart" aria-hidden="true"></i></span>
          <span class="iosPopText">Gu uống &amp; Yêu thích</span>
          ${wishCount > 0 ? `<span class="iosPopBadge">${wishCount}</span>` : ""}
        </a>
        ${
          user.role === "dev"
            ? `<a href="${prefix}admin.html" class="iosPopItem" role="menuitem">
                 <span class="iosPopIcon isIndigo"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i></span>
                 <span class="iosPopText">Bảng Quản Trị Admin</span>
               </a>`
            : ""
        }
        ${
          user.role === "seller"
            ? `<a href="${prefix}seller.html" class="iosPopItem" role="menuitem">
                 <span class="iosPopIcon isOrange"><i class="fa-solid fa-store" aria-hidden="true"></i></span>
                 <span class="iosPopText">Kênh Người Bán</span>
               </a>`
            : ""
        }
      </div>
      <div class="iosPopDivider"></div>
      <button type="button" class="iosPopItem iosPopLogout" id="iosPopLogoutBtn" role="menuitem">
        <span class="iosPopIcon isDanger"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i></span>
        <span class="iosPopText">Đăng xuất</span>
      </button>
    `;

    pop.querySelectorAll("a.iosPopItem").forEach((a) => {
      a.addEventListener("click", () => this.close());
    });

    pop.querySelector("#iosPopLogoutBtn")?.addEventListener("click", () => {
      this.close();
      customerService.logout();
      showToast("Đã đăng xuất. Hẹn gặp lại bạn!");
      setTimeout(() => {
        window.location.href = `${projectRootPrefix}index.html`;
      }, 600);
    });
  },

  async open() {
    const pop = this.ensureEl();
    await this.renderContent();
    this.position();
    pop.classList.add("isOpen");
    this.isOpen = true;
    document.getElementById("navAvatarBtn")?.setAttribute("aria-expanded", "true");
  },

  close() {
    this.el?.classList.remove("isOpen");
    this.isOpen = false;
    document.getElementById("navAvatarBtn")?.setAttribute("aria-expanded", "false");
  },

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  },
};

function syncMobileDrawerAccountLinks(currentUser) {
  const drawerPanel = document.querySelector(".navDrawerPanel");
  if (!drawerPanel) return;

  let section = document.getElementById("drawerAccountSection");
  if (!section) {
    section = document.createElement("div");
    section.id = "drawerAccountSection";
    section.className = "drawerAccountSection";
    drawerPanel.appendChild(section);
  }

  const prefix = window.location.pathname
    .replace(/\\/g, "/")
    .includes("/pages/")
    ? ""
    : "pages/";

  if (currentUser) {
    const rewardPts =
      typeof rewardsService !== "undefined"
        ? rewardsService.getSummary().balance
        : 0;
    section.innerHTML = `
      <div class="drawerDivider" aria-hidden="true"></div>
      <div class="drawerSectionTitle">Tài khoản của bạn</div>
      <a href="${prefix}account.html?tab=profile" class="drawerNavLink"><i class="fa-regular fa-circle-user fa-fw"></i> Tài khoản &amp; Cài đặt</a>
      <a href="${prefix}orders.html" class="drawerNavLink"><i class="fa-solid fa-receipt fa-fw"></i> Đơn hàng của tôi</a>
      <a href="${prefix}account.html?tab=rewards" class="drawerNavLink"><i class="fa-solid fa-crown fa-fw"></i> Tích điểm &amp; Voucher (${rewardPts} đ)</a>
      <a href="${prefix}account.html?tab=preferences" class="drawerNavLink"><i class="fa-solid fa-heart fa-fw"></i> Gu uống &amp; Yêu thích</a>
      <button type="button" id="drawerLogoutBtn" class="drawerNavLink drawerLogoutBtn">
        <i class="fa-solid fa-right-from-bracket fa-fw"></i> Đăng xuất
      </button>
    `;
    section.querySelector("#drawerLogoutBtn")?.addEventListener("click", () => {
      customerService.logout();
      showToast("Đã đăng xuất. Hẹn gặp lại bạn!");
      setTimeout(() => {
        window.location.href = `${projectRootPrefix}index.html`;
      }, 600);
    });
  } else {
    section.innerHTML = `
      <div class="drawerDivider" aria-hidden="true"></div>
      <a href="${prefix}auth.html" class="drawerNavLink drawerLoginLink"><i class="fa-solid fa-right-to-bracket fa-fw"></i> Đăng nhập / Đăng ký</a>
    `;
  }
}

function initAuthNav() {
  const loginBtn = document.getElementById("navLoginBtn");
  const avatarBtn = document.getElementById("navAvatarBtn");
  const avatarImg = document.getElementById("navAvatarImg");

  if (!loginBtn && !avatarBtn) return;

  const currentUser = customerService.getCurrentUser();
  const cartOpenBtn = document.getElementById("cartOpenBtn");
  if (cartOpenBtn) {
    cartOpenBtn.hidden = !currentUser;
    cartOpenBtn.style.display = currentUser ? "" : "none";
  }

  if (currentUser) {
    if (loginBtn) loginBtn.style.display = "none";
    if (avatarBtn) {
      avatarBtn.style.display = "flex";
      let avatarLabel = avatarBtn.querySelector(".navActionLabel");
      if (!avatarLabel) {
        avatarLabel = document.createElement("span");
        avatarLabel.className = "navActionLabel";
        avatarBtn.appendChild(avatarLabel);
      }
      avatarLabel.textContent = currentUser.firstName || currentUser.username || "Tài khoản";
      avatarBtn.setAttribute(
        "aria-label",
        `Menu tài khoản của ${currentUser.firstName || currentUser.username || currentUser.email || "bạn"}`,
      );
      avatarBtn.setAttribute("aria-haspopup", "menu");
      avatarBtn.setAttribute("aria-expanded", accountPopover.isOpen ? "true" : "false");
      avatarBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        accountPopover.toggle();
      };
    }
    if (avatarImg) {
      avatarImg.src = currentUser.avatar || defaultAvatarDataUri;
      avatarImg.alt = `Avatar của ${currentUser.firstName || "khách hàng"}`;
    }

    // Role-specific badges in navActions
    const navActions = document.querySelector(".navActions");
    if (navActions) {
      let devBtn = document.getElementById("navDevAdminBtn");
      if (currentUser.role === "dev") {
        if (!devBtn) {
          devBtn = document.createElement("a");
          devBtn.id = "navDevAdminBtn";
          devBtn.className = "navRoleBadge navDevBadge";
          devBtn.href = isInsidePagesFolder ? "admin.html" : "pages/admin.html";
          devBtn.innerHTML =
            '<i class="fa-solid fa-shield-halved" aria-hidden="true"></i><span class="navActionLabel">Quản trị</span>';
          navActions.insertBefore(devBtn, avatarBtn || cartOpenBtn);
        }
        devBtn.style.display = "inline-flex";
      } else if (devBtn) {
        devBtn.style.display = "none";
      }

      let sellerBtn = document.getElementById("navSellerPortalBtn");
      if (currentUser.role === "seller") {
        if (!sellerBtn) {
          sellerBtn = document.createElement("a");
          sellerBtn.id = "navSellerPortalBtn";
          sellerBtn.className = "navRoleBadge navSellerBadge";
          sellerBtn.href = isInsidePagesFolder
            ? "seller.html"
            : "pages/seller.html";
          sellerBtn.innerHTML =
            '<i class="fa-solid fa-store" aria-hidden="true"></i><span class="navActionLabel">Kênh Bán</span>';
          navActions.insertBefore(sellerBtn, avatarBtn || cartOpenBtn);
        }
        sellerBtn.style.display = "inline-flex";
      } else if (sellerBtn) {
        sellerBtn.style.display = "none";
      }
    }

    // Drawer role links
    const drawerPanel = document.querySelector(".navDrawerPanel");
    if (drawerPanel) {
      if (currentUser.role === "dev" && !document.getElementById("drawerAdminLink")) {
        const adminA = document.createElement("a");
        adminA.id = "drawerAdminLink";
        adminA.className = "drawerNavLink drawerRoleLink";
        adminA.href = isInsidePagesFolder ? "admin.html" : "pages/admin.html";
        adminA.innerHTML = '<i class="fa-solid fa-shield-halved fa-fw"></i> Bảng Quản Trị';
        drawerPanel.appendChild(adminA);
      }
      if (currentUser.role === "seller" && !document.getElementById("drawerSellerLink")) {
        const sellerA = document.createElement("a");
        sellerA.id = "drawerSellerLink";
        sellerA.className = "drawerNavLink drawerRoleLink";
        sellerA.href = isInsidePagesFolder ? "seller.html" : "pages/seller.html";
        sellerA.innerHTML = '<i class="fa-solid fa-store fa-fw"></i> Kênh Người Bán';
        drawerPanel.appendChild(sellerA);
      }
    }
  } else {
    accountPopover.close();
    if (avatarBtn) avatarBtn.style.display = "none";
    if (loginBtn) loginBtn.style.display = "";
    document.getElementById("navDevAdminBtn")?.remove();
    document.getElementById("navSellerPortalBtn")?.remove();
    document.getElementById("drawerAdminLink")?.remove();
    document.getElementById("drawerSellerLink")?.remove();
  }

  syncMobileDrawerAccountLinks(currentUser);
}

/* ────────────────────────────────────────────────────────────
   SCROLL REVEAL ANIMATIONS
   ──────────────────────────────────────────────────────────── */
function initScrollReveal(root = document) {
  const elements = (root || document).querySelectorAll(
    ".revealUp:not(.revealed), .revealLeft:not(.revealed), .revealRight:not(.revealed)",
  );
  if (!elements.length) return;

  if (typeof IntersectionObserver === "undefined") {
    elements.forEach((el) => el.classList.add("revealed"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const siblings = entry.target.parentElement?.querySelectorAll(
            ".revealUp, .revealLeft, .revealRight",
          );
          let delay = 0;
          if (siblings) {
            const arr = Array.from(siblings);
            const pos = arr.indexOf(entry.target);
            delay = Math.min(pos * 60, 300);
          }
          setTimeout(() => entry.target.classList.add("revealed"), delay);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.05, rootMargin: "0px 0px 50px 0px" },
  );

  elements.forEach((el) => {
    // Nếu phần tử đã nằm trong viewport thì hiển thị ngay lập tức
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      el.classList.add("revealed");
    } else {
      observer.observe(el);
    }
  });
}

/* ────────────────────────────────────────────────────────────
   "ADD TO CART" BUTTONS
   ──────────────────────────────────────────────────────────── */
function initAddToCartButtons() {
  document.querySelectorAll("[data-add-to-cart]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const productData = {
        id: btn.dataset.productId,
        productId: btn.dataset.productId,
        category: btn.dataset.productCategory || "",
        sellerId: btn.dataset.productSeller || "",
        name: btn.dataset.productName,
        price: parseFloat(btn.dataset.productPrice),
        img: btn.dataset.productImg,
      };
      const added = cartState.addItem(productData);
      if (!added) return;

      // Button micro-animation
      btn.classList.add("addedAnim");
      setTimeout(() => btn.classList.remove("addedAnim"), 600);
    });
  });
}

/* ────────────────────────────────────────────────────────────
   WISHLIST SERVICE & BUTTONS (lưu persistent qua localStorage)
   ──────────────────────────────────────────────────────────── */
const WISHLIST_STORAGE_KEY = "koffiaWishlistV1";

const wishlistService = {
  getIds() {
    try {
      const raw = JSON.parse(localStorage.getItem(WISHLIST_STORAGE_KEY) || "[]");
      return Array.isArray(raw) ? raw.map(String) : [];
    } catch {
      return [];
    }
  },
  saveIds(ids) {
    try {
      const unique = Array.from(new Set((ids || []).filter(Boolean).map(String)));
      localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(unique));
    } catch {}
  },
  has(productId) {
    if (!productId) return false;
    return this.getIds().includes(String(productId));
  },
  count() {
    return this.getIds().length;
  },
  toggle(productId) {
    if (!productId) return false;
    const id = String(productId);
    const ids = this.getIds();
    const exists = ids.includes(id);
    const next = exists ? ids.filter((x) => x !== id) : [...ids, id];
    this.saveIds(next);
    const wishlisted = !exists;
    window.dispatchEvent(
      new CustomEvent("koffia:wishlist-changed", {
        detail: { productId: id, wishlisted, count: next.length },
      }),
    );
    return wishlisted;
  },
};

function getWishlistHeartSvg(wishlisted) {
  if (wishlisted) {
    return '<svg class="koffiaHeartSvg isFilled" viewBox="0 0 24 24" width="17" height="17" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.4l-1.35-1.23C5.4 14.36 2 11.28 2 7.5 2 4.42 4.42 2 7.5 2c1.74 0 3.41.81 4.5 2.09C13.09 2.81 14.76 2 16.5 2 19.58 2 22 4.42 22 7.5c0 3.78-3.4 6.86-8.65 11.68L12 20.4z"/></svg>';
  }
  return '<svg class="koffiaHeartSvg" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.4l-1.35-1.23C5.4 14.36 2 11.28 2 7.5 2 4.42 4.42 2 7.5 2c1.74 0 3.41.81 4.5 2.09C13.09 2.81 14.76 2 16.5 2 19.58 2 22 4.42 22 7.5c0 3.78-3.4 6.86-8.65 11.68L12 20.4z"/></svg>';
}

function syncWishlistButtonVisual(btn, wishlisted, animate = false) {
  if (!btn) return;
  const active = Boolean(wishlisted);
  btn.classList.toggle("wishlisted", active);
  btn.setAttribute("aria-pressed", active ? "true" : "false");
  btn.setAttribute(
    "aria-label",
    active ? "Bỏ khỏi yêu thích" : "Thêm vào yêu thích",
  );
  // Cập nhật trực tiếp bằng SVG inline (0ms, không bị Font Awesome SVG kit nuốt mất thẻ <i>)
  btn.innerHTML = getWishlistHeartSvg(active);

  if (animate) {
    btn.classList.remove("heartPop");
    void btn.offsetWidth;
    btn.classList.add("heartPop");
    clearTimeout(btn._heartPopTimer);
    btn._heartPopTimer = setTimeout(() => {
      btn.classList.remove("heartPop");
    }, 420);
  }
}

function initWishlistButtons() {
  document.querySelectorAll("[data-wishlist-btn]").forEach((btn) => {
    const productId =
      btn.dataset.productId ||
      btn.closest("[data-product-id]")?.dataset.productId ||
      new URLSearchParams(window.location.search).get("id") ||
      "";
    if (productId && !btn.dataset.productId) {
      btn.dataset.productId = productId;
    }

    if (productId) {
      syncWishlistButtonVisual(btn, wishlistService.has(productId), false);
    } else {
      syncWishlistButtonVisual(btn, btn.classList.contains("wishlisted"), false);
    }

    if (btn.dataset.wishlistWired === "1") return;
    btn.dataset.wishlistWired = "1";

    // Ngăn card nhận pointerdown/mousedown giúp bấm tim nhạy tức thì
    btn.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
    });
    btn.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const id =
        btn.dataset.productId ||
        btn.closest("[data-product-id]")?.dataset.productId ||
        new URLSearchParams(window.location.search).get("id") ||
        "";

      if (id) {
        const added = wishlistService.toggle(id);
        document.querySelectorAll("[data-wishlist-btn]").forEach((peer) => {
          const peerId =
            peer.dataset.productId ||
            peer.closest("[data-product-id]")?.dataset.productId ||
            "";
          if (peerId === id) syncWishlistButtonVisual(peer, added, peer === btn);
        });
        showToast(
          added ? "Đã thêm vào danh sách yêu thích" : "Đã bỏ khỏi yêu thích",
          "success",
          2000,
        );
      } else {
        const nextState = !btn.classList.contains("wishlisted");
        syncWishlistButtonVisual(btn, nextState, true);
      }
    });
  });
}

/* ────────────────────────────────────────────────────────────
   MENU PAGE — Category Filter
   ──────────────────────────────────────────────────────────── */
function initCategoryFilter() {
  const filterBtns = document.querySelectorAll(".filterBtn");
  const menuCards = document.querySelectorAll(".menuCard");
  const resultsCount = document.getElementById("resultsCount");
  const emptyState = document.querySelector(".menuEmptyState");

  if (!filterBtns.length) return;

  function updateResults(category) {
    let visibleCount = 0;
    menuCards.forEach((card) => {
      const matches = category === "all" || card.dataset.category === category;
      card.style.display = matches ? "" : "none";
      if (matches) {
        visibleCount++;
        card.style.animation = "none";
        card.offsetHeight; // reflow
        card.style.animation = "";
      }
    });

    if (resultsCount) resultsCount.textContent = visibleCount;
    if (emptyState) emptyState.classList.toggle("visible", visibleCount === 0);
  }

  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterBtns.forEach((b) => b.classList.remove("filterActive"));
      btn.classList.add("filterActive");
      updateResults(btn.dataset.category);
    });
  });

  updateResults("all"); // initial count
}

/* ────────────────────────────────────────────────────────────
   MENU PAGE — Sort
   ──────────────────────────────────────────────────────────── */
function initMenuSort() {
  const sortSelect = document.getElementById("menuSortSelect");
  const menuGrid = document.getElementById("menuGrid");

  if (!sortSelect || !menuGrid) return;

  sortSelect.addEventListener("change", () => {
    const cards = Array.from(
      menuGrid.querySelectorAll('.menuCard:not([style*="display: none"])'),
    );
    cards.sort((a, b) => {
      const priceA = parseFloat(a.dataset.price);
      const priceB = parseFloat(b.dataset.price);
      if (sortSelect.value === "priceAsc") return priceA - priceB;
      if (sortSelect.value === "priceDesc") return priceB - priceA;
      return 0; // default
    });
    cards.forEach((card) => menuGrid.appendChild(card));
  });
}

/* ────────────────────────────────────────────────────────────
   CONTACT FORM
   ──────────────────────────────────────────────────────────── */
function initContactForm() {
  const form = document.getElementById("contactForm");
  const successMsg = document.getElementById("formSuccessMsg");
  const submitBtn = document.getElementById("formSubmitBtn");

  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    submitBtn.classList.add("submitting");
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi...`;

    // Simulate async submission
    setTimeout(() => {
      form.style.display = "none";
      successMsg?.classList.add("visible");
    }, 1800);
  });
}

/* ────────────────────────────────────────────────────────────
   NEWSLETTER FORM
   ──────────────────────────────────────────────────────────── */
function initNewsletter() {
  const form = document.getElementById("newsletterForm");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = form.querySelector(".newsletterInput");
    if (input?.value) {
      showToast("Đăng ký nhận tin thành công!");
      input.value = "";
    }
  });
}

/* ────────────────────────────────────────────────────────────
   UTILS
   ──────────────────────────────────────────────────────────── */
function formatPrice(amount) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(amount);
}

/* ────────────────────────────────────────────────────────────
   APPLE THEME MANAGER (Dark / Light Mode)
   ──────────────────────────────────────────────────────────── */
const themeManager = {
  THEME_KEY: "koffiaTheme",

  getThemeIconSvg(isDark) {
    // Khi đang Dark Mode → hiển thị Mặt trời (chuyển sang Sáng); khi Light Mode → hiển thị Mặt trăng (chuyển sang Tối)
    if (isDark) {
      return '<svg class="themeSvgIcon isSun" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none"/><line x1="12" y1="2.4" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="21.6"/><line x1="4.9" y1="4.9" x2="6.8" y2="6.8"/><line x1="17.2" y1="17.2" x2="19.1" y2="19.1"/><line x1="2.4" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="21.6" y2="12"/><line x1="4.9" y1="19.1" x2="6.8" y2="17.2"/><line x1="17.2" y1="6.8" x2="19.1" y2="4.9"/></svg>';
    }
    return '<svg class="themeSvgIcon isMoon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>';
  },

  getSavedTheme() {
    return localStorage.getItem(this.THEME_KEY);
  },

  getCurrentTheme() {
    // Default is ALWAYS Light Mode unless explicitly switched by user
    return this.getSavedTheme() === "dark" ? "dark" : "light";
  },

  syncToggleIcons(isDark) {
    const iconSvg = this.getThemeIconSvg(isDark);
    const labelText = isDark
      ? "Chuyển sang giao diện Sáng"
      : "Chuyển sang giao diện Tối";
    const titleText = isDark ? "Giao diện Sáng" : "Giao diện Tối";

    document
      .querySelectorAll(
        ".themeToggleBtn, #themeToggleBtn, #navThemeToggleBtn, #drawerThemeToggleBtn",
      )
      .forEach((btn) => {
        btn.dataset.themeState = isDark ? "dark" : "light";
        btn.setAttribute("aria-label", labelText);
        btn.setAttribute("title", titleText);

        if (btn.id === "drawerThemeToggleBtn" || btn.classList.contains("drawerThemeToggle")) {
          const labelWrap = btn.querySelector(".drawerThemeLabel");
          if (labelWrap) {
            let iconHolder = labelWrap.querySelector(".drawerThemeIcon");
            if (!iconHolder) {
              const oldIcon = labelWrap.querySelector("i, svg");
              iconHolder = document.createElement("span");
              iconHolder.className = "drawerThemeIcon";
              iconHolder.setAttribute("aria-hidden", "true");
              if (oldIcon) oldIcon.replaceWith(iconHolder);
              else labelWrap.prepend(iconHolder);
            }
            iconHolder.innerHTML = iconSvg;
          }
          const drawerText = btn.querySelector(".drawerThemeText");
          if (drawerText) {
            drawerText.textContent = isDark ? "Chế độ Ban ngày" : "Chế độ Ban đêm";
          }
        } else {
          // Nút icon tròn trên Navbar / Admin / Seller: thay thẳng bằng SVG inline (tránh bị Font Awesome Kit khóa icon)
          btn.innerHTML = `<span class="themeIconWrap" aria-hidden="true">${iconSvg}</span>`;
        }
      });
  },

  applyTheme(theme, notify = false) {
    const isDark = theme === "dark";
    document.documentElement.classList.toggle("darkMode", isDark);
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    if (document.body) {
      document.body.classList.toggle("darkMode", isDark);
    }
    localStorage.setItem(this.THEME_KEY, isDark ? "dark" : "light");

    // Sync theme radio buttons in Settings (account.html)
    document
      .querySelectorAll('input[name="appThemeOption"]')
      .forEach((input) => {
        input.checked = input.value === (isDark ? "dark" : "light");
      });

    this.syncToggleIcons(isDark);

    if (notify && typeof showToast === "function") {
      showToast(
        isDark
          ? "Đã chuyển sang Giao diện Ban đêm"
          : "Đã chuyển sang Giao diện Ban ngày",
      );
    }
  },

  toggle(notify = true) {
    const current = this.getCurrentTheme();
    const next = current === "dark" ? "light" : "dark";

    const buttons = document.querySelectorAll(
      ".themeToggleBtn, #themeToggleBtn, #navThemeToggleBtn",
    );
    buttons.forEach((b) => {
      b.classList.remove("toggling");
      void b.offsetWidth;
      b.classList.add("toggling");
    });
    setTimeout(() => {
      buttons.forEach((b) => b.classList.remove("toggling"));
    }, 450);

    this.applyTheme(next, notify);
  },

  init() {
    const current = this.getCurrentTheme();
    this.applyTheme(current, false);

    // Bind any buttons
    document
      .querySelectorAll(
        ".themeToggleBtn, #themeToggleBtn, #navThemeToggleBtn, #drawerThemeToggleBtn",
      )
      .forEach((btn) => {
        btn.onclick = (e) => {
          e.preventDefault();
          this.toggle(true);
        };
      });

    // Bind theme radio inputs in Settings (account.html)
    document
      .querySelectorAll('input[name="appThemeOption"]')
      .forEach((input) => {
        input.onchange = (e) => {
          this.applyTheme(e.target.value, true);
        };
      });

    // Cross-tab sync
    if (!window._koffiaThemeStorageBound) {
      window._koffiaThemeStorageBound = true;
      window.addEventListener("storage", (e) => {
        if (e.key === this.THEME_KEY && e.newValue) {
          this.applyTheme(e.newValue, false);
        }
      });
    }
  },
};

// Immediate sync on parse
try {
  themeManager.applyTheme(themeManager.getCurrentTheme(), false);
} catch {}

/* ────────────────────────────────────────────────────────────
   SEAMLESS SPA ROUTER — Chuyển trang mượt mà không tải lại (Zero FOUT)
   ──────────────────────────────────────────────────────────── */
const koffiaRouter = {
  cache: new Map(),
  isNavigating: false,

  resolveInternalUrl(href, fromUrl = window.location.href) {
    const from = new URL(fromUrl);
    const pathname = from.pathname.replace(/\\/g, "/");

    // Xác định thư mục gốc của project (vd: "/Koffia/" hoặc "/")
    let basePath = "";
    if (pathname.includes("/pages/")) {
      basePath = pathname.substring(0, pathname.indexOf("/pages/") + 1);
    } else {
      basePath = pathname.substring(0, pathname.lastIndexOf("/") + 1);
    }

    const cleanHref = href.split("?")[0].split("#")[0];
    const filename = cleanHref.split("/").pop();

    const urlObj = new URL(href, fromUrl);
    const searchAndHash = urlObj.search + urlObj.hash;

    const pageFiles = [
      "menu.html",
      "aboutUs.html",
      "contact.html",
      "cart.html",
      "checkout.html",
      "auth.html",
      "orders.html",
      "product.html",
      "account.html",
      "home.html",
    ];

    if (filename === "index.html" || filename === "") {
      return from.origin + basePath + "index.html" + searchAndHash;
    } else if (pageFiles.includes(filename)) {
      return from.origin + basePath + "pages/" + filename + searchAndHash;
    }

    return urlObj.href;
  },

  syncNavHrefs() {
    const isPages = window.location.pathname
      .replace(/\\/g, "/")
      .includes("/pages/");
    const prefix = isPages ? "" : "pages/";
    const homeHref = isPages ? "../index.html" : "index.html";

    const logo = document.querySelector(".navLogo, .navLogoLight");
    if (logo) logo.href = homeHref;

    const mapping = {
      "trang chủ": homeHref,
      "thực đơn": `${prefix}menu.html`,
      "giới thiệu": `${prefix}aboutUs.html`,
      "liên hệ": `${prefix}contact.html`,
    };

    document.querySelectorAll(".navLink, .drawerNavLink").forEach((link) => {
      const text = link.textContent.trim().toLowerCase();
      if (mapping[text]) {
        link.href = mapping[text];
      }
    });

    const loginBtn = document.getElementById("navLoginBtn");
    if (loginBtn) loginBtn.href = `${prefix}auth.html`;
  },

  isStandalonePage(pathname = window.location.pathname) {
    const p = String(pathname || "").replace(/\\/g, "/").toLowerCase();
    return (
      p.includes("admin.html") ||
      p.includes("seller.html") ||
      p.includes("auth.html")
    );
  },

  init() {
    // Không kích hoạt SPA router trên các trang layout độc lập không dùng khung <main id="mainContent">
    if (
      this.isStandalonePage(window.location.pathname) ||
      (!document.getElementById("mainContent") && !document.querySelector("main"))
    ) {
      return;
    }

    // Bắt sự kiện click vào các liên kết nội bộ
    document.addEventListener("click", (e) => {
      if (!(e.target instanceof Element)) return;
      const link = e.target.closest("a");
      if (!link) return;
      if (link.hasAttribute("download") || link.target === "_blank") return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.defaultPrevented) return;

      const href = link.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("javascript:") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      )
        return;

      const resolvedUrl = this.resolveInternalUrl(href, window.location.href);
      const targetUrl = new URL(resolvedUrl);
      if (targetUrl.origin !== window.location.origin) return;

      // Không can thiệp trang đăng nhập, quản trị hoặc kênh người bán (cần layout/phiên độc lập)
      if (this.isStandalonePage(targetUrl.pathname)) return;

      e.preventDefault();

      if (targetUrl.href === window.location.href) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      this.navigate(targetUrl.href, true);
    });

    // Prefetch trước khi click khi hover chuột hoặc chạm nhẹ màn hình
    document.addEventListener(
      "pointerenter",
      (e) => {
        if (!(e.target instanceof Element)) return;
        const link = e.target.closest("a");
        if (!link) return;
        const href = link.getAttribute("href");
        if (!href || href.startsWith("#") || href.startsWith("javascript:"))
          return;
        const resolvedUrl = this.resolveInternalUrl(href, window.location.href);
        const targetUrl = new URL(resolvedUrl);
        if (
          targetUrl.origin === window.location.origin &&
          !this.isStandalonePage(targetUrl.pathname)
        ) {
          this.prefetch(targetUrl.href);
        }
      },
      { capture: true, passive: true },
    );

    // Hỗ trợ nút Back / Forward trên trình duyệt
    window.addEventListener("popstate", () => {
      if (this.isStandalonePage(window.location.pathname)) {
        window.location.reload();
        return;
      }
      this.navigate(window.location.href, false);
    });

    // Nạp trước dữ liệu các tab chính trong lúc rảnh (idle)
    const prefetchTabs = () => {
      document
        .querySelectorAll(".navLink")
        .forEach((l) => this.prefetch(l.href));
    };
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(prefetchTabs);
    } else {
      setTimeout(prefetchTabs, 1200);
    }
  },

  async prefetch(url) {
    const resolvedUrl = this.resolveInternalUrl(url);
    const cleanUrl = resolvedUrl.split("#")[0];
    if (this.cache.has(cleanUrl)) return;
    try {
      const res = await fetch(cleanUrl, { cache: "no-cache" });
      if (res.ok) {
        const text = await res.text();
        this.cache.set(cleanUrl, text);
      }
    } catch {}
  },

  async navigate(url, pushState = true) {
    accountPopover.close();
    if (typeof navRecentManager !== "undefined") {
      navRecentManager.closeMorePopover();
    }
    if (typeof cartUI !== "undefined" && typeof cartUI.close === "function") {
      cartUI.close();
    }
    // Nếu đích đến là trang layout độc lập (auth/admin/seller), chuyển trang gốc
    url = this.resolveInternalUrl(url);
    try {
      const destObj = new URL(url, window.location.href);
      if (this.isStandalonePage(destObj.pathname)) {
        window.location.href = url;
        return;
      }
      // Chuyển tức thì 0ms giữa các tab bên trong account.html mà không cần nạp lại <main>
      const curObj = new URL(window.location.href);
      if (
        destObj.pathname === curObj.pathname &&
        destObj.pathname.toLowerCase().endsWith("account.html") &&
        typeof switchAccountTab === "function"
      ) {
        if (pushState) {
          window.history.pushState({ url: destObj.href }, "", destObj.href);
        }
        const tabParam = destObj.searchParams.get("tab") || "profile";
        switchAccountTab(tabParam, false);
        this.updateNavState(destObj.href);
        return;
      }
    } catch {}

    if (this.isNavigating) return;
    this.isNavigating = true;

    let cleanUrl = url.split("#")[0];

    // Trượt ngay viên thuốc trên navbar tới tab được click
    this.updateNavState(cleanUrl);

    // Đóng drawer trên thiết bị di động nếu đang mở
    const hamburgerBtn = document.getElementById("navHamburger");
    const navDrawer = document.getElementById("navDrawer");
    if (
      hamburgerBtn &&
      navDrawer &&
      hamburgerBtn.classList.contains("hamOpen")
    ) {
      hamburgerBtn.classList.remove("hamOpen");
      navDrawer.classList.remove("drawerOpen");
      document.body.style.overflow = "";
      hamburgerBtn.setAttribute("aria-expanded", "false");
    }

    try {
      let htmlText = this.cache.get(cleanUrl);
      if (!htmlText) {
        let res = await fetch(cleanUrl);
        if (!res.ok) {
          // Thử lại nếu đường dẫn thiếu /pages/
          const retry = this.resolveInternalUrl(cleanUrl);
          if (retry !== cleanUrl) {
            res = await fetch(retry);
            if (res.ok) {
              cleanUrl = retry;
              url = retry;
            }
          }
        }
        if (!res.ok) {
          window.location.href = url;
          return;
        }
        htmlText = await res.text();
        this.cache.set(cleanUrl, htmlText);
      }

      if (pushState) {
        window.history.pushState({ url }, "", url);
      }

      // Cập nhật lại biến đường dẫn tương đối sau khi đổi URL
      isInsidePagesFolder = window.location.pathname
        .replace(/\\/g, "/")
        .includes("/pages/");
      projectRootPrefix = isInsidePagesFolder ? "../" : "";

      // Sử dụng View Transition API gốc nếu trình duyệt hỗ trợ
      if (document.startViewTransition) {
        await document.startViewTransition(() =>
          this.applyNewPage(htmlText, cleanUrl),
        ).finished;
      } else {
        const main =
          document.getElementById("mainContent") ||
          document.querySelector("main");
        if (main) {
          main.classList.add("mainTransitioning");
          await new Promise((r) => setTimeout(r, 120));
        }
        this.applyNewPage(htmlText, cleanUrl);
        if (main) {
          main.classList.remove("mainTransitioning");
        }
      }
    } catch (err) {
      console.warn("Lỗi chuyển trang mượt:", err);
      window.location.href = url;
    } finally {
      this.isNavigating = false;
    }
  },

  updateNavState(targetUrl) {
    const targetPath = new URL(targetUrl, window.location.href).pathname.replace(
      /\\/g,
      "/",
    );
    const navMenu = document.querySelector(".navMenu");
    let targetLink = null;

    document.querySelectorAll(".navLink, .drawerNavLink").forEach((link) => {
      const linkPath = new URL(link.href, window.location.href).pathname.replace(
        /\\/g,
        "/",
      );
      const isMatch =
        linkPath === targetPath ||
        (targetPath.endsWith("/") && linkPath.endsWith("index.html")) ||
        (targetPath.endsWith("index.html") &&
          linkPath.endsWith("index.html")) ||
        (targetPath === "/" && linkPath.endsWith("index.html"));

      link.classList.toggle("navLinkActive", isMatch);
      if (isMatch && link.classList.contains("navLink")) {
        targetLink = link;
      }
    });

    syncNavCenterAndContextPill(targetUrl);
    syncSpotlightVisibility(targetUrl);

    if (navMenu && navMenu._updatePill) {
      if (targetLink) {
        navMenu._updatePill(targetLink, false);
      } else {
        const pill = navMenu.querySelector(".navActivePill");
        if (pill) pill.style.opacity = "0";
      }
    }
  },

  applyNewPage(htmlText, cleanUrl) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, "text/html");

    // 1. Cập nhật tiêu đề trang
    if (doc.title) {
      document.title = doc.title;
    }

    // 2. Hoán đổi phần nội dung chính <main id="mainContent">
    const currentMain =
      document.getElementById("mainContent") || document.querySelector("main");
    const newMain =
      doc.getElementById("mainContent") || doc.querySelector("main");

    if (currentMain && newMain) {
      currentMain.replaceWith(newMain);
    } else {
      window.location.href = cleanUrl;
      return;
    }

    // 3. Nạp stylesheet riêng của trang đích nếu chưa có
    const currentHeadLinks = Array.from(
      document.querySelectorAll('link[rel="stylesheet"]'),
    );
    const currentHrefSet = new Set(
      currentHeadLinks.map(
        (l) => new URL(l.href, window.location.href).pathname,
      ),
    );

    const iosThemeLink = document.querySelector(
      'link[rel="stylesheet"][href*="iosTheme.css"]',
    );

    doc.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
      const resolvedUrl = new URL(link.getAttribute("href"), cleanUrl);
      const path = resolvedUrl.pathname;
      if (!currentHrefSet.has(path)) {
        const newLink = document.createElement("link");
        newLink.rel = "stylesheet";
        newLink.href = resolvedUrl.href;
        if (
          iosThemeLink &&
          iosThemeLink.parentNode === document.head &&
          !path.endsWith("iosTheme.css")
        ) {
          document.head.insertBefore(newLink, iosThemeLink);
        } else {
          document.head.appendChild(newLink);
        }
      }
    });

    // 4. Đồng bộ giao diện thanh điều hướng Navbar & thanh filter thực đơn
    const navBar = document.getElementById("navBar");
    if (navBar) {
      navBar.classList.remove("navDark");
      navBar.classList.remove("navMenuMerged");
      navBar.classList.toggle("navScrolled", window.scrollY > 20);

      // Tránh bê nguyên filter shelf từ tab Thực Đơn sang các tab khác (Trang chủ, Giới thiệu, Liên hệ...)
      const currentShelf = navBar.querySelector("#navCategoryShelf");
      const targetShelf = doc.querySelector("#navCategoryShelf");

      if (targetShelf) {
        if (!currentShelf) {
          navBar.appendChild(targetShelf.cloneNode(true));
        }
      } else {
        if (currentShelf) {
          currentShelf.remove();
        }
        if (window._menuMergedNavHandler) {
          window.removeEventListener("scroll", window._menuMergedNavHandler);
          window._menuMergedNavHandler = null;
        }
        navBar.classList.remove("navMenuMerged");
      }
    }

    // 5. Cuộn mượt lên đầu trang ngay lập tức
    window.scrollTo({ top: 0, behavior: "instant" });

    // 6. Cập nhật lại các liên kết href trên Navbar cho khớp với thư mục hiện tại
    this.syncNavHrefs();

    // 7. Cập nhật lại vị trí viên thuốc trượt
    this.updateNavState(cleanUrl);

    // 8. Khởi tạo lại các script tương tác trên trang mới
    this.reinitPageScripts(cleanUrl, doc);
  },

  async reinitPageScripts(url, doc) {
    const path = new URL(url, window.location.href).pathname.replace(
      /\\/g,
      "/",
    );

    // Khởi tạo các tiện ích chung
    if (typeof initScrollReveal === "function") initScrollReveal();
    if (typeof initIosLargeTitle === "function") initIosLargeTitle();
    if (typeof initBackToTop === "function") initBackToTop();
    if (typeof liveOrderActivity !== "undefined") liveOrderActivity.render();
    if (typeof initAddToCartButtons === "function") initAddToCartButtons();
    if (typeof initWishlistButtons === "function") initWishlistButtons();
    if (typeof initContactForm === "function") initContactForm();
    if (typeof initNewsletter === "function") initNewsletter();
    if (typeof cartUI !== "undefined" && cartUI.updateBadge)
      cartUI.updateBadge();
    if (typeof initAuthNav === "function") initAuthNav();
    if (typeof initNavBar === "function") initNavBar();

    // Trang chủ
    if (path === "/" || path.endsWith("index.html")) {
      if (typeof initHeroDrinkTabs === "function") initHeroDrinkTabs();
      if (typeof initHomepageProducts === "function") initHomepageProducts();
    }

    // Trang Thực Đơn
    if (path.includes("menu.html")) {
      if (typeof initMenuPage === "function") {
        initMenuPage();
      } else {
        await this.loadScriptOnce("js/products.js");
        if (typeof initMenuPage === "function") initMenuPage();
      }
    }

    // Trang Giỏ Hàng
    if (path.includes("cart.html")) {
      if (typeof cartState !== "undefined") cartState.loadForCurrentUser();
      if (typeof renderOrderCart === "function") {
        renderOrderCart();
        if (typeof wireVoucherControls === "function") wireVoucherControls();
        if (typeof wireClearCartButton === "function") wireClearCartButton();
      } else {
        await this.loadScriptOnce("js/cart.js");
        if (typeof renderOrderCart === "function") renderOrderCart();
        if (typeof wireVoucherControls === "function") wireVoucherControls();
        if (typeof wireClearCartButton === "function") wireClearCartButton();
      }
    }

    // Trang Đơn Hàng
    if (path.includes("orders.html")) {
      if (typeof renderOrderHistory === "function") {
        renderOrderHistory();
      } else {
        await this.loadScriptOnce("js/orders.js");
        if (typeof renderOrderHistory === "function") renderOrderHistory();
      }
    }

    // Trang Thanh Toán
    if (path.includes("checkout.html")) {
      if (typeof initCheckoutPage === "function") {
        initCheckoutPage();
      } else {
        await this.loadScriptOnce("js/checkout.js");
        if (typeof initCheckoutPage === "function") initCheckoutPage();
      }
    }

    // Trang Tài Khoản
    if (path.includes("account.html")) {
      if (typeof themeManager !== "undefined") themeManager.init();
      if (typeof initAccountPage === "function") {
        initAccountPage();
      } else {
        await this.loadScriptOnce("js/account.js");
        if (typeof initAccountPage === "function") initAccountPage();
      }
    }

    // Trang Chi Tiết Sản Phẩm
    if (path.includes("product.html")) {
      if (typeof initProductDetailPage === "function") {
        initProductDetailPage();
      } else {
        await this.loadScriptOnce("js/product.js");
        if (typeof initProductDetailPage === "function")
          initProductDetailPage();
      }
    }
  },

  loadScriptOnce(relSrc) {
    return new Promise((resolve) => {
      const isPages = window.location.pathname
        .replace(/\\/g, "/")
        .includes("/pages/");
      const finalSrc = isPages
        ? relSrc.startsWith("../")
          ? relSrc
          : "../" + relSrc
        : relSrc.replace(/^\.\.\//, "");
      const scriptName = relSrc.split("/").pop();
      const existing = document.querySelector(`script[src*="${scriptName}"]`);
      if (existing) {
        resolve();
        return;
      }
      const s = document.createElement("script");
      s.src = finalSrc;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => resolve();
      document.body.appendChild(s);
    });
  },
};

/* ────────────────────────────────────────────────────────────
   iOS LARGE TITLE SCROLL COLLAPSE
   - Thu nhỏ và mờ nhẹ tiêu đề lớn (.pageHeroTitle) khi cuộn xuống
   - Tự động tắt khi hệ điều hành bật prefers-reduced-motion
   ──────────────────────────────────────────────────────────── */
function initIosLargeTitle() {
  if (window._iosLargeTitleHandler) {
    window.removeEventListener("scroll", window._iosLargeTitleHandler);
    window._iosLargeTitleHandler = null;
  }

  const titleEl = document.querySelector(".pageHeroTitle");
  if (!titleEl) return;

  const reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) {
    titleEl.style.transform = "";
    titleEl.style.opacity = "";
    return;
  }

  let ticking = false;
  const update = () => {
    ticking = false;
    const el = document.querySelector(".pageHeroTitle");
    if (!el) return;
    const progress = Math.min(Math.max(window.scrollY / 160, 0), 1);
    const scale = 1 - progress * 0.08;
    const translateY = progress * -6;
    const opacity = 1 - progress * 0.22;
    el.style.transform = `translate3d(0, ${translateY.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
    el.style.opacity = opacity.toFixed(3);
  };

  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };

  window._iosLargeTitleHandler = onScroll;
  window.addEventListener("scroll", onScroll, { passive: true });
  update();
}

/* ────────────────────────────────────────────────────────────
   iOS SPOTLIGHT QUICK SEARCH (Ctrl+K / Cmd+K / nút kính lúp)
   ──────────────────────────────────────────────────────────── */
const SPOTLIGHT_CATEGORY_LABELS = {
  coffee: "Cà phê",
  tea: "Trà",
  "milk-tea": "Trà sữa",
  juice: "Nước ép",
  smoothie: "Sinh tố",
  yogurt: "Sữa chua",
  soda: "Soda",
  kombucha: "Kombucha",
  other: "Khác",
};

const SPOTLIGHT_SUGGESTIONS = [
  "Cà phê muối",
  "Bạc xỉu",
  "Trà đào",
  "Matcha",
  "Trà sữa",
  "Nước ép",
];

function spotlightNormalize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

function spotlightHighlightHtml(originalText, normalizedQuery) {
  const source = String(originalText || "");
  if (!normalizedQuery) return escapeHtmlGlobal(source);

  // Ánh xạ mỗi ký tự chuẩn hóa về vị trí ký tự gốc để highlight đúng dấu tiếng Việt
  let normStr = "";
  const indexMap = [];
  for (let i = 0; i < source.length; i++) {
    const chNorm = source[i]
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase();
    for (let k = 0; k < chNorm.length; k++) {
      normStr += chNorm[k];
      indexMap.push(i);
    }
  }

  const hitIdx = normStr.indexOf(normalizedQuery);
  if (hitIdx === -1) return escapeHtmlGlobal(source);

  const origStart = indexMap[hitIdx];
  const origEnd = indexMap[Math.min(hitIdx + normalizedQuery.length - 1, indexMap.length - 1)] + 1;
  return (
    escapeHtmlGlobal(source.slice(0, origStart)) +
    `<mark class="iosSpotlightMark">${escapeHtmlGlobal(source.slice(origStart, origEnd))}</mark>` +
    escapeHtmlGlobal(source.slice(origEnd))
  );
}

const spotlightSearch = {
  modalEl: null,
  inputEl: null,
  bodyEl: null,
  clearBtn: null,
  menuLinkEl: null,
  isOpen: false,
  selectedIndex: 0,
  currentItems: [],
  productsCache: null,
  sellersMap: null,
  coverUrls: new Map(),

  init() {
    if (!document.getElementById("navBar")) return;

    if (!document.getElementById("iosSpotlightModal")) {
      const modal = document.createElement("div");
      modal.id = "iosSpotlightModal";
      modal.className = "iosSpotlightModal";
      modal.setAttribute("aria-hidden", "true");
      modal.innerHTML = `
        <div class="iosSpotlightBackdrop"></div>
        <div class="iosSpotlightDialog" role="dialog" aria-modal="true" aria-label="Tìm kiếm nhanh đồ uống">
          <div class="iosSpotlightHeader">
            <i class="fa-solid fa-magnifying-glass iosSpotlightSearchIcon" aria-hidden="true"></i>
            <input type="search" id="iosSpotlightInput" class="iosSpotlightInput"
                   placeholder="Tìm cà phê, trà sữa, matcha, nước ép..."
                   aria-label="Tìm nhanh món đồ uống" autocomplete="off" />
            <button type="button" id="iosSpotlightClearBtn" class="iosSpotlightClearBtn" aria-label="Xóa từ khóa" hidden>
              <i class="fa-solid fa-circle-xmark" aria-hidden="true"></i>
            </button>
            <button type="button" id="iosSpotlightCloseBtn" class="iosSpotlightCloseBtn" aria-label="Đóng tìm kiếm">
              ESC
            </button>
          </div>
          <div id="iosSpotlightBody" class="iosSpotlightBody"></div>
          <div class="iosSpotlightFooter">
            <div class="iosSpotlightHints" aria-hidden="true">
              <span><kbd>↑</kbd><kbd>↓</kbd> Di chuyển</span>
              <span><kbd>↵</kbd> Xem món</span>
              <span><kbd>ESC</kbd> Đóng</span>
            </div>
            <a href="pages/menu.html" id="iosSpotlightMenuLink" class="iosSpotlightMenuLink">
              Xem toàn bộ thực đơn <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </a>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    this.modalEl = document.getElementById("iosSpotlightModal");
    this.inputEl = document.getElementById("iosSpotlightInput");
    this.bodyEl = document.getElementById("iosSpotlightBody");
    this.clearBtn = document.getElementById("iosSpotlightClearBtn");
    this.menuLinkEl = document.getElementById("iosSpotlightMenuLink");

    if (this.modalEl.dataset.wired === "1") return;
    this.modalEl.dataset.wired = "1";

    this.modalEl
      .querySelector(".iosSpotlightBackdrop")
      ?.addEventListener("click", () => this.close());
    document
      .getElementById("iosSpotlightCloseBtn")
      ?.addEventListener("click", () => this.close());

    this.clearBtn?.addEventListener("click", () => {
      if (!this.inputEl) return;
      this.inputEl.value = "";
      this.clearBtn.hidden = true;
      this.renderResults("");
      this.inputEl.focus();
    });

    this.inputEl?.addEventListener("input", () => {
      const val = this.inputEl.value || "";
      if (this.clearBtn) this.clearBtn.hidden = val.length === 0;
      this.selectedIndex = 0;
      this.renderResults(val);
    });

    this.menuLinkEl?.addEventListener("click", (e) => {
      e.preventDefault();
      const targetUrl = new URL(`${projectRootPrefix}pages/menu.html`, window.location.href).href;
      this.close();
      if (typeof koffiaRouter !== "undefined" && typeof koffiaRouter.navigate === "function") {
        koffiaRouter.navigate(targetUrl);
      } else {
        window.location.href = targetUrl;
      }
    });

    if (!window._iosSpotlightKeyWired) {
      window._iosSpotlightKeyWired = true;
      document.addEventListener("keydown", (event) => {
        const isMetaK =
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          String(event.key || "").toLowerCase() === "k";
        if (isMetaK) {
          if (!isMenuPageUrl(window.location.href)) return;
          event.preventDefault();
          if (this.isOpen) this.close();
          else this.open();
          return;
        }

        if (
          !this.isOpen &&
          event.key === "/" &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          if (!isMenuPageUrl(window.location.href)) return;
          const activeTag = document.activeElement?.tagName;
          const isTyping =
            activeTag === "INPUT" ||
            activeTag === "TEXTAREA" ||
            activeTag === "SELECT" ||
            document.activeElement?.isContentEditable;
          if (!isTyping) {
            event.preventDefault();
            this.open();
            return;
          }
        }

        if (!this.isOpen) return;

        if (event.key === "Escape") {
          event.preventDefault();
          this.close();
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          this.moveSelection(1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          this.moveSelection(-1);
        } else if (event.key === "Enter") {
          if (this.currentItems.length > 0) {
            event.preventDefault();
            this.openSelected();
          }
        }
      });
    }
  },

  async ensureData() {
    if (!this.productsCache) {
      const map = await productCatalogService.getProductMap();
      this.productsCache = Array.from(map.values());
    }
    if (!this.sellersMap && typeof sellerService !== "undefined") {
      try {
        this.sellersMap = await sellerService.getMap();
      } catch {
        this.sellersMap = new Map();
      }
    }
  },

  async open() {
    if (!isMenuPageUrl(window.location.href)) return;
    if (!this.modalEl) this.init();
    if (!this.modalEl) return;

    this.isOpen = true;
    this.selectedIndex = 0;
    if (this.menuLinkEl) {
      this.menuLinkEl.href = `${projectRootPrefix}pages/menu.html`;
    }
    if (this.inputEl) {
      this.inputEl.value = "";
    }
    if (this.clearBtn) this.clearBtn.hidden = true;

    this.modalEl.classList.add("isOpen");
    this.modalEl.setAttribute("aria-hidden", "false");
    document.body.classList.add("iosModalActive");

    if (this.bodyEl) {
      this.bodyEl.innerHTML =
        '<div class="iosSpotlightLoading">Đang tải danh sách đồ uống...</div>';
    }

    setTimeout(() => this.inputEl?.focus(), 30);

    await this.ensureData();
    if (this.isOpen) {
      this.renderResults(this.inputEl?.value || "");
    }
  },

  close() {
    if (!this.modalEl || !this.isOpen) return;
    this.isOpen = false;
    this.modalEl.classList.remove("isOpen");
    this.modalEl.setAttribute("aria-hidden", "true");
    document.body.classList.remove("iosModalActive");
  },

  openProduct(productId) {
    if (!productId) return;
    const targetUrl = new URL(
      `${projectRootPrefix}pages/product.html?id=${encodeURIComponent(productId)}`,
      window.location.href,
    ).href;
    this.close();
    if (
      typeof koffiaRouter !== "undefined" &&
      typeof koffiaRouter.navigate === "function"
    ) {
      koffiaRouter.navigate(targetUrl);
    } else {
      window.location.href = targetUrl;
    }
  },

  moveSelection(delta) {
    if (!this.currentItems.length || !this.bodyEl) return;
    this.selectedIndex =
      (this.selectedIndex + delta + this.currentItems.length) %
      this.currentItems.length;
    const rows = this.bodyEl.querySelectorAll(".iosSpotlightItem");
    rows.forEach((row, idx) => {
      const isSelected = idx === this.selectedIndex;
      row.classList.toggle("isActive", isSelected);
      if (isSelected) row.scrollIntoView({ block: "nearest" });
    });
  },

  openSelected() {
    const selected =
      this.currentItems[this.selectedIndex] || this.currentItems[0];
    if (selected?.id) this.openProduct(selected.id);
  },

  renderResults(rawQuery) {
    if (!this.bodyEl) return;
    const products = this.productsCache || [];
    const normQuery = spotlightNormalize(rawQuery);

    if (!normQuery) {
      const popular = [...products]
        .filter((p) => p.isAvailable !== false)
        .sort(
          (a, b) =>
            Number(b.isBestSeller) - Number(a.isBestSeller) ||
            (b.soldCount || 0) - (a.soldCount || 0),
        )
        .slice(0, 5);

      this.currentItems = popular;
      this.selectedIndex = 0;

      const chipsHtml = SPOTLIGHT_SUGGESTIONS.map(
        (kw) =>
          `<button type="button" class="iosSpotlightChip" data-spotlight-chip="${escapeHtmlGlobal(kw)}">${escapeHtmlGlobal(kw)}</button>`,
      ).join("");

      const popularHtml = popular
        .map((p, idx) => this.buildResultRowHtml(p, idx, ""))
        .join("");

      this.bodyEl.innerHTML = `
        <div class="iosSpotlightSection">
          <div class="iosSpotlightSectionLabel">Tìm nhanh theo từ khóa</div>
          <div class="iosSpotlightSuggestions">${chipsHtml}</div>
        </div>
        <div class="iosSpotlightSection">
          <div class="iosSpotlightSectionLabel">Bán chạy hôm nay</div>
          <div class="iosSpotlightList" role="listbox">${popularHtml}</div>
        </div>
      `;
    } else {
      const matches = products
        .filter((p) => {
          const catLabel = SPOTLIGHT_CATEGORY_LABELS[p.category] || "";
          const sellerName = this.sellersMap?.get(p.sellerId)?.channelName || "";
          const hay = spotlightNormalize(
            `${p.name} ${p.description || ""} ${catLabel} ${sellerName}`,
          );
          return hay.includes(normQuery);
        })
        .sort((a, b) => {
          const aNameHit = spotlightNormalize(a.name).startsWith(normQuery) ? 1 : 0;
          const bNameHit = spotlightNormalize(b.name).startsWith(normQuery) ? 1 : 0;
          return (
            bNameHit - aNameHit ||
            Number(b.isBestSeller) - Number(a.isBestSeller) ||
            (b.soldCount || 0) - (a.soldCount || 0)
          );
        })
        .slice(0, 8);

      this.currentItems = matches;
      this.selectedIndex = 0;

      if (!matches.length) {
        this.bodyEl.innerHTML = `
          <div class="iosSpotlightEmpty">
            <i class="fa-solid fa-mug-hot" aria-hidden="true"></i>
            <p>Không tìm thấy món khớp với "<strong>${escapeHtmlGlobal(rawQuery.trim())}</strong>"</p>
            <span>Thử từ khóa khác như: Cà phê muối, Trà đào, Bạc xỉu...</span>
          </div>
        `;
        return;
      }

      const listHtml = matches
        .map((p, idx) => this.buildResultRowHtml(p, idx, normQuery))
        .join("");

      this.bodyEl.innerHTML = `
        <div class="iosSpotlightSection">
          <div class="iosSpotlightSectionLabel">Kết quả phù hợp (${matches.length})</div>
          <div class="iosSpotlightList" role="listbox">${listHtml}</div>
        </div>
      `;
    }

    this.wireBodyInteractions();
    this.hydrateCovers();
  },

  buildResultRowHtml(product, index, normQuery) {
    const catLabel = SPOTLIGHT_CATEGORY_LABELS[product.category] || "Đồ uống";
    const cachedCover = this.coverUrls.get(product.id);
    const titleHtml = spotlightHighlightHtml(product.name, normQuery);
    const isSoldOut = product.isAvailable === false;
    return `
      <button type="button" class="iosSpotlightItem${index === this.selectedIndex ? " isActive" : ""}"
              role="option" aria-selected="${index === this.selectedIndex ? "true" : "false"}"
              data-spotlight-product-id="${escapeHtmlGlobal(product.id)}"
              data-spotlight-index="${index}">
        <span class="iosSpotlightThumb">
          <img class="iosSpotlightImg${cachedCover ? " isLoaded" : ""}"
               src="${escapeHtmlGlobal(cachedCover || defaultProductImageDataUri)}"
               data-spotlight-img="${escapeHtmlGlobal(product.id)}" alt="" />
        </span>
        <span class="iosSpotlightMeta">
          <span class="iosSpotlightName">${titleHtml}</span>
          <span class="iosSpotlightSub">${escapeHtmlGlobal(catLabel)}${isSoldOut ? " · Tạm hết" : ""}</span>
        </span>
        <span class="iosSpotlightPrice">${formatPrice(product.price)}</span>
        <i class="fa-solid fa-chevron-right iosSpotlightArrow" aria-hidden="true"></i>
      </button>
    `;
  },

  wireBodyInteractions() {
    if (!this.bodyEl) return;
    this.bodyEl.querySelectorAll("[data-spotlight-chip]").forEach((chip) => {
      chip.addEventListener("click", () => {
        if (!this.inputEl) return;
        this.inputEl.value = chip.dataset.spotlightChip || "";
        if (this.clearBtn) this.clearBtn.hidden = false;
        this.selectedIndex = 0;
        this.renderResults(this.inputEl.value);
        this.inputEl.focus();
      });
    });

    this.bodyEl
      .querySelectorAll("[data-spotlight-product-id]")
      .forEach((row) => {
        row.addEventListener("mouseenter", () => {
          const idx = Number(row.dataset.spotlightIndex);
          if (Number.isFinite(idx)) {
            this.selectedIndex = idx;
            this.bodyEl
              .querySelectorAll(".iosSpotlightItem")
              .forEach((el, i) => el.classList.toggle("isActive", i === idx));
          }
        });
        row.addEventListener("click", () => {
          this.openProduct(row.dataset.spotlightProductId);
        });
      });
  },

  async hydrateCovers() {
    if (!this.bodyEl || typeof productImageService === "undefined") return;
    const imgs = [...this.bodyEl.querySelectorAll("[data-spotlight-img]")];
    await Promise.all(
      imgs.map(async (img) => {
        const productId = img.dataset.spotlightImg;
        if (this.coverUrls.has(productId)) return;
        const product = (this.productsCache || []).find((p) => p.id === productId);
        if (!product) return;
        const cover = await productImageService.resolveCoverImage(
          product,
          projectRootPrefix,
        );
        if (cover && img.isConnected) {
          const absUrl = new URL(cover, window.location.href).href;
          this.coverUrls.set(productId, absUrl);
          img.src = absUrl;
          img.classList.add("isLoaded");
        }
      }),
    );
  },
};

/* ────────────────────────────────────────────────────────────
   iOS BACK TO TOP BUTTON (nút tròn kính mờ + vòng tiến độ cuộn)
   ──────────────────────────────────────────────────────────── */
function initBackToTop() {
  if (!document.getElementById("navBar")) return;

  let btn = document.getElementById("iosBackToTopBtn");
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "iosBackToTopBtn";
    btn.className = "iosBackToTopBtn";
    btn.setAttribute("aria-label", "Lên đầu trang");
    btn.title = "Lên đầu trang";
    btn.innerHTML = `
      <svg class="iosBackToTopRing" viewBox="0 0 44 44" aria-hidden="true">
        <circle class="iosBackToTopTrack" cx="22" cy="22" r="19" />
        <circle class="iosBackToTopArc" cx="22" cy="22" r="19" />
      </svg>
      <i class="fa-solid fa-arrow-up" aria-hidden="true"></i>
    `;
    document.body.appendChild(btn);

    btn.addEventListener("click", () => {
      const reduceMotion =
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({
        top: 0,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    });
  }

  const arc = btn.querySelector(".iosBackToTopArc");
  const circumference = 2 * Math.PI * 19; // ~119.38
  if (arc) {
    arc.style.strokeDasharray = `${circumference.toFixed(2)}`;
  }

  let ticking = false;
  const update = () => {
    ticking = false;
    const el = document.getElementById("iosBackToTopBtn");
    if (!el) return;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const maxScroll = Math.max(
      1,
      document.documentElement.scrollHeight - window.innerHeight,
    );
    const progress = Math.min(1, Math.max(0, scrollY / maxScroll));
    el.classList.toggle("isVisible", scrollY > 360);
    const arcEl = el.querySelector(".iosBackToTopArc");
    if (arcEl) {
      arcEl.style.strokeDashoffset = `${(circumference * (1 - progress)).toFixed(2)}`;
    }
  };

  if (!window._iosBackToTopScrollWired) {
    window._iosBackToTopScrollWired = true;
    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(update);
        }
      },
      { passive: true },
    );
  }
  update();
}

/* ────────────────────────────────────────────────────────────
   RECENTLY VIEWED PRODUCTS SERVICE (lưu tối đa 8 món vừa xem)
   ──────────────────────────────────────────────────────────── */
const RECENTLY_VIEWED_KEY = "koffiaRecentlyViewedV1";

const recentlyViewedService = {
  getIds() {
    try {
      const parsed = JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  },
  record(productId) {
    if (!productId) return;
    const id = String(productId);
    const next = [id, ...this.getIds().filter((x) => x !== id)].slice(0, 8);
    try {
      localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next));
    } catch {}
  },
};

/* ────────────────────────────────────────────────────────────
   PRODUCT REVIEWS SERVICE (Đánh giá & Bình luận sản phẩm)
   ──────────────────────────────────────────────────────────── */
const PRODUCT_REVIEWS_KEY = "koffiaProductReviewsV1";

const SEED_REVIEW_TEMPLATES = {
  coffee: [
    { author: "Minh Anh", rating: 5, text: "Hương cà phê rang mộc rất thơm, đậm vị nhưng không gắt. Giao tới vẫn còn nguyên độ mát." },
    { author: "Hoàng Nam", rating: 5, text: "Chọn 50% đường vừa miệng cực kỳ, đóng gói cẩn thận không bị đổ ra ngoài." },
    { author: "Thảo Vy", rating: 4, text: "Vị ổn định, shipper giao tầm 15 phút là có nước uống ngay." },
  ],
  tea: [
    { author: "Khánh Linh", rating: 5, text: "Trà thanh mát, vị trái cây tự nhiên chứ không bị ngọt gắt siro. Rất đáng thử!" },
    { author: "Quốc Bảo", rating: 5, text: "Uống giải nhiệt buổi chiều siêu hợp, để đá riêng vẫn đậm vị trà." },
    { author: "Ngọc Hân", rating: 4, text: "Ly đầy đặn, topping tươi giòn, giao nhanh đúng giờ." },
  ],
  "milk-tea": [
    { author: "Gia Hân", rating: 5, text: "Trà sữa béo thơm mùi trà rang, trân châu mềm dẻo ăn rất cuốn!" },
    { author: "Đức Anh", rating: 5, text: "Đặt 70% đường và ít đá là chuẩn bài, vị đậm đà hơn nhiều quán khác." },
    { author: "Phương Nhi", rating: 4, text: "Ly to, béo ngậy vừa phải không bị ngán." },
  ],
  default: [
    { author: "Tuấn Kiệt", rating: 5, text: "Đồ uống tươi ngon, đóng gói gọn gàng sạch sẽ, sẽ đặt lại nhiều lần." },
    { author: "Lan Phương", rating: 5, text: "Tùy chỉnh đường đá đúng như ghi chú, giao hàng rất nhanh." },
    { author: "Hải Đăng", rating: 4, text: "Hương vị dễ uống, giá hợp lý, áp thêm mã giảm giá càng hời." },
  ],
};

const productReviewService = {
  loadMap() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PRODUCT_REVIEWS_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  },
  saveMap(map) {
    try {
      localStorage.setItem(PRODUCT_REVIEWS_KEY, JSON.stringify(map));
      if (typeof koffiaCloudSync !== "undefined") {
        koffiaCloudSync.schedulePush("reviews");
      }
    } catch {}
  },
  getUserReviews(productId) {
    const map = this.loadMap();
    const list = map[String(productId)];
    return Array.isArray(list) ? list : [];
  },
  addReview(productId, { rating, comment }) {
    const user =
      typeof customerService !== "undefined"
        ? customerService.getCurrentUser()
        : getStoredCurrentUser();
    if (!user?.id) return null;

    const cleanComment = String(comment || "").trim().slice(0, 300);
    const safeRating = Math.min(5, Math.max(1, Math.round(Number(rating) || 5)));
    const authorName =
      `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
      user.username ||
      "Khách hàng Koffia";
    const initials = authorName
      .split(/\s+/)
      .filter(Boolean)
      .slice(-2)
      .map((w) => w[0].toUpperCase())
      .join("") || "KF";

    const review = {
      id: `rev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      userId: user.id,
      authorName,
      authorInitials: initials,
      rating: safeRating,
      comment: cleanComment,
      createdAt: new Date().toISOString(),
      isVerifiedPurchase: true,
    };

    const map = this.loadMap();
    const key = String(productId);
    const existing = Array.isArray(map[key]) ? map[key] : [];
    map[key] = [review, ...existing].slice(0, 50);
    this.saveMap(map);
    return review;
  },
  deleteReview(productId, reviewId) {
    const user =
      typeof customerService !== "undefined"
        ? customerService.getCurrentUser()
        : getStoredCurrentUser();
    if (!user?.id) return false;
    const map = this.loadMap();
    const key = String(productId);
    const list = Array.isArray(map[key]) ? map[key] : [];
    const target = list.find((r) => r.id === reviewId);
    if (!target || (target.userId !== user.id && user.role !== "dev")) return false;
    map[key] = list.filter((r) => r.id !== reviewId);
    this.saveMap(map);
    return true;
  },
  getMergedRatingStats(product) {
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    if (product?.ratings && typeof product.ratings === "object") {
      Object.entries(product.ratings).forEach(([star, cnt]) => {
        const s = Number(star);
        if (s >= 1 && s <= 5) counts[s] += Math.max(0, Number(cnt) || 0);
      });
    }
    const userReviews = this.getUserReviews(product?.id);
    userReviews.forEach((r) => {
      const s = Math.min(5, Math.max(1, Number(r.rating) || 5));
      counts[s] += 1;
    });
    const total = counts[5] + counts[4] + counts[3] + counts[2] + counts[1];
    const weighted =
      counts[5] * 5 + counts[4] * 4 + counts[3] * 3 + counts[2] * 2 + counts[1];
    return {
      counts,
      total,
      average: total > 0 ? weighted / total : 0,
    };
  },
  getDisplayReviews(product) {
    const userReviews = this.getUserReviews(product?.id);
    const templates =
      SEED_REVIEW_TEMPLATES[product?.category] || SEED_REVIEW_TEMPLATES.default;
    // Sinh ngày mẫu cố định theo mã sản phẩm để danh sách trông tự nhiên và không nhấp nháy
    const hash = String(product?.id || "1")
      .split("")
      .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const now = Date.now();
    const seedReviews = templates.map((tpl, idx) => ({
      id: `seed_${product?.id}_${idx}`,
      userId: "",
      authorName: tpl.author,
      authorInitials: tpl.author
        .split(/\s+/)
        .slice(-2)
        .map((w) => w[0].toUpperCase())
        .join(""),
      rating: tpl.rating,
      comment: tpl.text,
      createdAt: new Date(now - ((hash % 7) + idx * 3 + 1) * 86400000).toISOString(),
      isVerifiedPurchase: true,
      isSeed: true,
    }));
    return [...userReviews, ...seedReviews];
  },
};

/* ────────────────────────────────────────────────────────────
   iOS LIVE ACTIVITY — THEO DÕI ĐƠN HÀNG TRỰC QUAN
   ──────────────────────────────────────────────────────────── */
const liveOrderActivity = {
  el: null,
  timerId: null,
  completedHideTimer: null,
  lastTrackedOrderId: null,

  init() {
    if (!document.getElementById("navBar")) return;

    if (!document.getElementById("iosLiveActivity")) {
      const box = document.createElement("aside");
      box.id = "iosLiveActivity";
      box.className = "iosLiveActivity";
      box.setAttribute("aria-label", "Theo dõi đơn hàng trực tiếp");
      box.setAttribute("aria-live", "polite");
      document.body.appendChild(box);
    }
    this.el = document.getElementById("iosLiveActivity");

    if (!window._iosLiveActivityWired) {
      window._iosLiveActivityWired = true;
      window.addEventListener("koffia:orders-changed", (event) => {
        const completedIds = event?.detail?.newlyCompletedIds || [];
        if (
          completedIds.length &&
          this.lastTrackedOrderId &&
          completedIds.includes(this.lastTrackedOrderId)
        ) {
          this.render(this.lastTrackedOrderId);
          showToast(`Đơn ${this.lastTrackedOrderId} đã được giao thành công!`, "success", 3600);
          clearTimeout(this.completedHideTimer);
          this.completedHideTimer = setTimeout(() => {
            this.lastTrackedOrderId = null;
            this.render();
          }, 7000);
          return;
        }
        this.render();
      });

      this.timerId = window.setInterval(() => {
        if (!getStoredCurrentUser()) return;
        orderHistoryService.syncLiveStatuses();
        this.render();
      }, 5000);
    }

    orderHistoryService.syncLiveStatuses();
    this.render();
  },

  render(forceOrderId = null) {
    if (!this.el) this.el = document.getElementById("iosLiveActivity");
    if (!this.el) return;

    const user = getStoredCurrentUser();
    if (!user?.id) {
      this.el.classList.remove("isVisible");
      return;
    }

    let dismissedId = "";
    try {
      dismissedId = sessionStorage.getItem("koffiaLiveActivityDismissed") || "";
    } catch {}

    const viewerOrders = orderHistoryService
      .getForCurrentViewer()
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    let activeOrder = null;
    if (forceOrderId) {
      activeOrder = viewerOrders.find((o) => o.id === forceOrderId) || null;
    } else {
      activeOrder =
        viewerOrders.find((o) =>
          ["new", "preparing", "delivering"].includes(o.status),
        ) || null;
    }

    if (!activeOrder || activeOrder.id === dismissedId) {
      this.el.classList.remove("isVisible");
      return;
    }

    this.lastTrackedOrderId = activeOrder.id;
    const info = orderHistoryService.getProgressInfo(activeOrder);
    const isCompleted = activeOrder.status === "completed";
    const etaText =
      !isCompleted &&
      activeOrder.status === "new" &&
      activeOrder.deliverySchedule?.mode === "scheduled" &&
      activeOrder.deliverySchedule?.slotLabel
        ? activeOrder.deliverySchedule.slotLabel
        : info.etaLabel;
    const totalCups = (activeOrder.items || []).reduce(
      (sum, i) => sum + (Number(i.qty) || 1),
      0,
    );
    const ordersHref = `${projectRootPrefix}pages/orders.html`;

    this.el.classList.toggle("isCompleted", isCompleted);
    this.el.innerHTML = `
      <a href="${escapeHtmlGlobal(ordersHref)}" class="iosLiveMain" id="iosLiveActivityLink">
        <span class="iosLiveIconWrap" aria-hidden="true">
          <i class="fa-solid ${info.icon}"></i>
        </span>
        <span class="iosLiveInfo">
          <span class="iosLiveTopRow">
            <strong class="iosLiveTitle">${escapeHtmlGlobal(info.title)}</strong>
            <span class="iosLiveEta">${escapeHtmlGlobal(etaText)}</span>
          </span>
          <span class="iosLiveSub">Đơn ${escapeHtmlGlobal(activeOrder.id)} · ${totalCups} món</span>
          <span class="iosLiveProgressTrack" aria-hidden="true">
            <span class="iosLiveProgressFill" style="width:${info.progressPct}%"></span>
          </span>
        </span>
      </a>
      <button type="button" class="iosLiveCloseBtn" id="iosLiveCloseBtn" aria-label="Ẩn theo dõi đơn">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
    `;

    this.el.classList.add("isVisible");

    this.el.querySelector("#iosLiveCloseBtn")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        sessionStorage.setItem("koffiaLiveActivityDismissed", activeOrder.id);
      } catch {}
      this.el.classList.remove("isVisible");
    });
  },
};

/* ────────────────────────────────────────────────────────────
   NHÓM 3: CÁ NHÂN HÓA THÔNG MINH
   - Gu uống mặc định (drinkPreferenceService)
   - Sổ địa chỉ giao hàng (addressBookService)
   - Tích điểm Koffia Rewards & Đổi Voucher (rewardsService)
   ──────────────────────────────────────────────────────────── */
const DRINK_PREF_STORAGE_KEY = "koffiaDrinkPreferenceV1";

const drinkPreferenceService = {
  getDefault() {
    return {
      enabled: false,
      size: "M",
      sugar: 50,
      ice: 70,
      note: "",
    };
  },
  getOwnerKey() {
    const user = getStoredCurrentUser();
    return user?.id ? String(user.id) : "guest";
  },
  loadMap() {
    try {
      const parsed = JSON.parse(localStorage.getItem(DRINK_PREF_STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  },
  getForCurrentUser() {
    const map = this.loadMap();
    const raw = map[this.getOwnerKey()];
    if (!raw || typeof raw !== "object") return this.getDefault();
    return {
      enabled: Boolean(raw.enabled),
      size: ["S", "M", "L"].includes(String(raw.size).toUpperCase())
        ? String(raw.size).toUpperCase()
        : "M",
      sugar: Number.isFinite(Number(raw.sugar)) ? Number(raw.sugar) : 50,
      ice: Number.isFinite(Number(raw.ice)) ? Number(raw.ice) : 70,
      note: String(raw.note || "").trim().slice(0, 120),
    };
  },
  saveForCurrentUser(patch) {
    const map = this.loadMap();
    const current = this.getForCurrentUser();
    const next = {
      enabled: patch.enabled !== undefined ? Boolean(patch.enabled) : true,
      size: ["S", "M", "L"].includes(String(patch.size || current.size).toUpperCase())
        ? String(patch.size || current.size).toUpperCase()
        : "M",
      sugar: Number.isFinite(Number(patch.sugar)) ? Number(patch.sugar) : current.sugar,
      ice: Number.isFinite(Number(patch.ice)) ? Number(patch.ice) : current.ice,
      note: String(patch.note !== undefined ? patch.note : current.note)
        .trim()
        .slice(0, 120),
    };
    map[this.getOwnerKey()] = next;
    try {
      localStorage.setItem(DRINK_PREF_STORAGE_KEY, JSON.stringify(map));
    } catch {}
    window.dispatchEvent(
      new CustomEvent("koffia:preference-changed", { detail: next }),
    );
    return next;
  },
  getSummaryText(pref) {
    const p = pref || this.getForCurrentUser();
    const sizeLabels = { S: "Size S", M: "Size M", L: "Size L" };
    const parts = [
      sizeLabels[p.size] || "Size M",
      `${p.sugar}% đường`,
      `${p.ice}% đá`,
    ];
    if (p.note) parts.push(`"${p.note}"`);
    return parts.join(" · ");
  },
};

const ADDRESS_BOOK_STORAGE_KEY = "koffiaAddressBookV1";

const addressBookService = {
  getOwnerKey() {
    const user = getStoredCurrentUser();
    return user?.id ? String(user.id) : "";
  },
  loadMap() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ADDRESS_BOOK_STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  },
  saveMap(map) {
    try {
      localStorage.setItem(ADDRESS_BOOK_STORAGE_KEY, JSON.stringify(map));
      if (typeof koffiaCloudSync !== "undefined") {
        koffiaCloudSync.schedulePush("addresses");
      }
    } catch {}
  },
  getList() {
    const key = this.getOwnerKey();
    if (!key) return [];
    const map = this.loadMap();
    if (!(key in map)) {
      const user = getStoredCurrentUser();
      const fullName =
        `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
        user?.username ||
        "Trần Minh Khôi";
      const phone = user?.phone || user?.sellerProfile?.phone || "0912 345 678";
      map[key] = [
        {
          id: `addr_seed_home_${key}`,
          label: "Nhà riêng",
          recipientName: fullName,
          phone,
          provinceCode: "79",
          provinceName: "Thành phố Hồ Chí Minh",
          districtCode: "760",
          districtName: "Quận 1",
          wardCode: "",
          wardName: "Phường Bến Nghé",
          street: "Số 88 Nguyễn Huệ",
          isDefault: true,
          createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        },
        {
          id: `addr_seed_work_${key}`,
          label: "Công ty",
          recipientName: fullName,
          phone,
          provinceCode: "1",
          provinceName: "Thành phố Hà Nội",
          districtCode: "4",
          districtName: "Quận Cầu Giấy",
          wardCode: "",
          wardName: "Phường Dịch Vọng",
          street: "Tầng 12, Tòa nhà Cầu Giấy Center",
          isDefault: false,
          createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        },
      ];
      this.saveMap(map);
    }
    const list = Array.isArray(map[key]) ? map[key] : [];
    return list.slice().sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
  },
  getDefault() {
    const list = this.getList();
    return list.find((a) => a.isDefault) || list[0] || null;
  },
  add(entry) {
    const key = this.getOwnerKey();
    if (!key || !entry) return null;
    const map = this.loadMap();
    const list = Array.isArray(map[key]) ? map[key].slice() : [];
    const shouldBeDefault = list.length === 0 || Boolean(entry.isDefault);
    if (shouldBeDefault) {
      list.forEach((a) => {
        a.isDefault = false;
      });
    }
    const clean = {
      id: entry.id || `addr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      label: String(entry.label || "Nhà riêng").trim().slice(0, 32),
      recipientName: String(entry.recipientName || "").trim().slice(0, 80),
      phone: String(entry.phone || "").trim().slice(0, 20),
      provinceCode: String(entry.provinceCode || ""),
      provinceName: String(entry.provinceName || "").trim(),
      districtCode: String(entry.districtCode || ""),
      districtName: String(entry.districtName || "").trim(),
      wardCode: String(entry.wardCode || ""),
      wardName: String(entry.wardName || "").trim(),
      street: String(entry.street || "").trim().slice(0, 140),
      isDefault: shouldBeDefault,
      createdAt: new Date().toISOString(),
    };
    // Tránh trùng hoàn toàn cùng địa chỉ chi tiết
    const existingIdx = list.findIndex(
      (a) =>
        a.street.toLowerCase() === clean.street.toLowerCase() &&
        a.wardName === clean.wardName &&
        a.districtName === clean.districtName &&
        a.provinceName === clean.provinceName,
    );
    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...clean, id: list[existingIdx].id };
    } else {
      list.unshift(clean);
    }
    map[key] = list.slice(0, 10);
    this.saveMap(map);
    window.dispatchEvent(new CustomEvent("koffia:addresses-changed"));
    return clean;
  },
  setDefault(id) {
    const key = this.getOwnerKey();
    if (!key || !id) return false;
    const map = this.loadMap();
    const list = Array.isArray(map[key]) ? map[key] : [];
    let found = false;
    list.forEach((item) => {
      item.isDefault = item.id === id;
      if (item.isDefault) found = true;
    });
    if (!found) return false;
    map[key] = list;
    this.saveMap(map);
    window.dispatchEvent(new CustomEvent("koffia:addresses-changed"));
    return true;
  },
  remove(id) {
    const key = this.getOwnerKey();
    if (!key || !id) return false;
    const map = this.loadMap();
    const list = Array.isArray(map[key]) ? map[key] : [];
    const next = list.filter((item) => item.id !== id);
    if (next.length && !next.some((item) => item.isDefault)) {
      next[0].isDefault = true;
    }
    map[key] = next;
    this.saveMap(map);
    window.dispatchEvent(new CustomEvent("koffia:addresses-changed"));
    return true;
  },
  formatFullAddress(entry) {
    if (!entry) return "";
    return [
      entry.street,
      entry.wardName,
      entry.districtName,
      entry.provinceName,
    ]
      .filter(Boolean)
      .join(", ");
  },
};

const REWARDS_LEDGER_STORAGE_KEY = "koffiaRewardsLedgerV1";
const REWARDS_WELCOME_BONUS = 30;
const REWARDS_VND_PER_POINT = 10000;

const REWARDS_CATALOG = [
  {
    id: "rw_10k",
    title: "Giảm 10.000 ₫",
    subtitle: "Áp dụng cho đơn từ 30.000 ₫",
    points: 20,
    type: "fixed",
    value: 10000,
    minOrderValue: 30000,
    maxDiscount: 10000,
    icon: "fa-ticket",
  },
  {
    id: "rw_freeship",
    title: "Freeship 0 ₫",
    subtitle: "Miễn phí giao hàng mọi đơn",
    points: 35,
    type: "freeShip",
    value: 0,
    minOrderValue: 0,
    maxDiscount: 15000,
    icon: "fa-truck-fast",
  },
  {
    id: "rw_25k",
    title: "Giảm 25.000 ₫",
    subtitle: "Áp dụng cho đơn từ 60.000 ₫",
    points: 50,
    type: "fixed",
    value: 25000,
    minOrderValue: 60000,
    maxDiscount: 25000,
    icon: "fa-gift",
  },
  {
    id: "rw_25pct",
    title: "Giảm 25% (tối đa 40K)",
    subtitle: "Áp dụng cho đơn từ 50.000 ₫",
    points: 80,
    type: "percent",
    value: 25,
    minOrderValue: 50000,
    maxDiscount: 40000,
    icon: "fa-crown",
  },
];

const rewardsService = {
  getCatalog() {
    return REWARDS_CATALOG;
  },
  loadMap() {
    try {
      const parsed = JSON.parse(
        localStorage.getItem(REWARDS_LEDGER_STORAGE_KEY) || "{}",
      );
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  },
  saveMap(map) {
    try {
      localStorage.setItem(REWARDS_LEDGER_STORAGE_KEY, JSON.stringify(map));
    } catch {}
  },
  getSummary() {
    const user = getStoredCurrentUser();
    if (!user?.id) {
      return {
        balance: 0,
        lifetimeEarned: 0,
        spent: 0,
        orderPoints: 0,
        welcomeBonus: 0,
        tier: { id: "bronze", name: "Thành viên Đồng", badge: "Đồng" },
        nextTier: { name: "Thành viên Bạc", threshold: 50 },
        progressPct: 0,
        pointsToNext: 50,
        history: [],
      };
    }

    const orders =
      typeof orderHistoryService !== "undefined"
        ? orderHistoryService.getForCurrentViewer()
        : [];
    const orderPoints = orders
      .filter((o) => o.status !== "cancelled")
      .reduce(
        (sum, o) => sum + Math.floor((Number(o.total) || 0) / REWARDS_VND_PER_POINT),
        0,
      );

    const map = this.loadMap();
    const history = Array.isArray(map[user.id]) ? map[user.id] : [];
    const spent = history.reduce(
      (sum, entry) => sum + Math.max(0, Number(entry.points) || 0),
      0,
    );

    const lifetimeEarned = REWARDS_WELCOME_BONUS + orderPoints;
    const balance = Math.max(0, lifetimeEarned - spent);

    let tier = { id: "bronze", name: "Thành viên Đồng", badge: "Đồng", icon: "fa-medal" };
    let nextTier = { name: "Thành viên Bạc", threshold: 50 };
    let prevThreshold = 0;

    if (lifetimeEarned >= 150) {
      tier = { id: "gold", name: "Thành viên Vàng", badge: "Vàng", icon: "fa-crown" };
      nextTier = null;
      prevThreshold = 150;
    } else if (lifetimeEarned >= 50) {
      tier = { id: "silver", name: "Thành viên Bạc", badge: "Bạc", icon: "fa-award" };
      nextTier = { name: "Thành viên Vàng", threshold: 150 };
      prevThreshold = 50;
    }

    const progressPct = nextTier
      ? Math.min(
          100,
          Math.round(
            ((lifetimeEarned - prevThreshold) /
              Math.max(1, nextTier.threshold - prevThreshold)) *
              100,
          ),
        )
      : 100;
    const pointsToNext = nextTier ? Math.max(0, nextTier.threshold - lifetimeEarned) : 0;

    return {
      balance,
      lifetimeEarned,
      spent,
      orderPoints,
      welcomeBonus: REWARDS_WELCOME_BONUS,
      tier,
      nextTier,
      progressPct,
      pointsToNext,
      history,
    };
  },
  async redeem(rewardId) {
    const user = getStoredCurrentUser();
    if (!user?.id) {
      return { success: false, message: "Vui lòng đăng nhập để đổi quà." };
    }
    const reward = REWARDS_CATALOG.find((r) => r.id === rewardId);
    if (!reward) {
      return { success: false, message: "Ưu đãi không tồn tại." };
    }
    const summary = this.getSummary();
    if (summary.balance < reward.points) {
      return {
        success: false,
        message: `Bạn cần thêm ${reward.points - summary.balance} điểm nữa để đổi ưu đãi này.`,
      };
    }

    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code = `RWKOF${rand}`;
    const voucher = await voucherService.createVoucher({
      code,
      name: `Đổi điểm Koffia: ${reward.title}`,
      description: `${reward.subtitle} (Đổi bằng ${reward.points} điểm Koffia Rewards)`,
      type: reward.type,
      value: reward.value,
      maxDiscount: reward.maxDiscount,
      minOrderValue: reward.minOrderValue,
      maxUsageTotal: 1,
      maxUsagePerUser: 1,
      isPublic: true,
      ownerUserId: user.id,
      isRewardVoucher: true,
    });

    const map = this.loadMap();
    const list = Array.isArray(map[user.id]) ? map[user.id].slice() : [];
    list.unshift({
      id: `red_${Date.now().toString(36)}`,
      rewardId: reward.id,
      title: reward.title,
      code: voucher.code,
      points: reward.points,
      createdAt: new Date().toISOString(),
    });
    map[user.id] = list.slice(0, 20);
    this.saveMap(map);

    window.dispatchEvent(
      new CustomEvent("koffia:rewards-changed", { detail: { code: voucher.code } }),
    );
    return {
      success: true,
      voucher,
      summary: this.getSummary(),
    };
  },
};

/* ────────────────────────────────────────────────────────────
   KOFFIA LIVE CLOUD SYNC — GitHub Gist Data Center qua Vercel /api/db
   - Tự kích hoạt khi deploy lên Vercel (tắt êm trên localhost để tránh 404)
   - Đồng bộ 2 chiều: Orders, Customers, Vouchers, FlashSales, Sellers, CustomProducts, Reviews, Addresses
   - Polling nhẹ mỗi 6 giây khi tab đang mở để cập nhật live giữa nhiều máy
   ──────────────────────────────────────────────────────────── */
const koffiaCloudSync = {
  endpoint: "/api/db",
  enabled: false,
  isApplyingRemote: false,
  isPushing: false,
  lastUpdatedAt: "",
  pendingKeys: new Set(),
  pushTimer: null,
  pollTimer: null,

  KEYS: {
    orders: ORDER_HISTORY_STORAGE_KEY,
    customers: CUSTOMER_RUNTIME_STORAGE_KEY,
    vouchers: VOUCHERS_RUNTIME_KEY,
    flashSales: FLASH_SALES_RUNTIME_KEY,
    sellers: SELLER_RUNTIME_STORAGE_KEY,
    customProducts: "koffiaCustomProducts",
    reviews: PRODUCT_REVIEWS_KEY,
    addresses: ADDRESS_BOOK_STORAGE_KEY,
  },

  canUseCloudApi() {
    if (!window.location.protocol.startsWith("http")) return false;
    const host = (window.location.hostname || "").toLowerCase();
    if (
      (host === "localhost" || host === "127.0.0.1" || host === "") &&
      !window.KOFFIA_ENABLE_LOCAL_CLOUD_SYNC
    ) {
      return false;
    }
    return true;
  },

  readLocalKey(storageKey) {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  applyRemoteData(data, updatedAt = "") {
    if (!data || typeof data !== "object") return false;
    this.isApplyingRemote = true;
    let changed = false;
    try {
      Object.entries(this.KEYS).forEach(([field, storageKey]) => {
        if (!(field in data) || data[field] == null) return;
        const nextStr = JSON.stringify(data[field]);
        if (localStorage.getItem(storageKey) !== nextStr) {
          localStorage.setItem(storageKey, nextStr);
          changed = true;
        }
      });
      if (updatedAt) this.lastUpdatedAt = updatedAt;

      if (changed) {
        if (typeof productCatalogService !== "undefined") {
          productCatalogService.productMap = null;
        }
        if (typeof customerService !== "undefined") {
          customerService.runtime = null;
        }
        if (typeof sellerService !== "undefined") {
          sellerService.cache = null;
        }
        if (typeof flashSaleService !== "undefined") {
          flashSaleService.cache = null;
        }
        if (typeof voucherService !== "undefined") {
          voucherService.cache = null;
        }
        if (typeof liveOrderActivity !== "undefined") {
          liveOrderActivity.render();
        }
        if (typeof renderOrderHistory === "function" && document.getElementById("orderHistoryList")) {
          renderOrderHistory();
        }
        if (typeof loadAllAdminData === "function" && document.getElementById("adminApp")) {
          loadAllAdminData().then(() => {
            if (typeof adminState !== "undefined") {
              if (adminState.activeTab === "overview" && typeof renderOverview === "function") renderOverview();
              if (adminState.activeTab === "flashsales" && typeof renderFlashSalesTable === "function") renderFlashSalesTable();
              if (adminState.activeTab === "vouchers" && typeof renderVouchersTable === "function") renderVouchersTable();
              if (adminState.activeTab === "users" && typeof renderUsersTable === "function") renderUsersTable();
              if (adminState.activeTab === "orders" && typeof renderOrdersTable === "function") renderOrdersTable();
            }
          });
        }
        if (typeof loadSellerData === "function" && document.getElementById("sellerLayout")) {
          loadSellerData().then(() => {
            if (typeof sellerPortalState !== "undefined") {
              if (sellerPortalState.activeTab === "overview" && typeof renderOverview === "function") renderOverview();
              if (sellerPortalState.activeTab === "products" && typeof renderProductsTable === "function") renderProductsTable();
              if (sellerPortalState.activeTab === "orders" && typeof renderOrdersTable === "function") renderOrdersTable();
              if (sellerPortalState.activeTab === "vouchers" && typeof renderVouchersTable === "function") renderVouchersTable();
            }
          });
        }
        window.dispatchEvent(new CustomEvent("koffia:cloud-synced", { detail: { updatedAt } }));
      }
    } finally {
      this.isApplyingRemote = false;
    }
    return changed;
  },

  async pull(initial = false) {
    if (!this.canUseCloudApi()) return false;
    if (this.isPushing) return false;
    try {
      const res = await fetch(`${this.endpoint}?t=${Date.now()}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return false;
      const payload = await res.json();
      if (!payload || !payload.ok || !payload.configured) {
        if (initial) this.enabled = false;
        return false;
      }
      this.enabled = true;
      if (payload.updatedAt && payload.updatedAt === this.lastUpdatedAt && !initial) {
        return false;
      }
      this.applyRemoteData(payload.data, payload.updatedAt || "");
      return true;
    } catch {
      return false;
    }
  },

  schedulePush(fieldKey) {
    if (!this.enabled || this.isApplyingRemote) return;
    if (fieldKey && this.KEYS[fieldKey]) {
      this.pendingKeys.add(fieldKey);
    }
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => this.flushPush(), 400);
  },

  async flushPush() {
    if (!this.enabled || this.isPushing || this.pendingKeys.size === 0) return;
    const keysToSend = Array.from(this.pendingKeys);
    this.pendingKeys.clear();

    const patch = {};
    keysToSend.forEach((field) => {
      const val = this.readLocalKey(this.KEYS[field]);
      if (val !== null) patch[field] = val;
    });
    if (Object.keys(patch).length === 0) return;

    this.isPushing = true;
    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ patch }),
      });
      if (res.ok) {
        const payload = await res.json();
        if (payload?.updatedAt) {
          this.lastUpdatedAt = payload.updatedAt;
        }
      }
    } catch {
      // Giữ nguyên dữ liệu localStorage nếu mất mạng tạm thời
    } finally {
      this.isPushing = false;
    }
  },

  async init() {
    if (!this.canUseCloudApi()) return;
    await this.pull(true);
    if (!this.enabled) return;

    clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      if (document.visibilityState === "visible") {
        this.pull(false);
      }
    }, 6000);
  },
};

/* ────────────────────────────────────────────────────────────
   BOOTSTRAP
   ──────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  themeManager.init();
  initNavBar();
  initAuthNav();
  cartUI.init();
  spotlightSearch.init();
  initBackToTop();
  liveOrderActivity.init();
  initScrollReveal();
  initIosLargeTitle();
  initAddToCartButtons();
  initWishlistButtons();
  initCategoryFilter();
  initMenuSort();
  initContactForm();
  initNewsletter();
  koffiaRouter.init();
  koffiaCloudSync.init();
});
