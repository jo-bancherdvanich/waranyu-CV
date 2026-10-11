/* Football club database — interactive entity-relationship diagram
 *
 * Draws window.FOOTBALL_SCHEMA as inline SVG you can pan and zoom, so the
 * whole 16-table model is visible at once and the attributes are readable
 * once you zoom in. A flat PNG could show one or the other, not both.
 *
 * Scroll policy: the diagram deliberately does NOT swallow the page's wheel
 * events. A bare wheel scrolls the page as usual; the diagram only zooms when
 * the user has clicked/tapped into it (it then holds focus and shows a live
 * outline) or holds Ctrl/Cmd. Touch works the same way — until the diagram is
 * activated it uses touch-action: pan-y, so a swipe still scrolls the page.
 * That keeps a full-width diagram on a phone from becoming a scroll trap.
 */
(function () {
  "use strict";

  var host = document.getElementById("erd");
  if (!host || !window.FOOTBALL_SCHEMA) return;

  var S = window.FOOTBALL_SCHEMA;
  var M = S.metrics;
  var NS = "http://www.w3.org/2000/svg";

  var MIN_SCALE = 0.4;
  var MAX_SCALE = 3;
  /* below this the boxes show a summary instead of the column list — the
     column text is unreadable at fit-to-screen size anyway */
  var DETAIL_SCALE = 0.62;

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function el(name, attrs) {
    var n = document.createElementNS(NS, name);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function text(x, y, cls, str) {
    var t = el("text", { x: x, y: y, class: cls });
    t.textContent = str;
    return t;
  }

  /* ---- shell ---------------------------------------------------------- */
  var frame = document.createElement("div");
  frame.className = "erd-frame";

  var bar = document.createElement("div");
  bar.className = "erd-bar";
  bar.innerHTML =
    '<span class="erd-legend"><i class="erd-key erd-key-pk"></i>PK<i class="erd-key erd-key-fk"></i>FK</span>' +
    '<span class="erd-zoom" aria-live="off">100%</span>' +
    '<span class="erd-btns">' +
    '<button type="button" class="erd-btn" data-erd="out" aria-label="Zoom out">&minus;</button>' +
    '<button type="button" class="erd-btn" data-erd="in" aria-label="Zoom in">+</button>' +
    '<button type="button" class="erd-btn erd-btn-wide" data-erd="reset">Reset</button>' +
    "</span>";

  var stage = document.createElement("div");
  stage.className = "erd-stage";
  stage.tabIndex = 0;
  stage.setAttribute("role", "application");
  stage.setAttribute("aria-label",
    "Entity relationship diagram of 16 tables. Drag or use the arrow keys to pan, " +
    "plus and minus to zoom. Tab to a table to highlight what it links to.");

  var svg = el("svg", { class: "erd-svg" });
  var viewport = el("g", { class: "erd-viewport" });
  var linkLayer = el("g", { class: "erd-links" });
  var boxLayer = el("g", { class: "erd-boxes" });
  viewport.appendChild(linkLayer);
  viewport.appendChild(boxLayer);
  svg.appendChild(viewport);
  stage.appendChild(svg);

  var hint = document.createElement("p");
  hint.className = "erd-hint";
  hint.textContent = "Click the diagram, then scroll to zoom — or hold Ctrl. Drag to look around, and click a table to trace what it joins to.";

  frame.appendChild(bar);
  frame.appendChild(stage);
  frame.appendChild(hint);
  host.insertBefore(frame, host.firstChild);

  /* ---- geometry ------------------------------------------------------- */
  var byName = {};
  S.tables.forEach(function (t) { byName[t.name] = t; });

  function rowY(tableName, colName) {
    var t = byName[tableName];
    var p = S.pos[tableName];
    var i = 0;
    for (var k = 0; k < t.cols.length; k++) if (t.cols[k].n === colName) { i = k; break; }
    return p.y + M.head + (i + 0.5) * M.row;
  }
  function pkName(tableName) {
    var t = byName[tableName];
    for (var k = 0; k < t.cols.length; k++) if (t.cols[k].pk) return t.cols[k].n;
    return t.cols[0].n;
  }

  /* ---- connectors ----------------------------------------------------- */
  /* Drawn before the boxes so the opaque table fills hide the few lines that
     have to cross a column (Club to ClubGame, Player to GamePlayer). */
  var linkEls = [];
  S.rels.forEach(function (r, i) {
    var parent = S.pos[r.to], child = S.pos[r.from];
    /* Tables stacked in adjacent bands overlap horizontally, and routing those
       out of the side produced the long sideways swoops that crossed
       everything else. Leave the box through whichever face actually points at
       the other table: sideways when they sit apart, vertically when one is
       above the other. */
    var apart = parent.x + M.w < child.x || child.x + M.w < parent.x;
    var d, tickA, tickB;

    if (apart) {
      var right = parent.x + M.w < child.x;
      var x1 = right ? parent.x + M.w : parent.x;
      var x2 = right ? child.x : child.x + M.w;
      var y1 = rowY(r.to, r.toCol);
      var y2 = rowY(r.from, r.col);
      var bend = Math.max(46, Math.abs(x2 - x1) * 0.42);
      d = "M" + x1 + " " + y1 +
        "C" + (x1 + (right ? bend : -bend)) + " " + y1 + " " +
        (x2 - (right ? bend : -bend)) + " " + y2 + " " + x2 + " " + y2;
      var s = right ? 1 : -1;
      tickA = "M" + (x1 + s * 7) + " " + (y1 - 5) + "v10";
      tickB = "M" + (x2 - s * 9) + " " + (y2 - 5) + "L" + x2 + " " + y2 +
              "L" + (x2 - s * 9) + " " + (y2 + 5) + "M" + (x2 - s * 9) + " " + y2 + "H" + x2;
    } else {
      var down = parent.y < child.y;                      // parent sits above
      var px = parent.x + M.w / 2, cx = child.x + M.w / 2;
      var py = down ? parent.y + parent.h : parent.y;
      var cy = down ? child.y : child.y + child.h;
      var vb = Math.max(30, Math.abs(cy - py) * 0.5);
      var sv = down ? 1 : -1;
      d = "M" + px + " " + py +
        "C" + px + " " + (py + sv * vb) + " " + cx + " " + (cy - sv * vb) + " " + cx + " " + cy;
      tickA = "M" + (px - 5) + " " + (py + sv * 7) + "h10";
      tickB = "M" + (cx - 5) + " " + (cy - sv * 9) + "L" + cx + " " + cy +
              "L" + (cx + 5) + " " + (cy - sv * 9) + "M" + cx + " " + (cy - sv * 9) + "V" + cy;
    }

    var g = el("g", { class: "erd-link", "data-from": r.from, "data-to": r.to });
    g.appendChild(el("path", { class: "erd-link-line", d: d }));
    /* one bar at the parent (exactly one) and a crow's foot at the child
       (many) — every relationship in this schema is one-to-many */
    g.appendChild(el("path", { class: "erd-link-tick", d: tickA }));
    g.appendChild(el("path", { class: "erd-link-tick", d: tickB }));
    g.dataset.i = i;
    linkLayer.appendChild(g);
    linkEls.push(g);
  });

  /* ---- table boxes ---------------------------------------------------- */
  var boxEls = {};
  S.tables.forEach(function (t) {
    var p = S.pos[t.name];
    var g = el("g", {
      class: "erd-box",
      transform: "translate(" + p.x + " " + p.y + ")",
      "data-table": t.name,
      tabindex: "0",
      role: "button"
    });
    var fkList = t.cols.filter(function (c) { return c.fk; }).map(function (c) { return c.fk; });
    g.setAttribute("aria-label",
      t.name + ", " + t.rows + " rows, " + t.cols.length + " columns: " +
      t.cols.map(function (c) {
        return c.n + (c.pk ? " primary key" : c.fk ? " foreign key to " + c.fk : "");
      }).join(", ") + "." +
      (fkList.length ? "" : " No outgoing foreign keys."));

    g.appendChild(el("rect", { class: "erd-box-bg", x: 0, y: 0, width: M.w, height: p.h, rx: 9 }));
    g.appendChild(el("rect", { class: "erd-box-head", x: 0, y: 0, width: M.w, height: M.head, rx: 9 }));
    /* square off the bottom of the rounded header so it meets the body */
    g.appendChild(el("rect", { class: "erd-box-head", x: 0, y: M.head - 9, width: M.w, height: 9 }));
    g.appendChild(text(11, 20, "erd-t-name", t.name));
    g.appendChild(text(M.w - 11, 20, "erd-t-rows", t.rows.toLocaleString()));

    /* summary shown while zoomed out, column list once zoomed in */
    var summary = el("g", { class: "erd-summary" });
    summary.appendChild(text(M.w / 2, M.head + (p.h - M.head) / 2 - 2, "erd-s-num", t.cols.length));
    summary.appendChild(text(M.w / 2, M.head + (p.h - M.head) / 2 + 15, "erd-s-lab", t.cols.length === 1 ? "column" : "columns"));
    g.appendChild(summary);

    var cols = el("g", { class: "erd-cols" });
    t.cols.forEach(function (c, i) {
      var y = M.head + (i + 1) * M.row - 5;
      if (c.pk || c.fk) {
        cols.appendChild(el("rect", {
          class: c.pk ? "erd-mark erd-mark-pk" : "erd-mark erd-mark-fk",
          x: 8, y: y - 8, width: 4, height: 10, rx: 2
        }));
      }
      var row = text(17, y, "erd-c-name" + (c.pk ? " is-pk" : c.fk ? " is-fk" : ""), c.n);
      if (!c.req) row.setAttribute("class", row.getAttribute("class") + " is-opt");
      cols.appendChild(row);
      cols.appendChild(text(M.w - 11, y, "erd-c-type", c.t.replace(/VARCHAR2/, "VC2")));
    });
    g.appendChild(cols);

    boxLayer.appendChild(g);
    boxEls[t.name] = g;
  });

  /* ---- selection ------------------------------------------------------ */
  var selected = null;
  function select(name) {
    selected = name;
    var neighbours = {};
    if (name) {
      neighbours[name] = true;
      S.rels.forEach(function (r) {
        if (r.from === name) neighbours[r.to] = true;
        if (r.to === name) neighbours[r.from] = true;
      });
    }
    host.classList.toggle("has-selection", !!name);
    Object.keys(boxEls).forEach(function (n) {
      boxEls[n].classList.toggle("is-selected", n === name);
      boxEls[n].classList.toggle("is-related", !!name && n !== name && !!neighbours[n]);
      boxEls[n].classList.toggle("is-dim", !!name && !neighbours[n]);
    });
    linkEls.forEach(function (g) {
      var on = !!name && (g.dataset.from === name || g.dataset.to === name);
      g.classList.toggle("is-lit", on);
      g.classList.toggle("is-dim", !!name && !on);
    });
  }

  Object.keys(boxEls).forEach(function (n) {
    boxEls[n].addEventListener("click", function (e) {
      e.stopPropagation();
      select(selected === n ? null : n);
    });
    boxEls[n].addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select(selected === n ? null : n);
      }
    });
    boxEls[n].addEventListener("focus", function () { if (!selected) select(n); });
  });

  /* ---- view transform -------------------------------------------------- */
  var view = { x: 0, y: 0, k: 1 };

  /* The stylesheet already swaps these via the .show-detail class. Writing the
     value on the elements as well makes the state explicit and independent of
     the cascade, which matters because the class sits on the figure while the
     groups are several levels down inside the SVG. Cheap: 32 style writes on
     a zoom step, and only when the threshold is actually crossed. */
  var detailGroups = null;
  function collectDetailGroups() {
    detailGroups = {
      cols: [].slice.call(host.querySelectorAll("g.erd-cols")),
      summary: [].slice.call(host.querySelectorAll("g.erd-summary"))
    };
  }

  function applyDetail(showDetail) {
    if (!detailGroups) collectDetailGroups();
    detailGroups.cols.forEach(function (g) { g.style.opacity = showDetail ? "1" : "0"; });
    detailGroups.summary.forEach(function (g) { g.style.opacity = showDetail ? "0" : "1"; });
  }

  var lastDetail = null;
  function apply() {
    viewport.setAttribute("transform",
      "translate(" + view.x.toFixed(2) + " " + view.y.toFixed(2) + ") scale(" + view.k.toFixed(4) + ")");
    var detail = view.k >= DETAIL_SCALE;
    if (detail !== lastDetail) {
      host.classList.toggle("show-detail", detail);
      applyDetail(detail);
      lastDetail = detail;
    }
    bar.querySelector(".erd-zoom").textContent = Math.round(view.k * 100) + "%";
  }

  function zoomAt(factor, cx, cy) {
    var k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.k * factor));
    if (k === view.k) return;
    /* keep the point under the cursor fixed */
    view.x = cx - (cx - view.x) * (k / view.k);
    view.y = cy - (cy - view.y) * (k / view.k);
    view.k = k;
    apply();
  }

  function centre() {
    var r = stage.getBoundingClientRect();
    if (!r.width) return;
    var k = Math.min(r.width / S.size.w, r.height / S.size.h);
    view.k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, k));
    view.x = (r.width - S.size.w * view.k) / 2;
    view.y = (r.height - S.size.h * view.k) / 2;
    apply();
  }

  /* No viewBox: SVG user units then equal CSS pixels, which is what makes
     zoom-to-cursor a one-liner above. */
  function sizeSvg() {
    var r = stage.getBoundingClientRect();
    svg.setAttribute("width", r.width);
    svg.setAttribute("height", r.height);
  }

  function localPoint(clientX, clientY) {
    var r = stage.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  /* ---- activation ------------------------------------------------------ */
  /* "Live" means the diagram owns wheel and touch gestures. It goes live on
     click/tap or keyboard focus and drops out again on blur, so the page can
     always be scrolled past a diagram nobody is using. */
  function setLive(on) {
    host.classList.toggle("is-live", on);
  }
  stage.addEventListener("focus", function () { setLive(true); });
  stage.addEventListener("blur", function () { setLive(false); });
  stage.addEventListener("pointerdown", function () {
    if (document.activeElement !== stage && !stage.contains(document.activeElement)) stage.focus();
  });

  /* ---- pan and pinch --------------------------------------------------- */
  var pointers = {};
  var dragged = false;
  var pinch = null;

  function pointerCount() { return Object.keys(pointers).length; }

  stage.addEventListener("pointerdown", function (e) {
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    dragged = false;
    if (pointerCount() === 1) {
      stage.setPointerCapture(e.pointerId);
      host.classList.add("is-grabbing");
    } else if (pointerCount() === 2) {
      pinch = null;
    }
  });

  stage.addEventListener("pointermove", function (e) {
    var p = pointers[e.pointerId];
    if (!p) return;
    var ids = Object.keys(pointers);

    if (ids.length >= 2) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var a = pointers[ids[0]], b = pointers[ids[1]];
      var dist = Math.hypot(a.x - b.x, a.y - b.y);
      var mid = localPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (pinch) {
        if (pinch.dist > 0) zoomAt(dist / pinch.dist, mid.x, mid.y);
        view.x += mid.x - pinch.mid.x;
        view.y += mid.y - pinch.mid.y;
        apply();
      }
      pinch = { dist: dist, mid: mid };
      dragged = true;
      e.preventDefault();
      return;
    }

    var dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragged = true;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    view.x += dx;
    view.y += dy;
    apply();
    if (e.pointerType !== "touch" || host.classList.contains("is-live")) e.preventDefault();
  });

  function endPointer(e) {
    delete pointers[e.pointerId];
    if (pointerCount() < 2) pinch = null;
    if (pointerCount() === 0) host.classList.remove("is-grabbing");
  }
  stage.addEventListener("pointerup", endPointer);
  stage.addEventListener("pointercancel", endPointer);

  /* a drag that ends on empty canvas should not also count as a click */
  stage.addEventListener("click", function () {
    if (!dragged) select(null);
  });

  stage.addEventListener("wheel", function (e) {
    if (!host.classList.contains("is-live") && !e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    var p = localPoint(e.clientX, e.clientY);
    /* deltaMode 1 is lines, 2 is pages — normalise so a trackpad and a mouse
       wheel feel roughly the same */
    var step = e.deltaY * (e.deltaMode === 1 ? 18 : e.deltaMode === 2 ? 300 : 1);
    zoomAt(Math.pow(0.9985, step), p.x, p.y);
  }, { passive: false });

  stage.addEventListener("keydown", function (e) {
    var step = e.shiftKey ? 140 : 55;
    var mid = { x: stage.clientWidth / 2, y: stage.clientHeight / 2 };
    switch (e.key) {
      case "ArrowLeft":  view.x += step; break;
      case "ArrowRight": view.x -= step; break;
      case "ArrowUp":    view.y += step; break;
      case "ArrowDown":  view.y -= step; break;
      case "+": case "=": zoomAt(1.25, mid.x, mid.y); break;
      case "-": case "_": zoomAt(0.8, mid.x, mid.y); break;
      case "0": centre(); break;
      case "Escape": select(null); return;
      default: return;
    }
    e.preventDefault();
    apply();
  });

  bar.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-erd]") : null;
    if (!btn) return;
    var mid = { x: stage.clientWidth / 2, y: stage.clientHeight / 2 };
    if (btn.dataset.erd === "in") zoomAt(1.3, mid.x, mid.y);
    else if (btn.dataset.erd === "out") zoomAt(1 / 1.3, mid.x, mid.y);
    else { centre(); select(null); }
  });

  /* ---- boot ------------------------------------------------------------ */
  function layout() {
    sizeSvg();
    centre();
  }
  layout();
  /* fonts land after first paint and change nothing here, but the stage does
     resize with the column, so re-fit only while the user has not moved it */
  var touched = false;
  ["pointerdown", "wheel", "keydown"].forEach(function (t) {
    stage.addEventListener(t, function () { touched = true; }, { passive: true });
  });
  window.addEventListener("resize", function () {
    sizeSvg();
    if (!touched) centre(); else apply();
  });

  if (reduceMotion) host.classList.add("erd-still");
})();
