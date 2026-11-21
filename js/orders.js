"use strict";

const ordersUiState = {
  filter: "all",
  query: "",
  controlsWired: false,
};

function historyEscape(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function historyNormalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

function historyFormatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Không rõ thời gian";
  return date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function historyItemCount(order) {
  return (order.items || []).reduce(
    (sum, item) => sum + (Number(item.qty) || 0),
    0,
  );
}

function isOrderActiveStatus(status) {
  return status === "new" || status === "preparing" || status === "delivering";
}

function renderHistoryStats(orders) {
  const countEl = document.getElementById("historyOrderCount");
  const totalEl = document.getElementById("historyOrderValue");
  const recentEl = document.getElementById("historyRecentOrder");
  const validOrders = orders.filter((o) => o.status !== "cancelled");
  if (countEl) countEl.textContent = String(orders.length);
  if (totalEl)
    totalEl.textContent = formatPrice(
      validOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0),
    );
  if (recentEl) recentEl.textContent = orders[0]?.id || "—";

  const counts = {
    all: orders.length,
    active: orders.filter((o) => isOrderActiveStatus(o.status)).length,
    completed: orders.filter((o) => o.status === "completed").length,
    cancelled: orders.filter((o) => o.status === "cancelled").length,
  };
  Object.entries(counts).forEach(([key, val]) => {
    const badge = document.querySelector(`[data-count-for="${key}"]`);
    if (badge) badge.textContent = String(val);
  });
}

function renderViewerContext() {
  const user = customerService.getCurrentUser();
  const text = document.getElementById("historyViewerText");
  const accountLink = document.getElementById("historyAccountLink");
  if (!text) return;

  if (user) {
    text.innerHTML = `Đang hiển thị các đơn được đặt bằng tài khoản <strong>@${historyEscape(user.username || user.email || "Koffia")}</strong>.`;
    if (accountLink) {
      accountLink.href = "account.html";
      accountLink.innerHTML =
        '<i class="fa-regular fa-circle-user"></i> Tài khoản của tôi';
    }
  } else {
    text.innerHTML =
      "Vui lòng đăng nhập để xem lịch sử đơn hàng của tài khoản.";
    if (accountLink) {
      accountLink.href = getAuthPageUrl("login");
      accountLink.innerHTML =
        '<i class="fa-solid fa-right-to-bracket"></i> Đăng nhập';
    }
  }
}

