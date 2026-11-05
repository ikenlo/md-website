/**
 * Онлайн-запис: Послуга → Майстер → Дата і час → Контакти.
 * Дані — через window.MdsApi (mock або MDs connect).
 * Зовнішній виклик: MdBooking.start({ categoryId?, serviceId?, master? })
 */
(function () {
  const api = window.MdsApi;
  const cfg = window.MD_CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, props = {}, html) => { const n = Object.assign(document.createElement(tag), props); if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const num = (n) => Number(n).toLocaleString("uk-UA");
  const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)} год${m % 60 ? " " + (m % 60) + " хв" : ""}` : `${m} хв`);
  const fmtDate = (s) => new Date(s + "T12:00:00").toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" });
  const loader = '<div class="loader"><i></i><i></i><i></i></div>';
  const TITLES = { 1: "Оберіть послугу", 2: "Оберіть майстра", 3: "Оберіть дату і час", 4: "Підтвердіть запис" };

  const state = {
    step: 1, categories: [], services: [], masters: [], allMasters: [],
    categoryId: null, service: null, master: null, presetMaster: null,
    month: null, days: {}, date: null, time: null, slotMasterId: null,
  };
  const card = $(".booking__card");

  /* ---------- статус підключення ---------- */
  const status = $("#apiStatus");
  const setStatus = (t, cls = "") => { status.textContent = t; status.className = "api-status " + cls; };
  setStatus(api.mode === "api" ? "Розклад MDs connect" : "Демо-режим", api.mode === "api" ? "" : "is-mock");

  /* ---------- кроки ---------- */
  function go(step, { scroll = true } = {}) {
    state.step = step;
    document.querySelectorAll(".step-pane").forEach((p) => p.classList.toggle("is-active", p.dataset.pane == step));
    document.querySelectorAll("#steps li").forEach((li) => {
      const n = +li.dataset.step;
      li.classList.toggle("is-active", n === step);
      li.classList.toggle("is-done", step === "done" || n < step);
    });
    $("#stepTitle").innerHTML = step === "done" ? "" : `<small>Крок ${step} / 4</small>${TITLES[step]}`;
    $("#stepTitle").hidden = step === "done";
    $("#backBtn").hidden = !(step > 1 && step !== "done");
    // на телефоні після переходу показуємо верх картки
    if (scroll) {
      const top = card.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.6) card.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  $("#steps").addEventListener("click", (e) => {
    const li = e.target.closest("li.is-done");
    if (li && state.step !== "done") go(+li.dataset.step);
  });
  $("#backBtn").addEventListener("click", () => {
    // якщо майстра обрано заздалегідь — крок 2 пропускаємо
    go(state.step === 3 && state.presetMaster ? 1 : state.step - 1);
  });

  /* ---------- обраний заздалегідь майстер ---------- */
  function renderPreset() {
    const box = $("#presetMaster");
    const m = state.presetMaster;
    box.hidden = !m;
    if (!m) return;
    box.innerHTML = `<div class="avatar">${m.photo ? `<img src="${esc(m.photo)}" alt="">` : esc(m.name[0])}</div><span>Майстер: <b>${esc(m.name)}</b></span><button type="button">Змінити</button>`;
    box.querySelector("button").onclick = () => { state.presetMaster = null; renderPreset(); renderCategories(); renderServices(); go(1); };
  }

  /* ---------- крок 1: послуги ---------- */
  const visibleServices = () => state.services.filter((s) => !state.presetMaster || state.presetMaster.serviceIds?.includes(s.id));
  function renderCategories() {
    const box = $("#categoryChips");
    const avail = new Set(visibleServices().map((s) => s.categoryId));
    box.innerHTML = "";
    [{ id: null, name: "Усі" }, ...state.categories.filter((c) => avail.has(c.id))].forEach((c) => {
      const b = el("button", { className: "chip" + (state.categoryId === c.id ? " is-active" : ""), type: "button", textContent: c.name });
      b.onclick = () => { state.categoryId = c.id; renderCategories(); renderServices(); };
      box.append(b);
    });
    // гортаємо лише рядок чипів (не всю сторінку), щоб активна категорія була видна
    const act = box.querySelector(".is-active");
    if (act) box.scrollLeft = act.offsetLeft - (box.clientWidth - act.offsetWidth) / 2;
  }
  function renderServices() {
    const box = $("#serviceList");
    box.innerHTML = "";
    visibleServices().filter((s) => !state.categoryId || s.categoryId === state.categoryId).forEach((s) => {
      const b = el("button", { type: "button", className: "option" + (state.service?.id === s.id ? " is-selected" : "") },
        `<div class="option__main"><div class="option__title">${esc(s.name)}</div><div class="option__meta">${dur(s.duration)}</div></div>
         <div class="option__price">від ${num(s.priceFrom)} ₴</div>`);
      b.onclick = () => selectService(s);
      box.append(b);
    });
  }
  async function selectService(s) {
    state.service = s; state.date = null; state.time = null;
    renderServices();
    if (state.presetMaster) {
      state.masters = [state.presetMaster];
      return selectMaster(state.presetMaster);
    }
    state.master = null;
    go(2);
    const box = $("#masterList");
    box.innerHTML = loader;
    try { state.masters = await api.getMasters(s.id); renderMasters(); }
    catch (e) { box.innerHTML = `<p class="form__error">${esc(e.message)}</p>`; }
  }

  /* ---------- крок 2: майстри ---------- */
  function renderMasters() {
    const box = $("#masterList");
    box.innerHTML = "";
    const any = el("button", { type: "button", className: "option" },
      `<div class="avatar avatar--any">✦</div><div class="option__main"><div class="option__title">Будь-який майстер</div><div class="option__meta">Найбільше вільного часу</div></div>`);
    any.onclick = () => selectMaster(null);
    box.append(any);
    state.masters.forEach((m) => {
      const b = el("button", { type: "button", className: "option" },
        `<div class="avatar">${m.photo ? `<img src="${esc(m.photo)}" alt="">` : esc(m.name[0])}</div>
         <div class="option__main"><div class="option__title">${esc(m.name)}</div><div class="option__meta">${esc(m.role)}</div></div>`);
      b.onclick = () => selectMaster(m);
      box.append(b);
    });
  }
  function selectMaster(m) {
    state.master = m; state.date = null; state.time = null; state.days = {};
    const t = new Date(); state.month = new Date(t.getFullYear(), t.getMonth(), 1);
    go(3);
    $("#slotsTitle").textContent = "Оберіть дату";
    $("#slotsGrid").innerHTML = "";
    renderCalendar(true);
  }

  /* ---------- крок 3: календар і слоти ---------- */
  async function renderCalendar(autoPick) {
    const box = $("#calendar");
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const last = new Date(today); last.setDate(last.getDate() + cfg.daysAhead);
    const y = state.month.getFullYear(), mo = state.month.getMonth();
    const first = new Date(y, mo, 1), end = new Date(y, mo + 1, 0);
    const prevOk = first > today, nextOk = new Date(y, mo + 1, 1) <= last;

    box.innerHTML = `
      <div class="cal__head">
        <button class="cal__btn" type="button" data-nav="-1" ${prevOk ? "" : "disabled"} aria-label="Попередній місяць">‹</button>
        <span class="cal__title">${first.toLocaleDateString("uk-UA", { month: "long", year: "numeric" })}</span>
        <button class="cal__btn" type="button" data-nav="1" ${nextOk ? "" : "disabled"} aria-label="Наступний місяць">›</button>
      </div>
      <div class="cal__grid">${["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].map((d) => `<span class="cal__dow">${d}</span>`).join("")}</div>`;
    box.querySelectorAll("[data-nav]").forEach((b) => (b.onclick = () => { state.month = new Date(y, mo + +b.dataset.nav, 1); renderCalendar(); }));

    const grid = box.querySelector(".cal__grid");
    for (let i = 0; i < (first.getDay() + 6) % 7; i++) grid.append(el("span"));
    const buttons = [];
    for (let d = 1; d <= end.getDate(); d++) {
      const date = new Date(y, mo, d), key = ymd(date);
      const b = el("button", { type: "button", className: "cal__day", textContent: d, disabled: true });
      b.dataset.date = key;
      b.dataset.out = date < today || date > last ? "1" : "";
      if (+date === +today) b.classList.add("is-today");
      if (key === state.date) b.classList.add("is-selected");
      b.onclick = () => selectDate(key, true);
      grid.append(b); buttons.push(b);
    }

    const from = ymd(first < today ? today : first), to = ymd(end > last ? last : end);
    if (from > to) return;
    try {
      const days = await api.getDays({ serviceId: state.service.id, masterId: state.master?.id, from, to });
      days.forEach((d) => (state.days[d.date] = d.freeSlots));
    } catch (e) { setStatus(e.message, "is-error"); }
    if (state.month.getMonth() !== mo || state.step !== 3) return;
    buttons.forEach((b) => {
      if (b.dataset.out) return;
      const free = state.days[b.dataset.date];
      b.disabled = !free;
      b.classList.toggle("has-free", free > 0);
      b.classList.toggle("is-full", free === 0);
      b.setAttribute("aria-label", `${b.dataset.date}: ${free ? "вільних віконець " + free : "немає вільного часу"}`);
    });
    // одразу показуємо найближчий вільний день — менше тапів на телефоні
    if (autoPick && !state.date) {
      const firstFree = buttons.find((b) => !b.disabled);
      if (firstFree) selectDate(firstFree.dataset.date, false);
    }
  }

  async function selectDate(date, userAction) {
    state.date = date; state.time = null;
    document.querySelectorAll(".cal__day").forEach((b) => b.classList.toggle("is-selected", b.dataset.date === date));
    $("#slotsTitle").textContent = fmtDate(date);
    const box = $("#slotsGrid");
    box.innerHTML = loader;
    if (userAction && window.innerWidth < 900) $("#slots").scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      const slots = await api.getSlots({ serviceId: state.service.id, masterId: state.master?.id, date });
      if (state.date !== date) return;
      box.innerHTML = "";
      if (!slots.some((s) => s.available)) box.innerHTML = '<p class="slots__empty">У цей день немає вільного часу — оберіть інший.</p>';
      slots.forEach((s) => {
        const b = el("button", { type: "button", className: "slot", textContent: s.time, disabled: !s.available });
        b.setAttribute("aria-label", `${s.time} — ${s.available ? "вільно" : "зайнято"}`);
        b.onclick = () => { state.time = s.time; state.slotMasterId = s.masterId || state.master?.id; toConfirm(); };
        box.append(b);
      });
    } catch (e) { box.innerHTML = `<p class="slots__empty form__error">${esc(e.message)}</p>`; }
  }

  /* ---------- крок 4: підтвердження ---------- */
  const masterOfSlot = () => state.master || state.masters.find((x) => x.id === state.slotMasterId);
  function priceText() {
    const s = state.service;
    const v = s.prices?.find((p) => p.id === $("#variantSelect").value);
    return v ? `${num(v.price)} ₴` : `від ${num(s.priceFrom)} ₴`;
  }
  function renderSummary() {
    const m = masterOfSlot();
    $("#summary").innerHTML = `<dl>
      <dt>Послуга</dt><dd>${esc(state.service.name)}</dd>
      <dt>Майстер</dt><dd>${esc(m ? m.name : "Будь-який")}</dd>
      <dt>Дата</dt><dd>${fmtDate(state.date)}</dd>
      <dt>Час</dt><dd>${state.time} · ${dur(state.service.duration)}</dd>
      <dt class="total">Вартість</dt><dd class="total">${priceText()}</dd></dl>`;
  }
  function toConfirm() {
    const s = state.service;
    const sel = $("#variantSelect");
    $("#variantField").hidden = !s.prices?.length;
    sel.innerHTML = (s.prices || []).map((p) => `<option value="${esc(p.id)}">${esc(p.label)} — ${num(p.price)} ₴</option>`).join("");
    renderSummary();
    $("#formError").textContent = "";
    go(4);
  }
  $("#variantSelect").addEventListener("change", renderSummary);

  const form = $("#bookingForm");
  const phoneOk = (v) => v.replace(/\D/g, "").length >= 10;
  ["name", "phone"].forEach((n) => form[n].addEventListener("input", () => form[n].classList.remove("is-invalid")));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#formError");
    const name = form.name.value.trim(), phone = form.phone.value.trim();
    form.name.classList.toggle("is-invalid", !name);
    form.phone.classList.toggle("is-invalid", !phoneOk(phone));
    if (!name || !phoneOk(phone)) return (err.textContent = "Вкажіть ім'я та коректний номер телефону");
    if (!form.agree.checked) return (err.textContent = "Потрібна згода на обробку даних");

    const btn = $("#submitBtn");
    btn.disabled = true; btn.textContent = "Записуємо…"; err.textContent = "";
    try {
      const res = await api.createBooking({
        salonId: cfg.salonId,
        serviceId: state.service.id,
        variantId: state.service.prices?.length ? form.variant.value : undefined,
        masterId: state.slotMasterId,
        date: state.date, time: state.time,
        client: { name, phone, comment: form.comment.value.trim() },
        source: "website",
      });
      const m = masterOfSlot();
      $("#successText").innerHTML = `${esc(state.service.name)}${m ? ", майстер " + esc(m.name) : ""}<br><b>${fmtDate(state.date)}, ${state.time}</b><br>Номер запису: ${esc(res.id)}.<br>Ми зателефонуємо для підтвердження.`;
      form.reset();
      go("done");
    } catch (ex) {
      err.textContent = ex.message;
      if (ex.code === "SLOT_TAKEN" || ex.status === 409) {
        go(3); renderCalendar(); selectDate(state.date, false);
        $("#slotsTitle").textContent = "Цей час щойно зайняли — оберіть інший";
      }
    } finally {
      btn.disabled = false; btn.textContent = "Підтвердити запис";
    }
  });

  $("#restartBtn").addEventListener("click", () => start({}));

  /* ---------- публічний вхід ---------- */
  function start({ categoryId = null, serviceId = null, master } = {}) {
    state.presetMaster = master || null;
    Object.assign(state, { categoryId, service: null, master: null, date: null, time: null });
    renderPreset(); renderCategories(); renderServices();
    go(1, { scroll: false });
    $("#booking").scrollIntoView({ behavior: "smooth" });
    if (serviceId) {
      const s = state.services.find((x) => x.id === serviceId);
      if (s) { state.categoryId = s.categoryId; renderCategories(); selectService(s); }
    }
  }
  window.MdBooking = { start };

  /* ---------- init ---------- */
  (async function init() {
    go(1, { scroll: false });
    $("#serviceList").innerHTML = loader;
    try {
      [state.categories, state.services] = await Promise.all([api.getCategories(), api.getServices()]);
      renderCategories(); renderServices();
      document.dispatchEvent(new CustomEvent("md:data", { detail: { categories: state.categories, services: state.services } }));
    } catch {
      setStatus("Немає зв'язку з розкладом", "is-error");
      $("#serviceList").innerHTML = `<p class="slots__empty">Не вдалося завантажити послуги. Зателефонуйте нам: <a class="gold" href="tel:+380971234567">+38 (097) 123 45 67</a></p>`;
    }
  })();
})();
