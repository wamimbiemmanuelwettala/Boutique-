// ==========================================
// CONFIGURATION
// ==========================================
const WEB_APP_URL = "/api/gas";
const MTN_MERCHANT_CODE = "0786408437";
const AIRTEL_MERCHANT_CODE = "0757754559";
const BOUTIQUE_WHATSAPP = "256757754559";
const CART_STORAGE_KEY = "jireh_boutique_cart";
const ORDER_MAX_RETRIES = 3;
const ORDER_RETRY_DELAY_MS = 1500;

const CLOTHES_CATEGORIES = ["Clothes", "Dresses", "Others", "Skirts", "Jampsuits", "Pants", "Tops"];

let allProducts = [];
let filteredProducts = [];
let currentCategory = "all";
let selectedItem = "";
let selectedPrice = 0;
let cart = [];
let lastSelectedProduct = null;

// ==========================================
// 1. INIT
// ==========================================
window.addEventListener("DOMContentLoaded", () => {
    loadCartFromStorage();
    updateCartBadge();

    if (document.getElementById("product-list")) {
        fetchLiveProducts().then(() => {
            const params = new URLSearchParams(window.location.search);
            const cat = params.get("category");
            if (cat) filterByCategory(cat);
            if (window.location.hash === "#openCart") {
                setTimeout(openCart, 400);
            }
        });
    }

    const offerDismissed = localStorage.getItem("boutique_offer_dismissed");
    const offerBottomSheet = document.getElementById("offerBottomSheet");
    if (offerBottomSheet) {
        if (!offerDismissed) {
            setTimeout(() => offerBottomSheet.classList.add("active"), 2500);
        } else {
            const reopenBadge = document.getElementById("reopenOfferBadge");
            if (reopenBadge) reopenBadge.style.display = "block";
        }
    }
});

// ==========================================
// 2. FETCH & RENDER
// ==========================================
async function fetchLiveProducts() {
    const container = document.getElementById("product-list");
    const loadingEl = document.getElementById("loading");
    if (!container) return;

    try {
        let data = [];
        const response = await fetch(WEB_APP_URL);
        data = await response.json();
        data = Array.isArray(data) ? data.map(normalizeProduct);
        
        allProducts = data;
        filteredProducts = data;
        if (loadingEl) loadingEl.style.display = "none";
        renderProducts(filteredProducts);
    } catch (error) {
        console.error(error);
        if (loadingEl) loadingEl.style.display = "none";
        showToast("No Internet, Please check Your Network");
    }
}

function normalizeProduct(p) {
    return {
        Name: p.Name || p.name || "",
        Price: p.Price || p.price || 0,
        Stock_Status: p.Stock_Status || p["Stock Status"] || p.stock_status || "In Stock",
        Category: p.Category || p.category || "Collection",
        Image_URL: p.Image_URL || p["Image URL"] || p.image_url || p.Image || "",
        Size: p.Size || p.size || "",
        Color: p.Color || p.color || "",
        Pattern: p.Pattern || p.pattern || "",
        Fashion: p.Fashion || p.fashion || p.Style || p.style || ""
    };
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function renderProducts(productsList, targetId = "product-list") {
    const container = document.getElementById(targetId);
    if (!container) return;

    if (!productsList || productsList.length === 0) {
        container.innerHTML = `<div class="empty-state">No matching items found.</div>`;
        container.style.display = "block";
        return;
    }

    container.innerHTML = productsList.map((product) => {
        const isOutOfStock = product.Stock_Status && String(product.Stock_Status).toLowerCase() === "out of stock";
        const isLowStock = product.Stock_Status && String(product.Stock_Status).toLowerCase() === "low stock";
        let badgeHTML = isOutOfStock
            ? `<span class="badge badge-sold-out">Sold Out</span>`
            : isLowStock
                ? `<span class="badge badge-low-stock">Low Stock</span>`
                : `<span class="badge badge-in-stock">In Stock</span>`;

        const cleanPrice = Number(product.Price) || 0;
        const category = product.Category || "Collection";
        const imageUrl = product.Image_URL || "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=500&q=80";
        const sizeLabel = product.Size ? `<span class="meta-chip">Size: ${escapeHtml(product.Size)}</span>` : "";
        const colorLabel = product.Color ? `<span class="meta-chip">Color: ${escapeHtml(product.Color)}</span>` : "";
        const patternLabel = product.Pattern ? `<span class="meta-chip">${escapeHtml(product.Pattern)}</span>` : "";
        const productKey = encodeURIComponent(product.Name + "|" + cleanPrice);
        const safeName = escapeHtml(product.Name);

        return `
            <div class="product-card" data-key="${productKey}" onclick="onProductTap('${productKey}')">
                <div class="product-img-container">
                    <img src="${imageUrl}" alt="${safeName}" onerror="this.src='https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=500&q=80'">
                    ${badgeHTML}
                </div>
                <div class="product-info">
                    <span class="product-category">${escapeHtml(category)}</span>
                    <h3 class="product-title">${safeName}</h3>
                    <div class="product-meta">${sizeLabel}${colorLabel}${patternLabel}</div>
                    <p class="product-price">UGX ${cleanPrice.toLocaleString()}</p>
                    <div class="product-actions" onclick="event.stopPropagation()">
                        ${isOutOfStock
                            ? `<button class="order-btn out-of-stock" disabled>Sold Out</button>`
                            : `
                                <button class="order-btn" onclick="openOrderModal('${product.Name.replace(/'/g, "\\'")}', ${cleanPrice})">Order</button>
                                <button class="cart-add-btn" onclick="addToCartByKey('${productKey}')" title="Add to cart">+ Cart</button>
                              `}
                    </div>
                </div>
            </div>
        `;
    }).join("");

    container.style.display = "grid";
}