function buildOrderProgressStepper(order) {
  if (order.status === "cancelled") return "";

  const steps = [
    { key: "new", label: "Đã nhận", icon: "fa-receipt" },
    { key: "preparing", label: "Pha chế", icon: "fa-mug-hot" },
    { key: "delivering", label: "Đang giao", icon: "fa-motorcycle" },
    { key: "completed", label: "Hoàn tất", icon: "fa-circle-check" },
  ];
  const info =
    typeof orderHistoryService.getProgressInfo === "function"
      ? orderHistoryService.getProgressInfo(order)
      : { stepIndex: 0, etaLabel: "" };
  const currentIdx = Math.max(0, info.stepIndex);
  const isLive = isOrderActiveStatus(order.status);

  return `
    <div class="orderProgressBox${isLive ? " isLive" : " isDone"}" aria-label="Tiến trình giao hàng">
      <div class="orderProgressTop">
        <span class="orderProgressHeadline">
          ${isLive ? '<span class="orderLivePulse" aria-hidden="true"></span>' : '<i class="fa-solid fa-circle-check" aria-hidden="true"></i>'}
          ${historyEscape(info.title || "Đang xử lý đơn hàng")}
        </span>
        <span class="orderProgressEta">${historyEscape(info.etaLabel || "")}</span>
      </div>
      <div class="orderProgressStepper">
        ${steps
          .map((step, idx) => {
            const isDone = idx < currentIdx || order.status === "completed";
            const isCurrent = idx === currentIdx && order.status !== "completed";
            const cls = isDone ? "isDone" : isCurrent ? "isCurrent" : "";
            return `
              <div class="orderStepItem ${cls}">
                <span class="orderStepDot" aria-hidden="true">
                  <i class="fa-solid ${isDone ? "fa-check" : step.icon}"></i>
                </span>
                <span class="orderStepLabel">${step.label}</span>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function getOrderItemBaseId(item) {
  if (!item) return "";
  if (item.productId) return String(item.productId);
  return String(item.id || "").split("::")[0];
}

function buildOrderItems(order) {
  const isCompleted = order.status === "completed";
  return (order.items || [])
    .map((item, index) => {
      const baseId = getOrderItemBaseId(item);
      return `
    <div class="historyItem">
      <img class="historyItemImg" src="${historyEscape(item.img || defaultProductImageDataUri)}"
           alt="${historyEscape(item.name)}"
           data-history-order="${historyEscape(order.id)}"
           data-history-index="${index}"
           loading="lazy" />
      <div class="historyItemInfo">
        <h4>${historyEscape(item.name)}</h4>
        <p>${formatPrice(item.price)} × ${Number(item.qty) || 1}</p>
        ${item.note ? `<div class="historyItemNote"><i class="fa-regular fa-note-sticky" aria-hidden="true"></i> ${historyEscape(item.note)}</div>` : ""}
        ${
          isCompleted && baseId
            ? `<a href="product.html?id=${encodeURIComponent(baseId)}#productReviewsSection" class="historyItemReviewLink"><i class="fa-regular fa-star" aria-hidden="true"></i> Viết đánh giá</a>`
            : ""
        }
      </div>
      <strong>${formatPrice((Number(item.price) || 0) * (Number(item.qty) || 1))}</strong>
    </div>
  `;
    })
    .join("");
}

function buildOrderCard(order) {
  const status = orderHistoryService.getStatusMeta(order.status);
  const itemCount = historyItemCount(order);
  const canCancel = order.status === "new";
  const firstBaseId =
    order.status === "completed" && order.items?.length
      ? getOrderItemBaseId(order.items[0])
      : "";
  return `
    <article class="historyOrderCard" data-order-id="${historyEscape(order.id)}">
      <header class="historyOrderHeader">
        <div>
          <div class="historyOrderCode"><i class="fa-solid fa-receipt"></i> ${historyEscape(order.id)}</div>
          <div class="historyOrderDate">${historyFormatDate(order.createdAt)}</div>
        </div>
        <span class="historyStatus ${status.className}">${historyEscape(status.label)}</span>
      </header>

      ${buildOrderProgressStepper(order)}

      <div class="historyOrderSummary">
        <div><span>Sản phẩm</span><strong>${itemCount} món</strong></div>
        ${order.deliverySchedule?.mode === "scheduled" && order.deliverySchedule?.fullLabel ? `<div><span>Hẹn giờ giao</span><strong style="color: var(--colorAccent)">${historyEscape(order.deliverySchedule.fullLabel)}</strong></div>` : ""}
        ${order.voucher ? `<div><span>Voucher</span><strong style="color: #2e7d32">-${formatPrice(order.voucher.discount)} (${historyEscape(order.voucher.code)})</strong></div>` : ""}
        <div><span>Thanh toán</span><strong>${historyEscape(order.paymentMethod)}</strong></div>
        <div><span>Tổng tiền</span><strong class="historyTotal">${formatPrice(order.total)}</strong></div>
      </div>

      <div class="historyOrderActions">
        <button type="button" class="btnSecondary btnOrderReorder" data-reorder-id="${historyEscape(order.id)}">
          <i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Đặt lại đơn này
        </button>
        ${
          firstBaseId
            ? `<a href="product.html?id=${encodeURIComponent(firstBaseId)}#productReviewsSection" class="btnSecondary btnOrderReview">
                 <i class="fa-regular fa-star" aria-hidden="true"></i> Đánh giá món
               </a>`
            : ""
        }
        ${
          canCancel
            ? `<button type="button" class="btnOrderCancel" data-cancel-order-id="${historyEscape(order.id)}">
                 <i class="fa-solid fa-xmark" aria-hidden="true"></i> Hủy đơn
               </button>`
            : ""
        }
      </div>

      <details class="historyDetails">
        <summary>Xem chi tiết đơn hàng <i class="fa-solid fa-chevron-down"></i></summary>
        <div class="historyDetailsBody">
          <section>
            <h3><i class="fa-solid fa-mug-hot"></i> Món đã đặt</h3>
            <div class="historyItemList">${buildOrderItems(order)}</div>
          </section>
          <section class="historyDelivery">
            <h3><i class="fa-solid fa-location-dot"></i> Thông tin nhận hàng</h3>
            <dl>
              <div><dt>Người nhận</dt><dd>${historyEscape(order.customer?.name || "—")}</dd></div>
              <div><dt>Số điện thoại</dt><dd>${historyEscape(order.customer?.phone || "—")}</dd></div>
              <div><dt>Địa chỉ</dt><dd>${historyEscape(order.customer?.address || "—")}</dd></div>
              ${order.customer?.note ? `<div><dt>Ghi chú</dt><dd>${historyEscape(order.customer.note)}</dd></div>` : ""}
            </dl>
          </section>
        </div>
      </details>
    </article>
  `;
}

async function hydrateHistoryImages(orders) {
  if (
    typeof productImageService === "undefined" ||
    typeof productCatalogService === "undefined"
  )
    return;
  const nodes = [
    ...document.querySelectorAll(".historyItemImg[data-history-order]"),
  ];

  await Promise.all(
    nodes.map(async (img) => {
      const order = orders.find(
        (entry) => entry.id === img.dataset.historyOrder,
      );
      const item = order?.items?.[Number(img.dataset.historyIndex)];
      if (!item) return;
      const cover = await productCatalogService.resolveItemCover(item);
      if (cover && img.isConnected)
        img.src = new URL(cover, window.location.href).href;
    }),
  );

  nodes.forEach((img) => {
    img.addEventListener(
      "error",
      () => {
        img.src = defaultProductImageDataUri;
      },
      { once: true },
    );
  });
}

function wireOrderHistoryControls() {
  const pills = [...document.querySelectorAll("[data-order-filter]")];
  const searchInput = document.getElementById("historySearchInput");
  const clearBtn = document.getElementById("historySearchClearBtn");

  pills.forEach((pill) => {
    if (pill.dataset.wired === "1") return;
    pill.dataset.wired = "1";
    pill.addEventListener("click", () => {
      ordersUiState.filter = pill.dataset.orderFilter || "all";
      pills.forEach((p) => {
        const active = p === pill;
        p.classList.toggle("isActive", active);
        p.setAttribute("aria-selected", active ? "true" : "false");
      });
      renderOrderHistory();
    });
  });

  if (searchInput && searchInput.dataset.wired !== "1") {
    searchInput.dataset.wired = "1";
    searchInput.value = ordersUiState.query || "";
    if (clearBtn) clearBtn.hidden = searchInput.value.length === 0;

    searchInput.addEventListener("input", () => {
      ordersUiState.query = searchInput.value;
      if (clearBtn) clearBtn.hidden = searchInput.value.length === 0;
      renderOrderHistory();
    });
  }

  if (clearBtn && clearBtn.dataset.wired !== "1") {
    clearBtn.dataset.wired = "1";
    clearBtn.addEventListener("click", () => {
      ordersUiState.query = "";
      if (searchInput) {
        searchInput.value = "";
        searchInput.focus();
      }
      clearBtn.hidden = true;
      renderOrderHistory();
    });
  }
}

function wireOrderCardActions(orders) {
  const list = document.getElementById("historyOrderList");
  if (!list) return;

  list.querySelectorAll("[data-reorder-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const order = orders.find((o) => o.id === btn.dataset.reorderId);
      if (!order || !order.items?.length) return;
      const addedQty =
        typeof cartState.addItemsBatch === "function"
          ? cartState.addItemsBatch(order.items)
          : order.items.reduce(
              (sum, it) =>
                sum + (cartState.addItem(it, it.qty || 1) ? it.qty || 1 : 0),
              0,
            );
      if (addedQty > 0 && typeof showToast === "function") {
        showToast(
          `Đã thêm ${addedQty} món từ đơn ${order.id} vào giỏ!`,
          "success",
          4200,
          {
            actionLabel: "Xem giỏ hàng",
            onAction: () => {
              const cartUrl = new URL("cart.html", window.location.href).href;
              if (
                typeof koffiaRouter !== "undefined" &&
                typeof koffiaRouter.navigate === "function"
              ) {
                koffiaRouter.navigate(cartUrl);
              } else {
                window.location.href = cartUrl;
              }
            },
          },
        );
      }
    });
  });

  // Hủy đơn 2 chạm gọn gàng không cần popup window.confirm
  list.querySelectorAll("[data-cancel-order-id]").forEach((btn) => {
    let confirmTimer = null;
    btn.addEventListener("click", () => {
      const orderId = btn.dataset.cancelOrderId;
      if (!orderId) return;

      if (btn.dataset.confirming !== "1") {
        btn.dataset.confirming = "1";
        btn.classList.add("isConfirming");
        btn.innerHTML =
          '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Xác nhận hủy?';
        clearTimeout(confirmTimer);
        confirmTimer = setTimeout(() => {
          btn.dataset.confirming = "0";
          btn.classList.remove("isConfirming");
          btn.innerHTML =
            '<i class="fa-solid fa-xmark" aria-hidden="true"></i> Hủy đơn';
        }, 3500);
        return;
      }

      clearTimeout(confirmTimer);
      orderHistoryService.updateStatus(orderId, "cancelled");
      if (typeof showToast === "function") {
        showToast(`Đã hủy đơn hàng ${orderId}.`, "success", 2800);
      }
      renderOrderHistory();
    });
  });
}

