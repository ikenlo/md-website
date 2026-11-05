/**
 * Контентні блоки: фото послуг, команда, прайс, відгуки, кнопки гортання.
 * Дані послуг/майстрів — з MdsApi (MDs connect), відгуки поки статичні.
 */
(function () {
  const api = window.MdsApi;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n) => Number(n).toLocaleString("uk-UA");
  const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)} год${m % 60 ? " " + (m % 60) + " хв" : ""}` : `${m} хв`);
  const book = (opts) => window.MdBooking && window.MdBooking.start(opts);

  /* ---------- фото карток послуг: показуємо перше, що реально існує ---------- */
  document.querySelectorAll(".svc[data-photo]").forEach((card) => {
    const urls = card.dataset.photo.split("|");
    (function tryNext(i) {
      if (i >= urls.length) return;
      const img = new Image();
      // img.src — абсолютна адреса (url() у CSS-змінній інакше рахувався б від папки css/)
      img.onload = () => { card.style.setProperty("--photo", `url("${img.src}")`); card.classList.add("has-photo"); };
      img.onerror = () => tryNext(i + 1);
      img.src = urls[i];
    })(0);
    card.addEventListener("click", () => book({ categoryId: card.dataset.category }));
  });

  /* ---------- коли послуги завантажились (booking.js) ---------- */
  document.addEventListener("md:data", (e) => {
    const { categories, services } = e.detail;
    // "від N грн" на картках
    document.querySelectorAll("[data-from]").forEach((el) => {
      const list = services.filter((s) => s.categoryId === el.dataset.from);
      if (list.length) el.textContent = `від ${num(Math.min(...list.map((s) => s.priceFrom)))} грн`;
    });
    renderPrices(categories, services);
  });

  /* ---------- прайс-акордеон ---------- */
  function renderPrices(categories, services) {
    const box = $("#priceAcc");
    box.innerHTML = categories.map((c, i) => {
      const list = services.filter((s) => s.categoryId === c.id);
      if (!list.length) return "";
      const items = list.map((s) => `
        <div class="price-item">
          <div class="price-item__row">
            <div><div class="price-item__name">${esc(s.name)}</div><div class="price-item__dur">${dur(s.duration)}</div></div>
            ${s.prices?.length ? "" : `<div class="price-item__val">${num(s.priceFrom)} ₴</div>`}
          </div>
          ${s.prices?.length ? `<div class="tiers">${s.prices.map((p) => `<span>${esc(p.label)}<b>${num(p.price)} ₴</b></span>`).join("")}</div>` : ""}
          <button type="button" class="price-item__book" data-service="${esc(s.id)}">Записатись →</button>
        </div>`).join("");
      return `<details${i === 0 ? " open" : ""}><summary><span>${esc(c.name)}<small>${list.length} послуг · від ${num(Math.min(...list.map((s) => s.priceFrom)))} ₴</small></span><i class="plus"></i></summary><div class="price-list">${items}</div></details>`;
    }).join("");
    box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-service]");
      if (b) book({ serviceId: b.dataset.service });
    });
  }

  /* ---------- команда ---------- */
  (async function renderTeam() {
    const box = $("#teamList");
    box.innerHTML = '<div class="skeleton"></div>'.repeat(3);
    try {
      const masters = await api.getMasters();
      box.innerHTML = masters.map((m) => `
        <article class="master">
          <div class="master__photo">${m.photo ? `<img src="${esc(m.photo)}" alt="${esc(m.name)}" loading="lazy">` : esc(m.name[0])}</div>
          <div class="master__body">
            <div class="master__name">${esc(m.name)}</div>
            <div class="master__role">${esc(m.role)}</div>
            <p class="master__about">${esc(m.about)}</p>
            <button type="button" class="btn btn--outline btn--block" data-master="${esc(m.id)}">Записатись</button>
          </div>
        </article>`).join("");
      box.addEventListener("click", (e) => {
        const b = e.target.closest("[data-master]");
        if (b) book({ master: masters.find((m) => m.id === b.dataset.master) });
      });
    } catch {
      $("#team").hidden = true;
    }
  })();

  /* ---------- відгуки (поки приклад; згодом — з Google) ---------- */
  const REVIEWS = [
    { name: "Олена К.", date: "жовтень 2026", text: "Найкраще фарбування в моєму житті! Ольга підібрала ідеальний відтінок, волосся живе і блищить." },
    { name: "Ірина", date: "вересень 2026", text: "Дуже затишно, пригостили кавою. Марина зробила стрижку саме так, як я хотіла. Тепер тільки сюди." },
    { name: "Андрій", date: "вересень 2026", text: "Записався онлайн за хвилину, прийшов — нікого не чекав. Дмитро — топ барбер." },
    { name: "Софія", date: "серпень 2026", text: "Манікюр тримається вже три тижні, жодного сколу. Рекомендую Анну!" },
  ];
  $("#reviewList").innerHTML = REVIEWS.map((r) => `
    <article class="review">
      <div class="review__head"><div class="avatar">${esc(r.name[0])}</div><div><div class="review__name">${esc(r.name)}</div><div class="review__meta">${esc(r.date)} · Google</div></div></div>
      <div class="stars" aria-label="5 з 5">★★★★★</div>
      <p>${esc(r.text)}</p>
    </article>`).join("");

  /* ---------- стрілки для горизонтальних списків (планшет/десктоп) ---------- */
  document.querySelectorAll("[data-scroll]").forEach((wrap) => {
    const list = document.getElementById(wrap.dataset.scroll);
    wrap.addEventListener("click", (e) => {
      const b = e.target.closest("[data-dir]");
      if (!b) return;
      const card = list.firstElementChild;
      const step = card ? card.getBoundingClientRect().width + 16 : 300;
      list.scrollBy({ left: step * +b.dataset.dir, behavior: "smooth" });
    });
  });
})();