function findProductByKey(key) {
    const decoded = decodeURIComponent(key);
    const [name, priceStr] = decoded.split("|");
    const price = Number(priceStr) || 0;
    return allProducts.find((p) => p.Name === name && (Number(p.Price) || 0) === price)
        || allProducts.find((p) => p.Name === name);
}

// ==========================================
// 3. CATEGORY & SEARCH
// ==========================================
function filterByCategory(category) {
    currentCategory = category || "all";
    const searchInput = document.getElementById("searchInput");
    const query = searchInput ? searchInput.value.trim() : "";

    document.querySelectorAll(".category-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.category === currentCategory);
    });

    applyFilters(query);
    closeSimilarSection();
}

function applyFilters(query) {
    let list = allProducts.slice();

    if (currentCategory && currentCategory !== "all") {
        const catLower = currentCategory.toLowerCase();
        if (catLower === "clothes") {
            list = list.filter((p) => {
                const c = (p.Category || "").toLowerCase();
                return CLOTHES_CATEGORIES.some((cc) => c.includes(cc) || cc.includes(c));
            });
        } else if (catLower === "Others") {
            list = list.filter((p) => {
                const c = (p.Category || "").toLowerCase();
                return c.includes("Others");
            });
        } else {
            list = list.filter((p) => (p.Category || "").toLowerCase().includes(catLower));
        }
    }

    if (query) {
        const q = query.toLowerCase();
        list = list.filter((p) =>
            (p.Name && p.Name.toLowerCase().includes(q)) ||
            (p.Category && p.Category.toLowerCase().includes(q)) ||
            (p.Size && String(p.Size).toLowerCase().includes(q)) ||
            (p.Color && p.Color.toLowerCase().includes(q)) ||
            (p.Pattern && p.Pattern.toLowerCase().includes(q)) ||
            (p.Fashion && p.Fashion.toLowerCase().includes(q))
        );
    }

    filteredProducts = list;
    renderProducts(filteredProducts);
}

function searchProducts(query) {
    applyFilters(query);
}

// 4. PRODUCT DETAIL + RELATED (inside the card)
// ==========================================
function onProductTap(productKey) {
    const product = findProductByKey(productKey);
    if (!product) return;
    lastSelectedProduct = product;
    openProductDetail(product); // related items only inside this modal
}

