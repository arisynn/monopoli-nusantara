export function createPwa({
  window: win,
  navigator: nav,
  canUpdate,
  onChange,
}) {
  const state = {
    installable: false,
    installed:
      !!nav.standalone || win.matchMedia("(display-mode: standalone)").matches,
    updateAvailable: false,
    offline: nav.onLine === false,
    message: "",
  };
  let prompt,
    registration,
    controlled = !!nav.serviceWorker?.controller;
  const changed = () => onChange?.();
  win.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    prompt = event;
    state.installable = true;
    changed();
  });
  win.addEventListener("appinstalled", () => {
    prompt = null;
    state.installed = true;
    state.installable = false;
    changed();
  });
  for (const type of ["online", "offline"])
    win.addEventListener(type, () => {
      state.offline = nav.onLine === false;
      changed();
    });
  nav.serviceWorker?.addEventListener("message", (event) => {
    if (event.data?.type === "CAN_ACTIVATE")
      event.ports[0]?.postMessage({ safe: !!canUpdate() });
  });
  nav.serviceWorker?.addEventListener("controllerchange", () => {
    if (controlled && canUpdate()) win.location.reload();
    controlled = true;
  });
  return {
    state,
    async start() {
      if (!nav.serviceWorker || !win.isSecureContext) return;
      registration = await nav.serviceWorker.register("/nusantara-sw.js");
      const inspect = () => {
        state.updateAvailable = !!registration.waiting;
        changed();
      };
      inspect();
      const watch = () =>
        registration.installing?.addEventListener("statechange", inspect);
      watch();
      registration.addEventListener("updatefound", watch);
    },
    async install() {
      if (!prompt) {
        state.message = state.installed
          ? "Nusantara sudah terpasang."
          : "Di iPhone/iPad: buka di Safari, pilih Bagikan lalu Tambahkan ke Layar Utama. Di browser lain, cari Pasang aplikasi pada menu browser.";
        changed();
        return;
      }
      const event = prompt;
      prompt = null;
      state.installable = false;
      await event.prompt();
      await event.userChoice;
      changed();
    },
    update() {
      if (!canUpdate()) {
        state.message = "Kembali ke lobby sebelum memperbarui aplikasi.";
        changed();
        return;
      }
      state.message =
        "Tutup pertandingan di tab lain agar pembaruan dapat dipasang.";
      registration?.waiting?.postMessage({ type: "ACTIVATE_UPDATE" });
      changed();
    },
  };
}
