document.addEventListener("DOMContentLoaded", function () {
  var menuButton = document.querySelector(".menu-toggle");
  var navigation = document.querySelector("#primary-nav");

  if (menuButton && navigation) {
    menuButton.addEventListener("click", function () {
      var isExpanded = menuButton.getAttribute("aria-expanded") === "true";
      menuButton.setAttribute("aria-expanded", String(!isExpanded));
      navigation.classList.toggle("is-open", !isExpanded);
    });
  }
});
