(function () {
  const header = document.querySelector(".header");
  const nav = document.getElementById("nav");
  const burger = document.getElementById("burger");

  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 40);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const setMenu = (open) => {
    nav.classList.toggle("is-open", open);
    burger.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", open);
  };
  burger.addEventListener("click", () => setMenu(!nav.classList.contains("is-open")));
  nav.addEventListener("click", (e) => e.target.closest("a") && setMenu(false));

  document.getElementById("year").textContent = new Date().getFullYear();
})();
