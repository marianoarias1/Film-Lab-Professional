// The inspector never changes settings. One request runs at a time; newer
// intentions replace the pending one and late results cannot enter a new file.
export function mountDetailInspector({ $, current, api, time, isBusy, available, prepare }) {
  const panel = $("detailInspector"), viewport = $("detailViewport"), image = $("detailImage");
  let open = false, epoch = 0, running = false, pending = null, timer;
  let center = { x: .5, y: .5 }, result = null, original = false, pointer = null;
  function endBefore() {
    original = false;
    $("detailBefore").setAttribute("aria-pressed", "false");
    if (result) image.src = result.url;
  }
  function close() {
    if (open && api?.releaseDetail) void api.releaseDetail({ id: current()?.id }).catch(() => {});
    open = false;
    epoch++;
    clearTimeout(timer);
    pending = null;
    result = null;
    image.hidden = true;
    image.removeAttribute("src");
    panel.hidden = true;
    $("detailToggle").setAttribute("aria-expanded", "false");
    $("detailToggle").textContent = "Ver detalle · 100 %";
    $("imageWrap").classList.remove("inspecting-detail");
    endBefore();
  }
  function draw() {
    $("detailToggle").disabled = !current() || !!current()?.missing || isBusy() || !api?.detailPreview;
    if (open && (!current() || isBusy() || !available())) close();
  }
  async function run() {
    if (running || !pending || !open) return;
    const job = pending;
    pending = null;
    running = true;
    $("detailState").textContent = "Actualizando…";
    try {
      const next = await api.detailPreview(job.request);
      if (open && job.epoch === epoch && current()?.id === job.request.id) {
        result = next;
        image.style.width = next.width / job.ratio + "px";
        image.style.height = next.height / job.ratio + "px";
        image.src = original ? next.beforeUrl : next.url;
        image.hidden = false;
        $("detailLoading").hidden = true;
        $("detailState").textContent = "";
      }
    } catch (error) {
      if (open && job.epoch === epoch) {
        $("detailLoading").hidden = false;
        $("detailLoading").textContent = error.message || "No se pudo cargar el detalle.";
        $("detailState").textContent = "";
      }
    } finally {
      running = false;
      void run();
    }
  }
  function request() {
    const file = current();
    if (!open || !file || isBusy() || !available()) return;
    epoch++;
    const ratio = window.devicePixelRatio > 0 && Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1;
    const size = value => Math.max(1, Math.min(1024, Math.round(value * ratio)));
    pending = {
      epoch, ratio,
      request: { id: file.id, settings: structuredClone(file.settings), time: time(),
        ...center, width: size(viewport.clientWidth), height: size(viewport.clientHeight) },
    };
    void run();
  }
  function update() {
    if (!open) return;
    // Invalidate the old intention immediately, then coalesce rapid slider inputs.
    epoch++;
    pending = null;
    clearTimeout(timer);
    timer = setTimeout(request, 120);
  }
  $("detailToggle").onclick = () => {
    if (open) { close(); return; }
    if ($("detailToggle").disabled) return;
    prepare();
    open = true;
    center = { x: .5, y: .5 };
    panel.hidden = false;
    $("detailLoading").hidden = false;
    $("detailLoading").textContent = "Cargando detalle…";
    $("detailToggle").setAttribute("aria-expanded", "true");
    $("detailToggle").textContent = "Ocultar detalle";
    $("imageWrap").classList.add("inspecting-detail");
    request();
  };
  $("detailClose").onclick = () => { close(); $("detailToggle").focus(); };
  $("imageWrap").addEventListener("pointerdown", event => {
    if (!open || event.button !== 0) return;
    const box = $("preview").getBoundingClientRect();
    if (!box.width || !box.height) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    center = { x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) };
    request();
  }, true);
  viewport.onpointerdown = event => {
    if (event.button !== 0 || !result) return;
    event.preventDefault();
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, center: { ...center } };
    viewport.setPointerCapture(event.pointerId);
  };
  viewport.onpointermove = event => {
    if (!pointer || pointer.id !== event.pointerId || !result) return;
    center = {
      x: Math.max(0, Math.min(1, pointer.center.x - (event.clientX - pointer.x) * (window.devicePixelRatio || 1) / result.fullWidth)),
      y: Math.max(0, Math.min(1, pointer.center.y - (event.clientY - pointer.y) * (window.devicePixelRatio || 1) / result.fullHeight)),
    };
    update();
  };
  viewport.onpointerup = () => { if (pointer) { pointer = null; request(); } };
  viewport.onlostpointercapture = () => { pointer = null; };
  const button = $("detailBefore");
  function beginBefore() {
    if (!result) return;
    original = true;
    button.setAttribute("aria-pressed", "true");
    image.src = result.beforeUrl;
  }
  button.onpointerdown = event => { event.preventDefault(); button.setPointerCapture(event.pointerId); beginBefore(); };
  button.onpointerup = button.onpointercancel = button.onlostpointercapture = endBefore;
  button.onkeydown = event => { if ([" ", "Enter"].includes(event.key)) { event.preventDefault(); beginBefore(); } };
  button.onkeyup = button.onblur = endBefore;
  window.addEventListener("blur", endBefore);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && open && !document.querySelector("dialog[open]")) {
      close();
      $("detailToggle").focus();
    }
  });
  new ResizeObserver(() => update()).observe(viewport);
  return { close, draw, update };
}
