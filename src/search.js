(function () {
  var year = document.getElementById("year");
  var county = document.getElementById("county");
  var q = document.getElementById("q");
  var none = document.getElementById("noResults");
  var cards = Array.prototype.slice.call(document.querySelectorAll(".card"));
  if (!year || !cards.length) return;
  function apply() {
    var y = year.value, c = county.value, text = q.value.trim().toLowerCase(), shown = 0;
    cards.forEach(function (card) {
      var ok = (!y || card.dataset.year === y) && (!c || card.dataset.county === c) && (!text || card.dataset.search.indexOf(text) !== -1);
      card.hidden = !ok;
      if (ok) shown++;
    });
    none.hidden = shown > 0;
  }
  year.addEventListener("change", apply);
  county.addEventListener("change", apply);
  q.addEventListener("input", apply);
})();
