const header = document.querySelector(".site-header");
const menuButton = document.querySelector(".menu-button");
const navLinks = [...document.querySelectorAll(".main-nav a")];

if (window.lucide) {
  window.lucide.createIcons();
}

menuButton?.addEventListener("click", () => {
  const open = header.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
});

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    header.classList.remove("open");
    menuButton?.setAttribute("aria-expanded", "false");
  });
});

const trackedSections = [...document.querySelectorAll("main section[id], header[id]")];

const updateActiveNavigation = () => {
  const current = trackedSections
    .filter((section) => section.getBoundingClientRect().top <= 140)
    .at(-1)?.id;

  navLinks.forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${current || "inicio"}`);
  });
};

window.addEventListener("scroll", updateActiveNavigation, { passive: true });
updateActiveNavigation();
