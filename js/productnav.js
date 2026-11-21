"use strict";

const PRODUCT_DETAIL_PATH = "pages/product.html";

function navigateToProductDetail(productId) {
  if (!productId) return;
  window.location.href = `${PRODUCT_DETAIL_PATH}?id=${encodeURIComponent(productId)}`;
}

function initProductCardNavigation() {
  const grid = document.querySelector(".productsGrid");
  if (!grid) return;

  grid.addEventListener("click", (event) => {
    const card = event.target.closest(".productCard[data-product-id]");
    if (!card || !grid.contains(card)) return;
    if (
      event.target.closest("[data-add-to-cart], [data-wishlist-btn], a, button")
    )
      return;
    navigateToProductDetail(card.dataset.productId);
  });

  grid.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest(".productCard[data-product-id]");
    if (!card || event.target.closest("a, button")) return;
    event.preventDefault();
    navigateToProductDetail(card.dataset.productId);
  });
}

document.addEventListener("DOMContentLoaded", initProductCardNavigation);
