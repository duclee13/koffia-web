"use strict";

(function initProductImageService(global) {
  const IMAGE_SLOTS = [1, 2, 3, 4];
  const IMAGE_EXTENSIONS = [
    "webp",
    "png",
    "jpg",
    "jpeg",
    "avif",
    "jfif",
    "gif",
    "bmp",
    "svg",
  ];
  const imageListCache = new Map();
  const coverCache = new Map();
  let preferredExtension = null;

  function cleanImageDir(imageDir) {
    return String(imageDir || "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\.?\//, "")
      .replace(/\/+$/, "");
  }

  function buildBasePath(imageDir, pathPrefix = "") {
    const cleanDir = cleanImageDir(imageDir);
    if (!cleanDir) return "";
    return `${pathPrefix}${cleanDir}/`;
  }

  function probeImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(url);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  function getExtensionOrder(preferred = preferredExtension) {
    if (!preferred || !IMAGE_EXTENSIONS.includes(preferred))
      return [...IMAGE_EXTENSIONS];
    return [preferred, ...IMAGE_EXTENSIONS.filter((ext) => ext !== preferred)];
  }

  function extractExtension(url) {
    const match = String(url || "").match(/\.([a-z0-9]+)(?:[?#].*)?$/i);
    return match ? match[1].toLowerCase() : null;
  }

  async function resolveSlot(
    basePath,
    slotNumber,
    preferred = preferredExtension,
  ) {
    if (!basePath) return null;

    const names = [String(slotNumber), String(slotNumber).padStart(2, "0")];
    const extensions = getExtensionOrder(preferred);

    for (const name of names) {
      for (const extension of extensions) {
        const url = `${basePath}${name}.${extension}`;
        // Dò tuần tự để tránh tạo hàng loạt request 404 không cần thiết.
        // eslint-disable-next-line no-await-in-loop
        const found = await probeImage(url);
        if (found) {
          preferredExtension = extension;
          return found;
        }
      }
    }

    return null;
  }

  async function resolveCoverImage(product, pathPrefix = "") {
    if (!product?.imageDir) return "";
    const basePath = buildBasePath(product.imageDir, pathPrefix);
    const cacheKey = `cover::${basePath}`;
    if (coverCache.has(cacheKey)) return coverCache.get(cacheKey);

    let cover = await resolveSlot(basePath, 1);

    // Nếu thiếu file số 1 nhưng thư mục vẫn có ảnh, thử 2 → 4 làm fallback.
    if (!cover) {
      for (const slot of IMAGE_SLOTS.slice(1)) {
        // eslint-disable-next-line no-await-in-loop
        cover = await resolveSlot(basePath, slot);
        if (cover) break;
      }
    }

    const result = cover || "";
    coverCache.set(cacheKey, result);
    return result;
  }

  async function resolveProductImages(product, pathPrefix = "") {
    if (!product?.imageDir) return [];
    const basePath = buildBasePath(product.imageDir, pathPrefix);
    const cacheKey = `gallery::${basePath}`;
    if (imageListCache.has(cacheKey)) return [...imageListCache.get(cacheKey)];

    const images = [];

    // Ảnh số 1 được dò trước để lấy extension ưu tiên cho các ảnh còn lại.
    const first = await resolveSlot(basePath, 1);
    if (first) images.push(first);
    const firstExt = extractExtension(first) || preferredExtension;

    for (const slot of IMAGE_SLOTS.slice(1)) {
      // eslint-disable-next-line no-await-in-loop
      const found = await resolveSlot(basePath, slot, firstExt);
      if (found) images.push(found);
    }

    // Trường hợp hiếm: file 1.* bị thiếu nhưng 2.* ... tồn tại.
    if (images.length === 0) {
      for (const slot of IMAGE_SLOTS.slice(1)) {
        // eslint-disable-next-line no-await-in-loop
        const found = await resolveSlot(basePath, slot);
        if (found) images.push(found);
      }
    }

    // Yêu cầu của project: nếu chỉ có 1 ảnh, dùng lại ảnh đó để đủ 2 slide.
    if (images.length === 1) images.push(images[0]);

    imageListCache.set(cacheKey, [...images]);
    if (images[0]) coverCache.set(`cover::${basePath}`, images[0]);
    return [...images];
  }

  global.productImageService = Object.freeze({
    resolveCoverImage,
    resolveProductImages,
    supportedExtensions: [...IMAGE_EXTENSIONS],
  });
})(window);
