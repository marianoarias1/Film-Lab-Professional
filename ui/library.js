import { nextReviewFile, normalizeReview, reviewFiles } from "./model.js";

const label = { picked: "⚑ Elegida", rejected: "× Descartada", unreviewed: "Sin revisar" };
const fit = () => ({ scale: 1, x: 0, y: 0 });
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
};

export function mountLibrary({ $, state, api, save, reveal, enter, leave, isBusy }) {
  const root = $("library"), grid = $("libraryGrid"), strip = $("libraryStrip");
  const frames = [$("libraryA"), $("libraryB")];
  const thumbnails = new Map(), details = new Map(), revisions = new WeakMap();
  const visible = new Set(), pending = new Map();
  const cards = new Map(), stripCards = new Map();
  let filter = "all", active, pair = null, side = 0, views = [fit(), fit()];
  let working = false, ready = false, drag = null;
  const photos = () => reviewFiles(state.files, "all");
  const filtered = () => reviewFiles(state.files, filter);
  const focused = () => pair ? pair[side] : active;
  const shown = () => !root.hidden;

  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting && pending.has(entry.target)) visible.add(entry.target);
      else visible.delete(entry.target);
    }
    void pump();
  }, { rootMargin: "140px" });

  function placeholder(node, text) {
    node.replaceChildren(el("span", "library-placeholder", text));
  }

  function detach(node) {
    observer.unobserve(node);
    pending.delete(node);
    visible.delete(node);
  }

  function attach(node, file, detail = false) {
    detach(node);
    if (!file || file.missing) {
      placeholder(node, file?.missing ? "Original no disponible" : "");
      return;
    }
    const cache = detail ? details : thumbnails;
    if (cache.has(file)) {
      showImage(node, cache.get(file));
      return;
    }
    placeholder(node, detail ? "Cargando vista…" : "▧");
    pending.set(node, { file, detail });
    if (!detail) observer.observe(node);
  }

  function showImage(node, src) {
    if (!src) { placeholder(node, "Vista no disponible"); return; }
    const img = el("img", "");
    img.alt = "";
    img.draggable = false;
    img.src = src;
    node.replaceChildren(img);
    if (frames.includes(node)) {
      img.addEventListener("load", applyViews, { once: true });
      applyViews();
    }
  }

  async function pump() {
    if (!ready || !shown() || working || isBusy() || !api?.libraryPreview) return;
    // Request one at a time, with visible details ahead of grid thumbnails.
    const work = [...pending].find(([node, item]) =>
      node.isConnected && !node.closest("[hidden]") && item.detail) ||
      [...pending].find(([node]) => node.isConnected && visible.has(node) && node.getClientRects().length);
    if (!work) return;
    const [, { file, detail }] = work;
    const revision = revisions.get(file);
    working = true;
    let src = null;
    try { src = await api.libraryPreview({ id: file.id, detail }); } catch {}
    const cache = detail ? details : thumbnails;
    if (state.files.includes(file) && revisions.get(file) === revision) {
      cache.delete(file);
      cache.set(file, src);
      while (cache.size > (detail ? 4 : 96)) cache.delete(cache.keys().next().value);
      for (const [target, job] of pending) {
        if (job.file !== file || job.detail !== detail) continue;
        detach(target);
        if (target.isConnected) showImage(target, src);
      }
    }
    working = false;
    void pump();
  }

  function makeCard(file, isStrip) {
    const button = el("button", "library-card");
    const image = el("div", "library-image library-thumb");
    const name = el("span", "library-card-name", file.name);
    name.title = file.name;
    const mark = el("span", "library-status");
    button.append(image, name, mark);
    button.onclick = () => {
      if (isBusy()) return;
      if (isStrip) {
        const other = 1 - side;
        if (pair[other] === file) side = other;
        else { pair[side] = file; views[side] = $("libraryLinked").checked ? { ...views[other] } : fit(); }
      } else active = file;
      refresh();
    };
    if (!isStrip) button.ondblclick = openReveal;
    attach(image, file);
    return { button, image, mark };
  }

  function status(node, file) {
    const value = normalizeReview(file?.review);
    node.dataset.review = value;
    node.textContent = file ? label[value] : "";
  }

  function paintCards(container, elements, files, isStrip) {
    const scroll = isStrip ? container.scrollLeft : $("libraryResults").scrollTop;
    const wanted = new Set(files);
    for (const [file, card] of elements) {
      if (wanted.has(file)) continue;
      detach(card.image);
      card.button.remove();
      elements.delete(file);
    }
    for (const [index, file] of files.entries()) {
      if (!elements.has(file)) elements.set(file, makeCard(file, isStrip));
      const card = elements.get(file);
      if (container.children[index] !== card.button) container.insertBefore(card.button, container.children[index] ?? null);
      card.button.disabled = isBusy();
      card.button.setAttribute("aria-pressed", String(focused() === file));
      status(card.mark, file);
      const slot = isStrip && pair.includes(file) ? (pair[0] === file ? "A · " : "B · ") : "";
      card.button.querySelector(".library-card-name").textContent = slot + file.name;
    }
    if (isStrip) container.scrollLeft = scroll;
    else $("libraryResults").scrollTop = scroll;
  }

  function paintImage(node, file) {
    if (node.reviewFile === file) return;
    node.reviewFile = file;
    attach(node, file, true);
  }

  function refresh({ scroll = false, focus = false } = {}) {
    if (!shown()) return;
    const all = photos(), list = filtered();
    if (pair && pair.some(file => !all.includes(file))) pair = null;
    if (!list.includes(active)) active = list.find(file => file.id === state.activeId) ?? list[0];
    $("libraryBrowse").hidden = !!pair;
    $("libraryComparison").hidden = !pair;
    $("libraryZoomHint").hidden = !pair;
    root.classList.toggle("comparing", !!pair);
    $("libraryCount").textContent = filter === "all" ? (all.length === 1 ? "1 foto" : all.length + " fotos") : list.length + " de " + all.length;
    $("libraryCompare").disabled = isBusy() || list.filter(file => !file.missing).length < 2;
    for (const button of root.querySelectorAll("[data-review-filter]")) button.setAttribute("aria-pressed", String(button.dataset.reviewFilter === filter));
    for (const button of root.querySelectorAll("[data-review-mark]")) {
      button.disabled = isBusy() || !focused();
      button.setAttribute("aria-pressed", String(!!focused() && normalizeReview(focused().review) === button.dataset.reviewMark));
    }
    if (pair) {
      frames.forEach((node, index) => {
        const file = pair[index], key = index === 0 ? "A" : "B";
        node.setAttribute("aria-pressed", String(side === index));
        node.setAttribute("aria-label", "Activar toma " + key);
        paintImage(node, file);
        const caption = $("libraryLabel" + key);
        const mark = el("span", "library-status");
        status(mark, file);
        caption.replaceChildren(el("span", "library-frame-name", key + " · " + file.name), mark);
      });
      paintCards(strip, stripCards, all, true);
      if (scroll) stripCards.get(focused())?.button.scrollIntoView({ block: "nearest", inline: "nearest" });
      applyViews();
      if (focus) frames[side].focus({ preventScroll: true });
    } else {
      paintCards(grid, cards, list, false);
      const empty = $("libraryEmpty");
      empty.hidden = !!list.length;
      empty.textContent = all.length ? "No hay fotos con esta marca." : "Agregá fotografías para empezar a revisar.";
      $("libraryDetail").hidden = !active;
      if (active) {
        $("libraryFilename").textContent = active.name;
        status($("libraryReviewStatus"), active);
      }
      $("libraryReveal").disabled = isBusy() || !active || !!active.missing;
      paintImage($("libraryPreview"), active);
      const card = cards.get(active);
      if (scroll) card?.button.scrollIntoView({ block: "nearest", inline: "nearest" });
      if (focus) (card?.button ?? root.querySelector('[aria-pressed="true"][data-review-filter]'))?.focus({ preventScroll: true });
    }
    void pump();
  }

  function mark(value) {
    if (!shown() || isBusy()) return;
    const file = focused();
    if (!file) return;
    const next = !pair && $("libraryAuto").checked ? nextReviewFile(filtered(), file.id) : null;
    if (file.review !== value) {
      file.review = value;
      save();
      $("libraryAnnouncement").textContent = file.name + " · " + label[value];
    }
    if (next) active = next;
    const filterRemoved = !pair && !filtered().includes(file);
    refresh({ scroll: !!next || filterRemoved, focus: filterRemoved || grid.contains(document.activeElement) });
  }

  function navigate(direction) {
    if (pair) {
      const list = photos().filter(file => file !== pair[1 - side] && !file.missing);
      const next = nextReviewFile(list, pair[side].id, direction);
      if (!next) return;
      pair[side] = next;
    } else {
      const next = nextReviewFile(filtered(), active?.id, direction);
      if (!next) return;
      active = next;
    }
    refresh({ scroll: true, focus: true });
  }

  function openReveal() {
    if (focused() && !focused().missing && !isBusy()) reveal(focused().id);
  }

  function applyViews() {
    frames.forEach((node, index) => {
      const img = node.querySelector("img"), v = views[index];
      if (!img || !img.naturalWidth || !node.clientWidth || !node.clientHeight) return;
      const ratio = Math.min(node.clientWidth / img.naturalWidth, node.clientHeight / img.naturalHeight);
      const w = ratio * img.naturalWidth, h = ratio * img.naturalHeight;
      const limit = (value, max) => Math.max(-max, Math.min(max, value));
      img.style.width = w + "px";
      img.style.height = h + "px";
      const x = limit(v.x * node.clientWidth, Math.max(0, (w * v.scale - node.clientWidth) / 2));
      const y = limit(v.y * node.clientHeight, Math.max(0, (h * v.scale - node.clientHeight) / 2));
      img.style.transform = `translate(${x}px, ${y}px) scale(${v.scale})`;
      node.classList.toggle("zoomed", v.scale > 1);
    });
  }
  function updateView(index, value) {
    views[index] = value;
    if ($("libraryLinked").checked) views[1 - index] = { ...value };
    applyViews();
  }
  new ResizeObserver(applyViews).observe($("libraryComparison"));
  frames.forEach((node, index) => {
    node.onclick = () => { side = index; refresh(); };
    node.addEventListener("wheel", event => {
      if (!pair || !node.querySelector("img") || isBusy()) return;
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 300 : 1);
      const old = views[index], scale = Math.max(1, Math.min(6, old.scale * Math.exp(-delta * .002)));
      const box = node.getBoundingClientRect(), factor = scale / old.scale;
      const x = (event.clientX - box.left) / box.width - .5;
      const y = (event.clientY - box.top) / box.height - .5;
      updateView(index, scale === 1 ? fit() : { scale, x: x * (1 - factor) + old.x * factor, y: y * (1 - factor) + old.y * factor });
    }, { passive: false });
    node.onpointerdown = event => {
      if (event.button || views[index].scale === 1 || isBusy()) return;
      drag = { index, id: event.pointerId, x: event.clientX, y: event.clientY, view: { ...views[index] } };
      node.setPointerCapture(event.pointerId);
    };
    node.onpointermove = event => {
      if (!drag || drag.index !== index || drag.id !== event.pointerId) return;
      updateView(index, { ...drag.view,
        x: drag.view.x + (event.clientX - drag.x) / node.clientWidth,
        y: drag.view.y + (event.clientY - drag.y) / node.clientHeight });
    };
    node.onlostpointercapture = () => { drag = null; };
  });

  function back() {
    const file = focused();
    if (file && filtered().includes(file)) active = file;
    pair = null;
    refresh({ scroll: true, focus: true });
  }
  $("navLibrary").onclick = () => shown() ? leave() : enter();
  $("libraryBack").onclick = back;
  $("libraryCompare").onclick = () => {
    const list = filtered().filter(file => !file.missing);
    if (isBusy() || list.length < 2) return;
    const first = list.includes(active) ? active : list[0];
    pair = [first, nextReviewFile(list, first.id) ?? list.find(file => file !== first)];
    side = 0;
    views = [fit(), fit()];
    refresh({ scroll: true, focus: true });
  };
  $("libraryFit").onclick = () => { views = [fit(), fit()]; applyViews(); };
  $("libraryLinked").onchange = () => { if ($("libraryLinked").checked) updateView(side, views[side]); };
  $("libraryReveal").onclick = openReveal;
  $("libraryFiles").ontoggle = () => { if (pair) applyViews(); void pump(); };
  for (const button of root.querySelectorAll("[data-review-filter]")) {
    button.onclick = () => {
      filter = button.dataset.reviewFilter;
      $("libraryResults").scrollTop = 0;
      refresh();
    };
  }
  for (const button of root.querySelectorAll("[data-review-mark]"))
    button.onclick = () => mark(button.dataset.reviewMark);
  document.addEventListener("keydown", event => {
    if (!shown() || isBusy() || event.altKey || event.ctrlKey || event.metaKey ||
        document.querySelector("dialog[open]") || event.target.closest("input,textarea,select,[contenteditable],#projectMenu")) return;
    const key = event.key.toLowerCase();
    const value = { p: "picked", x: "rejected", u: "unreviewed" }[key];
    if (value && typeof value === "string") {
      event.preventDefault();
      if (!event.repeat) mark(value);
    } else if (key === "arrowleft" || key === "arrowright") {
      event.preventDefault();
      navigate(key === "arrowright" ? 1 : -1);
    } else if (key === "escape" && pair) {
      back();
    }
  });

  return {
    refresh,
    ready() { ready = true; void pump(); },
    open() {
      root.hidden = false;
      active = state.files.find(file => file.id === state.activeId && file.kind === "photo") ?? active;
      refresh({ scroll: true, focus: true });
    },
    close() { root.hidden = true; pair = null; },
    reset() {
      active = undefined; pair = null; filter = "all";
      observer.disconnect();
      visible.clear(); pending.clear(); thumbnails.clear(); details.clear();
      cards.clear(); stripCards.clear(); grid.replaceChildren(); strip.replaceChildren();
      for (const node of [...frames, $("libraryPreview")]) {
        node.reviewFile = undefined;
        node.replaceChildren();
      }
    },
    invalidate(file) {
      revisions.set(file, (revisions.get(file) ?? 0) + 1);
      thumbnails.delete(file);
      details.delete(file);
      for (const card of [cards.get(file), stripCards.get(file)]) if (card) attach(card.image, file);
      for (const node of [...frames, $("libraryPreview")]) if (node.reviewFile === file) attach(node, file, true);
    },
  };
}
