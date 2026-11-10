// Render one visible tile at a time, after foreground work has had priority.
export function mountRecipePreviews({ scroll, request, canRender }) {
  let context = null, generation = 0, entries = new Map(), visible = new Set();
  let timer = null, running = false, enabled = false, quietUntil = 0;
  const thumbnails = new Map();

  function placeholder(slot) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.4");
    const outline = document.createElementNS(ns, "rect");
    outline.setAttribute("x", "3"); outline.setAttribute("y", "4");
    outline.setAttribute("width", "18"); outline.setAttribute("height", "16");
    outline.setAttribute("rx", "3");
    const mountain = document.createElementNS(ns, "path");
    mountain.setAttribute("d", "m3 16 5-5 4 4 3-3 6 6M15 8h1");
    svg.append(outline, mountain);
    slot.replaceChildren(svg);
  }

  function paint(slot, src) {
    if (!src) { placeholder(slot); return; }
    const image = document.createElement("img");
    image.alt = "";
    image.draggable = false;
    image.onerror = () => { if (image.parentElement === slot) placeholder(slot); };
    image.src = src;
    slot.replaceChildren(image);
  }

  function nextVisible() {
    for (const [slot, recipe] of entries) {
      if (visible.has(slot) && !thumbnails.has(recipe.id)) return recipe;
    }
    return null;
  }

  function schedule(delay = 0) {
    if (!enabled || !context || running || timer !== null || !nextVisible()) return;
    timer = setTimeout(pump, Math.max(delay, quietUntil - performance.now()));
  }

  async function pump() {
    timer = null;
    if (!enabled || !context) return;
    const recipe = nextVisible();
    if (!recipe) return;
    if (performance.now() < quietUntil) { schedule(); return; }
    if (!canRender()) return;
    const revision = generation, { id, time } = context;
    running = true;
    try {
      const src = await request({ id, time, settings: recipe.settings });
      if (revision !== generation) return;
      thumbnails.set(recipe.id, src);
      for (const [slot, item] of entries) if (item.id === recipe.id) paint(slot, src);
    } catch {
      // A failed tile falls back to the placeholder without interrupting the editor.
      if (revision === generation) thumbnails.set(recipe.id, null);
    } finally {
      running = false;
      schedule(35);
    }
  }

  const observer = new IntersectionObserver(changes => {
    for (const { target, isIntersecting } of changes) {
      if (!entries.has(target)) continue;
      if (isIntersecting) visible.add(target);
      else visible.delete(target);
    }
    schedule();
  }, { root: scroll, rootMargin: "60px 0px" });

  function setContext(next) {
    if (context?.file === next?.file && context?.time === next?.time) return;
    context = next;
    generation++;
    thumbnails.clear();
    for (const slot of entries.keys()) placeholder(slot);
    schedule();
  }

  return {
    setContext,
    setItems(items) {
      observer.disconnect();
      // Discard queued observations for elements replaced by a recipe search.
      observer.takeRecords();
      visible.clear();
      entries = new Map(items);
      for (const [slot, recipe] of entries) {
        paint(slot, thumbnails.get(recipe.id));
        if (context) observer.observe(slot);
      }
      schedule();
    },
    setEnabled(value) {
      enabled = value && typeof request === "function";
      if (!enabled) { clearTimeout(timer); timer = null; }
      else schedule();
    },
    pause() { quietUntil = performance.now() + 260; },
    wake: schedule,
  };
}
