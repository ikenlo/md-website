(function () {
  const header = document.querySelector(".header");
  const nav = document.getElementById("nav");
  const burger = document.getElementById("burger");
  const cta = document.getElementById("stickyCta");

  /* header */
  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 10);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* мобільне меню */
  const setMenu = (open) => {
    nav.classList.toggle("is-open", open);
    burger.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", open);
    burger.setAttribute("aria-label", open ? "Закрити меню" : "Відкрити меню");
    document.body.classList.toggle("menu-open", open);
    updateCta();
  };
  burger.addEventListener("click", () => setMenu(!nav.classList.contains("is-open")));
  nav.addEventListener("click", (e) => e.target.closest("a") && setMenu(false));
  document.addEventListener("keydown", (e) => e.key === "Escape" && setMenu(false));
  window.matchMedia("(min-width: 900px)").addEventListener("change", () => setMenu(false));

  /* sticky-кнопка запису: ховаємо на першому екрані (там є своя кнопка), у блоці запису і коли відкрите меню */
  const hidden = { hero: true, booking: false };
  function updateCta() {
    cta.classList.toggle("is-hidden", hidden.hero || hidden.booking || nav.classList.contains("is-open"));
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.target.classList.contains("hero")) hidden.hero = en.intersectionRatio > 0.35;
      else hidden.booking = en.isIntersecting;
    });
    updateCta();
  }, { threshold: [0, 0.35] });
  io.observe(document.querySelector(".hero"));
  io.observe(document.getElementById("booking"));

  document.getElementById("year").textContent = new Date().getFullYear();
})();