function openProductDetail(product) {
    const modal = document.getElementById("productDetailModal");
    const title = document.getElementById("detailTitle");
    const body = document.getElementById("detailBody");
    if (!modal || !body) return;

    const cleanPrice = Number(product.Price) || 0;
    const isOutOfStock =
        product.Stock_Status &&
        String(product.Stock_Status).toLowerCase() === "out of stock";
    const imageUrl =
        product.Image_URL ||
        "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=500&q=80";
    const productKey = encodeURIComponent(product.Name + "|" + cleanPrice);

    if (title) title.textContent = product.Name;

    const related = getRelatedProducts(product, 6);
    const relatedHTML =
        related.length === 0
            ? ""
            : `
        <div class="detail-related">
            <h4 class="detail-related-title">Related items</h4>
            <p class="detail-related-hint">Similar fashion, pattern &amp; category</p>
            <div class="detail-related-grid">
                ${related
                    .map((p) => {
                        const price = Number(p.Price) || 0;
                        const key = encodeURIComponent(p.Name + "|" + price);
                        const img =
                            p.Image_URL ||
                            "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=500&q=80";
                        return `
                    <button type="button" class="detail-related-card" onclick="onProductTap('${key}')">
                        <img src="${img}" alt="${escapeHtml(p.Name)}"
                             onerror="this.src='https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=500&q=80'">
                        <span class="detail-related-name">${escapeHtml(p.Name)}</span>
                        <span class="detail-related-meta">${escapeHtml(
                            [p.Category, p.Pattern, p.Fashion]
                                .filter(Boolean)
                                .join(" · ")
                        )}</span>
                        <span class="detail-related-price">UGX ${price.toLocaleString()}</span>
                    </button>`;
                    })
                    .join("")}
            </div>
        </div>
    `;

    // IMPORTANT: relatedHTML is included at the end of the card
    body.innerHTML = `
        <div class="detail-layout">
            <img class="detail-img" src="${imageUrl}" alt="${escapeHtml(product.Name)}"
                 onerror="this.src='https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=500&q=80'">
            <div class="detail-info">
                <p class="product-category">${escapeHtml(product.Category || "")}</p>
                <p class="product-price">UGX ${cleanPrice.toLocaleString()}</p>
                <ul class="detail-attrs">
                    ${product.Size ? `<li><strong>Size:</strong> ${escapeHtml(product.Size)}</li>` : ""}
                    ${product.Color ? `<li><strong>Color:</strong> ${escapeHtml(product.Color)}</li>` : ""}
                    ${product.Pattern ? `<li><strong>Pattern:</strong> ${escapeHtml(product.Pattern)}</li>` : ""}
                    ${product.Fashion ? `<li><strong>Style:</strong> ${escapeHtml(product.Fashion)}</li>` : ""}
                    <li><strong>Stock:</strong> ${escapeHtml(product.Stock_Status || "In Stock")}</li>
                </ul>
                <div class="detail-actions">
                    ${
                        isOutOfStock
                            ? `<button class="order-btn out-of-stock" disabled>Sold Out</button>`
                            : `
                        <button class="order-btn" onclick="closeProductDetail(); openOrderModal('${product.Name.replace(
                            /'/g,
                            "\\'"
                        )}', ${cleanPrice})">Order for Pickup</button>
                        <button class="cart-add-btn" onclick="addToCartByKey('${productKey}'); showToast('Added', 'Item saved in your cart.', 'success')">Add to Cart</button>
                      `
                    }
                </div>
            </div>
        </div>
        ${relatedHTML}
    `;

    modal.style.display = "flex";
}

function closeProductDetail() {
    const modal = document.getElementById("productDetailModal");
    if (modal) modal.style.display = "none";
}