function renderOrderHistory() {
  if (typeof orderHistoryService.syncLiveStatuses === "function") {
    orderHistoryService.syncLiveStatuses();
  }
  renderViewerContext();
  wireOrderHistoryControls();

  const list = document.getElementById("historyOrderList");
  const empty = document.getElementById("historyEmpty");
  const allOrders = orderHistoryService
    .getForCurrentViewer()
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  renderHistoryStats(allOrders);
  if (!list || !empty) return;

  // Giữ trạng thái <details open> của người dùng khi live-sync re-render
  const openIds = new Set(
    [...list.querySelectorAll(".historyOrderCard")]
      .filter((card) => card.querySelector(".historyDetails[open]"))
      .map((card) => card.dataset.orderId),
  );

  let filtered = allOrders;
  if (ordersUiState.filter === "active") {
    filtered = filtered.filter((o) => isOrderActiveStatus(o.status));
  } else if (ordersUiState.filter === "completed") {
    filtered = filtered.filter((o) => o.status === "completed");
  } else if (ordersUiState.filter === "cancelled") {
    filtered = filtered.filter((o) => o.status === "cancelled");
  }

  const normQuery = historyNormalize(ordersUiState.query);
  if (normQuery) {
    filtered = filtered.filter((o) => {
      const itemsText = (o.items || []).map((i) => i.name || "").join(" ");
      return historyNormalize(`${o.id} ${itemsText}`).includes(normQuery);
    });
  }

  if (!filtered.length) {
    list.innerHTML = "";
    empty.hidden = false;
    const emptyTitle = empty.querySelector("h2");
    const emptyDesc = empty.querySelector("p");
    if (allOrders.length > 0) {
      if (emptyTitle) emptyTitle.textContent = "Không có đơn hàng phù hợp";
      if (emptyDesc)
        emptyDesc.textContent =
          "Thử đổi bộ lọc trạng thái hoặc xóa từ khóa tìm kiếm để xem các đơn khác.";
    } else {
      if (emptyTitle) emptyTitle.textContent = "Chưa có đơn hàng nào";
      if (emptyDesc)
        emptyDesc.textContent =
          "Đơn hàng sau khi xác nhận sẽ được lưu lại tại đây để bạn có thể xem lại.";
    }
    return;
  }

  empty.hidden = true;
  list.innerHTML = filtered.map(buildOrderCard).join("");
  openIds.forEach((id) => {
    const card = list.querySelector(`.historyOrderCard[data-order-id="${CSS.escape(id)}"]`);
    card?.querySelector(".historyDetails")?.setAttribute("open", "");
  });
  wireOrderCardActions(filtered);
  hydrateHistoryImages(filtered);
}

document.addEventListener("DOMContentLoaded", () => {
  if (!customerService.getCurrentUser()) {
    requireAuthenticatedUser("xem lịch sử đơn hàng");
    return;
  }
  renderOrderHistory();
});

if (!window._ordersPageLiveBound) {
  window._ordersPageLiveBound = true;
  window.addEventListener("koffia:orders-changed", () => {
    if (document.getElementById("historyOrderList")) {
      renderOrderHistory();
    }
  });
}