/** Related by fashion, pattern, category */
function getRelatedProducts(product, limit) {
    limit = limit || 6;
    const fashion = (product.Fashion || "").toString().toLowerCase().trim();
    const pattern = (product.Pattern || "").toString().toLowerCase().trim();
    const category = (product.Category || "").toString().toLowerCase().trim();

    return allProducts
        .filter((p) => p.Name !== product.Name)
        .map((p) => {
            let score = 0;
            const pFashion = (p.Fashion || "").toString().toLowerCase().trim();
            const pPattern = (p.Pattern || "").toString().toLowerCase().trim();
            const pCat = (p.Category || "").toString().toLowerCase().trim();

            if (fashion && pFashion) {
                if (pFashion === fashion) score += 5;
                else if (pFashion.includes(fashion) || fashion.includes(pFashion)) score += 3;
            }
            if (pattern && pPattern) {
                if (pPattern === pattern) score += 5;
                else if (pPattern.includes(pattern) || pattern.includes(pPattern)) score += 3;
            }
            if (category && pCat) {
                if (pCat === category) score += 4;
                else if (pCat.includes(category) || category.includes(pCat)) score += 2;
            }
            if (isSameGroup(category, pCat)) score += 2;

            return { product: p, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((x) => x.product);
}

function isSameGroup(catA, catB) {
    const aClothes = CLOTHES_CATEGORIES.some((c) => catA.includes(c));
    const bClothes = CLOTHES_CATEGORIES.some((c) => catB.includes(c));
    if (aClothes && bClothes) return true;
    if (catA.includes("shoe") && catB.includes("shoe")) return true;
    if (
        (catA.includes("bag") || catA.includes("accessor")) &&
        (catB.includes("bag") || catB.includes("accessor"))
    )
        return true;
    return false;
}

function closeSimilarSection() {
    const section = document.getElementById("similarSection");
    if (section) section.style.display = "none";
}

function showSimilarItems(product) {
    const section = document.getElementById("similarSection");
    const listEl = document.getElementById("similar-list");
    const hint = document.getElementById("similarHint");
    if (!section || !listEl) return;

    const size = (product.Size || "").toString().toLowerCase().trim();
    const color = (product.Color || "").toLowerCase().trim();
    const pattern = (product.Pattern || "").toLowerCase().trim();
    const fashion = (product.Fashion || "").toLowerCase().trim();
    const category = (product.Category || "").toLowerCase().trim();

    const scored = allProducts
        .filter((p) => p.Name !== product.Name)
        .map((p) => {
            let score = 0;
            const pSize = (p.Size || "").toString().toLowerCase().trim();
            const pColor = (p.Color || "").toLowerCase().trim();
            const pPattern = (p.Pattern || "").toLowerCase().trim();
            const pFashion = (p.Fashion || "").toLowerCase().trim();
            const pCat = (p.Category || "").toLowerCase().trim();

            if (size && pSize && (pSize === size || pSize.includes(size) || size.includes(pSize))) score += 3;
            if (color && pColor && (pColor === color || pColor.includes(color) || color.includes(pColor))) score += 3;
            if (fashion && pFashion) {
                if (pFashion === fashion) score += 5;
                else if (pFashion.includes(fashion) || fashion.includes(pFashion)) score += 3;
            }
            if (pattern && pPattern) {
                if (pPattern === pattern) score += 5;
                else if (pPattern.includes(pattern) || pattern.includes(pPattern)) score += 3;
            }
            if (category && pCat) {
                if (pCat === category) score += 4;
                else if (pCat.includes(category) || category.includes(pCat)) score += 2;
            }
            if (isSameGroup(category, pCat)) score += 2;
            return { product: p, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map((x) => x.product);

    if (scored.length === 0) {
        section.style.display = "none";
        return;
    }

    const parts = [];
    if (size) parts.push("size " + product.Size);
    if (color) parts.push(product.Color);
    if (pattern) parts.push(product.Pattern);
    if (hint) {
        hint.textContent = parts.length ? `Based on ${parts.join(", ")} & style` : "Matching category & style";
    }

    renderProducts(scored, "similar-list");
    section.style.display = "block";
    section.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function isSameGroup(catA, catB) {
    const aClothes = CLOTHES_CATEGORIES.some((c) => catA.includes(c));
    const bClothes = CLOTHES_CATEGORIES.some((c) => catB.includes(c));
    if (aClothes && bClothes) return true;
    if (catA.includes("Others") && catB.includes("Others")) return true;
    return false;
}

function closeSimilarSection() {
    const section = document.getElementById("similarSection");
    if (section) section.style.display = "none";
}

// ==========================================
// 5. CART
// ==========================================
function loadCartFromStorage() {
    try {
        const raw = localStorage.getItem(CART_STORAGE_KEY);
        cart = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(cart)) cart = [];
    } catch {
        cart = [];
    }
}

function saveCartToStorage() {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}

function addToCartByKey(productKey) {
    const product = findProductByKey(productKey);
    if (!product) return;
    addToCart(product);
}

function addToCart(product) {
    const cleanPrice = Number(product.Price) || 0;
    const existing = cart.find((i) => i.Name === product.Name && i.Price === cleanPrice);
    if (existing) {
        existing.qty = (existing.qty || 1) + 1;
    } else {
        cart.push({
            Name: product.Name,
            Price: cleanPrice,
            Size: product.Size || "",
            Color: product.Color || "",
            Category: product.Category || "",
            Image_URL: product.Image_URL || "",
            qty: 1
        });
    }
    saveCartToStorage();
    updateCartBadge();
    renderCartDrawer();
    showToast("Added to cart", product.Name + " saved for later.", "success");
}

function removeFromCart(index) {
    cart.splice(index, 1);
    saveCartToStorage();
    updateCartBadge();
    renderCartDrawer();
}

function changeCartQty(index, delta) {
    if (!cart[index]) return;
    cart[index].qty = Math.max(1, (cart[index].qty || 1) + delta);
    saveCartToStorage();
    updateCartBadge();
    renderCartDrawer();
}

function clearCart() {
    cart = [];
    saveCartToStorage();
    updateCartBadge();
    renderCartDrawer();
    showToast("Cart cleared", "All items removed.", "info");
}

function updateCartBadge() {
    const badge = document.getElementById("cartBadge");
    if (!badge) return;
    const totalQty = cart.reduce((sum, i) => sum + (i.qty || 1), 0);
    if (totalQty > 0) {
        badge.textContent = totalQty > 99 ? "99+" : String(totalQty);
        badge.style.display = "flex";
    } else {
        badge.style.display = "none";
    }
}

function openCart() {
    renderCartDrawer();
    const drawer = document.getElementById("cartDrawer");
    const overlay = document.getElementById("cartOverlay");
    if (drawer) {
        drawer.classList.add("open");
        drawer.setAttribute("aria-hidden", "false");
    }
    if (overlay) overlay.classList.add("open");
    document.body.style.overflow = "hidden";
}

function closeCart() {
    const drawer = document.getElementById("cartDrawer");
    const overlay = document.getElementById("cartOverlay");
    if (drawer) {
        drawer.classList.remove("open");
        drawer.setAttribute("aria-hidden", "true");
    }
    if (overlay) overlay.classList.remove("open");
    document.body.style.overflow = "";
}

function renderCartDrawer() {
    const container = document.getElementById("cartItems");
    const totalEl = document.getElementById("cartTotal");
    const checkoutBtn = document.getElementById("cartCheckoutBtn");
    if (!container) return;

    if (cart.length === 0) {
        container.innerHTML = `<p class="cart-empty">Your cart is empty. Add items to view later.</p>`;
        if (totalEl) totalEl.textContent = "UGX 0";
        if (checkoutBtn) checkoutBtn.disabled = true;
        return;
    }

    let total = 0;
    container.innerHTML = cart.map((item, idx) => {
        const line = (item.Price || 0) * (item.qty || 1);
        total += line;
        const meta = [item.Size, item.Color].filter(Boolean).join(" · ");
        return `
            <div class="cart-item">
                <div class="cart-item-info">
                    <strong>${escapeHtml(item.Name)}</strong>
                    ${meta ? `<span class="cart-item-meta">${escapeHtml(meta)}</span>` : ""}
                    <span class="cart-item-price">UGX ${line.toLocaleString()}</span>
                </div>
                <div class="cart-item-controls">
                    <button type="button" class="qty-btn" onclick="changeCartQty(${idx}, -1)">−</button>
                    <span class="qty-val">${item.qty || 1}</span>
                    <button type="button" class="qty-btn" onclick="changeCartQty(${idx}, 1)">+</button>
                    <button type="button" class="cart-remove-btn" onclick="removeFromCart(${idx})" title="Remove">&times;</button>
                </div>
            </div>
        `;
    }).join("");

    if (totalEl) totalEl.textContent = "UGX " + total.toLocaleString();
    if (checkoutBtn) checkoutBtn.disabled = false;
}

function checkoutFromCart() {
    if (cart.length === 0) return;
    const names = cart.map((i) => `${i.Name}${i.Size ? " (" + i.Size + ")" : ""} ×${i.qty || 1}`).join(", ");
    const total = cart.reduce((s, i) => s + (i.Price || 0) * (i.qty || 1), 0);
    closeCart();
    openOrderModal(names, total);
}

// ==========================================
// 6. CHECKOUT MODAL
// ==========================================
function openOrderModal(name, price) {
    selectedItem = name;
    selectedPrice = Number(price) || 0;

    const detailsContainer = document.getElementById("modalProductDetails");
    if (detailsContainer) {
        detailsContainer.innerHTML = `
            <p>Selected Item: <strong>${escapeHtml(name)}</strong></p>
            <p>Total Amount: <strong>UGX ${selectedPrice.toLocaleString()}</strong></p>
        `;
    }

    const modal = document.getElementById("orderModal");
    if (modal) modal.style.display = "flex";

    const payMethod = document.getElementById("paymentMethod");
    if (payMethod) {
        payMethod.value = "Cash on Pickup";
        togglePaymentInstructions();
    }
}

function closeModal() {
    const modal = document.getElementById("orderModal");
    if (modal) modal.style.display = "none";
    const form = document.getElementById("pickupForm");
    if (form) form.reset();
}

function togglePaymentInstructions() {
    const method = document.getElementById("paymentMethod").value;
    const instructionBox = document.getElementById("momoInstructions");
    const instructionText = document.getElementById("instructionText");
    const txnIdInput = document.getElementById("txnId");
    if (!instructionBox || !instructionText || !txnIdInput) return;

    if (method === "Cash on Pickup") {
        instructionBox.style.display = "none";
        txnIdInput.removeAttribute("required");
    } else {
        instructionBox.style.display = "block";
        txnIdInput.setAttribute("required", "true");
        if (method === "MTN MoMo Pay") {
            instructionText.innerHTML = `
                <strong>MTN Money Steps:</strong><br>
                1. Dial *165*1#<br>
                2. Enter MTN Money Number: <strong>${MTN_MERCHANT_CODE}</strong>
                <span id="copyCodeBtn" class="copy-item" onclick="copyToClipboard('${MTN_MERCHANT_CODE}', 'copyCodeBtn')">Copy Number</span><br>
                3. Amount: <strong>UGX ${selectedPrice.toLocaleString()}</strong>
                <span id="copyAmtBtn" class="copy-item" onclick="copyToClipboard('${selectedPrice}', 'copyAmtBtn')">Copy Amount</span>
            `;
        } else if (method === "Airtel Merchant") {
            instructionText.innerHTML = `
                <strong>Airtel Money Steps:</strong><br>
                1. Dial *185*1#<br>
                2. Enter Airtel Money Number: <strong>${AIRTEL_MERCHANT_CODE}</strong>
                <span id="copyCodeBtn" class="copy-item" onclick="copyToClipboard('${AIRTEL_MERCHANT_CODE}', 'copyCodeBtn')">Copy Number</span><br>
                3. Amount: <strong>UGX ${selectedPrice.toLocaleString()}</strong>
                <span id="copyAmtBtn" class="copy-item" onclick="copyToClipboard('${selectedPrice}', 'copyAmtBtn')">Copy Amount</span>
            `;
        }
    }
}

function copyToClipboard(text, elementId) {
    navigator.clipboard.writeText(String(text)).then(() => {
        const el = document.getElementById(elementId);
        if (!el) return;
        const originalText = el.innerText;
        el.innerText = "Copied!";
        el.style.backgroundColor = "var(--success)";
        el.style.color = "white";
        setTimeout(() => {
            el.innerText = originalText;
            el.style.backgroundColor = "";
            el.style.color = "";
        }, 1500);
    }).catch((err) => console.error(err));
}

// ==========================================
// 7. ORDER SUBMIT + RETRIES (one definition only)
// ==========================================
async function submitOrder(event) {
    event.preventDefault();

    const btn = document.getElementById("submitBtn");
    if (!btn) return;

    const originalBtnText = btn.innerText;
    btn.innerText = "Processing Reservation...";
    btn.disabled = true;

    const paymentMethod = document.getElementById("paymentMethod").value;
    const txnId = document.getElementById("txnId").value || "N/A";
    const custName = document.getElementById("custName").value;
    const custPhone = document.getElementById("custPhone").value;

    const orderData = {
        name: custName,
        phone: custPhone,
        item: selectedItem,
        price: selectedPrice.toString(),
        payment_method: paymentMethod,
        txn_id: txnId,
        payment_status: paymentMethod === "Cash on Pickup" ? "Unpaid (Cash)" : "Verifying (MoMo)"
    };

    try {
        const result = await postOrderWithRetry(orderData);

        if (result.status === "success") {
            showToast("Success!", "Your order is saved. Pick your items after 2 days.", "success");

            const message =
                `Hello! I just placed a boutique order via the website.\n\n` +
                `👤 Name: ${orderData.name}\n` +
                `📞 Phone: ${orderData.phone}\n` +
                `👗 Item: ${orderData.item}\n` +
                `💰 Price: UGX ${Number(orderData.price).toLocaleString()}\n` +
                `💳 Payment: ${orderData.payment_method}\n` +
                `📝 Ref/Txn ID: ${orderData.txn_id}\n`;

            if (cart.length > 0) {
                const fromCart = cart.some((i) => selectedItem.includes(i.Name));
                if (fromCart) clearCart();
            }

            closeModal();
            const instructionBox = document.getElementById("momoInstructions");
            if (instructionBox) instructionBox.style.display = "none";

            setTimeout(() => {
                window.location.href = `https://wa.me/${BOUTIQUE_WHATSAPP}?text=${encodeURIComponent(message)}`;
            }, 600);
        } else {
            const msg = result.message || "Failed to process order on backend.";
            const isBusy = /lock|timeout|too many|simultaneously|try again/i.test(msg);
            showToast(
                isBusy ? "Shop is busy" : "Error",
                isBusy ? "Many people are ordering right now. Please try again in a moment." : msg,
                "error"
            );
        }
    } catch (error) {
        showToast("Connection Error", "Could not reach the server. Check your internet and try again.", "error");
        console.error(error);
    } finally {
        btn.innerText = originalBtnText;
        btn.disabled = false;
    }
}

async function postOrderWithRetry(orderData) {
    if (!WEB_APP_URL || WEB_APP_URL === "https://script.google.com/macros/s/") {
        await delay(1200);
        return { status: "success" };
    }

    let lastError = null;

    for (let attempt = 1; attempt <= ORDER_MAX_RETRIES; attempt++) {
        try {
            if (attempt > 1) {
                btnStatus("Retrying... (" + attempt + "/" + ORDER_MAX_RETRIES + ")");
                await delay(ORDER_RETRY_DELAY_MS * attempt);
            }

            const response = await fetch(WEB_APP_URL, {
                method: "POST",
                body: JSON.stringify(orderData)
            });

            const text = await response.text();
            let result;
            try {
                result = JSON.parse(text);
            } catch {
                throw new Error("Invalid response from server");
            }

            if (result.status === "success") return result;

            const msg = (result.message || "").toString();
            const retryable = /lock|timeout|simultaneously|try again|service invoked too many/i.test(msg);
            if (!retryable || attempt === ORDER_MAX_RETRIES) return result;
            lastError = new Error(msg);
        } catch (err) {
            lastError = err;
            if (attempt === ORDER_MAX_RETRIES) throw err;
        }
    }

    throw lastError || new Error("Order failed after retries");
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function btnStatus(text) {
    const btn = document.getElementById("submitBtn");
    if (btn) btn.innerText = text;
}

// ==========================================
// 8. OFFERS + TOASTS
// ==========================================
function toggleBottomSheet() {
    const sheet = document.getElementById("offerBottomSheet");
    const badge = document.getElementById("reopenOfferBadge");
    if (sheet && badge) {
        sheet.classList.toggle("active");
        badge.style.display = sheet.classList.contains("active") ? "none" : "block";
    }
}

function closeBottomSheetPermanently() {
    const sheet = document.getElementById("offerBottomSheet");
    const badge = document.getElementById("reopenOfferBadge");
    if (sheet) sheet.classList.remove("active");
    localStorage.setItem("boutique_offer_dismissed", "true");
    if (badge) badge.style.display = "block";
}

function showToast(title, message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <strong>${title}</strong>
            <p>${message}</p>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(100px)";
        toast.style.transition = "all 0.3s ease";
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
